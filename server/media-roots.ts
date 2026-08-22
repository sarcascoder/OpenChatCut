// Which filesystem paths may be served as media. The renderer is untrusted, so
// every candidate is canonicalised with realpath BEFORE the containment test:
// a symlink placed inside a project folder must not be able to point outside it.
//
// This module only performs a point-in-time check and hands back a path
// string, not an open file descriptor: it is NOT a capability. Between the
// check and a later open, the path on disk can change (e.g. the checked file
// can be replaced by a symlink pointing outside every root) — see the TOCTOU
// note on resolveAllowedMediaPath below for what a caller must do about it.
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isPathInside } from '../desktop/directory-watch-import.ts';

const roots = new Set<string>();

/** Register a directory whose files may be served. Returns its canonical path. */
export async function registerMediaRoot(root: string): Promise<string> {
  const canonical = await realpath(resolve(root));
  roots.add(canonical);
  return canonical;
}

export function clearMediaRoots(): void {
  roots.clear();
}

export function listMediaRoots(): readonly string[] {
  return [...roots];
}

/**
 * The canonical path when `candidate` resolves inside a registered root, else
 * null. Never throws: a missing file, a broken symlink or a permission error
 * is a refusal, because callers must not distinguish "denied" from "absent".
 *
 * TOCTOU: this is a check, not a hold. The returned string is only proof that
 * *at the moment of this call* the path resolved inside a root. Nothing stops
 * the path being replaced (e.g. swapped for a symlink pointing outside every
 * root) between this call returning and a caller later opening that path. A
 * caller that opens the returned path must not trust the string alone:
 *   - open with O_NOFOLLOW, so an attacker-substituted symlink fails to open
 *     rather than silently being followed outside the root, and/or
 *   - after opening, fstat the file descriptor and compare its device+inode
 *     against a fresh stat of the checked path, so a swap between check and
 *     open is detected instead of trusted.
 */
export async function resolveAllowedMediaPath(candidate: string): Promise<string | null> {
  if (roots.size === 0) return null;
  let canonical: string;
  try {
    canonical = await realpath(resolve(candidate));
  } catch {
    return null;
  }
  for (const root of roots) {
    if (isPathInside(root, canonical)) return canonical;
  }
  return null;
}
