// Runnable check: `npx tsx src/editor/clipFit.verify.ts`.
// Verify the self-healing of duration-derived data: fading on both sides does not overlap, the side that was changed when setFade gives way, and key frames are truncated
// Keep "the still rendered frame sample value is completely unchanged" and confirm with true reduce retime/setSpeed/split
// No out-of-bounds fades or keyframes will be left after changing the duration.
import assert from 'node:assert/strict';
import { capFade, fitItemToDuration, fitKeyframes, truncateKeyframes } from './clipFit';
import { sampleKeyframes } from './keyframes';
import { reduce } from './reduce';
import { migrateProjectDoc } from '../persist/projectStore';
import type { Keyframe, TimelineItem, TimelineState } from './types';

const item = (patch: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 'a', track: 'V1', startFrame: 0, durationInFrames: 100,
  kind: 'video', name: 'a', src: '/m/a.mp4', ...patch,
} as TimelineItem);

const stateOf = (items: TimelineItem[]): TimelineState => ({
  fps: 30, width: 1920, height: 1080, selectedId: null,
  tracks: { V1: { kind: 'video' } }, trackOrder: ['V1'], items,
});

// ── capFade: Negative numbers are returned to zero, room is given away, undefined remains unset ──
{
  assert.equal(capFade(undefined, 100), undefined, 'unset stays unset');
  assert.equal(capFade(-5, 100), 0);
  assert.equal(capFade(90, 100), 90);
  assert.equal(capFade(90, 10), 10, 'it can only take the room the other side gives up');
  assert.equal(capFade(90, -20), 0, 'a negative room clamps to zero');
}

// ── Core flaw: The sum of the fades on both sides cannot exceed the length of the clip ──
{
  const broken = fitItemToDuration(item({ durationInFrames: 100, fadeInFrames: 90, fadeOutFrames: 90 }));
  assert.equal(broken.fadeInFrames, 90);
  assert.equal(broken.fadeOutFrames, 10, 'the fade out yields, so the total exactly equals the duration');
  assert.ok((broken.fadeInFrames ?? 0) + (broken.fadeOutFrames ?? 0) <= 100);

  const legal = item({ fadeInFrames: 10, fadeOutFrames: 10 });
  assert.equal(fitItemToDuration(legal), legal, 'an already valid item returns the same object (no extra re-render)');
}

// ── Keyframe truncation: Each frame that is still rendered must have the same sample value ──
{
  const kfs: Keyframe[] = [
    { frame: 0, value: 0, easing: 'easeInOut' },
    { frame: 40, value: 100, easing: [0.2, 0.9, 0.4, 1] },
    { frame: 90, value: 20 },
  ];
  const last = 49; // Reduce duration to 50
  const cut = truncateKeyframes(kfs, last);
  assert.ok(cut[cut.length - 1]!.frame <= last, 'no keyframe lands after the last frame');
  for (let f = 0; f <= last; f += 1) {
    assert.ok(
      Math.abs(sampleKeyframes(cut, f) - sampleKeyframes(kfs, f)) < 1e-6,
      `the sampled value at frame ${f} must not change (dropping the tail outright would stop the curve early)`,
    );
  }
  assert.equal(truncateKeyframes(kfs, 200), kfs, 'already in range returns unchanged');

  const ik = { opacity: kfs, scale: [{ frame: 0, value: 1 }] as Keyframe[] };
  assert.equal(fitKeyframes(ik, 200), ik, 'when everything is in range the whole object is returned unchanged');
  const trimmed = fitKeyframes(ik, last)!;
  assert.notEqual(trimmed, ik);
  assert.deepEqual(trimmed.scale, ik.scale, 'properties that stay in range are untouched');
  assert.equal(fitKeyframes(undefined, 10), undefined);

  // Extreme case of 1 frame duration: leaving a 0-frame keyframe, neither exploding nor clearing
  assert.deepEqual(truncateKeyframes(kfs, 0).map((k) => k.frame), [0]);
}

// ── After using reduce:retime to shorten the clip, the fade and keyframes are pressed back together ──
{
  const before = stateOf([item({
    durationInFrames: 100, fadeInFrames: 30, fadeOutFrames: 60,
    keyframes: { opacity: [{ frame: 0, value: 0 }, { frame: 95, value: 1 }] },
  })]);
  const after = reduce(before, { type: 'retime', id: 'a', durationInFrames: 20 });
  const it = after.items[0]!;
  assert.equal(it.durationInFrames, 20);
  assert.ok((it.fadeInFrames ?? 0) + (it.fadeOutFrames ?? 0) <= 20, `fades still out of range after shortening: ${it.fadeInFrames}+${it.fadeOutFrames}`);
  assert.ok((it.keyframes?.opacity ?? []).every((k) => k.frame <= 19), 'no keyframe is left unrenderable');
}

// ── It is true that reduce:setSpeed ​​also heals itself after acceleration ──
{
  const before = stateOf([item({ durationInFrames: 100, fadeInFrames: 40, fadeOutFrames: 40 })]);
  const it = reduce(before, { type: 'setSpeed', id: 'a', rate: 4 }).items[0]!;
  assert.equal(it.durationInFrames, 25);
  assert.ok((it.fadeInFrames ?? 0) + (it.fadeOutFrames ?? 0) <= 25, 'at 4x speed the 40+40 frame fades must be pulled back in');
}

// ── The outer fade of the last two halves of Jingzhen reduce:split cannot exceed their respective lengths ──
{
  const before = stateOf([item({ durationInFrames: 100, fadeInFrames: 80, fadeOutFrames: 80 })]);
  const halves = reduce(before, { type: 'split', id: 'a', atFrame: 30, newId: 'b' }).items;
  assert.equal(halves.length, 2);
  for (const half of halves) {
    assert.ok(
      (half.fadeInFrames ?? 0) + (half.fadeOutFrames ?? 0) <= half.durationInFrames,
      `${half.id} fades exceed its own ${half.durationInFrames} frames`,
    );
  }
}

// ── setFade: The side that has been explicitly changed gives way, and the side that has not been moved remains unchanged ──
{
  const before = stateOf([item({ durationInFrames: 100, fadeInFrames: 0, fadeOutFrames: 90 })]);
  const it = reduce(before, { type: 'setFade', id: 'a', fadeInFrames: 90 }).items[0]!;
  assert.equal(it.fadeOutFrames, 90, 'adjusting only the fade in must not shorten the fade out the user already set');
  assert.equal(it.fadeInFrames, 10, 'the edited side takes the room that is left');

  const both = reduce(before, { type: 'setFade', id: 'a', fadeInFrames: 70, fadeOutFrames: 70 }).items[0]!;
  assert.deepEqual([both.fadeInFrames, both.fadeOutFrames], [70, 30], 'when both sides are given, the fade in wins');
}

// ── Self-healing is also required when loading the project: reduce is only reached when there is an action, and illegal values ​​cannot wait for the user to move first ──
{
  const legacy = {
    version: 3, assets: [], mediaFolders: [], activeTimelineId: 'tl1',
    timelines: [{
      id: 'tl1', name: 'main', order: 0, fps: 30, width: 1920, height: 1080, selectedId: null,
      tracks: { V1: { kind: 'video' as const } }, trackOrder: ['V1'],
      items: [item({ durationInFrames: 100, fadeInFrames: 90, fadeOutFrames: 90 })],
    }],
  };
  const healed = migrateProjectDoc(legacy);
  assert.ok(healed, 'a valid project still passes migration');
  const it = healed!.timelines[0]!.items[0]!;
  assert.ok(
    (it.fadeInFrames ?? 0) + (it.fadeOutFrames ?? 0) <= 100,
    `still out of range after loading: ${it.fadeInFrames}+${it.fadeOutFrames} (the whole clip would stay dark)`,
  );
}

console.log('clipFit.verify: ok (joint fade clamp/edited side yields/keyframe truncation keeps samples/real reduce retime·setSpeed·split/self-healing on load)');
