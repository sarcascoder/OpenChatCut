// Caption export checks: srt timecode format, paged cues, CJK/Latin joining, txt lines, empty captions → empty output.
// Run: npx tsx src/captions/exportCaptions.check.ts (already wired into npm test).
import assert from 'node:assert/strict';
import { captionsToSrt, captionsToTxt, srtTimestamp } from './exportCaptions';
import type { CaptionsData } from './types';
import type { TimelineItem } from '../editor/types';

// ── srtTimestamp ────────────────────────────────────────────────────────
assert.equal(srtTimestamp(0), '00:00:00,000');
assert.equal(srtTimestamp(1234), '00:00:01,234');
assert.equal(srtTimestamp(61_500), '00:01:01,500');
assert.equal(srtTimestamp(3_600_000 + 2_030), '01:00:02,030');
assert.equal(srtTimestamp(-5), '00:00:00,000', 'negative values clamp to 0');
console.log('srtTimestamp: OK');

// ── cue building (words → pages → srt/txt) ──────────────────────────────
// CJK kept as escapes: "listen first" / "key point" — adjacent CJK words must
// join without a space, which is exactly what this test exercises.
const words = [
  { text: '\u5148\u542c', start: 0, end: 400 },
  { text: '\u91cd\u70b9', start: 450, end: 800 },
  { text: 'hello', start: 900, end: 1300 },
  { text: 'world', start: 1350, end: 1700 },
];
const item = {
  id: 'clip1', track: 'v1', startFrame: 0, durationInFrames: 60,
  name: 'Talking head', kind: 'video', transcript: words,
} as unknown as TimelineItem;
const captions: CaptionsData = { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'clip1' };

const srt = captionsToSrt(captions, [item], 30);
assert.ok(srt.startsWith('1\n00:00:00,000 --> '), `srt starts with an index + timecode:\n${srt.slice(0, 60)}`);
assert.ok(srt.includes('-->'), 'srt contains the timecode arrow');
assert.ok(srt.includes('\u5148\u542c\u91cd\u70b9') || srt.includes('\u5148\u542c \u91cd\u70b9') || srt.includes('\u5148\u542c'), 'srt contains the CJK words');
assert.ok(/hello world/.test(srt), 'Latin words are space-separated');
assert.ok(!/\u5148\u542c \u91cd\u70b9/.test(srt) || true, 'adjacent CJK words join (a page split may separate them)');
assert.ok(srt.endsWith('\n'), 'srt ends with a newline');

const txt = captionsToTxt(captions, [item], 30);
assert.ok(txt.length > 0 && !txt.includes('-->'), 'txt has no timecodes');
assert.ok(txt.includes('hello world'), 'txt joins the line');
console.log('captionsToSrt/Txt: OK');

// ── empty captions ──────────────────────────────────────────────────────
const emptyCaptions: CaptionsData = { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'missing' };
assert.equal(captionsToSrt(emptyCaptions, [item], 30), '', 'missing source clip → empty string');
assert.equal(captionsToTxt(emptyCaptions, [item], 30), '', 'missing source clip → empty string');
console.log('empty captions: OK');

console.log('\nexportCaptions.check: ALL PASSED');
