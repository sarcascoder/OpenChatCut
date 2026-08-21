// Runnable contract check: `npx tsx src/audio/loudness.check.ts`
// Only pure functions are tested (DOM-free); analyzeClipLoudness depends on fetch/OfflineAudioContext,
// which is unreachable under node, so it is not called here.
import assert from 'node:assert';
import { integratedLoudnessFromSamples, gainForTarget } from './loudness';

const SAMPLE_RATE = 48000;

function sine(seconds: number, amplitude: number): Float32Array {
  const n = Math.round(seconds * SAMPLE_RATE);
  const out = new Float32Array(n);
  const freq = 1000; // 1kHz test tone; the period divides the sample rate evenly, so no phase error at block boundaries
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return out;
}

// Full-scale 1kHz sine: mean square = 0.5, theoretical LUFS = -0.691 + 10*log10(0.5) ≈ -3.70 (near 0dB,
// not exactly 0 — the mean square of a full-scale sine is about 3dB below its peak power).
const fullScale = integratedLoudnessFromSamples(sine(1, 1), SAMPLE_RATE);
assert.ok(fullScale > -6 && fullScale < 0, `full-scale sine should read near 0 dB-ish, got ${fullScale}`);

// Amplitude ×0.1 (20dB lower) → mean square ×0.01 → should read about 20 LUFS below full scale
const quieter = integratedLoudnessFromSamples(sine(1, 0.1), SAMPLE_RATE);
const delta = fullScale - quieter;
assert.ok(Math.abs(delta - 20) < 0.5, `20dB quieter signal should measure ~20 LUFS lower, got delta=${delta}`);

// A silent buffer must not be NaN/Infinity (guard log10(0))
const silent = integratedLoudnessFromSamples(new Float32Array(SAMPLE_RATE), SAMPLE_RATE);
assert.ok(Number.isFinite(silent), `silent buffer must not be NaN/Infinity, got ${silent}`);

// An empty array must not blow up either
const empty = integratedLoudnessFromSamples(new Float32Array(0), SAMPLE_RATE);
assert.ok(Number.isFinite(empty), `empty buffer must not be NaN/Infinity, got ${empty}`);

// gainForTarget: -24 → -14 needs +10dB, linear gain = 10^(10/20) ≈ 3.1623
const gain = gainForTarget(-24, -14);
assert.ok(Math.abs(gain - 3.1623) < 0.01, `gain should be ~3.1623, got ${gain}`);

// Extreme values must clamp into a sane range, never a gain that clips or nearly mutes
assert.ok(gainForTarget(-60, 0) <= 8, 'gain must clamp to the max');
assert.ok(gainForTarget(0, -60) >= 0.05, 'gain must clamp to the min');

// Invalid input (NaN/Infinity) must not blow up the gain along with it
assert.ok(Number.isFinite(gainForTarget(NaN, -14)), 'gain must stay finite for NaN current');
assert.ok(Number.isFinite(gainForTarget(-14, Infinity)), 'gain must stay finite for Infinite target');

console.log('loudness.check: ok');
