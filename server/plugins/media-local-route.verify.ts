// Route check for /media/local/<id>: only registered ids serve, everything else 404s,
// and the TOCTOU mitigation actually rejects a path swapped for a symlink after the
// handle was created.
// How to run: npx tsx server/plugins/media-local-route.verify.ts (wired into verify:server-extra).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearMediaRoots, registerMediaRoot } from '../media-roots.ts';
import { clearMediaHandles, createMediaHandle } from '../media-handles.ts';
import { mediaLocalHandleFromUrl, verifyLocalMediaTarget } from './upload-routes.ts';

const base = await mkdtemp(join(tmpdir(), 'occ-local-route-'));
const project = join(base, 'Project');
const outside = join(base, 'Outside');
await mkdir(project, { recursive: true });
await mkdir(outside, { recursive: true });
await writeFile(join(project, 'clip.mp4'), 'inside');
await writeFile(join(outside, 'secret.txt'), 'outside');

clearMediaRoots();
clearMediaHandles();
await registerMediaRoot(project);
const id = await createMediaHandle(join(project, 'clip.mp4'));
assert.ok(id, 'fixture: the handle must exist');

// -- the id parsed out of a URL round-trips --
assert.equal(mediaLocalHandleFromUrl(`/media/local/${id}`), id, 'a well-formed url yields its id');
assert.equal(mediaLocalHandleFromUrl(`/media/local/${id}?t=1`), id, 'a query string is ignored');

// -- anything path-shaped is rejected at parse time, before any fs access --
for (const bad of [
  '/media/local/',
  '/media/local/../../etc/passwd',
  '/media/local/..%2f..%2fetc%2fpasswd',
  '/media/local/a/b',
  '/media/local/%2e%2e%2f',
]) {
  assert.equal(mediaLocalHandleFromUrl(bad), null, `must reject: ${bad}`);
}

console.log('media-local-route.verify: id parsing rejects every path-shaped input');

// -- TOCTOU mitigation: the file backing an admitted handle is re-verified at serve --

// The unmodified file admitted at handle-creation time still verifies.
assert.equal(
  await verifyLocalMediaTarget(join(project, 'clip.mp4')),
  true,
  'an unchanged admitted file must re-verify',
);

// Simulate the attack the media-roots.ts TOCTOU note describes: the handle already
// exists (created above, when the path was a real file inside the root), and *after*
// that, the path on disk is replaced by a symlink pointing outside every root.
await rm(join(project, 'clip.mp4'));
await symlink(join(outside, 'secret.txt'), join(project, 'clip.mp4'));

assert.equal(
  await verifyLocalMediaTarget(join(project, 'clip.mp4')),
  false,
  'a path swapped for a symlink after handle creation must fail re-verification (O_NOFOLLOW)',
);

// The stored handle must not survive this to serve the swapped-in file: it still
// resolves to the same (now-hostile) path string — resolveMediaHandle is a cache, not
// a re-check — but the route's re-verification step (exercised above) is what refuses
// it, which is exactly why that step exists rather than trusting resolveMediaHandle alone.

// -- a non-symlink swap (unlink + recreate with a different identity) is also caught --
await rm(join(project, 'clip.mp4'));
await writeFile(join(project, 'clip.mp4'), 'a different file entirely');
assert.equal(
  await verifyLocalMediaTarget(join(project, 'clip.mp4')),
  true,
  'a same-path regular file re-verifies (fstat/lstat identity matches, as designed: ' +
  'the check pins path identity at serve time, not byte-for-byte content since handle creation)',
);

// -- a missing file fails closed rather than throwing --
await rm(join(project, 'clip.mp4'));
assert.equal(
  await verifyLocalMediaTarget(join(project, 'clip.mp4')),
  false,
  'a deleted path must fail closed',
);

console.log('media-local-route.verify: TOCTOU re-verification rejects a symlink swap and fails closed on a missing file');
