// Runnable: `npx tsx src/media/media-folder-menu.verify.ts`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const card = readFileSync(new URL('./MediaPoolCard.tsx', import.meta.url), 'utf8');
const overlays = readFileSync(new URL('./MediaPoolOverlays.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('./MediaPoolPanel.tsx', import.meta.url), 'utf8');
const menus = readFileSync(new URL('./MediaPoolMenus.tsx', import.meta.url), 'utf8');
const grid = readFileSync(new URL('./MediaPoolGrid.tsx', import.meta.url), 'utf8');

assert.match(card, /onContextMenu/, 'folder card must respond to right-click');
assert.match(card, /onOpenMenu/, 'folder card must expose a menu entry point');
assert.match(card, /cc-folder-more/, 'folder card should have a ⋯ button');
assert.match(overlays, /export function FolderMenuPortal/, 'a folder-menu portal must exist');
assert.match(overlays, /Only empty folders can be deleted/, 'deleting a non-empty folder must be disabled with a hint');
assert.match(menus, /FolderMenuPortal/, 'domain-local media menus must mount the folder portal');
assert.match(panel, /MediaPoolMenus/, 'the media pool panel must mount the extracted folder menu');
assert.match(panel, /onOpenFolderMenu/, 'the grid must receive the folder-menu callback');
assert.match(grid, /onOpenFolderMenu/, 'the grid must pass the folder menu down to the card');
assert.match(panel, /currentFolderId === state\.id/, 'deleting a folder other than the current one must not navigate away');

console.log('media-folder-menu.verify: ok (right-click/⋯/portal/empty-folder delete/navigation)');
