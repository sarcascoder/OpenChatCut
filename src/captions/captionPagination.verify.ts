import assert from 'node:assert/strict';
import { captionPages } from './exportCaptions';
import { buildCues } from './captionCues';
import { buildCaptionPages } from './captionPages';
import { resolveEntryWordRefs } from './resolve';
import { CAPTION_MAX_CHARS_PER_LINE, CAPTION_MAX_VISUAL_LINES, joinCaptionWords, paginate } from './types';
import type { CaptionsData } from './types';
import { buildCaptionWordRuns } from './captionWordRuns';

const words = (texts: string[]) => texts.map((text, index) => ({
  text,
  start: index * 100,
  end: index * 100 + 80,
}));
const pageText = (texts: string[], per: number, breaks?: Set<number>, chars = CAPTION_MAX_CHARS_PER_LINE, lines = CAPTION_MAX_VISUAL_LINES) =>
  paginate(words(texts), 'phrase', per, breaks, chars, lines).map((page) => joinCaptionWords(page.words));
const estimatedUnits = (text: string) => Array.from(text)
  .reduce((total, char) => total + (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(char) ? 2 : 1), 0);

// "hello, world" split per character - CJK punctuation-attachment input
assert.deepEqual(
  pageText(['\u4f60', '\u597d', '\uff0c', '\u4e16', '\u754c'], 2, undefined, 4, 1),
  ['\u4f60\u597d\uff0c', '\u4e16\u754c'],
  'CJK punctuation stays with the preceding phrase',
);
assert.deepEqual(
  pageText(['We', 'build', 'tools', 'for', 'the', 'future'], 4),
  ['We build tools', 'for the future'],
  'Latin function words are not orphaned at a page edge',
);
// "ah,", "so", "big", "solar power", "shoot", "good-looking", "huh?" - inline CJK run input
const cjkWords = words(['\u554a\uff0c', '\u8fd9\u4e48', '\u5927\u7684', '\u592a\u9633\u80fd', '\u62cd', '\u597d\u770b', '\u5417\uff1f']);
assert.deepEqual(
  buildCaptionWordRuns(cjkWords, false).map((run) => run.words.map((word) => word.text)),
  [['\u554a\uff0c', '\u8fd9\u4e48', '\u5927\u7684', '\u592a\u9633\u80fd', '\u62cd', '\u597d\u770b', '\u5417\uff1f']],
  'inline CJK tokens share one flex run without synthetic word gaps',
);
assert.deepEqual(
  // "lets", "editing", "more", "simple" - CJK tokens between Latin words
  buildCaptionWordRuns(words(['OpenChatCut', '\u8ba9', '\u526a\u8f91', '\u66f4', '\u7b80\u5355', 'today']), false)
    .map((run) => run.words.map((word) => word.text)),
  [['OpenChatCut'], ['\u8ba9', '\u526a\u8f91', '\u66f4', '\u7b80\u5355'], ['today']],
  'mixed-script captions preserve spacing only at script boundaries',
);
assert.equal(
  buildCaptionWordRuns(cjkWords, true).length,
  cjkWords.length,
  'stacked captions keep one visual row per word',
);

const forced = paginate(words(['one', 'two', 'three', 'four']), 'phrase', 6, new Set([2]));
assert.deepEqual(forced.map((page) => page.words.map((word) => word.text)), [
  ['one', 'two'],
  ['three', 'four'],
], 'forced page breaks remain hard boundaries');

const segmenter = Intl.Segmenter;
if (typeof segmenter === 'function') {
  assert.deepEqual(
    // "to", "day", "weather", "very good" - Intl.Segmenter CJK word-boundary input
    pageText(['\u4eca', '\u5929', '\u5929\u6c14', '\u5f88\u597d'], 1, undefined, 2, 1),
    ['\u4eca\u5929', '\u5929\u6c14', '\u5f88\u597d'],
    'Intl word boundaries keep one CJK word together',
  );
}
Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
try {
  // "to", "day", ",", "go", "then" - CJK fallback segmentation input
  const first = pageText(['\u4eca', '\u5929', '\uff0c', '\u53bb', '\u5427'], 2, undefined, 4, 1);
  const second = pageText(['\u4eca', '\u5929', '\uff0c', '\u53bb', '\u5427'], 2, undefined, 4, 1);
  assert.deepEqual(first, second, 'Intl-unavailable fallback is deterministic');
  assert.equal(first.join(''), '\u4eca\u5929\uff0c\u53bb\u5427', 'fallback preserves every token');
  assert.ok(first.every((page) => !/^[\uff0c\u3002\uff01\uff1f]/u.test(page)), 'fallback never opens with punctuation');
} finally {
  Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: segmenter });
}

const exportCaptions: CaptionsData = {
  enabled: true,
  template: 'bold-outline',
  pacing: 'phrase',
  words: words(['We', 'build', 'tools', 'for', 'the', 'future']),
};
assert.deepEqual(
  captionPages(exportCaptions, [], 30).map((page) => joinCaptionWords(page.words)),
  ['We build tools', 'for the future'],
  'caption export uses the same content-aware pager as preview',
);


const budgetWords = words(Array.from({ length: 12 }, (_, index) => `word${index}xxxxx`));
const budgetCaptions: CaptionsData = {
  enabled: true,
  template: 'plain',
  pacing: 'phrase',
  words: budgetWords,
};
const budgetPages = captionPages(budgetCaptions, [], 30);
const twoLineBudget = CAPTION_MAX_CHARS_PER_LINE * CAPTION_MAX_VISUAL_LINES;
assert.ok(
  budgetPages.every((page) => estimatedUnits(joinCaptionWords(page.words)) <= twoLineBudget),
  'every phrase page stays within the shared two-line weighted character budget',
);
assert.deepEqual(
  budgetPages.flatMap((page) => page.words.map((word) => word.text)),
  budgetWords.map((word) => word.text),
  'two-line pagination moves overflow to later cues without truncating text',
);
assert.deepEqual(
  buildCues(budgetCaptions, [], 30).map((cue) => cue.text),
  budgetPages.map((page) => joinCaptionWords(page.words)),
  'cue editor and caption export share the two-line pagination contract',
);
const laneItems = [
  {
    id: 'item-a', track: 'A1', startFrame: 0, durationInFrames: 90, kind: 'audio' as const, name: 'A', src: '/a.wav',
    transcriptGenerationId: 'generation-a',
    transcript: [
      { id: 'a-one', text: 'Alpha', start: 0, end: 400 },
      { id: 'a-two', text: 'lane', start: 500, end: 900 },
    ],
  },
  {
    id: 'item-b', track: 'A2', startFrame: 0, durationInFrames: 90, kind: 'audio' as const, name: 'B', src: '/b.wav',
    transcriptGenerationId: 'generation-b',
    transcript: [{ id: 'b-one', text: 'Beta', start: 0, end: 400 }],
  },
];
const laneCaptions: CaptionsData = {
  enabled: true,
  template: 'plain',
  pacing: 'phrase',
  sourceEntries: [
    { id: 'source-a', itemId: 'item-a', trackOrder: 0 },
    { id: 'source-b', itemId: 'item-b', trackOrder: 1 },
  ],
  wordOverrides: { 0: { text: 'legacy-hijack' } },
};
const initialLanePages = buildCaptionPages(laneCaptions, laneItems, 30);
assert.deepEqual(initialLanePages.map(({ laneId }) => laneId), ['source-a', 'source-b'],
  'parallel source lanes paginate independently instead of merging into one global cue');
assert.equal(initialLanePages.some(({ page }) => joinCaptionWords(page.words).includes('legacy-hijack')), false,
  'numeric legacy indices cannot hijack entries with persisted source identity');
const stableRef = resolveEntryWordRefs(laneCaptions.sourceEntries![1]!, laneItems, 30)[0]!;
const stableOverridePages = buildCaptionPages({
  ...laneCaptions,
  wordOverrides: { 0: { wordRef: stableRef, text: 'Stable Beta' } },
}, laneItems, 30);
assert.deepEqual(stableOverridePages.map(({ laneId, page }) => [laneId, joinCaptionWords(page.words)]), [
  ['source-a', 'Alpha lane'],
  ['source-b', 'Stable Beta'],
], 'stable source-entry identity applies an override to exactly one persisted lane');
const importedReordered = JSON.parse(JSON.stringify({
  ...laneCaptions,
  wordOverrides: undefined,
  sourceEntries: [
    { ...laneCaptions.sourceEntries![1]!, trackOrder: 0 },
    { ...laneCaptions.sourceEntries![0]!, trackOrder: 1 },
  ],
})) as CaptionsData;
const reorderedLanePages = buildCaptionPages(importedReordered, laneItems, 30);
assert.deepEqual(reorderedLanePages.map(({ laneId }) => laneId), ['source-b', 'source-a']);
assert.deepEqual(
  reorderedLanePages.map(({ id }) => id).sort(),
  initialLanePages.map(({ id }) => id).sort(),
  'copied/imported sourceEntries retain page identity and render exactly once after lane reorder',
);
const copiedItems = laneItems.map((item) => ({ ...item, id: `copy-${item.id}` }));
const copiedCaptions: CaptionsData = {
  ...importedReordered,
  sourceEntries: importedReordered.sourceEntries!.map((entry) => ({
    ...entry,
    itemId: entry.itemId.startsWith('item-') ? `copy-${entry.itemId}` : entry.itemId,
  })),
};
assert.deepEqual(
  buildCaptionPages(copiedCaptions, copiedItems, 30).map(({ id }) => id).sort(),
  reorderedLanePages.map(({ id }) => id).sort(),
  'copied projects resolve lane identity before remapped item ids',
);
assert.deepEqual(
  captionPages(importedReordered, laneItems, 30).map((page) => joinCaptionWords(page.words)).sort(),
  reorderedLanePages.map(({ page }) => joinCaptionWords(page.words)).sort(),
  'preview and subtitle export consume the same lane-aware pages',
);

console.log('caption pagination check passed');
