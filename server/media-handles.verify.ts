// Opaque-id registry for served media: the renderer references a file by id,
// never by path, so a URL cannot be forged to reach a different file.
// How to run: npx tsx server/media-handles.verify.ts (wired into verify:server-extra).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearMediaRoots, registerMediaRoot } from './media-roots.ts';
import { clearMediaHandles, createMediaHandle, resolveMediaHandle } from './media-handles.ts';

const base = await mkdtemp(join(tmpdir(), 'occ-handles-'));
const project = join(base, 'Project');
const outside = join(base, 'Outside');
await mkdir(project, { recursive: true });
await mkdir(outside, { recursive: true });
await writeFile(join(project, 'clip.mp4'), 'inside');
await writeFile(join(outside, 'secret.txt'), 'outside');

clearMediaRoots();
clearMediaHandles();
await registerMediaRoot(project);

// -- an admitted path yields an id that resolves back to it --
const id = await createMediaHandle(join(project, 'clip.mp4'));
assert.ok(id, 'an admitted path must produce a handle');
const resolved = resolveMediaHandle(id);
assert.ok(resolved && resolved.endsWith('clip.mp4'), 'the handle resolves to the file');

// -- the id leaks no path information --
assert.ok(!id.includes('clip'), 'the id must not contain the filename');
assert.ok(!id.includes('/') && !id.includes('\\'), 'the id must not contain separators');
assert.ok(/^[a-f0-9]{16,}$/.test(id), 'the id is opaque hex');

// -- a path outside the roots yields no handle at all --
assert.equal(
  await createMediaHandle(join(outside, 'secret.txt')),
  null,
  'a path outside every root must not be registrable',
);

// -- an unknown id resolves to null, and cannot be guessed into a file --
assert.equal(resolveMediaHandle('deadbeefdeadbeef'), null, 'an unknown id resolves to null');
assert.equal(resolveMediaHandle(''), null, 'an empty id resolves to null');
assert.equal(resolveMediaHandle('../../etc/passwd'), null, 'a path-shaped id resolves to null');

// -- the same path yields a stable id rather than growing the registry --
const again = await createMediaHandle(join(project, 'clip.mp4'));
assert.equal(again, id, 'registering the same path twice reuses its handle');

console.log('media-handles.verify: opaque ids, no path leakage, unknown ids refused');
