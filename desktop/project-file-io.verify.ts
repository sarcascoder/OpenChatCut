// Filesystem check for project document I/O: scaffold, atomic write, read back.
// How to run: npx tsx desktop/project-file-io.verify.ts (wired into verify:desktop-window).
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
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

console.log('project-file-io.verify: scaffold, atomic write and read OK');
