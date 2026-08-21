import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const vite = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { AssetMenuDestinations } = await vite.ssrLoadModule(
    '/src/media/AssetMenuDestinations.tsx',
  ) as typeof import('./AssetMenuDestinations');
  const { BlankMediaMenuActions } = await vite.ssrLoadModule(
    '/src/media/MediaPoolOverlays.tsx',
  ) as typeof import('./MediaPoolOverlays');
  const { runAssetDestinationAction } = await vite.ssrLoadModule(
    '/src/media/assetDestination.ts',
  ) as typeof import('./assetDestination');
  const { assetMenuSelectionIds, assetMenuFavoriteValue, batchAssetRename, duplicateAssetName } = await vite.ssrLoadModule(
    '/src/media/assetMenuSelection.ts',
  ) as typeof import('./assetMenuSelection');

  const calls: string[] = [];
  const actions = {
    timeline: () => calls.push('timeline'),
    chat: () => calls.push('chat'),
  };

  runAssetDestinationAction('timeline', actions);
  runAssetDestinationAction('chat', actions);
  assert.deepEqual(calls, ['timeline', 'chat']);
  assert.deepEqual(
    assetMenuSelectionIds('asset-b', new Set(['asset-a', 'asset-b']), ['asset-a', 'asset-b', 'asset-c']),
    ['asset-a', 'asset-b'],
    'right-clicking a selected asset must keep the whole multi-selection',
  );
  assert.equal(duplicateAssetName('Project Footage.mp4', 'copy'), 'Project Footage copy.mp4');
  assert.equal(duplicateAssetName('No Extension', 'copy'), 'No Extension copy');
  assert.deepEqual(
    assetMenuSelectionIds('asset-c', new Set(['asset-a', 'asset-b']), ['asset-a', 'asset-b', 'asset-c']),
    ['asset-c'],
    'right-clicking an unselected asset must act on that asset alone',
  );
  assert.equal(
    assetMenuFavoriteValue([{ favorite: true }, { favorite: false }]),
    true,
    'a bulk favorite must favorite everything when any item is not yet favorited',
  );
  assert.equal(
    assetMenuFavoriteValue([{ favorite: true }, { favorite: true }]),
    false,
    'a bulk unfavorite only happens when everything is already favorited',
  );
  assert.deepEqual(
    batchAssetRename([
      { id: 'asset-a', name: 'Original Cut.mp4' },
      { id: 'asset-b', name: 'Cover.png' },
    ], 'Project Footage'),
    [
      { id: 'asset-a', name: 'Project Footage.mp4' },
      { id: 'asset-b', name: 'Project Footage 2.png' },
    ],
    'a bulk rename must keep each asset extension and give later assets a stable index',
  );

  const markup = renderToStaticMarkup(createElement(AssetMenuDestinations, {
    // "July 7" — a non-ASCII asset name that must survive into the aria-label
    assetName: '7\u67087\u65e5.mp4',
    onAddTimeline: () => undefined,
    onAddChat: () => undefined,
  }));

  assert.match(markup, /Add to:/);
  assert.match(markup, />Timeline</);
  assert.match(markup, />AI chat</);
  assert.ok(markup.indexOf('>AI chat<') < markup.indexOf('>Timeline<'), 'AI chat must sit on the left and Timeline on the right');
  assert.match(markup, /aria-label="Add 7\u67087\u65e5.mp4 to timeline"/);
  assert.match(markup, /aria-label="Add 7\u67087\u65e5.mp4 to AI chat"/);

  const blankMenuMarkup = renderToStaticMarkup(createElement(BlankMediaMenuActions, {
    clipboardCount: 2,
    visibleCount: 3,
    allVisibleSelected: false,
    view: 'grid',
    sort: 'newest',
    type: 'all',
    onPaste: () => undefined,
    onSelectAll: () => undefined,
    onUpload: () => undefined,
    onSemanticSearch: () => undefined,
    onMobileUpload: () => undefined,
    onCreateFolder: () => undefined,
    onViewToggle: () => undefined,
    onSort: () => undefined,
    onType: () => undefined,
  }));
  assert.match(blankMenuMarkup, /Paste copies \(2\)/);
  assert.match(blankMenuMarkup, />Select all</);
  assert.match(blankMenuMarkup, />Upload media</);
  assert.match(blankMenuMarkup, />Local semantic search</);
  assert.match(blankMenuMarkup, />Upload from phone</);
  assert.match(blankMenuMarkup, />New folder</);
  assert.match(blankMenuMarkup, /aria-label="Sort media"/);
  assert.match(blankMenuMarkup, /aria-label="Filter media"/);

  const overlaySource = await readFile(new URL('./MediaPoolOverlays.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(overlaySource, /className="cc-asset-menu-backdrop"/, 'the asset menu must not use a full-screen backdrop that blocks right-clicking straight onto another asset');
  assert.match(overlaySource, /document\.addEventListener\('pointerdown', closeOutside, true\)/, 'the asset menu must close on an outside click');
} finally {
  await vite.close();
}

console.log('asset menu destinations verified');
