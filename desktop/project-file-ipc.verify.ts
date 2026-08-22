// Guard check for project document IPC: only .occ files inside a registered
// project root may be read or written, and refusals leak no filesystem detail.
// How to run: npx tsx desktop/project-file-ipc.verify.ts (wired into verify:desktop-window).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearMediaRoots, registerMediaRoot } from '../server/media-roots.ts';
import {
  guardedReadProjectFile,
  guardedScaffoldProjectFolder,
  guardedWriteProjectFile,
} from './project-file-ipc.ts';

const base = await mkdtemp(join(tmpdir(), 'occ-ipc-'));
const project = join(base, 'Project');
const outside = join(base, 'Outside');
await mkdir(project, { recursive: true });
await mkdir(outside, { recursive: true });
await writeFile(join(project, 'Project.occ'), '{"format":"openchatcut-project"}\n');
await writeFile(join(outside, 'secret.txt'), 'outside');

clearMediaRoots();
await registerMediaRoot(project);

// -- a .occ inside the root reads --
assert.match(
  await guardedReadProjectFile(join(project, 'Project.occ')),
  /openchatcut-project/,
  'a document inside a registered root must read',
);

// -- writing a .occ inside the root works --
await guardedWriteProjectFile(join(project, 'Project.occ'), '{"written":true}\n');
assert.equal(await readFile(join(project, 'Project.occ'), 'utf8'), '{"written":true}\n');

// -- a path outside every root is refused, for read AND write --
await assert.rejects(
  () => guardedReadProjectFile(join(outside, 'secret.txt')),
  (error: Error) => {
    assert.doesNotMatch(error.message, /Outside|secret|\//, 'the refusal must not leak the path');
    return true;
  },
  'reading outside every root must be refused',
);
await assert.rejects(
  () => guardedWriteProjectFile(join(outside, 'pwned.occ'), 'x'),
  'writing outside every root must be refused',
);
assert.equal(
  await readFile(join(outside, 'secret.txt'), 'utf8'),
  'outside',
  'a refused write must not have touched anything',
);

// -- a non-.occ target inside the root is refused: the allowlist alone is not enough --
await assert.rejects(
  () => guardedWriteProjectFile(join(project, 'notes.txt'), 'x'),
  'writing a non-.occ file inside the root must be refused',
);

// -- traversal out of the root is refused --
await assert.rejects(
  () => guardedWriteProjectFile(join(project, '..', 'Outside', 'pwned.occ'), 'x'),
  'a .. traversal out of the root must be refused',
);

// -- scaffolding registers the new folder as a root and succeeds --
const fresh = join(base, 'Fresh');
await mkdir(fresh, { recursive: true });
const layout = await guardedScaffoldProjectFolder(fresh, 'Fresh');
assert.ok(layout.documentPath.endsWith('Fresh.occ'));

console.log('project-file-ipc.verify: allowlist, extension check and scrubbed refusals hold');
