// Project document I/O for the Electron main process. The renderer has no
// filesystem access, so every read and write funnels through here.
//
// Reachable only through desktop/project-file-ipc.ts's guards (allowlist,
// extension check, root grants, scrubbed errors). This module additionally
// checks, with O_NOFOLLOW + fstat()/lstat() dev+ino comparisons (mirroring
// server/plugins/upload-routes.ts's verifyLocalMediaTarget), that neither the
// immediate parent directory nor the target itself is a symlink at the
// moment of the call. Read PRECISELY what this does and does not buy you:
//   - It DETERMINISTICALLY rejects a call where a directory component or the
//     target was ALREADY a symlink before the call started — no timing, no
//     race, no attacker skill required. This is the common case: a hostile
//     archive or a co-operating local process that pre-arranges a symlink and
//     then triggers a read/write through it.
//   - It does NOT close a genuine TOCTOU race, where an attacker swaps a
//     directory component for a symlink IN THE WINDOW between this check and
//     a later path-based call (open(temp), rename(), or even this function's
//     own lstat() a few lines below). Node's fs module has no openat() or
//     dirfd-relative operations, so nothing here can hold a verified
//     directory open across a subsequent path-based lookup that re-resolves
//     it from scratch. Measured: racing the write path wins in as few
//     attempts post-fix as pre-fix — the check does not measurably narrow
//     that window, so no "narrows" claim is made about it anywhere in this
//     file. See the callers' doc comments for why this residual is accepted.
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  projectFolderLayout,
  type ProjectFolderLayout,
} from '../src/persist/projectFolder.ts';

const NO_FOLLOW = process.platform === 'win32' ? 0 : fsConstants.O_NOFOLLOW;
const DIRECTORY_ONLY = process.platform === 'win32' ? 0 : fsConstants.O_DIRECTORY;

/** Create the folder structure for a project. Never destructive: existing files stay. */
export async function scaffoldProjectFolder(
  root: string,
  projectName: string,
): Promise<ProjectFolderLayout> {
  const layout = projectFolderLayout(root, projectName);
  await mkdir(layout.exportsDir, { recursive: true });
  await mkdir(layout.cacheDir, { recursive: true });
  return layout;
}

/**
 * Open `dir` with O_NOFOLLOW and confirm the handle's fstat() matches a fresh
 * lstat() of the same path (dev+ino) and that it is actually a directory.
 * Throws if `dir` is, at this moment, a symlink rather than a real directory.
 * This is a point-in-time check, not a hold: see the module doc comment for
 * exactly what it does and does not close.
 */
async function assertDirectoryNotSymlinked(dir: string): Promise<void> {
  const dirHandle = await open(dir, fsConstants.O_RDONLY | DIRECTORY_ONLY | NO_FOLLOW);
  try {
    const [fdStat, diskStat] = await Promise.all([dirHandle.stat(), lstat(dir)]);
    if (!fdStat.isDirectory() || fdStat.dev !== diskStat.dev || fdStat.ino !== diskStat.ino) {
      throw new Error('project directory target is not the expected directory');
    }
  } finally {
    await dirHandle.close().catch(() => {});
  }
}

/**
 * Read the document. Two checks, in order:
 *   1. The immediate parent directory must not be a symlink (assertDirectoryNotSymlinked).
 *      Without this, a directory component being a symlink is invisible to
 *      the check below: both open(documentPath, O_NOFOLLOW) and
 *      lstat(documentPath) only refuse to follow a symlink at the FINAL path
 *      component — a symlinked directory earlier in the path is transparently
 *      walked by the kernel for both calls, so their dev/ino agree and the
 *      swap goes undetected. This was exactly the round-3 review finding: a
 *      directory component that is a symlink at call time leaked content
 *      deterministically, with no race needed.
 *   2. The target itself is opened with O_NOFOLLOW, then read FROM THAT SAME
 *      HANDLE once its fstat() is confirmed to match a fresh lstat() of the
 *      path — closing the case where the FILE ITSELF (not a directory
 *      component) is a symlink.
 * Together these close the DETERMINISTIC case for both a symlinked directory
 * component and a symlinked target file. Neither closes a genuine race: see
 * the module doc comment.
 */
export async function readProjectFile(documentPath: string): Promise<string> {
  await assertDirectoryNotSymlinked(dirname(documentPath));
  const handle = await open(documentPath, fsConstants.O_RDONLY | NO_FOLLOW);
  try {
    const [fdStat, diskStat] = await Promise.all([handle.stat(), lstat(documentPath)]);
    if (!fdStat.isFile() || fdStat.dev !== diskStat.dev || fdStat.ino !== diskStat.ino) {
      throw new Error('project document target changed between check and read');
    }
    return await handle.readFile('utf8');
  } finally {
    await handle.close().catch(() => {});
  }
}

/**
 * Write the document atomically: a crash mid-write must never leave a
 * truncated project. Write a sibling temp file, then rename over the target
 * (rename is atomic within a filesystem). The temp file lives next to the
 * target (not in a system tmp dir) so the rename never crosses filesystems,
 * which would make it non-atomic or fail outright.
 *
 * Before creating the temp file, assertDirectoryNotSymlinked rejects a `dir`
 * that is, at this moment, a symlink rather than a real directory (the
 * DETERMINISTIC case). The temp file itself is then created with
 * O_CREAT|O_EXCL|O_NOFOLLOW, so it cannot be a pre-existing symlink either.
 * None of this closes a race: the open(temp) and rename() calls below are
 * themselves path-based and re-resolve `dir` from scratch, so a swap timed
 * between the directory check above and either of those calls is not caught.
 */
export async function writeProjectFile(documentPath: string, contents: string): Promise<void> {
  const dir = dirname(documentPath);
  await mkdir(dir, { recursive: true });
  await assertDirectoryNotSymlinked(dir);

  const temp = join(dir, `.${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}.occ.tmp`);
  try {
    const tempHandle = await open(
      temp,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | NO_FOLLOW,
    );
    try {
      await tempHandle.writeFile(contents, 'utf8');
    } finally {
      await tempHandle.close();
    }
    await rename(temp, documentPath);
  } catch (error) {
    // Best-effort cleanup: don't let a leftover temp file survive a failed write.
    await unlink(temp).catch(() => {});
    throw error;
  }
}
