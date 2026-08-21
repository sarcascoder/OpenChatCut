import assert from 'node:assert/strict';
import type { MediaAsset } from '../editor/types';
import { importMediaBatch } from './mediaPoolImport';

const targetFolderId = 'folder-travel';
const placeholder = { id: 'asset-1', name: 'trip.mov' } as MediaAsset;
const ready = { ...placeholder, src: '/media/trip.mov' } as MediaAsset;
const placements: Array<{ ids: string[]; folderId?: string }> = [];

const errors = await importMediaBatch({
  files: [{ name: 'trip.mov' } as File],
  targetFolderId,
  onImport: async (_file, _onProgress, lifecycle) => {
    lifecycle?.onPlaceholder?.(placeholder);
    assert.deepEqual(placements.at(-1), { ids: ['asset-1'], folderId: targetFolderId },
      'the placeholder must land in the drop target folder immediately');
    lifecycle?.onAssetUpdated?.(ready);
    assert.deepEqual(placements.at(-1), { ids: ['asset-1'], folderId: targetFolderId },
      'the ready asset must reconfirm the drop target folder');
    return ready;
  },
  onMoveAssets: (ids, folderId) => placements.push({ ids, folderId }),
  onProgress: () => undefined,
});

assert.deepEqual(errors, [], 'a successful import must not produce batch errors');
assert.deepEqual(placements, [
  { ids: ['asset-1'], folderId: targetFolderId },
  { ids: ['asset-1'], folderId: targetFolderId },
], 'the placeholder and ready stages must both land in the same drop target folder');

console.log('media-folder-drop.verify: placeholder and ready preserve the target folder');
