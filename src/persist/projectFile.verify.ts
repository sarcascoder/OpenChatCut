// Pure-logic check for the .occ envelope: round-trip, rejection of untrusted input.
// How to run: npx tsx src/persist/projectFile.verify.ts (wired into verify:media-persist).
import assert from 'node:assert/strict';
import { CURRENT_PROJECT_VERSION } from '../../shared/project-version';
import {
  PROJECT_FILE_FORMAT,
  parseProjectFile,
  serializeProjectFile,
} from './projectFile';

const doc = {
  version: CURRENT_PROJECT_VERSION,
  assets: [],
  mediaFolders: [],
  timelines: [{
    id: 'tl_1', name: 'Sequence 1', order: 0, fps: 30, width: 1920, height: 1080,
    selectedId: null, items: [],
  }],
  activeTimelineId: 'tl_1',
} as unknown as Parameters<typeof serializeProjectFile>[0];

// -- round trip --
const text = serializeProjectFile(doc, { projectId: 'p-1', appVersion: '0.2.9' });
const parsed = parseProjectFile(text);
assert.ok(parsed.ok, 'a freshly serialized file must parse');
assert.equal(parsed.envelope.format, PROJECT_FILE_FORMAT);
assert.equal(parsed.envelope.projectId, 'p-1');
assert.equal(parsed.envelope.appVersion, '0.2.9');
assert.deepEqual(parsed.envelope.doc.timelines[0]!.id, 'tl_1', 'the document survives the round trip');

// -- stable output: serializing twice gives identical bytes --
assert.equal(
  serializeProjectFile(doc, { projectId: 'p-1', appVersion: '0.2.9' }),
  text,
  'serialization must be deterministic so the file is diffable',
);

// -- the file ends with a newline (POSIX tools, git) --
assert.ok(text.endsWith('\n'), 'the file must end with a trailing newline');

// -- untrusted input is rejected, never thrown --
for (const [label, bad] of [
  ['not json', '{'],
  ['not an object', '42'],
  ['wrong format tag', JSON.stringify({ format: 'something-else', schemaVersion: 1, doc })],
  ['missing doc', JSON.stringify({ format: PROJECT_FILE_FORMAT, schemaVersion: 1 })],
  ['doc not an object', JSON.stringify({ format: PROJECT_FILE_FORMAT, schemaVersion: 1, doc: 7 })],
] as const) {
  const result = parseProjectFile(bad);
  assert.equal(result.ok, false, `${label} must be rejected`);
  assert.ok(typeof (result as { error: string }).error === 'string', `${label} must report a reason`);
}

console.log('projectFile.verify: envelope round-trip and rejection OK');
