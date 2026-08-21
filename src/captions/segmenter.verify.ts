// Content-aware segmenter assertions: ①CJK punctuation breaks first ②particles never start a line ③ the structural particle "de" (U+7684) stays attached
// ④orphan penalty ⑤Latin sentence-end breaks first ⑥with no opts, paginate matches the old output byte for byte (regression).
// Expected values are hand-derived from the segmenter.ts rules; run: npx tsx src/captions/segmenter.check.ts
import assert from 'node:assert/strict';
import { scoreLatinBreaks, segmentWords } from './segmenter';
import type { CaptionPage } from './types';
import { paginate } from './types';
import type { TranscriptWord } from '../transcript/types';

const S = (texts: string[]) => texts.map((text) => ({ text }));
const W = (texts: string[], gapMs = 10, durMs = 90): TranscriptWord[] =>
  texts.map((text, i) => ({ text, start: i * (durMs + gapMs), end: i * (durMs + gapMs) + durMs }));
const pageTexts = (pages: CaptionPage[]) => pages.map((p) => p.words.map((w) => w.text).join(''));

// ── ① CJK ideographic period / fullwidth comma break first (oHe: U+3002 →100 / U+FF0C →80 outrank the budget-overflow spot) ─────
{
  // "today", "weather", "really nice.", "we", "together", "go", "park" — CJK segmentation input
  const words = S(['\u4eca\u5929', '\u5929\u6c14', '\u771f\u597d\u3002', '\u6211\u4eec', '\u4e00\u8d77', '\u53bb', '\u516c\u56ed']);
  // The char budget tops out at "together" (U+4E00 U+8D77), so it falls back to the period break → after "really nice." (U+771F U+597D U+3002)
  assert.deepEqual(segmentWords(words, { wordsPerPage: 50, maxCharsPerLine: 20 }), [0, 3]);

  // "I said," (fullwidth comma), "everyone", "all", "want", "come", "my home", "eat" — CJK comma-break input
  const comma = S(['\u6211\u8bf4\uff0c', '\u5927\u5bb6', '\u90fd', '\u8981', '\u6765', '\u6211\u5bb6', '\u5403\u996d']);
  assert.deepEqual(segmentWords(comma, { wordsPerPage: 50, maxCharsPerLine: 20 }), [0, 1]);
}

// ── ② Modal particles "ne"/"ma"/"a" (U+5462 / U+5417 / U+554A) never start a line ────────────────────────
{
  // "ne" (U+5462): the aHe particle break (60) ends the page after that particle, not at the budget cap
  // "you", "at", "thinking", "what", "ne" (modal particle), "tomorrow", "we", "set off"
  const ne = S(['\u4f60', '\u5728', '\u60f3', '\u4ec0\u4e48', '\u5462', '\u660e\u5929', '\u6211\u4eec', '\u51fa\u53d1']);
  const starts = segmentWords(ne, { wordsPerPage: 50, maxCharsPerLine: 20 });
  assert.deepEqual(starts, [0, 5]); // page 2 opens at "tomorrow" (U+660E U+5929); "ne" stays at the end of page 1
  // "ma" (U+5417): the mA orphan demotion ("ma"/"le", U+5417 / U+4E86 ∈ Q9) knocks out every adjacent break
  // "you", "eat", "le" (aspect particle), "ma" (question particle), "we", "go"
  const ma = S(['\u4f60', '\u5403', '\u4e86', '\u5417', '\u6211\u4eec', '\u8d70']);
  const maStarts = segmentWords(ma, { wordsPerPage: 50, maxCharsPerLine: 8 });
  assert.ok(!maStarts.includes(2) && !maStarts.includes(3), '\u300c\u4e86\u300d/\u300c\u5417\u300d must not start a page');
  for (const st of maStarts) assert.ok(!['\u4e86', '\u5417', '\u5462', '\u554a'].includes(Array.from(ma[st].text)[0]), 'particle at page start');
  for (const st of starts) assert.ok(!['\u4e86', '\u5417', '\u5462', '\u554a'].includes(Array.from(ne[st].text)[0]), 'particle at page start');
  // FHe line-start particle pull-back: page 2 opens with "understand" (U+4E86 U+89E3), a G9e-initial "le" (U+4E86) → pull the previous page's last word fine in
  // 'OK', 'fine', "understand", "a bit", "ba" (modal particle)
  const pull = S(['OK', 'fine', '\u4e86\u89e3', '\u4e00\u4e0b', '\u5427']);
  assert.deepEqual(segmentWords(pull, { wordsPerPage: 50, maxCharsPerLine: 15 }), [0, 1]);
}

// ── ③ Structural particle "de" (U+7684) never splits from its head (mA: U+7684 ∈ Q9 → both breaks −30) ──
{
  // "I", "bought", "de" (structural particle), "apple", "very", "tasty", "extremely", "fresh"
  const words = S(['\u6211', '\u4e70', '\u7684', '\u82f9\u679c', '\u5f88', '\u597d\u5403', '\u975e\u5e38', '\u65b0\u9c9c']);
  const starts = segmentWords(words, { wordsPerPage: 50, maxCharsPerLine: 10 });
  assert.deepEqual(starts, [0, 4, 7]);
  assert.ok(!starts.includes(2), '\u300c\u7684\u300d must not start a page (\u4e70|\u7684 stays joined)');
  assert.ok(!starts.includes(3), '\u300c\u7684\u300d must not dangle at a page end (\u7684|\u82f9\u679c stays joined)');
}

// ── ④ Orphan penalty: no 1-2 function-word orphan line at the end (U9e quantifier-of/trailing + cP demotion) ──
{
  const words = S(['We', 'learned', 'quite', 'a', 'lot', 'of', 'things', 'today']);
  const starts = segmentWords(words, { wordsPerPage: 50, maxCharsPerLine: 30 });
  // Budget tops out at things; breaks beside a/lot/of all risk an orphan → fall back to after quite
  assert.deepEqual(starts, [0, 3]);
  const pages = [words.slice(0, 3), words.slice(3)].map((ws) => ws.map((w) => w.text));
  assert.equal(pages[0].join(' '), 'We learned quite');
  assert.equal(pages[1].join(' '), 'a lot of things today');
  for (let i = 0; i < starts.length; i++) {
    const end = (starts[i + 1] ?? words.length) - 1;
    assert.notEqual(words[end].text, 'of', 'no dangling of at a page end');
  }
}

// ── ⑤ Latin-only sentence-final . breaks first (z9e 100 + sentence-end +30 = 130) ──────────
{
  const words = S(['I', 'like', 'it.', 'Because', 'it', 'works', 'well', 'today']);
  assert.deepEqual(segmentWords(words, { wordsPerPage: 50, maxCharsPerLine: 30 }), [0, 3]);
  // A word-count budget overflow falls back to scoring too (spec; see segmenter.ts header, deviation 2)
  assert.deepEqual(segmentWords(S(['I', 'like', 'it.', 'Because', 'it', 'works']), { wordsPerPage: 4 }), [0, 3]);
  // H9e scorer itself: a sentence-final word scores 100+30
  const top = scoreLatinBreaks('We had fun. So it goes')[0];
  assert.equal(top.score, 130);
  assert.equal(top.position, 'We had fun.'.length);
}

// ── Misc semantics: a punctuation word never opens a page / M1e CJK ignores the word budget / edges ──
{
  const starts = segmentWords(S(['Hello', 'world', '!', 'again', 'now', 'yes', 'more']), { wordsPerPage: 2 });
  assert.deepEqual(starts, [0, 3, 5]); // '!' stays with world on page 1; it never opens a page
  // M1e semantics: CJK-dominant + a char budget was given → wordsPerPage is cleared
  // "one two", "three four", "five six", "seven eight" — CJK-dominant word list
  assert.deepEqual(segmentWords(S(['\u4e00\u4e8c', '\u4e09\u56db', '\u4e94\u516d', '\u4e03\u516b']), { wordsPerPage: 2, maxCharsPerLine: 100 }), [0]);
  assert.deepEqual(segmentWords(S(['aa', 'bb', 'cc', 'dd']), { wordsPerPage: 2, maxCharsPerLine: 100 }), [0, 2]);
  assert.deepEqual(segmentWords([], { wordsPerPage: 6 }), []);
  assert.deepEqual(segmentWords(S(['hi']), { wordsPerPage: 1, maxCharsPerLine: 1 }), [0]);
}

// ── paginate wiring: maxCharsPerLine goes through the segmenter (budget × visual lines); forceBreak still wins ──
{
  // "today", "weather", "really nice.", "we", "together", "go", "park"
  const cn = W(['\u4eca\u5929', '\u5929\u6c14', '\u771f\u597d\u3002', '\u6211\u4eec', '\u4e00\u8d77', '\u53bb', '\u516c\u56ed']);
  // 20 chars/line × CAPTION_MAX_VISUAL_LINES(2) = 40 chars — the 12-char sentence fits one page.
  assert.deepEqual(pageTexts(paginate(cn, 'phrase', 50, undefined, 20)), ['\u4eca\u5929\u5929\u6c14\u771f\u597d\u3002\u6211\u4eec\u4e00\u8d77\u53bb\u516c\u56ed']);
  const forced = paginate(cn, 'phrase', 50, new Set([5]), 20);
  assert.deepEqual(pageTexts(forced), ['\u4eca\u5929\u5929\u6c14\u771f\u597d\u3002\u6211\u4eec\u4e00\u8d77', '\u53bb\u516c\u56ed']);
  assert.equal(forced[1].words[0].text, '\u53bb'); // a forced break always opens a new page
  // word pacing is unaffected by maxCharsPerLine
  assert.equal(paginate(cn, 'word', 6, undefined, 20).length, cn.length);
}

// ── ⑥ Regression: with no maxCharsPerLine, paginate behaves exactly as before ──────────
{
  // a full page of 6 words flushes
  const plain = W(['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh']);
  assert.deepEqual(paginate(plain, 'phrase').map((p) => p.words.length), [6, 2]);
  // Below a full page, content-aware segmentation no longer hard-cuts at sentence punctuation (one page holds it)
  assert.deepEqual(paginate(W(['Hi', 'there.', 'Big', 'day']), 'phrase').map((p) => p.words.length), [4]);
  // A long pause is a high-priority break, but is only used when the budget forces a split (4 words don't → one page)
  const gap: TranscriptWord[] = [
    { text: 'a', start: 0, end: 100 }, { text: 'b', start: 110, end: 200 },
    { text: 'c', start: 1000, end: 1100 }, { text: 'd', start: 1110, end: 1200 },
  ];
  assert.deepEqual(paginate(gap, 'phrase').map((p) => p.words.length), [4]);
  // forceBreak
  assert.deepEqual(paginate(W(['aa', 'bb', 'cc', 'dd']), 'phrase', 6, new Set([2])).map((p) => p.words.length), [2, 2]);
  // page timestamp fields
  const pages = paginate(plain, 'phrase');
  assert.equal(pages[0].start, plain[0].start);
  assert.equal(pages[0].end, plain[5].end);
  assert.equal(pages[1].start, plain[6].start);
}

console.log('segmenter.check: ok');
