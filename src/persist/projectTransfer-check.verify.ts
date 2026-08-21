// Pure-logic check for project export/import: src collection, envelope boundary validation (untrusted files).
// How to run: npx tsx src/persist/projectTransfer.check.ts (wired into verify:persist, runs with pretest).
import assert from 'node:assert/strict';
import { CURRENT_PROJECT_VERSION } from '../../shared/project-version';
import { collectUploadSrcs, parseProjectEnvelope, PROJECT_EXPORT_FORMAT } from './projectTransfer';

const doc = {
  version: 2,
  assets: [
    { id: 'a1', name: 'v.mp4', kind: 'video', src: '/media/uploads/v.mp4', durationInFrames: 60 },
    { id: 'a2', name: 'pic.png', kind: 'image', src: '/media/uploads/pic.png', durationInFrames: 90 },
    { id: 'a3', name: 'ext', kind: 'image', src: 'https://cdn.example.com/x.png', durationInFrames: 90 },
  ],
  timelines: [{
    id: 'tl_1', name: 'Sequence 1', order: 0, fps: 30, width: 1920, height: 1080, selectedId: null,
    items: [
      { id: 'i1', name: 'v.mp4', kind: 'video', track: 'v1', startFrame: 0, durationInFrames: 60, src: '/media/uploads/v.mp4' },
      { id: 'i2', name: 'bgm.mp3', kind: 'audio', track: 'a1', startFrame: 0, durationInFrames: 60, src: '/media/uploads/bgm.mp3' },
      { id: 'i3', name: 'Title', kind: 'text', track: 'v2', startFrame: 0, durationInFrames: 30 },
    ],
  }],
  activeTimelineId: 'tl_1',
};

// ── collectUploadSrcs ───────────────────────────────────────────────────
{
  const srcs = collectUploadSrcs(doc as never);
  assert.deepEqual(srcs, ['/media/uploads/v.mp4', '/media/uploads/pic.png', '/media/uploads/bgm.mp3'],
    'media pool + timeline union, deduplicated in order, external links excluded');
  console.log('collectUploadSrcs: OK');
}

// ── parseProjectEnvelope ────────────────────────────────────────────────
{
  const good = {
    format: PROJECT_EXPORT_FORMAT, name: ' Migrated Project ', exportedAt: '2026-07-18T00:00:00Z', doc,
    chat: { messages: [], llm: [] },
    creativeMode: 'long-video-to-shorts',
    media: [
      { src: '/media/uploads/v.mp4', name: 'v.mp4', mime: 'video/mp4', bytes: 10, dataBase64: 'AAAA' },
    ],
  };
  const migrationProgress: Array<[number, number]> = [];
  const parsed = parseProjectEnvelope(JSON.stringify(good), {
    onProgress: (event) => migrationProgress.push([event.fromVersion, event.toVersion]),
  });
  assert.ok('envelope' in parsed, `should pass: ${'error' in parsed ? parsed.error : ''}`);
  if ('envelope' in parsed) {
    assert.equal(parsed.envelope.name, 'Migrated Project', 'name is trimmed');
    assert.equal(parsed.envelope.media.length, 1, 'valid media entries are kept');
    assert.equal(parsed.envelope.media[0].src, '/media/uploads/v.mp4');
    assert.ok(parsed.envelope.chat, 'chat is kept when its shape is valid');
    assert.equal(parsed.envelope.creativeMode, 'long-video-to-shorts');
    assert.equal(parsed.envelope.doc.timelines.length, 1, 'doc survives migrateProjectDoc');
    assert.equal(parsed.envelope.doc.version, CURRENT_PROJECT_VERSION, 'an older import file is upgraded to the current project version');
    // One progress event per public migration step.
    const expectedSteps = Array.from({ length: CURRENT_PROJECT_VERSION - 2 }, (_, i) => [2 + i, 3 + i]);
    assert.deepEqual(migrationProgress, expectedSteps, 'import reuses the shared migration progress');
  }

  // Any unsafe/oversized media entry rejects the whole envelope (untrusted input).
  for (const bad of [
    { src: '/media/uploads/../etc', name: 'x', mime: 'x', bytes: 1, dataBase64: 'AA' },      // traversal
    { src: '/media/uploads/ok.png', name: 'a/b.png', mime: 'x', bytes: 1, dataBase64: 'AA' }, // name carries a path
    { src: '/media/uploads/big.mov', name: 'big.mov', mime: 'x', bytes: 1e12, dataBase64: 'AA' }, // over the size limit
    { src: '/media/uploads/nob64.png', name: 'n.png', mime: 'x', bytes: 5, dataBase64: '' },  // empty data
  ]) {
    const withBad = parseProjectEnvelope(JSON.stringify({ ...good, media: [good.media[0], bad] }));
    assert.ok('error' in withBad, `a bad media entry rejects the whole package: ${JSON.stringify(bad.src)}`);
  }

  assert.deepEqual(parseProjectEnvelope('not json'), { error: 'Not a valid JSON file' });
  const wrongFormat = parseProjectEnvelope(JSON.stringify({ ...good, format: 'foreign-project@1' }));
  assert.ok('error' in wrongFormat, 'a foreign package format is rejected');
  const badDoc = parseProjectEnvelope(JSON.stringify({ ...good, doc: { timelines: [] } }));
  assert.ok('error' in badDoc, 'a doc with no timelines is rejected');
  const badChat = parseProjectEnvelope(JSON.stringify({ ...good, chat: { messages: 'x' } }));
  assert.ok('envelope' in badChat && !(badChat as { envelope: { chat?: unknown } }).envelope.chat, 'a bad chat is dropped without being fatal');
  console.log('parseProjectEnvelope: OK');
}

console.log('\nprojectTransfer.check: ALL PASSED');
