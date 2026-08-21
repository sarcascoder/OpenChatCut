// Path rules for a folder-backed project. Pure: no filesystem access, so the
// rules that decide what lives where stay testable on their own.
import { posix } from 'node:path';
import { PROJECT_FILE_EXTENSION } from './projectFile';

export interface ProjectFolderLayout {
  root: string;
  documentPath: string;
  exportsDir: string;
  cacheDir: string;
}

/** Make a project name safe to use as a filename, without ever escaping the folder. */
export function sanitizeProjectFolderName(name: string): string {
  const cleaned = name.trim().replace(/[/\\:*?"<>|]/g, '-');
  if (cleaned === '' || /^\.+$/.test(cleaned)) return 'Untitled';
  return cleaned;
}

export function projectFolderLayout(root: string, projectName: string): ProjectFolderLayout {
  const base = root.replace(/\/+$/, '');
  return {
    root: base,
    documentPath: `${base}/${sanitizeProjectFolderName(projectName)}${PROJECT_FILE_EXTENSION}`,
    exportsDir: `${base}/exports`,
    cacheDir: `${base}/.occ`,
  };
}

/**
 * Path of `absolutePath` relative to the project root, or null when it lies
 * outside. Used to decide whether a media reference can be stored relative
 * (portable) or must stay absolute.
 */
export function projectRelativePath(root: string, absolutePath: string): string | null {
  const base = posix.resolve(root.replace(/\/+$/, ''));
  const target = posix.resolve(absolutePath);
  if (target === base) return '';
  const prefix = `${base}/`;
  // A shared string prefix is not containment: /a/Proj2 must not match /a/Proj.
  if (!target.startsWith(prefix)) return null;
  return target.slice(prefix.length);
}
