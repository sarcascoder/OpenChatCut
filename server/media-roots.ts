// Which filesystem paths may be served as media. The renderer is untrusted, so
// every candidate is canonicalised with realpath BEFORE the containment test:
// a symlink placed inside a project folder must not be able to point outside it.
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
