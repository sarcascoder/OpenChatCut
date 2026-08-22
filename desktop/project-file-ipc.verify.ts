// Guard check for project document IPC: only .occ files inside a registered
// project root may be read or written, a scaffold target must have been
// explicitly granted through a trusted OS dialog (never self-authorised by
// the renderer), and every refusal — deliberate or a raw filesystem error
// (EACCES, EISDIR, a NUL-byte TypeError, ...) — is indistinguishable, so the
// renderer never gets a file-existence oracle.
// How to run: npx tsx desktop/project-file-ipc.verify.ts (wired into verify:desktop-window).
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearMediaRoots, listMediaRoots, registerMediaRoot } from '../server/media-roots.ts';
import { clearProjectRootGrants, grantProjectRoot } from './project-root-grants.ts';
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
clearProjectRootGrants();
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
// Capture the exact refusal message: every other failure mode below must
// produce this SAME string, not merely "not mention the path".
let refusalMessage = '';
await assert.rejects(
  () => guardedReadProjectFile(join(outside, 'secret.txt')),
  (error: Error) => {
    assert.doesNotMatch(error.message, /Outside|secret|\//, 'the refusal must not leak the path');
    refusalMessage = error.message;
    return true;
  },
  'reading outside every root must be refused',
);
assert.ok(refusalMessage, 'a refusal message must have been captured');
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
assert.equal(
  (await readdir(project)).includes('notes.txt'),
  false,
  'a refused write must not create the target at all',
);

// -- reading a non-.occ file inside a registered root is refused too --
// (the extension check must apply to reads, not just writes, or a scaffolded
// root that admits arbitrary paths becomes an arbitrary-file-read primitive)
await writeFile(join(project, 'notes.occ.bak'), 'not a project document');
await assert.rejects(
  () => guardedReadProjectFile(join(project, 'notes.occ.bak')),
  'reading a non-.occ file inside the root must be refused',
);

// -- traversal out of the root is refused --
await assert.rejects(
  () => guardedWriteProjectFile(join(project, '..', 'Outside', 'pwned.occ'), 'x'),
  'a .. traversal out of the root must be refused',
);

// -- scaffolding a NON-granted root is refused, and touches neither the filesystem nor the allowlist --
const ungranted = join(base, 'Ungranted');
await mkdir(ungranted, { recursive: true });
const rootCountBeforeUngranted = listMediaRoots().length;
await assert.rejects(
  () => guardedScaffoldProjectFolder(ungranted, 'Ungranted'),
  'scaffolding a root the renderer merely names (never granted via the dialog) must be refused',
);
assert.deepEqual(
  await readdir(ungranted),
  [],
  'a refused scaffold must not create exports/cache directories',
);
assert.equal(
  listMediaRoots().length,
  rootCountBeforeUngranted,
  'a refused scaffold must not register a new allowlist root — this is the self-authorisation hole',
);

// -- scaffolding a GRANTED root registers it and succeeds --
const fresh = join(base, 'Fresh');
await mkdir(fresh, { recursive: true });
await grantProjectRoot(fresh);
const layout = await guardedScaffoldProjectFolder(fresh, 'Fresh');
assert.ok(layout.documentPath.endsWith('Fresh.occ'));

// -- every raw filesystem failure mode is indistinguishable from a plain refusal --
// permission-denied (EACCES)
const lockedDir = join(base, 'Locked');
await mkdir(lockedDir, { recursive: true });
await registerMediaRoot(lockedDir);
const lockedDoc = join(lockedDir, 'Locked.occ');
await writeFile(lockedDoc, '{"locked":true}\n');
await chmod(lockedDoc, 0o000);
try {
  await assert.rejects(
    () => guardedReadProjectFile(lockedDoc),
    (error: Error) => {
      assert.equal(error.message, refusalMessage, 'EACCES must read as the identical refusal message');
      return true;
    },
  );
} finally {
  await chmod(lockedDoc, 0o600);
}

// EISDIR: the target exists but is a directory, not a document
const dirAsDoc = join(project, 'ADirectory.occ');
await mkdir(dirAsDoc, { recursive: true });
await assert.rejects(
  () => guardedReadProjectFile(dirAsDoc),
  (error: Error) => {
    assert.equal(error.message, refusalMessage, 'EISDIR must read as the identical refusal message');
    return true;
  },
);

// A NUL byte in the path is a synchronous TypeError from node:fs, not an fs errno
await assert.rejects(
  () => guardedReadProjectFile(join(project, 'a\0b.occ')),
  (error: Error) => {
    assert.equal(error.message, refusalMessage, 'a NUL-byte path must read as the identical refusal message');
    return true;
  },
);

console.log('project-file-ipc.verify: allowlist, extension checks, root grants and scrubbed refusals hold');
