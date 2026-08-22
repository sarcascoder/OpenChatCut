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
// Deliberately has no Electron import, so it stays testable headlessly with
// `tsx`: a test calls `grantProjectRoot` directly in place of the dialog.
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

const grantedRoots = new Set<string>();

/** Record that the user chose this directory through a trusted OS dialog. Returns its canonical path. */
export async function grantProjectRoot(root: string): Promise<string> {
  const canonical = await realpath(resolve(root));
  grantedRoots.add(canonical);
  return canonical;
}

export function clearProjectRootGrants(): void {
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
