// Path rules for a folder-backed project. Pure: no filesystem access, so the
// rules that decide what lives where stay testable on their own.
//
// projectRelativePath deliberately does NOT use node:path's platform-bound
// resolution (no `path`, no `path.win32`). A project document written on
// Windows must open identically on macOS/Linux, so the same input string
// must produce the same answer regardless of which OS is running this code.
// Instead we parse POSIX, Windows-drive, and UNC absolute forms explicitly
// and normalize `.`/`..` ourselves.
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

interface ParsedAbsolutePath {
  /** Canonical marker for the "volume" this path lives on: '/', 'C:', or '//server/share'. */
  root: string;
  /** Fully normalized path (forward slashes, no trailing slash, `.`/`..` resolved). */
  path: string;
}

/** Collapse `.` and `..` segments without touching the filesystem or cwd. */
function normalizeSegments(rest: string): string[] {
  const out: string[] = [];
  for (const part of rest.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out;
}

/**
 * Parse an absolute path in POSIX, Windows-drive (`C:\...` / `C:/...`), or
 * UNC (`\\server\share\...`) form. Returns null when the input is not
 * absolute in any recognized form (relative paths have no fixed volume to
 * compare against).
 */
function parseAbsolutePath(input: string): ParsedAbsolutePath | null {
  const s = input.replace(/\\/g, '/');

  // UNC: //server/share/... (checked before the plain POSIX-root case, since
  // a UNC path also starts with a single '/').
  const unc = /^\/\/+([^/]+)\/+([^/]+)\/*(.*)$/.exec(s);
  if (unc) {
    const [, server, share, rest] = unc;
    const root = `//${server}/${share}`;
    const segments = normalizeSegments(rest);
    return { root, path: segments.length ? `${root}/${segments.join('/')}` : `${root}/` };
  }

  // Windows drive: C:/... or C:\... (already slash-normalized above).
  const drive = /^([A-Za-z]):\/(.*)$/.exec(s);
  if (drive) {
    const [, letter, rest] = drive;
    // Drive letters are case-insensitive on Windows regardless of which OS
    // later reads this path, so canonicalize to uppercase for comparison.
    const root = `${letter.toUpperCase()}:`;
    const segments = normalizeSegments(rest);
    return { root, path: segments.length ? `${root}/${segments.join('/')}` : `${root}/` };
  }

  // POSIX root: /...
  if (s.startsWith('/')) {
    const segments = normalizeSegments(s.slice(1));
    return { root: '/', path: segments.length ? `/${segments.join('/')}` : '/' };
  }

  return null;
}

/**
 * Path of `absolutePath` relative to the project root, or null when it lies
 * outside. Used to decide whether a media reference can be stored relative
 * (portable) or must stay absolute.
 */
export function projectRelativePath(root: string, absolutePath: string): string | null {
  const base = parseAbsolutePath(root);
  const target = parseAbsolutePath(absolutePath);
  if (!base || !target) return null;
  // Different volumes (POSIX root vs a drive letter, or two different drive
  // letters/UNC shares) are never containment, no matter what the path text
  // looks like.
  if (base.root !== target.root) return null;
  if (target.path === base.path) return '';
  const prefix = base.path.endsWith('/') ? base.path : `${base.path}/`;
  // A shared string prefix is not containment: /a/Proj2 must not match /a/Proj,
  // and C:\a\Proj2 must not match C:\a\Proj. Requiring the trailing separator
  // in the prefix rules that out on every path form.
  if (!target.path.startsWith(prefix)) return null;
  return target.path.slice(prefix.length);
}
