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
    // TWO extension checks, and both are needed. The first tests the path the
    // renderer ASKED BY; the second tests the CANONICAL path that is actually
    // opened. Testing only the requested path left a hole: a `*.occ` symlink
    // inside a registered root whose target is a non-`.occ` file inside that
    // same root passed the first check and then read the target, because
    // resolveAllowedMediaPath returns the realpath()'d target and the read
    // opens that. The second check refuses it. It cannot reject a legitimate
    // call: the realpath of an `X.occ` regular file still ends in `.occ`.
    // Both are EXTENSION checks, not content checks: any file whose canonical
    // path ends in `.occ` and resolves inside a root is exposed by this
    // channel, regardless of what it contains. Non-`.occ` files under a root
    // are not exposed, by name or through a `.occ` symlink.
    if (!documentPath.endsWith(PROJECT_FILE_EXTENSION)) throw new ProjectFileAccessError();
    const allowed = await resolveAllowedMediaPath(documentPath);
    if (!allowed) throw new ProjectFileAccessError();
    if (!allowed.endsWith(PROJECT_FILE_EXTENSION)) throw new ProjectFileAccessError();
    // resolveAllowedMediaPath is a point-in-time check, not a hold (see its
    // doc comment in server/media-roots.ts): `allowed` is canonical AT THE
    // MOMENT OF THIS CHECK, but open() and lstat() inside readProjectFile are
    // themselves path-based and re-resolve it from scratch, so a swap timed
    // between this check and those calls is not caught here. readProjectFile
    // separately rejects the target ITSELF being ALREADY a symlink when it
    // runs, and on POSIX also its IMMEDIATE PARENT directory being one (that
    // parent check is skipped on win32 — see its doc comment in
    // project-file-io.ts). The parent check is one level deep: it does NOT
    // detect a symlinked component higher up the path. Such a path is still refused
    // on this channel, but by the resolveAllowedMediaPath call above, which
    // canonicalises first, so a path escaping every root fails containment —
    // pinned by an executed test in project-file-ipc.verify.ts. Neither check
    // is a narrowing of the race. This residual is accepted because it is not
    // renderer-reachable: exploiting the race needs a co-operating local
    // process or a hostile archive racing the main process's own filesystem
    // calls, not anything the sandboxed, network-facing renderer can trigger.
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
    // doc comment in server/media-roots.ts). Using the canonicalised `parent`
    // it returned, rather than the raw documentPath, means an already-taken
    // realpath()'d string is used, so `dirname` cannot itself be a symlink at
    // that instant — but it is still just a string: nothing stops the same
    // path being swapped for a symlink again after this call returns and
    // before writeProjectFile's mkdir/open(temp)/rename run, all three of
    // which are path-based and re-resolve the directory from scratch.
    // On POSIX, writeProjectFile DOES deterministically reject a `dir` that is
    // ALREADY a symlink when it runs (see its doc comment in
    // project-file-io.ts; that check is skipped on win32, which relies on the
    // realpath() canonicalisation above instead). Where it runs it needs no
    // timing luck, but it covers only ONE level -- `dir` is the immediate
    // parent; a symlinked component higher up the path is not detected there
    // (pinned by an executed test in project-file-io.verify.ts, and refused on
    // this channel by the resolveAllowedMediaPath call above). It is NOT a
    // narrowing of the
    // race: measured, a concurrent swap wins the race in as few attempts
    // post-fix as pre-fix, because the check's own open(temp)/rename() calls
    // afterward re-resolve `dir` by path just like before it existed. Node's
    // fs module has no openat()/dirfd-relative write to hold the verified
    // directory open across those calls, so this cannot be closed from JS.
    // This residual is accepted because it is not renderer-reachable:
    // exploiting the race needs a co-operating local process or a hostile
    // archive racing the main process's own filesystem calls, not anything
    // the sandboxed, network-facing renderer can trigger.
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
