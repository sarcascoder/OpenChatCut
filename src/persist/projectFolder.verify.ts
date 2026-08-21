// Pure-path check for the project folder layout and project-relative resolution.
// How to run: npx tsx src/persist/projectFolder.verify.ts (wired into verify:media-persist).
import assert from 'node:assert/strict';
import {
  projectFolderLayout,
  projectRelativePath,
  sanitizeProjectFolderName,
} from './projectFolder';

// -- layout --
const layout = projectFolderLayout('/Users/me/Videos/My Edit', 'My Edit');
assert.equal(layout.root, '/Users/me/Videos/My Edit');
assert.equal(layout.documentPath, '/Users/me/Videos/My Edit/My Edit.occ');
assert.equal(layout.exportsDir, '/Users/me/Videos/My Edit/exports');
assert.equal(layout.cacheDir, '/Users/me/Videos/My Edit/.occ');

// -- a name that is unsafe as a filename still yields a usable document path --
assert.equal(
  projectFolderLayout('/r', 'a/b:c').documentPath,
  '/r/a-b-c.occ',
  'path separators and colons must not escape the folder',
);
assert.equal(sanitizeProjectFolderName('  spaced  '), 'spaced');
assert.equal(sanitizeProjectFolderName(''), 'Untitled', 'an empty name falls back');
assert.equal(sanitizeProjectFolderName('.'), 'Untitled', 'a dot-only name falls back');
assert.equal(sanitizeProjectFolderName('..'), 'Untitled', 'a parent-dir name falls back');

// -- project-relative resolution --
assert.equal(
  projectRelativePath('/Users/me/Proj', '/Users/me/Proj/media/a.mp4'),
  'media/a.mp4',
  'a file under the root is relative',
);
assert.equal(
  projectRelativePath('/Users/me/Proj', '/Volumes/SSD/a.mp4'),
  null,
  'a file outside the root has no relative form',
);
assert.equal(
  projectRelativePath('/Users/me/Proj', '/Users/me/Proj2/a.mp4'),
  null,
  'a sibling folder with a shared prefix is not inside the root',
);
assert.equal(
  projectRelativePath('/Users/me/Proj/', '/Users/me/Proj/a.mp4'),
  'a.mp4',
  'a trailing separator on the root is tolerated',
);
assert.equal(
  projectRelativePath('/Users/me/Proj', '/Users/me/Proj/media/../a.mp4'),
  'a.mp4',
  '.. sequences are normalized before the containment check',
);
assert.equal(
  projectRelativePath('/Users/me/Proj', '/Users/me/Proj/../Proj2/a.mp4'),
  null,
  '.. sequences that escape the root are still rejected',
);

// -- project-relative resolution: Windows paths --
assert.equal(
  projectRelativePath('C:\\Users\\me\\Proj', 'C:\\Users\\me\\Proj\\media\\a.mp4'),
  'media/a.mp4',
  'a Windows-style absolute path under the root is relative, with forward slashes on output',
);
assert.equal(
  projectRelativePath('C:\\a\\Proj', 'C:\\a\\Proj2\\clip.mp4'),
  null,
  'a Windows sibling folder with a shared prefix is not inside the root',
);
assert.equal(
  projectRelativePath('C:\\Users\\me\\Proj', 'C:/Users/me/Proj/media/a.mp4'),
  'media/a.mp4',
  'mixed separators (root backslash-style, target forward-slash-style) still resolve',
);
assert.equal(
  projectRelativePath('C:\\Users\\me\\Proj', 'D:\\Users\\me\\Proj\\a.mp4'),
  null,
  'a different drive letter is a different volume, never containment',
);
assert.equal(
  projectRelativePath('c:\\Users\\me\\Proj', 'C:\\Users\\me\\Proj\\a.mp4'),
  'a.mp4',
  'the drive letter is compared case-insensitively',
);
assert.equal(
  projectRelativePath('\\\\server\\share\\Proj', '\\\\server\\share\\Proj\\media\\a.mp4'),
  'media/a.mp4',
  'a UNC path under the root is relative',
);
assert.equal(
  projectRelativePath('C:\\Users\\me\\Proj', '/Users/me/Proj/a.mp4'),
  null,
  'a POSIX path is never contained by a Windows-drive root',
);

console.log('projectFolder.verify: layout and relative-path rules OK');
