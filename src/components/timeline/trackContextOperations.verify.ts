import assert from 'node:assert/strict';
import type { TimelineState } from '../../editor/types';
import { closeCaptionTrackGaps, trackClearPlan, trackContextMenuLabels } from './trackContextOperations';

assert.deepEqual(trackContextMenuLabels('video').slice(0, 2), ['Insert assets', 'Close gaps']);
assert.ok(trackContextMenuLabels('audio').includes('Auto duck'));
assert.ok(trackContextMenuLabels('caption').includes('Caption styles'));
assert.ok(!trackContextMenuLabels('caption').includes('Mute track'));

const state: TimelineState = {
  fps: 30, width: 1080, height: 1920, items: [], selectedId: null,
  trackOrder: ['C1'], tracks: { C1: { kind: 'caption', captions: {
    enabled: true, template: 'plain', pacing: 'phrase', sourceEntries: [{
      id: 'lane-1', itemId: 'manual:lane-1', words: [
        { text: 'One', start: 1_000, end: 2_000 },
        { text: 'Two', start: 4_000, end: 5_500 },
        { text: 'Three', start: 5_200, end: 6_000 },
      ],
    }],
  } } },
};
const captions = state.tracks!.C1!.captions!;
const tightened = closeCaptionTrackGaps(captions);
assert.equal(tightened.changed, true);
assert.deepEqual(tightened.captions.sourceEntries?.[0]?.words?.map(({ start, end }) => [start, end]), [
  [1_000, 2_000], [2_000, 3_500], [5_200, 6_000],
]);
assert.equal(trackClearPlan(state, 'C1').hasContents, true);
assert.deepEqual(trackClearPlan(state, 'C1').actions, [{ type: 'setCaptions', captions: null, track: 'C1' }]);

console.log('track context operations verify passed');
