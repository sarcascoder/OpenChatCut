// Filesystem check for project document I/O: scaffold, atomic write, read back.
// How to run: npx tsx desktop/project-file-io.verify.ts (wired into verify:desktop-window).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProjectFile, scaffoldProjectFolder, writeProjectFile } from './project-file-io.ts';

const root = await mkdtemp(join(tmpdir(), 'occ-project-'));

// -- scaffold creates the folder structure --
const layout = await scaffoldProjectFolder(root, 'My Edit');
const entries = (await readdir(root)).sort();
assert.deepEqual(entries, ['.occ', 'exports'], 'scaffold creates exports and the cache dir');
assert.equal(layout.documentPath, join(root, 'My Edit.occ'));

// -- write then read round-trips --
await writeProjectFile(layout.documentPath, '{"hello":"world"}\n');
assert.equal(await readProjectFile(layout.documentPath), '{"hello":"world"}\n');

// -- write is atomic: no temporary file is left behind --
const afterWrite = await readdir(root);
assert.deepEqual(
  afterWrite.filter((name) => name.includes('.tmp')),
  [],
  'no temporary file may survive a completed write',
);

// -- overwriting replaces content rather than appending --
await writeProjectFile(layout.documentPath, '{"second":true}\n');
assert.equal(await readProjectFile(layout.documentPath), '{"second":true}\n');

// -- scaffolding over an existing folder is not destructive --
await writeFile(join(root, 'exports', 'keep.txt'), 'keep');
await scaffoldProjectFolder(root, 'My Edit');
assert.equal(await readFile(join(root, 'exports', 'keep.txt'), 'utf8'), 'keep',
  'scaffolding an existing folder must not delete its contents');

// -- DETERMINISTIC directory-component-is-a-symlink case: no race, set up before the
// call. This is the round-3 review's exact reproduction. readProjectFile and
// writeProjectFile are tested directly here (not through the IPC guard layer),
// because the guard's own resolveAllowedMediaPath call already canonicalises away
// any symlink before these functions ever see a path -- these functions must reject
// it on their OWN, since nothing guarantees every future caller pre-canonicalises. --
const detBase = await mkdtemp(join(tmpdir(), 'occ-symlink-det-'));
const detProject = join(detBase, 'Project');
const detOutside = join(detBase, 'Outside');
await mkdir(detProject, { recursive: true });
await mkdir(detOutside, { recursive: true });
await writeFile(join(detOutside, 'Secret.occ'), 'OUTSIDE-SECRET-CONTENT\n');
// project/AliasDir -> Outside: a directory component that IS a symlink at call time.
await symlink(detOutside, join(detProject, 'AliasDir'));

await assert.rejects(
  () => readProjectFile(join(detProject, 'AliasDir', 'Secret.occ')),
  'readProjectFile must reject a target reached through a symlinked directory component',
);
await assert.rejects(
  () => writeProjectFile(join(detProject, 'AliasDir', 'Pwned.occ'), 'x'),
  'writeProjectFile must reject a target reached through a symlinked directory component',
);
assert.equal(
  await readFile(join(detOutside, 'Secret.occ'), 'utf8'),
  'OUTSIDE-SECRET-CONTENT\n',
  'the outside file must be untouched by the refused write attempt',
);
assert.equal(
  (await readdir(detOutside)).includes('Pwned.occ'),
  false,
  'the refused write must not have created anything outside the alias target',
);

// -- KNOWN, DELIBERATE LIMIT: the check is exactly ONE level deep. --
// assertDirectoryNotSymlinked inspects only dirname(documentPath), the IMMEDIATE
// parent. When the symlink sits HIGHER in the path -- here the GRANDparent, with a
// real directory `sub` as the immediate parent -- the kernel walks it transparently
// for both the open() and the lstat(), their dev/ino agree, and the call SUCCEEDS.
// This test asserts that current, true behaviour so the limit cannot be quietly
// mis-described again: a comment can relocate, an executed assertion cannot.
// The limit is deliberate, not an oversight -- walking every component would need a
// boundary this module does not know (it is never told the granted root), and
// walking up to / would refuse legitimate paths on macOS, where /tmp and /var are
// themselves symlinks, breaking every tmpdir-based caller including this file.
// It is not a live hole: callers reaching this module through the IPC guards are
// covered, because resolveAllowedMediaPath canonicalises the path first and a
// grandparent-symlink escape then fails containment -- asserted at that layer in
// project-file-ipc.verify.ts. If a future change DOES make the walk full-depth,
// this test will fail: flip it to assert.rejects then, do not delete it. --
const gpBase = await mkdtemp(join(tmpdir(), 'occ-symlink-gp-'));
const gpRoot = join(gpBase, 'root');
const gpOutside = join(gpBase, 'Outside');
await mkdir(gpRoot, { recursive: true });
await mkdir(join(gpOutside, 'sub'), { recursive: true });
await writeFile(join(gpOutside, 'sub', 'Secret.occ'), 'GRANDPARENT-SECRET\n');
// root/AliasDir -> Outside, so in root/AliasDir/sub/Secret.occ the GRANDparent is
// the symlink while the immediate parent, `sub`, is a genuine directory.
await symlink(gpOutside, join(gpRoot, 'AliasDir'));

assert.equal(
  await readProjectFile(join(gpRoot, 'AliasDir', 'sub', 'Secret.occ')),
  'GRANDPARENT-SECRET\n',
  'documented limit: a symlinked GRANDparent is not detected, so this read currently succeeds',
);
await writeProjectFile(join(gpRoot, 'AliasDir', 'sub', 'Pwned.occ'), '{"gp":true}\n');
assert.equal(
  await readFile(join(gpOutside, 'sub', 'Pwned.occ'), 'utf8'),
  '{"gp":true}\n',
  'documented limit: a write through a symlinked GRANDparent currently lands outside',
);

// -- and in the SAME tree, moving the target up one level so `AliasDir` becomes the
// IMMEDIATE parent IS rejected. Pinning both side by side is what makes the boundary
// exact: only the depth of the symlink differs between these two cases. --
await writeFile(join(gpOutside, 'Shallow.occ'), 'SHALLOW-SECRET\n');
await assert.rejects(
  () => readProjectFile(join(gpRoot, 'AliasDir', 'Shallow.occ')),
  'the same symlink as the IMMEDIATE parent must still be rejected',
);
await assert.rejects(
  () => writeProjectFile(join(gpRoot, 'AliasDir', 'Shallow2.occ'), 'x'),
  'writing with the same symlink as the IMMEDIATE parent must still be rejected',
);

console.log(
  'project-file-io.verify: scaffold, atomic write, read, symlinked-immediate-parent rejection'
    + ' and the documented one-level (grandparent-not-detected) limit OK',
);
