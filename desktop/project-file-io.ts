// Project document I/O for the Electron main process. The renderer has no
// filesystem access, so every read and write funnels through here.
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  projectFolderLayout,
  type ProjectFolderLayout,
} from '../src/persist/projectFolder.ts';

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

export function readProjectFile(documentPath: string): Promise<string> {
  return readFile(documentPath, 'utf8');
}

/**
 * Write the document atomically: a crash mid-write must never leave a
 * truncated project. Write a sibling temp file, then rename over the target
 * (rename is atomic within a filesystem). The temp file lives next to the
 * target (not in a system tmp dir) so the rename never crosses filesystems,
 * which would make it non-atomic or fail outright. If a stale temp file from
 * a previous crash happens to occupy the same name, `writeFile` below simply
 * overwrites it before the rename, so it can't interfere.
 */
export async function writeProjectFile(documentPath: string, contents: string): Promise<void> {
  const dir = dirname(documentPath);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}.occ.tmp`);
  try {
    await writeFile(temp, contents, 'utf8');
    await rename(temp, documentPath);
  } catch (error) {
    // Best-effort cleanup: don't let a leftover temp file survive a failed write.
    await unlink(temp).catch(() => {});
    throw error;
  }
}
