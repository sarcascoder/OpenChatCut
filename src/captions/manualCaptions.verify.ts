import assert from 'node:assert/strict';
import { captionPages, captionsToSrt } from './exportCaptions';
import { buildLaneGroups } from './lanes';
import {
  appendDroppedManualCaption, appendManualCue, appendManualCueToFirstLane, appendManualLane, isManualCaptionEntry,
  newManualCaptions, placeManualCueTiming, removeManualCue, resizeManualCue, updateManualCue,
} from './manualCaptions';

let captions = newManualCaptions();
const laneId = captions.sourceEntries![0]!.id;
assert.equal(captions.sourceEntries!.filter(isManualCaptionEntry).length, 1);

const added = appendManualCue(captions, laneId, 'First line', 1_000, 2_000);
assert.ok(added?.sourceEntries);
captions = { ...captions, ...added };
assert.equal(buildLaneGroups(captions, [], 30, 1_500, 6)?.[0]?.lanes[0]?.page.words[0]?.text, 'First line');
assert.deepEqual(buildLaneGroups(captions, [], 30, 2_500, 6), [], 'manual cue ends exactly at endMs');
const originalCueId = captions.sourceEntries![0]!.words![0]!.id;

const updated = updateManualCue(captions, laneId, 0, 'Edited caption', 1_200, 2_400);
assert.ok(updated?.sourceEntries);
captions = { ...captions, ...updated };
assert.equal(captions.sourceEntries![0]!.words![0]!.id, originalCueId, 'manual text/timing updates preserve cue identity');
assert.equal(captionPages(captions, [], 30)[0]?.words[0]?.text, 'Edited caption');
assert.match(captionsToSrt(captions, [], 30), /00:00:01,200 --> 00:00:02,400\nEdited caption/);

captions = { ...captions, ...appendManualCue(captions, laneId, 'Next line', 3_000, 4_000) };
captions = { ...captions, ...resizeManualCue(captions, laneId, 0, 'start', -500) };
assert.equal(captions.sourceEntries![0]!.words![0]!.start, 700, 'left edge extends earlier');
captions = { ...captions, ...resizeManualCue(captions, laneId, 0, 'end', 2_000) };
assert.equal(captions.sourceEntries![0]!.words![0]!.end, 3_000, 'right edge stops at the next cue');

const secondLane = appendManualLane(captions, []);
captions = { ...captions, ...secondLane };
assert.equal(captions.sourceEntries!.filter(isManualCaptionEntry).length, 2, 'multiple manual lanes persist');

let destination = newManualCaptions();
destination = { ...destination, ...appendManualCueToFirstLane(destination, [], 'Cross-track caption', 1_000, 3_000) };
destination = { ...destination, ...appendManualCueToFirstLane(destination, [], 'Overlap allowed', 2_000, 4_000) };
assert.deepEqual(destination.sourceEntries![0]!.words?.map((word) => word.text), ['Cross-track caption', 'Overlap allowed']);

const dropped = appendDroppedManualCaption(captions, [], 'tiktok', 'Dropped caption', 5_000, {
  anchor: 'middle-center', offsetXRatio: 0.2, offsetYRatio: -0.15,
});
assert.ok(dropped);
captions = { ...captions, ...dropped.patch };
const droppedEntry = captions.sourceEntries!.find((entry) => entry.id === dropped.laneId)!;
assert.equal(droppedEntry.words?.[0]?.text, 'Dropped caption');
assert.equal(droppedEntry.offsetXRatio, 0.2);
assert.equal(droppedEntry.style?.highlightBackground, '#FF2E63');

captions = { ...captions, ...removeManualCue(captions, laneId, 0) };
captions = { ...captions, ...removeManualCue(captions, laneId, 0) };
assert.equal(captions.sourceEntries!.find((entry) => entry.id === laneId)?.words?.length, 0);

//  —  placeManualCueTiming: non-overlapping clamping of dragging and placing (shared with same-track/cross-track drag and drop)  —
const occupied = [{ text: 'a', start: 0, end: 1_000 }, { text: 'c', start: 1_200, end: 2_000 }];
assert.equal(placeManualCueTiming(occupied, 1_050, 1_000), null, 'a 1000ms cue dragged into a 200ms gap is rejected (the caller snaps it back)');
assert.deepEqual(placeManualCueTiming(occupied, 1_050, 150), { start: 1_050, end: 1_200 }, 'when it fits it lands at the requested position, its right edge stopped by the neighbour');
assert.deepEqual(placeManualCueTiming(occupied, 950, 200), { start: 1_000, end: 1_200 }, 'pushed into the previous neighbour\'s tail it snaps flush and fills the gap exactly');
assert.deepEqual(placeManualCueTiming(occupied, 5_000, 700), { start: 5_000, end: 5_700 }, 'it can jump past neighbours into open space further along');
assert.deepEqual(placeManualCueTiming([], -500, 800), { start: 0, end: 800 }, 'empty lane: a negative drop point clamps to 0 and the duration is kept');

console.log('manualCaptions.check: ok');
