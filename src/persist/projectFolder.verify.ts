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

console.log('projectFolder.verify: layout and relative-path rules OK');
