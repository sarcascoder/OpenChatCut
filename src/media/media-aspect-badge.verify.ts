import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mediaRatioLabel } from './mediaPoolFormat';

assert.equal(mediaRatioLabel(1920, 1080), '16:9');
assert.equal(mediaRatioLabel(1080, 1920), '9:16');
assert.equal(mediaRatioLabel(1024, 768), '4:3');
assert.equal(mediaRatioLabel(undefined, 1080), null);
assert.equal(mediaRatioLabel(1920, 0), null);

const cardSource = readFileSync(new URL('./MediaPoolCard.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

assert.match(
  cardSource,
  /const aspectLabel = mediaRatioLabel\(asset\.width, asset\.height\);[\s\S]*?className="cc-asset-ratio"/,
  'the asset card should render the ratio badge from its own width and height',
);
assert.match(
  cssSource,
  /\.cc-asset-ratio\s*\{[^}]*position:\s*absolute;[^}]*left:\s*4px;[^}]*bottom:\s*4px;/s,
  'the asset ratio should be pinned to the bottom-left of the thumbnail',
);
assert.match(
  cssSource,
  /\.cc-media-grid\.list[\s\S]*?\.cc-asset-ratio[\s\S]*?display:\s*none;/,
  'list mode should hide the thumbnail ratio badge',
);

console.log('media-aspect-badge.verify: valid visual media ratios render at thumbnail bottom-left');
