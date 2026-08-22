// Project document I/O for the Electron main process. The renderer has no
// filesystem access, so every read and write funnels through here.
//
// Reachable only through desktop/project-file-ipc.ts's guards (allowlist,
// extension checks, root grants, scrubbed errors). This module additionally
// checks, with O_NOFOLLOW + fstat()/lstat() dev+ino comparisons (mirroring
// server/plugins/upload-routes.ts's verifyLocalMediaTarget), that the
// IMMEDIATE PARENT DIRECTORY is not a symlink at the moment of the call.
//
// EVERY symlink claim below describes POSIX. O_NOFOLLOW and O_DIRECTORY do not
// exist on Windows, so NO_FOLLOW and DIRECTORY_ONLY are 0 there: the directory
// check is skipped outright on win32 (see assertDirectoryNotSymlinked below)
// and the target opens do not themselves refuse a symlinked final component.
// On win32 the containment defence is the realpath() canonicalisation in
// server/media-roots.ts, applied by the guards one layer above.
//
// The TARGET FILE is treated differently by the two entry points, and the
// difference matters: readProjectFile REJECTS a symlinked target (O_NOFOLLOW
// makes its open() fail with ELOOP), while writeProjectFile does NOT reject
// one — it rename()s its temp file over the symlink, which REPLACES the
// symlink with a regular file and leaves whatever it pointed at untouched
// (executed, on macOS).
//
// Read PRECISELY what this does and does not buy you:
//   - On POSIX it rejects, with no timing and no race involved, a call whose
//     IMMEDIATE PARENT directory was ALREADY a symlink before the call
//     started, and — on the READ path only — a call whose TARGET FILE was
//     already a symlink. That is the common case: a hostile archive or a
//     co-operating local process that pre-arranges a symlink and then triggers
//     a read/write through it. On the WRITE path a pre-arranged symlinked
//     target is replaced rather than refused, so it likewise does not redirect
//     the write to the link's target.
//   - It checks exactly ONE directory level. A symlinked component HIGHER in
//     the path — a grandparent or above — is NOT detected: the kernel walks
//     such a component transparently for both the open() and the lstat(), so
//     their dev/ino agree and nothing here notices. Executed and pinned as a
//     known limit in project-file-io.verify.ts. Callers arriving through
//     desktop/project-file-ipc.ts are covered regardless, because
//     resolveAllowedMediaPath canonicalises the candidate with realpath()
//     before this module ever sees a path; the one-level check is
//     defence-in-depth for future callers that do not pre-canonicalise. It is
//     deliberately NOT extended to walk every component: this module does not
//     know the granted root, so it has no boundary to stop at, and walking up
//     to / would refuse legitimate paths on macOS, where /tmp and /var are
//     themselves symlinks (to /private/tmp and /private/var).
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

const IS_WIN32 = process.platform === 'win32';
const NO_FOLLOW = IS_WIN32 ? 0 : fsConstants.O_NOFOLLOW;
const DIRECTORY_ONLY = IS_WIN32 ? 0 : fsConstants.O_DIRECTORY;

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
 *
 * POSIX-ONLY, and skipped outright on win32 rather than silently degraded.
 * Two independent reasons, either one sufficient:
 *   - No benefit there. O_NOFOLLOW and O_DIRECTORY do not exist on Windows,
 *     so NO_FOLLOW and DIRECTORY_ONLY are both 0 and the open() below would
 *     reduce to a plain O_RDONLY — which follows a reparse point like any
 *     other path and therefore detects nothing. The dev+ino comparison then
 *     compares two equally-followed views of the same object.
 *   - Pure cost there. Node cannot open a directory with fs.open on Windows
 *     (hence fs.opendir), so the call would reject for every path, making
 *     readProjectFile and writeProjectFile fail unconditionally; the
 *     deliberate error scrubbing in desktop/project-file-ipc.ts would then
 *     collapse a platform-wide break into the same generic refusal.
 * On win32 the containment defence is the realpath() canonicalisation in
 * server/media-roots.ts, applied by the guards one layer above, which does
 * resolve reparse points. This branch is reasoned from the Node and Win32
 * APIs and from the zeroed constants above; it has not been executed on a
 * Windows machine.
 */
async function assertDirectoryNotSymlinked(dir: string): Promise<void> {
  if (IS_WIN32) return;
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
 * Read the document. Two checks, in order (both POSIX — see the module doc
 * comment for what runs on win32):
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
 * Between them they cover a symlinked IMMEDIATE PARENT and a symlinked target
 * file. Check 1 looks at one level only: a symlinked component higher up the
 * path — a grandparent or above — is detected by NEITHER check, and reads
 * through it succeed. That limit is deliberate and is pinned by an executed
 * test in project-file-io.verify.ts; callers coming through
 * desktop/project-file-ipc.ts are covered anyway, because
 * resolveAllowedMediaPath canonicalises the path before this function runs.
 * And neither check closes a genuine race: see the module doc comment.
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
 * DETERMINISTIC case) — on POSIX; that check is skipped on win32, see the
 * module doc comment. The temp file itself is then created with
 * O_CREAT|O_EXCL|O_NOFOLLOW, so it cannot be a pre-existing symlink either.
 * The TARGET is treated differently from readProjectFile: a symlinked target
 * is not rejected here. The rename() below replaces the symlink itself with
 * the new regular file, so the write does not reach whatever the link pointed
 * at.
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
