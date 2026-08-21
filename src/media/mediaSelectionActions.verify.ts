import assert from 'node:assert/strict';
import { addAssetsToChat, allVisibleAssetsSelected, toggleVisibleAssetSelection } from './mediaSelectionActions';

const visible = ['map', 'route', 'video'];

assert.equal(allVisibleAssetsSelected(new Set(['map', 'route', 'video', 'outside']), visible), true,
  'when every visible asset is selected, the empty-area context menu should switch to deselect all');
assert.deepEqual(
  [...toggleVisibleAssetSelection(new Set(['map', 'route', 'video', 'outside']), visible)].sort(),
  ['outside'],
  'deselect all must only remove the currently visible assets, never clear selections in other folders or outside the filter',
);
assert.deepEqual(
  [...toggleVisibleAssetSelection(new Set(['map', 'outside']), visible)].sort(),
  ['map', 'outside', 'route', 'video'],
  'when not everything is selected, fill in the visible assets while keeping the existing selection',
);

const selectedAssets = [{ id: 'map' }, { id: 'route' }, { id: 'video' }];
const chatCalls: Array<Array<{ id: string }>> = [];
addAssetsToChat(selectedAssets, (assets) => chatCalls.push(assets));
assert.equal(chatCalls.length, 1, 'adding a batch to the AI chat box must invoke the callback exactly once');
assert.deepEqual(chatCalls[0]?.map((asset) => asset.id), ['map', 'route', 'video'],
  'a single chat seed must keep the selection order of every asset reference');

console.log('media selection actions verification passed');
