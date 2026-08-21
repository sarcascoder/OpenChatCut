import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const toolbar = await readFile(new URL('./MediaPoolToolbar.tsx', import.meta.url), 'utf8');
const semantic = await readFile(new URL('./semantic-search/SemanticSearchControls.tsx', import.meta.url), 'utf8');

for (const label of ['Upload media', 'Sort', 'Filter', 'More actions']) {
  assert.match(toolbar, new RegExp(`data-tip="${label}"`), `the media toolbar should show an immediate tooltip for "${label}"`);
}
assert.match(toolbar, /data-tip=\{mediaViewToggleLabel\(props\.view\)\}/, 'the grid/list toggle should show an immediate tooltip for the current action');
assert.match(semantic, /data-tip="Local semantic search"/, 'local semantic search should use an immediate tooltip');
assert.doesNotMatch(toolbar, /className=\{?`?[^\n]*cc-media-icon[^\n]*\stitle=/, 'media toolbar icons must not rely on the delayed native title');
assert.doesNotMatch(semantic, /className=\{?`?[^\n]*cc-media-icon[^\n]*\stitle=/, 'the semantic search icon must not rely on the delayed native title');

console.log('media toolbar immediate tooltips verified');
