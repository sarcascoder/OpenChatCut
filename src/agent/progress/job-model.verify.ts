// Black-box check for the unified Job model (plan A3). Run: tsx src/agent/job-model.check.ts
import assert from 'node:assert/strict';
import {
  normalizeStatus,
  isTerminal,
  isComplete,
  isFailed,
  TERMINAL_STATUSES,
  type JobStatus,
} from './job-model';

// ── normalizeStatus: each family's wire value → canonical ─────────────────
const NORM: ReadonlyArray<[string, JobStatus]> = [
  ['pending', 'pending'],
  ['queued', 'pending'], // the generation/export family's "queued"
  ['running', 'running'],
  ['processing', 'running'],
  ['complete', 'complete'],
  ['completed', 'complete'], // export family terminal wire
  ['succeeded', 'complete'], // generation family terminal wire
  ['success', 'complete'],
  ['done', 'complete'], // transcription store terminal wire
  ['failed', 'failed'],
  ['error', 'failed'],
  ['not_found', 'not_found'],
  ['missing', 'not_found'],
];
for (const [wire, canonical] of NORM) {
  assert.equal(normalizeStatus(wire), canonical, `normalizeStatus(${wire})`);
}

// Case / whitespace insensitive
assert.equal(normalizeStatus('SUCCEEDED'), 'complete');
assert.equal(normalizeStatus('  Done  '), 'complete');
assert.equal(normalizeStatus('Queued'), 'pending');

// Unknown string → running (non-terminal, keep polling instead of misreading it as terminal)
assert.equal(normalizeStatus('weird-status'), 'running');
assert.equal(normalizeStatus(''), 'running');

// ── isTerminal / isComplete / isFailed ────────────────────────────────────
for (const t of ['complete', 'completed', 'succeeded', 'done', 'failed', 'error', 'not_found', 'missing']) {
  assert.equal(isTerminal(t), true, `isTerminal(${t}) should be true`);
}
for (const nt of ['pending', 'queued', 'running', 'processing', 'weird', '']) {
  assert.equal(isTerminal(nt), false, `isTerminal(${nt}) should be false`);
}
for (const c of ['complete', 'completed', 'succeeded', 'done']) {
  assert.equal(isComplete(c), true, `isComplete(${c})`);
  assert.equal(isFailed(c), false, `isFailed(${c})`);
}
for (const f of ['failed', 'error']) {
  assert.equal(isFailed(f), true, `isFailed(${f})`);
  assert.equal(isComplete(f), false, `isComplete(${f})`);
}
// not_found is terminal, but neither complete nor failed
assert.equal(isTerminal('not_found'), true);
assert.equal(isComplete('not_found'), false);
assert.equal(isFailed('not_found'), false);

// TERMINAL_STATUSES contents are locked down
assert.deepEqual([...TERMINAL_STATUSES].sort(), ['complete', 'failed', 'not_found']);

// ── Isomorphism assertion: all three families' terminal wires are classified by the same authority (A3's core goal) ─────────
// Generation succeeded / export completed / transcription store done — all should read as "complete + terminal";
// each family's in-flight statuses (queued/running) should read as "non-terminal".
const FAMILY_COMPLETE = ['succeeded', 'completed', 'done'];
const FAMILY_INFLIGHT = ['queued', 'running'];
for (const done of FAMILY_COMPLETE) {
  assert.equal(isComplete(done), true, `family complete wire ${done}`);
  assert.equal(isTerminal(done), true, `family complete wire ${done} terminal`);
}
for (const live of FAMILY_INFLIGHT) {
  assert.equal(isTerminal(live), false, `family in-flight wire ${live} non-terminal`);
}

console.log('job-model.check.ts OK');
