import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const exportHistory = await readFile(new URL('./ExportHistory.tsx', import.meta.url), 'utf8');

assert.match(
  exportHistory,
  /<TopBarIconButton[\s\S]*?icon="download"[\s\S]*?label="Export History"/,
  'the export history button should reuse the top bar icon button',
);
assert.doesNotMatch(
  exportHistory,
  /<button title="Export History"/,
  'the export history button should not fall back to the unstylable native title attribute',
);

console.log('top bar immediate tooltips verified');
