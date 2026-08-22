// Guarded entry points for project document I/O. The renderer is untrusted, so
// every path is admitted by the media-root allowlist first, both reads and
// writes are limited to the project document extension, a scaffold target
// must have been explicitly granted by the user through a trusted OS dialog
// (never self-authorised by the renderer), and ANY failure — refusal or a raw
// filesystem error (EACCES, EISDIR, a NUL-byte TypeError, ...) — is collapsed
// to the same generic error so the renderer cannot use the error surface as a
// file-existence oracle.
import { basename, dirname, join } from 'node:path';
import { PROJECT_FILE_EXTENSION } from '../src/persist/projectFile.ts';
import type { ProjectFolderLayout } from '../src/persist/projectFolder.ts';
import { registerMediaRoot, resolveAllowedMediaPath } from '../server/media-roots.ts';
import { isProjectRootGranted } from './project-root-grants.ts';
import { readProjectFile, scaffoldProjectFolder, writeProjectFile } from './project-file-io.ts';

/** Refusal carries no path, errno or syscall: the renderer learns only that it was refused. */
export class ProjectFileAccessError extends Error {
  constructor() {
    super('project path is not accessible');
    this.name = 'ProjectFileAccessError';
  }
}

export async function guardedReadProjectFile(documentPath: string): Promise<string> {
  try {
    // This channel exposes project documents only, never arbitrary files
    // inside a registered root.
    if (!documentPath.endsWith(PROJECT_FILE_EXTENSION)) throw new ProjectFileAccessError();
    const allowed = await resolveAllowedMediaPath(documentPath);
    if (!allowed) throw new ProjectFileAccessError();
    return await readProjectFile(allowed);
  } catch {
    // Any failure — refusal, missing file, EACCES, EISDIR, a malformed path —
    // must be indistinguishable, or the renderer gets a file-existence oracle.
    throw new ProjectFileAccessError();
  }
}

export async function guardedWriteProjectFile(documentPath: string, contents: string): Promise<void> {
  try {
    if (!documentPath.endsWith(PROJECT_FILE_EXTENSION)) throw new ProjectFileAccessError();
    // The target may not exist yet, so admit its DIRECTORY rather than the file.
    const parent = await resolveAllowedMediaPath(dirname(documentPath));
    if (!parent) throw new ProjectFileAccessError();
    // resolveAllowedMediaPath is a point-in-time check, not a hold (see its
    // doc comment in server/media-roots.ts): use the canonicalised parent it
    // returned, not the raw (potentially symlink-relative) documentPath, so a
    // swap between the check and this write can't retarget the write.
    await writeProjectFile(join(parent, basename(documentPath)), contents);
  } catch {
    throw new ProjectFileAccessError();
  }
}

export async function guardedScaffoldProjectFolder(
  root: string,
  projectName: string,
): Promise<ProjectFolderLayout> {
  try {
    // A root is only eligible once the user has chosen it through a trusted
    // OS dialog (desktop/project-root-grants.ts) — never because the
    // renderer named it. Otherwise the renderer could scaffold $HOME and,
    // since registerMediaRoot has no other production caller, self-authorise
    // the allowlist for arbitrary reads/writes under it.
    if (!(await isProjectRootGranted(root))) throw new ProjectFileAccessError();
    const layout = await scaffoldProjectFolder(root, projectName);
    // A folder the user just chose becomes a root, so its document is reachable.
    await registerMediaRoot(layout.root);
    return layout;
  } catch {
    throw new ProjectFileAccessError();
  }
}
