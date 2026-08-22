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

console.log('project-file-io.verify: scaffold, atomic write, read and symlinked-directory rejection OK');
