// Session grants for directories the desktop shell will scaffold a project
// into. The renderer must not be able to name an arbitrary root and have it
// accepted as a project folder: `registerMediaRoot` (server/media-roots.ts)
// has exactly one production call site — the successful end of scaffolding —
// so whatever root reaches it becomes readable/writable through the project
// document channel. A root is only eligible once the user has chosen it
// through the dedicated `openchatcut:select-project-folder` dialog (in
// desktop/main.ts), which calls `grantProjectRoot` on a successful pick.
// Deliberately NOT the same dialog as `openchatcut:select-directory` (a
// generic "choose media storage directory" picker used elsewhere): granting
// that one would let a user who merely points media storage at $HOME hand
// the renderer recursive .occ read/write across it.
//
// Grants PERSIST across app restarts. `loadProjectRootGrants` restores them at
// startup and every successful `grantProjectRoot` rewrites the file, mirroring
// how desktop/export-directory-state.ts already treats a dialog-chosen export
// directory as durable. The tradeoff was made deliberately and is worth stating
// plainly: a folder granted in an earlier run can be opened as a terminal, and
// read/written as a project document, WITHOUT any dialog in the current run. It
// removes the one user-visible step that previously stood between renderer code
// and a shell. It is accepted because re-picking the folder on every launch made
// the feature unusable, and because the folder was still one the user chose
// through a trusted OS dialog at some point. It is NOT a claim that the boundary
// is unchanged -- it is weaker, by choice.
//
// Deliberately has no Electron import, so it stays testable headlessly with
// `tsx`: a test calls `grantProjectRoot` directly in place of the dialog, and
// passes its own store path.
import { mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';

const grantedRoots = new Set<string>();
let storePath: string | null = null;
/**
 * In flight while the store is being restored. `grantProjectRoot` waits on it
 * before writing, because a grant that rewrote the file mid-load would persist
 * a set that does not yet contain the roots still being read back, silently
 * dropping them from disk. The in-memory set is never at risk -- the load only
 * ever adds -- so this guards the FILE, not the Set.
 */
let restoring: Promise<unknown> | null = null;

/** Bounds the file so a runaway caller cannot grow it without limit. */
const MAX_GRANTED_ROOTS = 64;
const MAX_STORE_BYTES = 256 * 1_024;

interface StoredGrants {
  version: 1;
  roots: string[];
}

async function writeStore(): Promise<void> {
  if (!storePath) return;
  const payload: StoredGrants = { version: 1, roots: [...grantedRoots] };
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  // Temp-then-rename so a crash mid-write cannot leave a truncated file that
  // would silently drop every grant on the next launch.
  const temp = `${storePath}.${process.pid}-${randomBytes(6).toString('hex')}.tmp`;
  try {
    await mkdir(dirname(storePath), { recursive: true, mode: 0o700 });
    await writeFile(temp, body, { mode: 0o600 });
    await rename(temp, storePath);
  } catch {
    await unlink(temp).catch(() => {});
  }
}

/**
 * Restores grants from disk. Every entry is re-validated: a path that no longer
 * resolves, or is no longer a directory, is dropped rather than trusted, so a
 * folder the user deleted or replaced with a file cannot carry a stale grant.
 * Never throws -- a missing or corrupt store simply yields no grants.
 */
export async function loadProjectRootGrants(path: string): Promise<number> {
  storePath = path;
  const run = readStore(path);
  restoring = run;
  try {
    return await run;
  } finally {
    if (restoring === run) restoring = null;
  }
}

async function readStore(path: string): Promise<number> {
  // Adds rather than clearing first. Clearing would be safe for the Set (it is
  // synchronous, so it cannot drop a later grant) but pointless, and the file is
  // protected by `restoring` below instead. Nothing here can add a root the user
  // did not choose, so this cannot widen the set beyond what the file and the
  // dialog already authorise. Tests that need a clean slate call
  // detachProjectRootGrantStore().
  let parsed: unknown;
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_STORE_BYTES) return 0;
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return 0;
  }
  const roots = (parsed as StoredGrants | null)?.roots;
  if (!Array.isArray(roots)) return 0;
  for (const entry of roots.slice(0, MAX_GRANTED_ROOTS)) {
    if (typeof entry !== 'string' || !isAbsolute(entry)) continue;
    try {
      const canonical = await realpath(entry);
      const info = await stat(canonical);
      if (info.isDirectory()) grantedRoots.add(canonical);
    } catch {
      // Gone or unreadable: drop it.
    }
  }
  return grantedRoots.size;
}

/** Record that the user chose this directory through a trusted OS dialog. Returns its canonical path. */
export async function grantProjectRoot(root: string): Promise<string> {
  const canonical = await realpath(resolve(root));
  // Let an in-flight restore finish first, so the file we write below already
  // contains everything that was on disk.
  if (restoring) await restoring.catch(() => {});
  grantedRoots.add(canonical);
  // Oldest-first eviction keeps the file bounded; Set preserves insertion order.
  while (grantedRoots.size > MAX_GRANTED_ROOTS) {
    const oldest = grantedRoots.values().next().value;
    if (oldest === undefined) break;
    grantedRoots.delete(oldest);
  }
  await writeStore();
  return canonical;
}

/** Clears in-memory grants AND the store, so a test cannot leak into the next. */
export async function clearProjectRootGrants(): Promise<void> {
  grantedRoots.clear();
  await writeStore();
}

/** Test seam: forget where the store lives without touching the file. */
export function detachProjectRootGrantStore(): void {
  storePath = null;
  grantedRoots.clear();
}

/** Never throws: a missing or inaccessible directory is simply not granted. */
export async function isProjectRootGranted(root: string): Promise<boolean> {
  let canonical: string;
  try {
    canonical = await realpath(resolve(root));
  } catch {
    return false;
  }
  return grantedRoots.has(canonical);
}
