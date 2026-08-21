// Runnable check: `npx tsx server/plugins/extract-frames.verify.ts`.
// Verify contact table sampling: the basic properties of uniform sampling, and the selection rule of "change priority + uniform completion"
// (Change points are selected first, those too close to each other are not repeated, too many candidates are evenly distributed in order, and discarded outside the window,
// Exactly the same as uniform sampling when there are no candidates).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { frameSeekArgs, pickDistinctTimes, sampleTimesMs } from './extract-frames.ts';

const source = await readFile(new URL('./extract-frames.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /\bspawn\(ffprobeBin\(\)/, 'ffprobe must use the shared low-priority process launcher');

const inWindow = (times: number[], lo: number, hi: number): boolean =>
  times.every((t) => t >= lo && t < hi);
const ascending = (times: number[]): boolean =>
  times.every((t, i) => i === 0 || t >= times[i - 1]!);

assert.deepEqual(frameSeekArgs(0), [], 'grabbing a still image at zero seconds must not seek before the input');
assert.deepEqual(frameSeekArgs(1500), ['-ss', '1.5'], 'positive video timestamps still use the fast seek');

// ── Uniform sampling: equally divided block midpoint, number of bars, interval ──
{
  assert.deepEqual(sampleTimesMs(0, 12000, 6), [1000, 3000, 5000, 7000, 9000, 11000], 'midpoints of equal blocks');
  assert.equal(sampleTimesMs(0, 1000, 99).length, 20, 'capped by the MAX_SAMPLES limit');
  assert.equal(sampleTimesMs(0, 1000, 0).length, 1, 'count 0 still yields at least 1');
}

// ── No candidates → exactly the same as uniform sampling (the fallback path when scene analysis fails) ──
{
  assert.deepEqual(pickDistinctTimes([], 0, 18000, 6), sampleTimesMs(0, 18000, 6), 'no candidates = uniform sampling');
}

// ── Change points are selected first, and the rest are filled up to count using uniform sampling ──
{
  const out = pickDistinctTimes([9000, 12000, 15000], 0, 18000, 6);
  assert.equal(out.length, 6, 'filled up to count');
  for (const t of [9000, 12000, 15000]) assert.ok(out.includes(t), `change point ${t} must be selected`);
  assert.ok(ascending(out) && inWindow(out, 0, 18000), 'ascending and inside the window');
}

// ── Candidates who are too close to each other will not occupy duplicate seats (otherwise one transition will take up multiple places) ──
{
  const out = pickDistinctTimes([9000, 9050, 9100], 0, 18000, 6);
  const near = out.filter((t) => t >= 9000 && t <= 9100);
  assert.equal(near.length, 1, 'one change takes only one slot');
}

// ── There are more candidates than places → divide them evenly in order, not all at the beginning ──
{
  const dense = Array.from({ length: 40 }, (_, i) => i * 250); // 0..9750ms dense candidates
  const out = pickDistinctTimes(dense, 0, 10000, 5);
  assert.equal(out.length, 5, 'never exceeds count');
  assert.ok(out[out.length - 1]! - out[0]! > 5000, `should span the whole range instead of bunching at the start (got ${out.join(',')})`);
  assert.ok(ascending(out), 'ascending');
}

// ── Candidates outside the window are discarded ──
{
  const out = pickDistinctTimes([-500, 500, 99000], 0, 3000, 3);
  assert.ok(inWindow(out, 0, 3000), `candidates outside the window must be dropped (got ${out.join(',')})`);
  assert.ok(out.includes(500), 'candidates inside the window are kept');
}

// ── The interval that is not the starting point of the window (view_asset_frames will pass fromMs/toMs) ──
{
  const out = pickDistinctTimes([7000], 5000, 9000, 3);
  assert.ok(inWindow(out, 5000, 9000), 'inside the relative range');
  assert.ok(out.includes(7000), 'change points inside the range are kept');
}

console.log('extract-frames.verify: ok (uniform sampling/empty-candidate fallback/change priority/near-duplicate dedupe/even spread/window clipping)');
