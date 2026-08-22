// Integration check: a real ProjectDoc survives serialize -> disk -> parse.
// How to run: npx tsx src/persist/projectFileRoundTrip.verify.ts (wired into verify:media-persist).
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CURRENT_PROJECT_VERSION } from '../../shared/project-version';
import {
  readProjectFile,
  scaffoldProjectFolder,
  writeProjectFile,
} from '../../desktop/project-file-io.ts';
import { PROJECT_FILE_FORMAT, parseProjectFile, serializeProjectFile } from './projectFile.ts';

const doc = {
  version: CURRENT_PROJECT_VERSION,
  assets: [{
    id: 'a1', name: 'talk.mp4', kind: 'video',
    src: '/media/uploads/talk.mp4', durationInFrames: 90,
  }],
  mediaFolders: [],
  timelines: [{
    id: 'tl_1', name: 'Sequence 1', order: 0, fps: 30, width: 1920, height: 1080,
    selectedId: null,
    // A stable track id (not a legacy V1/A1 alias) so this fixture matches what a
    // CURRENT_PROJECT_VERSION document actually contains and migrateProjectDoc's
    // legacy-alias remap (see normalizeTimelineTracks) leaves it untouched.
    trackOrder: ['track_tl_1_1'],
    tracks: { track_tl_1_1: { kind: 'video' } },
    items: [{
      id: 'i1', name: 'talk', kind: 'video', track: 'track_tl_1_1',
      startFrame: 0, durationInFrames: 90, src: '/media/uploads/talk.mp4',
    }],
  }],
  activeTimelineId: 'tl_1',
} as unknown as Parameters<typeof serializeProjectFile>[0];

const root = await mkdtemp(join(tmpdir(), 'occ-roundtrip-'));
const layout = await scaffoldProjectFolder(root, 'Round Trip');

// The scaffold + layout must agree on where the document lives: the folder
// name is sanitized from the project name, so this is not a given.
assert.equal(layout.documentPath, join(root, 'Round Trip.occ'));

const serialized = serializeProjectFile(doc, { projectId: 'p-round', appVersion: '0.2.9' });
await writeProjectFile(layout.documentPath, serialized);

// The bytes on disk are exactly what was serialized -- proves writeProjectFile's
// atomic temp-file-then-rename path does not mangle or truncate content.
const onDisk = await readFile(layout.documentPath, 'utf8');
assert.equal(onDisk, serialized, 'the atomic write must not alter the serialized bytes');

const parsed = parseProjectFile(await readProjectFile(layout.documentPath));
assert.ok(parsed.ok, 'the written document must parse back');
if (!parsed.ok) throw new Error('unreachable');

assert.equal(parsed.envelope.format, PROJECT_FILE_FORMAT);
assert.equal(parsed.envelope.projectId, 'p-round');
assert.equal(parsed.envelope.appVersion, '0.2.9');

// -- assets survive with their actual content, not just their count --
assert.equal(parsed.envelope.doc.assets.length, 1, 'assets survive');
assert.equal(parsed.envelope.doc.assets[0]!.id, 'a1');
assert.equal(parsed.envelope.doc.assets[0]!.name, 'talk.mp4');
assert.equal(parsed.envelope.doc.assets[0]!.src, '/media/uploads/talk.mp4');
assert.equal(parsed.envelope.doc.assets[0]!.durationInFrames, 90);

// -- timelines and their items survive with their actual content --
assert.equal(parsed.envelope.doc.timelines.length, 1, 'timelines survive');
assert.equal(parsed.envelope.doc.timelines[0]!.id, 'tl_1');
assert.equal(parsed.envelope.doc.timelines[0]!.items.length, 1, 'timeline items survive');
assert.equal(parsed.envelope.doc.timelines[0]!.items[0]!.id, 'i1');
assert.equal(parsed.envelope.doc.timelines[0]!.items[0]!.track, 'track_tl_1_1');
assert.equal(parsed.envelope.doc.timelines[0]!.items[0]!.startFrame, 0);
assert.equal(parsed.envelope.doc.timelines[0]!.items[0]!.durationInFrames, 90);
assert.equal(parsed.envelope.doc.timelines[0]!.items[0]!.src, '/media/uploads/talk.mp4');
assert.equal(parsed.envelope.doc.activeTimelineId, 'tl_1');

console.log('projectFileRoundTrip.verify: document survives disk round trip');
