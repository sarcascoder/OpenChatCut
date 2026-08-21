// Runnable check: `npx tsx src/editor/silenceRebuild.verify.ts`.
// Verify: span→local frame cropping (clamp/segment/edge), and the planned split/remove sequence
// After applying [real reducer] one by one, the number of segments/duration/srcIn/ripple left shift of the timeline are all correct.
import assert from 'node:assert/strict';
import { reduce, type Action } from './reduce';
import { planSilenceRemoval, silenceRemovalBlocker, spansToLocalCuts } from './silenceRebuild';
import type { TimelineItem, TimelineState } from './types';

const FPS = 30;

const clip = (over: Partial<TimelineItem>): TimelineItem => ({
  id: 'main', track: 'V1', startFrame: 0, durationInFrames: 300,
  name: 'talk', kind: 'video', src: '/media/uploads/talk.mp4',
  ...over,
});

const baseState = (items: TimelineItem[]): TimelineState => ({
  fps: FPS, width: 1920, height: 1080, items, selectedId: null,
} as unknown as TimelineState);

const apply = (state: TimelineState, actions: Action[]): TimelineState =>
  actions.reduce((s, a) => reduce(s, a), state);

// ── spansToLocalCuts: source milliseconds → local frame, clamp source window, srcIn takes effect ──
const trimmed = clip({ srcInFrame: 60, durationInFrames: 240 }); // Source window [60, 300)
const cuts1 = spansToLocalCuts(trimmed, [
  { startMs: 0, endMs: 1000 },      // source [0,30) — before window, insufficient after clamp → lose
  { startMs: 4000, endMs: 5000 },   // source [120,150) → local [60,90)
  { startMs: 9800, endMs: 12000 },  // source [294,360) → local [234,240) tail
], FPS);
assert.deepEqual(cuts1, [{ fromFrame: 60, toFrame: 90 }, { fromFrame: 234, toFrame: 240 }], 'clamp + srcIn mapping');

// The fragmented reserved sections are merged and deleted: the two sections of silence are only separated by 3 frames → merged into one section
const cuts2 = spansToLocalCuts(clip({}), [
  { startMs: 1000, endMs: 2000 },
  { startMs: 2100, endMs: 3000 },
], FPS);
assert.deepEqual(cuts2, [{ fromFrame: 30, toFrame: 90 }], 'a 3-frame kept segment is merged in');

// The entire line is quiet: conservative and giving up
assert.deepEqual(spansToLocalCuts(clip({}), [{ startMs: 0, endMs: 10_000 }], FPS), [], 'a fully silent clip is left untouched');

// ── Planning + true reducer: dead energy in the middle, subsequent clip ripples on the same track shift left ──
{
  const follower = clip({ id: 'next', startFrame: 300, durationInFrames: 90 });
  let n = 0;
  const plan = planSilenceRemoval(clip({}), [{ fromFrame: 100, toFrame: 160 }], () => `seg_${++n}`);
  const out = apply(baseState([clip({}), follower]), plan.actions);
  const v1 = out.items.filter((it) => it.track === 'V1').sort((a, b) => a.startFrame - b.startFrame);
  assert.equal(plan.removedFrames, 60);
  assert.equal(v1.length, 3, 'the main clip becomes two segments + the follower clip');
  const [a, b, c] = v1;
  assert.deepEqual([a!.startFrame, a!.durationInFrames, a!.srcInFrame ?? 0], [0, 100, 0], 'kept segment 1');
  assert.deepEqual([b!.startFrame, b!.durationInFrames, b!.srcInFrame], [100, 140, 160], 'kept segment 2 skips the dead air at its source point');
  assert.deepEqual([c!.id, c!.startFrame], ['next', 240], 'the later clip on the same track shifts left by 60 frames');
}

// ── The death energy at the beginning + the death energy at the end (the original id is deleted at the beginning, and the whole paragraph at the end is removed) ──
{
  let n = 0;
  const plan = planSilenceRemoval(clip({}), [
    { fromFrame: 0, toFrame: 45 },
    { fromFrame: 200, toFrame: 300 },
  ], () => `seg_${++n}`);
  const out = apply(baseState([clip({})]), plan.actions);
  assert.equal(plan.removedFrames, 145);
  assert.equal(out.items.length, 1, 'only the middle kept segment remains');
  const only = out.items[0]!;
  assert.deepEqual([only.startFrame, only.durationInFrames, only.srcInFrame], [0, 155, 45], 'head and tail fully trimmed, srcIn=45');
}

// ── Multiple sections of dead energy: three reserved sections, srcIn jumps section by section, and the last section is aligned ──
{
  let n = 0;
  const plan = planSilenceRemoval(clip({}), [
    { fromFrame: 60, toFrame: 90 },
    { fromFrame: 180, toFrame: 240 },
  ], () => `seg_${++n}`);
  const out = apply(baseState([clip({})]), plan.actions);
  const segs = out.items.sort((a, b) => a.startFrame - b.startFrame);
  assert.equal(segs.length, 3);
  assert.deepEqual(segs.map((s) => [s.startFrame, s.durationInFrames, s.srcInFrame ?? 0]), [
    [0, 60, 0],
    [60, 90, 90],
    [150, 60, 240],
  ], 'three segments: position/duration/source point');
  const total = segs.reduce((sum, s) => sum + s.durationInFrames, 0);
  assert.equal(total, 300 - plan.removedFrames, 'total duration stays the same');
}

// ── Fade in and out to the outer edge: keep fadeIn in the first section, fadeOut in the last section, and no fade in the cut ──
{
  let n = 0;
  const faded = clip({ fadeInFrames: 12, fadeOutFrames: 15 });
  const plan = planSilenceRemoval(faded, [{ fromFrame: 100, toFrame: 160 }], () => `f_${++n}`);
  const out = apply(baseState([faded]), plan.actions);
  const segs = out.items.sort((a, b) => a.startFrame - b.startFrame);
  assert.equal(segs[0]!.fadeInFrames, 12, 'the first segment keeps its fadeIn');
  assert.equal(segs[0]!.fadeOutFrames, undefined, 'a cut edge has no fade out');
  assert.equal(segs[1]!.fadeInFrames, undefined, 'a cut edge has no fade in');
  assert.equal(segs[1]!.fadeOutFrames, 15, 'the last segment keeps its fadeOut');
}

// ── Gatekeeper: variable speed/zoom/word-level editing/non-audio/video/passive ──
assert.match(silenceRemovalBlocker(clip({ playbackRate: 2 })) ?? '', /playbackRate/);
assert.match(silenceRemovalBlocker(clip({ zoom: { kind: 'shape' } as never })) ?? '', /zoom/);
assert.match(silenceRemovalBlocker(clip({ kind: 'image' })) ?? '', /no audio/);
assert.match(silenceRemovalBlocker(clip({ src: undefined })) ?? '', /no media source/);
assert.match(
  silenceRemovalBlocker(clip({ transcript: [{ text: 'hi', start: 0, end: 300 }], deletedWordIdx: [0] })) ?? '',
  /clean_script/, 'a word-edited transcript clip defers to clean_script',
);
assert.equal(silenceRemovalBlocker(clip({ transcript: [{ text: 'hi', start: 0, end: 300 }] })), null, 'an unedited transcript clip can be processed');
assert.equal(silenceRemovalBlocker(clip({})), null, 'a plain video can be processed');

console.log('silenceRebuild.verify: ok (mapping/merging/real reducer ripple/outer fade edges/gatekeeping)');
