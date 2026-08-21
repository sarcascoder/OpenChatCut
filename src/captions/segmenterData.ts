// Content-aware caption segmentation - word list/weight constant (no changes allowed).

/** English breakpoint pattern table: left word hit → the word is followed by a good breakpoint. */
export const LATIN_BREAK_PATTERNS: ReadonlyArray<{ pattern: RegExp; score: number }> = [
  { pattern: /[.!?:;,]$/, score: 100 },
];

/** English avoidance penalty pairs (12 items, order sensitive - stop on first hit).
 * Match "left word right word" as a whole, if hit, penalty will be deducted from breakpoint points. */
export const LATIN_PENALTY_PATTERNS: ReadonlyArray<{ pattern: RegExp; penalty: number }> = [
  { pattern: /^(a|an|the|i|we|you|he|she|it|they|this|that|these|those|and|but|or|so)[,;:]\s+\w+$/i, penalty: 95 },
  { pattern: /^(lot|lots|kind|kinds|sort|sorts|type|types|part|parts|number|numbers|couple|couples|bit|bits|piece|pieces|group|groups|bunch|series|set|sets|range|ranges|variety|varieties)\s+of$/i, penalty: 95 },
  { pattern: /^(and|but|or|so|yet|nor|for|however|although|because|since|while|whereas|who|which|that|where|when|why|whose|in|on|at|by|with|from|to|of|about|through|during|before|after|above|below|between|among|under|over|without|within|beyond|across|against|around|behind|beside|beneath|inside|outside|towards|throughout|upon|the|a|an)\s+\w+$/i, penalty: 90 },
  { pattern: /^(the|a|an|this|that|these|those)\s+\w+$/i, penalty: 60 },
  { pattern: /\w+(ed|ing|ly|er|est|ful|less|ous|ive|able|ible)\s+\w+$/i, penalty: 55 },
  { pattern: /^[A-Z][a-z]+\s+[A-Z][a-z]+$/, penalty: 70 },
  { pattern: /^(Dr|Mr|Mrs|Ms|Prof|President|Director|Professor|Minister|Secretary|Ambassador)\s+[A-Z][a-z]+$/i, penalty: 75 },
  { pattern: /^\w+\s+(up|down|in|out|on|off|over|under|through|around|across|along|away|back|forward|ahead|behind|beside|between|among|above|below|inside|outside|onto|into|upon|within|without|throughout|against|towards|beyond|beneath|underneath|alongside)$/i, penalty: 80 },
  { pattern: /^(I|you|he|she|it|we|they|this|that)\s+\w+$/i, penalty: 65 },
  { pattern: /^(can|will|would|could|should|might|may|must|have|has|had|do|does|did|am|is|are|was|were|being|been)\s+\w+$/i, penalty: 70 },
  { pattern: /^(not|never|no|nothing|nobody|nowhere|neither|none|hardly|scarcely|barely|seldom|rarely)\s+\w+$/i, penalty: 75 },
  { pattern: /^\d+\s+(years?|months?|weeks?|days?|hours?|minutes?|seconds?|miles?|kilometers?|feet|inches?|pounds?|kilograms?|degrees?|percent)$/i, penalty: 80 },
];

/** English short function words: orphan word risk - scoreLatinBreaks −40 when the next word is hit and the remaining words are ≤2. */
export const SHORT_FUNCTION_WORD =
  /^(a|an|the|of|in|on|at|by|to|for|with|and|but|or|if|as|is|are|was|were|be|been|have|has|had|do|does|did|will|would|could|should|might|may|must|can|shall)$/i;

/** Chinese punctuation classification. */
export const CJK_PUNCT = {
  clauseBreak: ['\uff0c', '\uff1b', '\uff1a', '\u3001', '\uff64'],
  quoteEnd: ['”', '’', '\uff09', '\u3011', '\u300b', '\u300d', '\u300f', '\u3009'],
  sentenceEnd: ['\u3002', '\uff01', '\uff1f', '…', '\uff0e', '\uff61'],
} as const;

/** Modal particle: located at the end of the left word and the right word starts with CJK → good break point (breaks after, priority 60). */
// Chinese sentence-final modal particles: a, ba, bei, ha, la, ma, ne, o, ya.
export const MODAL_PARTICLES = ['\u554a', '\u5427', '\u5457', '\u54c8', '\u5566', '\u561b', '\u5462', '\u54e6', '\u5440'] as const;

/** Structural particle/adhesion word list (including Japanese/Korean particles):
 * Orphan word avoidance break - the last word of the left word or the first word of the right word is hit → the breakpoint is marked as orphanRisk (the weight is reduced by 30 when selecting a breakpoint). */
// Chinese structural particles / conjunctions / prepositions / demonstratives / measure
// words / numerals ("de", "le", "shi", "zai", "he", "yin", "wei", "ba", "bei", "zhe",
// "na", "ge", "yi", "er", "san", ...), then Japanese and Korean particles.
export const CJK_PARTICLES = [
  '\u7684', '\u5730', '\u5f97', '\u4e86', '\u7740', '\u8fc7', '\u662f', '\u5728', '\u6709', '\u548c', '\u4e0e', '\u6216', '\u53ca', '\u5e76', '\u4f46', '\u800c', '\u5374',
  '\u56e0', '\u4e3a', '\u7531', '\u82e5', '\u5982', '\u867d', '\u7136', '\u5219', '\u5373', '\u4fbf', '\u628a', '\u88ab', '\u8ba9', '\u7ed9', '\u5bf9', '\u5411', '\u4ece',
  '\u5230', '\u4e8e', '\u6309', '\u4f9d', '\u636e', '\u4ee5', '\u5417', '\u5462', '\u5427', '\u554a', '\u5440', '\u54e6', '\u54c7', '\u561b', '\u5450', '\u8fd9', '\u90a3',
  '\u4e9b', '\u4e2a', '\u4f4d', '\u4e00', '\u4e8c', '\u4e09', '\u51e0', '\u591a', '\u5c11',
  '\u306f', '\u304c', '\u3092', '\u306b', '\u3067', '\u3068', '\u306e', '\u3078', '\u3082', '\u3084',
  '\uc740', '\ub294', '\uc774', '\uac00', '\uc744', '\ub97c', '\uc5d0', '\uc758', '\ub3c4', '\ub9cc',
] as const;

/** Cannot be used as a particle at the beginning of a line: the particle at the beginning of a line is pulled back - if a page begins with these words,
 * Pull words from the previous page and merge them into this page. */
// Chinese particles / measure words / plural and question markers that must not start a
// line ("de", "di", "de", "le", "zhe", "guo", "ge", "xie", "men", "ma", "ne", "ba", ...),
// then Japanese and Korean particles.
export const NO_LINE_START = [
  '\u7684', '\u5730', '\u5f97', '\u4e86', '\u7740', '\u8fc7', '\u4e2a', '\u4e9b', '\u4eec', '\u5417', '\u5462', '\u5427', '\u554a', '\u5440', '\u54e6', '\u54c7', '\u561b',
  '\u5450', '\u4e0b',
  '\u306f', '\u304c', '\u3092', '\u306b', '\u3067', '\u3068', '\u306e', '\u3078', '\u3082', '\u3084',
  '\uc740', '\ub294', '\uc774', '\uac00', '\uc744', '\ub97c', '\uc5d0', '\uc758', '\ub3c4', '\ub9cc',
] as const;

/** English function words: judge latinFunction orphan words to be used at risk. */
export const LATIN_FUNCTION_WORDS = [
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'by', 'to', 'for', 'with', 'and', 'but', 'or', 'if', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'might', 'may', 'must', 'can', 'shall',
] as const;

/** Quantifier table: "X of" is not split (latinQuantifierOf orphan word risk). */
export const LATIN_QUANTIFIERS = [
  'bit', 'bits', 'bunch', 'couple', 'couples', 'group', 'groups', 'kind', 'kinds', 'lot', 'lots',
  'number', 'numbers', 'part', 'parts', 'piece', 'pieces', 'range', 'ranges', 'series', 'set', 'sets',
  'sort', 'sorts', 'type', 'types', 'varieties', 'variety',
] as const;

/** Pause noise reduction connectives: When these words end with a comma,
 * Small pauses of 150–400ms are not considered breakpoints (≥400ms are considered breakpoints). */
export const PAUSE_SUPPRESSED_CONNECTORS = [
  'a', 'an', 'and', 'but', 'he', 'i', 'it', 'or', 'she', 'so', 'that', 'the', 'these', 'they', 'this',
  'those', 'we', 'you',
] as const;

/** CJK affix: word segmentation - the left word is CJK and the right word hits → cannot be split. */
// CJK word-forming suffixes: "-men" (plural), "-hua" (-ize), "-xing" (-ness), "-zhe" (-er),
// "-du" (-degree), "-liu" (-flow), "-zhan" (stack), "-hou" (after).
export const CJK_WORD_SUFFIXES = ['\u4eec', '\u5316', '\u6027', '\u8005', '\u5ea6', '\u6d41', '\u6808', '\u540e'] as const;

/** CJK interrogative sentence pattern (two regular rules, priority 58 breakpoint). */
export const QUESTION_TAIL = /(?:\u6709|\u6ca1\u6709|\u8fd8\u6709|\u662f|\u662f\u4e0d\u662f|\u53eb|\u505a|\u5e72|\u770b\u5230|\u770b\u89c1|\u627e\u5230)(?:\u4ec0\u4e48|\u5565|\u8c01|\u54ea\u91cc|\u54ea\u513f)$/u;
export const QUESTION_TAIL_EXCLUDE = /(?:\u4e3a|\u51ed)\u4ec0\u4e48$/u;
export const QUESTION_HEAD = /^(?:\u6211|\u4f60|\u60a8|\u4ed6|\u5979|\u5b83|\u8fd9|\u90a3|\u54b1|\u6211\u4eec|\u4f60\u4eec|\u4ed6\u4eec|\u5979\u4eec|\u73b0\u5728|\u7136\u540e|\u63a5\u7740|\u5bf9\u4e86)/u;

/** Pause breakpoint priority: interval ms → priority. */
export function pauseBreakPriority(gapMs: number): number {
  if (gapMs >= 400) return 90;
  if (gapMs >= 250) return 70;
  return 55;
}

/** When selecting a breakpoint, the risk of orphan words is reduced. */
export const ORPHAN_PICK_DEMOTION = 30;

/** The minimum interval and noise reduction threshold for a pause to become a breakpoint. */
export const PAUSE_MIN_MS = 150;
export const PAUSE_SUPPRESSED_MIN_MS = 400;
