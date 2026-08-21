import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [controller, library, panel, converter, fileImport] = await Promise.all([
  readFile(new URL('../editor/useEditorController.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../library/LibraryPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./MediaPoolPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./directoryImportAsset.ts', import.meta.url), 'utf8'),
  readFile(new URL('./useMediaPoolFileImport.ts', import.meta.url), 'utf8'),
]);

assert.match(
  controller,
  /onIngestDirectoryAsset: ingestToPool/,
  'watched descriptors must enter the established ingestToPool/EditorCommands path',
);
const watchOwner = library.indexOf('const directoryImport = useDirectoryImport');
const conditionalMediaPanel = library.indexOf(') : isMyAssets ? (');
assert.ok(
  watchOwner >= 0 && watchOwner < conditionalMediaPanel,
  'always-mounted LibraryPanel must own the watch before the conditional media-tab subtree',
);
assert.match(
  library,
  /useDirectoryImport\(\{[\s\S]*?ingest: onIngestDirectoryAsset/,
  'the lifetime owner binds watched assets to the established ingest callback',
);
assert.doesNotMatch(panel, /useDirectoryImport\(/, 'media-tab unmount must not own or stop the watch');
assert.match(panel, /directoryImport: UseDirectoryImportState/, 'media pool consumes watch controls as state');
assert.match(
  fileImport,
  /if \(!hasDirectoryEntries\(transfer\)\)[\s\S]*?pickFiles\(transfer\.files, folderId\)/,
  'flat DataTransfer.files must bypass recursive collection and keep the established importer',
);
assert.doesNotMatch(
  converter,
  /normalizeUploadedVideo|fetch\(/,
  'renderer must never start watched-file normalization outside main-owned cancellation authority',
);
assert.match(converter, /compatibilityNormalized !== true/, 'ordinary videos require a backend-ready descriptor');
assert.ok(panel.split('\n').length <= 500, 'MediaPoolPanel must stay below the source-file line cap');
