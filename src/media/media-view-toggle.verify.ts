import assert from 'node:assert/strict';
import { mediaViewToggleLabel, toggleMediaView } from './mediaView';

assert.equal(mediaViewToggleLabel('list'), 'Switch to grid view');
assert.equal(toggleMediaView('list'), 'grid');
assert.equal(mediaViewToggleLabel('grid'), 'Switch to list view');
assert.equal(toggleMediaView('grid'), 'list');

console.log('media view toggle verification passed');
