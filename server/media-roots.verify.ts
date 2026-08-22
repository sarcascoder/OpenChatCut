// Containment check for served media paths: canonicalises with realpath before
// testing, so a symlink inside a root cannot escape it.
// How to run: npx tsx server/media-roots.verify.ts (wired into verify:server-extra).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearMediaRoots,
  listMediaRoots,
  registerMediaRoot,
  resolveAllowedMediaPath,
} from './media-roots.ts';

const base = await mkdtemp(join(tmpdir(), 'occ-roots-'));
const project = join(base, 'Project');
const outside = join(base, 'Outside');
await mkdir(join(project, 'media'), { recursive: true });
await mkdir(outside, { recursive: true });
await writeFile(join(project, 'media', 'clip.mp4'), 'inside');
await writeFile(join(outside, 'secret.txt'), 'outside');

clearMediaRoots();
const canonicalRoot = await registerMediaRoot(project);
assert.equal(listMediaRoots().length, 1, 'the root is registered once');

// -- a real file inside the root is admitted --
const inside = await resolveAllowedMediaPath(join(project, 'media', 'clip.mp4'));
assert.ok(inside, 'a file inside a registered root must be admitted');
assert.ok(inside.startsWith(canonicalRoot), 'the returned path is canonical');

// -- a file outside every root is refused --
assert.equal(
  await resolveAllowedMediaPath(join(outside, 'secret.txt')),
  null,
  'a file outside every root must be refused',
);

// -- traversal that climbs out is refused --
assert.equal(
  await resolveAllowedMediaPath(join(project, 'media', '..', '..', 'Outside', 'secret.txt')),
  null,
  'a .. sequence that escapes the root must be refused',
);

// -- THE SYMLINK CASE: a link inside the root pointing outside is refused --
await symlink(join(outside, 'secret.txt'), join(project, 'media', 'escape.txt'));
assert.equal(
  await resolveAllowedMediaPath(join(project, 'media', 'escape.txt')),
  null,
  'a symlink inside the root that points outside it must be refused',
);

// -- a link inside the root pointing inside the root is fine --
await symlink(join(project, 'media', 'clip.mp4'), join(project, 'media', 'alias.mp4'));
assert.ok(
  await resolveAllowedMediaPath(join(project, 'media', 'alias.mp4')),
  'a symlink that stays inside the root is admitted',
);

// -- a path that does not exist is refused, not thrown --
assert.equal(
  await resolveAllowedMediaPath(join(project, 'media', 'missing.mp4')),
  null,
  'a missing file is refused rather than throwing',
);

// -- with no roots registered, nothing is admitted --
clearMediaRoots();
assert.equal(
  await resolveAllowedMediaPath(join(project, 'media', 'clip.mp4')),
  null,
  'with no registered roots, every path is refused',
);

console.log('media-roots.verify: canonical containment, symlink escape and traversal closed');
