// Project document I/O for the Electron main process. The renderer has no
// filesystem access, so every read and write funnels through here.
//
// Reachable only through desktop/project-file-ipc.ts's guards (allowlist,
// extension check, root grants, scrubbed errors). This module additionally
// narrows the TOCTOU window between an allowlist check upstream and the
// actual open/write here, mirroring server/plugins/upload-routes.ts's
// verifyLocalMediaTarget: open with O_NOFOLLOW, then compare the open
// handle's fstat() against a fresh lstat() of the same path, so a path whose
// final component was swapped for a symlink between the check and this call
// is rejected rather than silently followed. This narrows, but — because
// Node's fs module exposes no openat()/dirfd-relative operations — cannot
// fully close the window for a swap of a path component ABOVE the immediate
// target; see the callers' doc comments for why that residual is accepted.
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
 * Read the document through a single verified handle: open with O_NOFOLLOW
 * (rejects if the final path component is a symlink), then confirm the open
 * handle's fstat() matches a fresh lstat() of the same path (dev+ino) before
 * reading FROM THAT HANDLE — never by reopening the path a second time. This
 * closes the read-side TOCTOU race for the target file itself: there is no
 * second path-based lookup for an attacker to win a race against.
 */
export async function readProjectFile(documentPath: string): Promise<string> {
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
 * Before creating the temp file, the parent directory is re-opened with
 * O_NOFOLLOW and its handle's fstat() is compared against a fresh lstat() of
 * the same path: if `dir` was swapped for a symlink between an earlier
 * allowlist check and this call, that swap is caught here rather than
 * silently followed. The temp file itself is then created with
 * O_CREAT|O_EXCL|O_NOFOLLOW, so it cannot be a pre-existing symlink either.
 */
export async function writeProjectFile(documentPath: string, contents: string): Promise<void> {
  const dir = dirname(documentPath);
  await mkdir(dir, { recursive: true });

  const dirHandle = await open(dir, fsConstants.O_RDONLY | DIRECTORY_ONLY | NO_FOLLOW);
  try {
    const [fdStat, diskStat] = await Promise.all([dirHandle.stat(), lstat(dir)]);
    if (!fdStat.isDirectory() || fdStat.dev !== diskStat.dev || fdStat.ino !== diskStat.ino) {
      throw new Error('project directory target changed between check and write');
    }
  } finally {
    await dirHandle.close().catch(() => {});
  }

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
