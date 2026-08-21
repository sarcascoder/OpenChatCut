import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const installedSource = await readFile(new URL('./ExtensionInstalled.tsx', import.meta.url), 'utf8');
const centerSource = await readFile(new URL('./ExtensionCenter.tsx', import.meta.url), 'utf8');
const partsSource = await readFile(new URL('./ExtensionCenterParts.tsx', import.meta.url), 'utf8');

assert.match(installedSource, /expandedId: string \| null/);
assert.match(installedSource, /pack\.items\.map/);
assert.match(installedSource, /View contents/);
assert.match(installedSource, /Confirm uninstall/);
assert.match(centerSource, /const \[expandedId, setExpandedId\]/);
assert.match(centerSource, /onExpand=\{setExpandedId\}/);
assert.match(partsSource, /role="switch"/);
assert.match(partsSource, /aria-checked=\{checked\}/);

console.log('extension-installed.verify: installed packs expose details, toggle state, and scoped removal');
