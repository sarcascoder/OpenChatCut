// Guarded entry points for project document I/O. The renderer is untrusted, so
// every path is admitted by the media-root allowlist first, writes are limited
// to the project document extension, and refusals carry no filesystem detail.
import { dirname } from 'node:path';
import { PROJECT_FILE_EXTENSION } from '../src/persist/projectFile.ts';
import type { ProjectFolderLayout } from '../src/persist/projectFolder.ts';
import { registerMediaRoot, resolveAllowedMediaPath } from '../server/media-roots.ts';
import { readProjectFile, scaffoldProjectFolder, writeProjectFile } from './project-file-io.ts';

/** Refusal carries no path, errno or syscall: the renderer learns only that it was refused. */
export class ProjectFileAccessError extends Error {
  constructor() {
    super('project path is not accessible');
    this.name = 'ProjectFileAccessError';
  }
}

export async function guardedReadProjectFile(documentPath: string): Promise<string> {
  const allowed = await resolveAllowedMediaPath(documentPath);
  if (!allowed) throw new ProjectFileAccessError();
  return readProjectFile(allowed);
}

export async function guardedWriteProjectFile(documentPath: string, contents: string): Promise<void> {
  if (!documentPath.endsWith(PROJECT_FILE_EXTENSION)) throw new ProjectFileAccessError();
  // The target may not exist yet, so admit its DIRECTORY rather than the file.
  const parent = await resolveAllowedMediaPath(dirname(documentPath));
  if (!parent) throw new ProjectFileAccessError();
  await writeProjectFile(documentPath, contents);
}

export async function guardedScaffoldProjectFolder(
  root: string,
  projectName: string,
): Promise<ProjectFolderLayout> {
  const layout = await scaffoldProjectFolder(root, projectName);
  // A folder the user just chose becomes a root, so its document is reachable.
  await registerMediaRoot(layout.root);
  return layout;
}
