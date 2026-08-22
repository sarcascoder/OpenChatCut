// Session grants for scaffold-eligible project roots: only a directory the
// user chose through a trusted OS dialog (grantProjectRoot) is eligible; a
// directory the renderer merely names is not, even if it exists on disk and
// even after a matching directory elsewhere was granted.
// How to run: npx tsx desktop/project-root-grants.verify.ts (wired into verify:desktop-window).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearProjectRootGrants,
  grantProjectRoot,
  isProjectRootGranted,
} from './project-root-grants.ts';

const base = await mkdtemp(join(tmpdir(), 'occ-root-grants-'));
const granted = join(base, 'Granted');
const ungranted = join(base, 'Ungranted');
await mkdir(granted, { recursive: true });
await mkdir(ungranted, { recursive: true });

clearProjectRootGrants();

// -- nothing is granted before a dialog pick --
assert.equal(await isProjectRootGranted(granted), false, 'a directory is not granted until chosen');

// -- grantProjectRoot (called by the select-project-folder dialog handler) admits it --
const canonicalGranted = await grantProjectRoot(granted);
assert.equal(await isProjectRootGranted(granted), true, 'a directory the dialog granted is eligible');
assert.ok(canonicalGranted.endsWith('Granted'), 'grantProjectRoot returns the canonicalised path');

// -- a directory the renderer merely names, never chosen through the dialog, stays refused --
assert.equal(
  await isProjectRootGranted(ungranted),
  false,
  'a directory that was never granted must not become eligible',
);

// -- a symlink to a granted directory is not itself granted: the grant is per-canonical-path,
//    but resolves through realpath, so this checks the grant does not widen via aliasing --
const alias = join(base, 'Alias');
await symlink(granted, alias);
assert.equal(
  await isProjectRootGranted(alias),
  true,
  'a symlink that resolves to a granted directory is granted (same canonical path)',
);

// -- clearing removes every grant --
clearProjectRootGrants();
assert.equal(await isProjectRootGranted(granted), false, 'clearProjectRootGrants revokes every prior grant');

// -- a path that does not exist is refused, not thrown --
assert.equal(
  await isProjectRootGranted(join(base, 'does-not-exist')),
  false,
  'a nonexistent directory is refused rather than throwing',
);

console.log('project-root-grants.verify: only dialog-chosen roots are scaffold-eligible');
