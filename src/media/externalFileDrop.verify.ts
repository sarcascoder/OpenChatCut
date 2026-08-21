import assert from 'node:assert/strict';
import { classifyExternalFile, parseDroppedCaptions } from './externalFileDrop';

assert.deepEqual(classifyExternalFile({ name: 'travel.mp4', type: 'video/mp4' }), {
  type: 'media', mediaKind: 'video',
});
assert.deepEqual(classifyExternalFile({ name: 'narration.mp3', type: 'audio/mpeg' }), {
  type: 'media', mediaKind: 'audio',
});
assert.deepEqual(classifyExternalFile({ name: 'captions.srt', type: '' }), {
  type: 'caption', format: 'srt',
});
assert.deepEqual(
  parseDroppedCaptions(
    'captions.srt',
    '1\n00:00:01,000 --> 00:00:02,500\nFirst sentence\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond sentence',
    10000,
  ),
  [
    { text: 'First sentence', start: 10000, end: 11500 },
    { text: 'Second sentence', start: 12000, end: 13000 },
  ],
);
assert.deepEqual(
  parseDroppedCaptions('script.txt', 'First line\n\nSecond line', 4000),
  [
    { text: 'First line', start: 4000, end: 7000 },
    { text: 'Second line', start: 7000, end: 10000 },
  ],
);

console.log('externalFileDrop.verify: Finder media and caption classification OK');
