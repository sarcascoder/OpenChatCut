// Guard check for project document IPC: only .occ files inside a registered
// project root may be read or written, a scaffold target must have been
// explicitly granted through a trusted OS dialog (never self-authorised by
// the renderer), and every refusal — deliberate or a raw filesystem error
// (EACCES, EISDIR, a NUL-byte TypeError, ...) — is indistinguishable, so the
// renderer never gets a file-existence oracle.
// How to run: npx tsx desktop/project-file-ipc.verify.ts (wired into verify:desktop-window).
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
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

// -- a REAL .occ file outside every root (no symlink, correct extension) is refused
// PURELY by the allowlist gate. The two cases above don't prove this: outside/secret.txt
// is killed by the extension check before the allowlist ever runs, and a symlink target
// (tested below) is killed by O_NOFOLLOW. Only this case isolates the allowlist gate
// itself — see the round-3 review finding that this was, until now, completely untested,
// so deleting the gate produced a fully green suite. --
await writeFile(join(outside, 'Secret.occ'), 'TOP SECRET OUT OF ROOT\n');
await assert.rejects(
  () => guardedReadProjectFile(join(outside, 'Secret.occ')),
  (error: Error) => {
    assert.equal(error.message, refusalMessage, 'a real .occ file outside every root must read as the identical refusal message');
    return true;
  },
  'a real, non-symlinked .occ file outside every root must be refused by the allowlist gate alone',
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

// -- a .occ symlink inside a registered root pointing outside every root is refused --
// (the extension check alone is not enough: the target itself must resolve inside a root)
await symlink(join(outside, 'secret.txt'), join(project, 'Escape.occ'));
await assert.rejects(
  () => guardedReadProjectFile(join(project, 'Escape.occ')),
  (error: Error) => {
    assert.equal(error.message, refusalMessage, 'a symlink escaping every root must read as the identical refusal message');
    return true;
  },
  'a .occ symlink pointing outside every root must be refused',
);

// -- a .occ symlink pointing at a NON-.occ file INSIDE the same registered root is refused --
// The extension check on the REQUESTED path cannot catch this (the request ends
// in .occ) and the allowlist cannot either (the target resolves inside the root).
// Only the extension check on the CANONICAL path returned by
// resolveAllowedMediaPath refuses it. Without that check this read succeeds and
// returns the target's bytes, making the channel a general file-read of anything
// inside a registered root. Mutation-proven: delete the canonical-path extension
// check in guardedReadProjectFile and this assertion fails. --
await writeFile(join(project, 'not-a-document.txt'), 'NOT-A-PROJECT-DOCUMENT-SECRET\n');
await symlink(join(project, 'not-a-document.txt'), join(project, 'InsideAlias.occ'));
await assert.rejects(
  () => guardedReadProjectFile(join(project, 'InsideAlias.occ')),
  (error: Error) => {
    assert.equal(
      error.message,
      refusalMessage,
      'a .occ symlink to a non-.occ file inside the root must read as the identical refusal message',
    );
    return true;
  },
  'a .occ symlink whose target is a non-.occ file inside the same registered root must be refused',
);

// -- write through a symlinked directory component must land via the CANONICALISED
// parent, not the raw path. This is the regression test for the fix at
// project-file-ipc.ts's guardedWriteProjectFile: it must call
// writeProjectFile(join(parent, basename(documentPath)), contents), not
// writeProjectFile(documentPath, contents). Proof: `aliasLink` below is a
// symlink, so if the raw (symlink) path were passed through, writeProjectFile's
// own O_NOFOLLOW directory-open guard (project-file-io.ts) would reject it —
// this test would then fail with a rejection instead of succeeding. --
const aliasTarget = join(project, 'RealSubdir');
const aliasLink = join(project, 'AliasSubdir');
await mkdir(aliasTarget, { recursive: true });
await symlink(aliasTarget, aliasLink);
await guardedWriteProjectFile(join(aliasLink, 'Aliased.occ'), '{"aliased":true}\n');
assert.equal(
  await readFile(join(aliasTarget, 'Aliased.occ'), 'utf8'),
  '{"aliased":true}\n',
  'a write via a symlinked directory component must land through the canonicalised parent',
);

// -- a raw filesystem failure on the WRITE path is scrubbed identically to a refusal --
// (mutation check: deleting guardedWriteProjectFile's try/catch survives a
// green suite unless a RAW fs error, not just a guard refusal, is asserted here)
const writeLocked = join(base, 'WriteLocked');
await mkdir(writeLocked, { recursive: true });
await registerMediaRoot(writeLocked);
await chmod(writeLocked, 0o500); // r-x: traversable and readable, not writable
try {
  await assert.rejects(
    () => guardedWriteProjectFile(join(writeLocked, 'Doc.occ'), 'x'),
    (error: Error) => {
      assert.equal(error.message, refusalMessage, 'a raw EACCES on write must read as the identical refusal message');
      return true;
    },
    'writing into a permission-denied registered root must be refused, not throw a raw EACCES',
  );
} finally {
  await chmod(writeLocked, 0o700);
}

// -- a raw filesystem failure on the SCAFFOLD path is scrubbed identically to a refusal --
// (mutation check: deleting guardedScaffoldProjectFolder's try/catch survives a
// green suite unless a RAW fs error, not just a guard refusal, is asserted here)
const scaffoldLocked = join(base, 'ScaffoldLocked');
await mkdir(scaffoldLocked, { recursive: true });
await grantProjectRoot(scaffoldLocked);
await chmod(scaffoldLocked, 0o500); // r-x: cannot mkdir exports/cache subdirectories inside it
try {
  await assert.rejects(
    () => guardedScaffoldProjectFolder(scaffoldLocked, 'ScaffoldLocked'),
    (error: Error) => {
      assert.equal(error.message, refusalMessage, 'a raw EACCES on scaffold must read as the identical refusal message');
      return true;
    },
    'scaffolding a permission-denied granted root must be refused, not throw a raw EACCES',
  );
} finally {
  await chmod(scaffoldLocked, 0o700);
}

// -- a symlinked GRANDparent escaping every root is refused HERE, at the guard layer --
// project-file-io.ts's directory check is exactly one level deep, so it does NOT
// catch this case (pinned as a documented limit in project-file-io.verify.ts). This
// asserts the other half of that story by execution: the guard refuses it anyway,
// because resolveAllowedMediaPath canonicalises the candidate before the io layer
// sees it, and the canonical path lands outside every registered root. So the
// defence-in-depth story is pinned by execution at both layers: the io layer lets
// this through, this layer refuses it. (No mutation claim is made for the
// resolveAllowedMediaPath call here — the allowlist-gate test above already fires
// first when it is removed.) --
const gpOutside = join(outside, 'GrandSub');
await mkdir(gpOutside, { recursive: true });
await writeFile(join(gpOutside, 'Secret.occ'), 'GRANDPARENT-SECRET\n');
// project/GrandAlias -> Outside, so in project/GrandAlias/GrandSub/Secret.occ the
// GRANDparent is the symlink and the immediate parent, GrandSub, is a real directory.
await symlink(outside, join(project, 'GrandAlias'));
await assert.rejects(
  () => guardedReadProjectFile(join(project, 'GrandAlias', 'GrandSub', 'Secret.occ')),
  (error: Error) => {
    assert.equal(error.message, refusalMessage, 'a symlinked grandparent must read as the identical refusal message');
    return true;
  },
  'a target reached through a symlinked GRANDparent escaping every root must be refused',
);
await assert.rejects(
  () => guardedWriteProjectFile(join(project, 'GrandAlias', 'GrandSub', 'Pwned.occ'), 'x'),
  'a write through a symlinked GRANDparent escaping every root must be refused',
);
assert.equal(
  (await readdir(gpOutside)).includes('Pwned.occ'),
  false,
  'the refused write must not have created anything outside every root',
);

console.log('project-file-ipc.verify: allowlist, extension checks, root grants, symlink escapes (including a symlinked grandparent) and scrubbed refusals hold');
