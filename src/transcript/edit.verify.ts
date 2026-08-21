// Word-edit engine window (trim window) check: npx tsx src/transcript/edit.check.ts
// fps=10, words laid out on whole seconds, frames = seconds×10, checkable by eye.
import assert from 'node:assert';
import { editedFrames, itemWindow, keptSegments, keptWordIndices, mediaWindowKeptIndices, mediaWindowWords, retimeWords } from './edit';
import type { TranscriptWord } from './types';

const FPS = 10;
const W: TranscriptWord[] = [
  { text: 'a', start: 0, end: 1000 },     // f0-10
  { text: 'b', start: 1000, end: 2000 },  // f10-20
  { text: 'c', start: 3000, end: 4000 },  // f30-40 (1s pause before it)
  { text: 'd', start: 4000, end: 5000 },  // f40-50
];
const none = new Set<number>();

// ── Regression line: behaviour without a window is unchanged ─────────────────────────────
{
  const segs = keptSegments(W, none, FPS, 0);
  assert.deepEqual(segs, [{ srcStartFrame: 0, srcEndFrame: 50, fromFrame: 0, durFrames: 50 }]);
  assert.equal(editedFrames(W, none, FPS), 50);
  assert.deepEqual(keptWordIndices(W, none, FPS), [0, 1, 2, 3]);
  assert.equal(retimeWords(W, none, FPS, 0).length, 4);
}

// ── Window identity: [0, full length) matches no window ──────────────────────────────────
{
  const segs = keptSegments(W, none, FPS, 0, { window: { startFrame: 0, durFrames: 50 } });
  assert.deepEqual(segs, [{ srcStartFrame: 0, srcEndFrame: 50, fromFrame: 0, durFrames: 50 }]);
}

// ── Trim 15 frames off the left: head cut, word a drops out, b clamps to the window start ──
{
  const opts = { window: { startFrame: 15, durFrames: 35 } };
  const segs = keptSegments(W, none, FPS, 100, opts); // offset 100 checks the repack baseline
  assert.deepEqual(segs, [{ srcStartFrame: 15, srcEndFrame: 50, fromFrame: 100, durFrames: 35 }]);
  assert.deepEqual(keptWordIndices(W, none, FPS, opts), [1, 2, 3], 'word a outside the window does not count as surviving');
  const words = retimeWords(W, none, FPS, 100, opts);
  assert.equal(words.length, 3);
  assert.equal(words[0].text, 'b');
  assert.equal(Math.round(words[0].start), 100 / FPS * 1000, 'b is clamped to the clip start');
}

// ── Trim from the right: tail cut away, d drops out, c is shortened ──────────────────────
{
  const opts = { window: { startFrame: 0, durFrames: 35 } };
  const segs = keptSegments(W, none, FPS, 0, opts);
  assert.deepEqual(segs, [{ srcStartFrame: 0, srcEndFrame: 35, fromFrame: 0, durFrames: 35 }]);
  assert.deepEqual(keptWordIndices(W, none, FPS, opts), [0, 1, 2]);
}

// ── Middle window: cut at both ends ───────────────────────────────────────────────────────
{
  const opts = { window: { startFrame: 15, durFrames: 20 } }; // [15,35)
  assert.deepEqual(keptWordIndices(W, none, FPS, opts), [1, 2]);
}

// ── Deleted word + window across segments: each segment is cut and repacked ──────────────
{
  const del = new Set([1]); // delete b → seg1 [0,10) + seg2 [30,50), stream length 30
  const base = keptSegments(W, del, FPS, 0);
  assert.deepEqual(base, [
    { srcStartFrame: 0, srcEndFrame: 10, fromFrame: 0, durFrames: 10 },
    { srcStartFrame: 30, srcEndFrame: 50, fromFrame: 10, durFrames: 20 },
  ]);
  const segs = keptSegments(W, del, FPS, 0, { window: { startFrame: 5, durFrames: 20 } }); // [5,25)
  assert.deepEqual(segs, [
    { srcStartFrame: 5, srcEndFrame: 10, fromFrame: 0, durFrames: 5 },   // seg1 head cut
    { srcStartFrame: 30, srcEndFrame: 45, fromFrame: 5, durFrames: 15 }, // seg2 tail cut, repacked right after
  ]);
}

// ── Out-of-range window self-heals: past the stream length → empty; editedFrames falls back to 1 ──
{
  const segs = keptSegments(W, none, FPS, 0, { window: { startFrame: 60, durFrames: 10 } });
  assert.equal(segs.length, 0);
  assert.equal(editedFrames(W, none, FPS, { window: { startFrame: 60, durFrames: 10 } }), 1);
}

// ── itemWindow: only audio yields a window (video's srcInFrame is media-frame semantics) ──
{
  assert.deepEqual(itemWindow({ kind: 'audio', srcInFrame: 15, durationInFrames: 35 }), { startFrame: 15, durFrames: 35 });
  assert.equal(itemWindow({ kind: 'video', srcInFrame: 15, durationInFrames: 35 }), undefined);
  assert.deepEqual(itemWindow({ kind: 'audio', durationInFrames: 50 }), { startFrame: 0, durFrames: 50 });
}

// ── video media-window projection (fixes the A/V desync caught by the long→short e2e) ────
// video plays continuously over [srcIn, srcIn+dur×rate); captions project straight off media frames; audible means visible:
// deleting a transcript word neither repacks nor hides it (otherwise the window opens on "someone talking with no caption").
{
  const s = (sec: number): number => sec * 1000; // ms; frame = sec×FPS
  const W: TranscriptWord[] = [
    { text: 'a', start: s(0), end: s(1) },   // frames 0×FPS-1×FPS (outside the window)
    { text: 'b', start: s(7), end: s(8) },   // 7×FPS-8×FPS
    { text: 'c', start: s(12), end: s(13) }, // 12×FPS-13×FPS
    { text: 'd', start: s(20), end: s(21) }, // outside the window (when rate=1)
  ];
  const item = { startFrame: 10, durationInFrames: 12 * FPS, srcInFrame: 6 * FPS }; // window [6s,18s)
  const out = mediaWindowWords(W, FPS, item);
  assert.deepEqual(out.map((w) => w.text), ['b', 'c'], 'b/c are inside the window, a/d are outside');
  assert.equal(Math.round(out[0].start), Math.round(((10 + 1 * FPS) / FPS) * 1000), 'b lands at startFrame+1s');
  assert.equal(Math.round(out[1].start), Math.round(((10 + 6 * FPS) / FPS) * 1000), 'c is offset by 6s');
  // indices map one-to-one onto words (wordOverrides keys)
  assert.deepEqual(mediaWindowKeptIndices(W, FPS, item), [1, 2]);
  // 2× speed: window [6s, 6s+12s×2)=[6s,30s) → d comes in too, timeline position halved
  const fast = { startFrame: 0, durationInFrames: 12 * FPS, srcInFrame: 6 * FPS, playbackRate: 2 };
  const outFast = mediaWindowWords(W, FPS, fast);
  assert.deepEqual(outFast.map((w) => w.text), ['b', 'c', 'd']);
  assert.equal(Math.round(outFast[2].start), Math.round(((20 - 6) / 2) * 1000), 'under a speed change the media-frame delta is divided by rate');
}

console.log('edit.check: ok (no-window regression/identity/left trim/right trim/middle/deleted word across segments/out-of-range self-heal/itemWindow kind gate/video media-window projection)');
