import assert from 'node:assert/strict';
import type { TimelineItem } from '../../editor/types';
import { contextReferenceItems } from './clipContextSelection';

const items = [
  { id: 'caption-card', name: 'Title Card', kind: 'motion-graphic', track: 'V2', startFrame: 0, durationInFrames: 60 },
  { id: 'video-main', name: 'Main Video', kind: 'video', track: 'V1', startFrame: 0, durationInFrames: 120 },
  { id: 'audio-bed', name: 'Background Music', kind: 'audio', track: 'A1', startFrame: 0, durationInFrames: 120 },
] as TimelineItem[];

assert.deepEqual(
  contextReferenceItems('video-main', ['audio-bed', 'video-main', 'missing'], items).map((item) => item.id),
  ['audio-bed', 'video-main'],
);
assert.deepEqual(
  contextReferenceItems('caption-card', ['audio-bed', 'video-main'], items).map((item) => item.id),
  ['caption-card'],
);

console.log('clip context selection verify passed');
