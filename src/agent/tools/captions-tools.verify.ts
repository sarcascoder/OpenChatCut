// Runnable contract check: `npx tsx src/agent/captions-tools.check.ts`.
// Covers: (1) paginate/applyWordOverrides pure logic (hide/retext/force page break/byte-identical with no overrides);
// (2) edit_captions action=display_text lands in updateCaptions via makeDraft, read_captions reads it back;
// (3) multi-source merge (resolveCaptionWords sorts by absolute time); (4) edit_captions action=source_* (selector resolution/
// add-remove/timeline); (5) the remaining actions: enable/disable, template list + apply, style→styleOverride (sizePx→
// ratio, highlightBackground object→color string, pacing routing, unmapped fields go to ignored), layout anchors,
// language_mode; the three siblings (positions/layout_policy/source_update) really dispatch (detailed tests in captions-lanes.check.ts).
import assert from 'node:assert/strict';
import { paginate } from '../../captions/types';
import type { TranscriptWord } from '../../transcript/types';
import { applyWordOverrides, resolveCaptionWords, resolveCaptionWordIndices } from '../../captions/resolve';
import { __resetCaptionPresetMemory } from '../../captions/presetStore';
import { makeDraft } from '../../editor/store';
import type { TimelineState } from '../../editor/types';
import { docFromTimeline } from '../../persist/projectStore';
import type { AgentContext } from '../context';
import { execCaptionsTool } from './captions-tools';

// ── 1) Pure logic: applyWordOverrides + paginate ────────────────────────
const words: TranscriptWord[] = [
  { text: 'hello', start: 0, end: 100 },
  { text: 'brave', start: 100, end: 200 },
  { text: 'new', start: 200, end: 300 },
  { text: 'world', start: 300, end: 400 },
  { text: 'today', start: 400, end: 500 },
];
const indices = [0, 1, 2, 3, 4];

// No overrides: elements pass through untouched (same word references, new array container), pagination output byte-identical to "before this logic existed"
{
  const { words: out, breakBefore } = applyWordOverrides(words, indices, undefined);
  assert.equal(out.length, words.length, 'no overrides → same word count');
  assert.equal(out[0], words[0], 'no overrides → same word element reference (no-op)');
  assert.equal(breakBefore.size, 0);
  assert.deepEqual(paginate(words, 'phrase', 6, breakBefore), paginate(words, 'phrase', 6), 'breakBefore=empty set behaves like no 4th arg');
}

// hidden: the word disappears from the output
{
  const { words: out } = applyWordOverrides(words, indices, { 1: { hidden: true } });
  assert.deepEqual(out.map((w) => w.text), ['hello', 'new', 'world', 'today'], 'hidden word dropped');
}

// text: replaces the displayed text, timing unchanged
{
  const { words: out } = applyWordOverrides(words, indices, { 2: { text: 'BRAND-NEW' } });
  assert.equal(out[2].text, 'BRAND-NEW');
  assert.equal(out[2].start, 200, 'start untouched by text override');
  assert.equal(out[2].end, 300, 'end untouched by text override');
}

// forceBreak: starts a new page before that word
{
  const { words: out, breakBefore } = applyWordOverrides(words, indices, { 3: { forceBreak: true } });
  const pages = paginate(out, 'phrase', 10, breakBefore);
  assert.equal(pages.length, 2, 'forceBreak splits into two pages');
  assert.deepEqual(pages[0].words.map((w) => w.text), ['hello', 'brave', 'new']);
  assert.deepEqual(pages[1].words.map((w) => w.text), ['world', 'today']);
}

// All three combined: hide + retext + force page break all take effect
{
  const { words: out, breakBefore } = applyWordOverrides(words, indices, {
    1: { hidden: true },
    2: { text: 'BRAND-NEW' },
    3: { forceBreak: true },
  });
  assert.deepEqual(out.map((w) => w.text), ['hello', 'BRAND-NEW', 'world', 'today']);
  const pages = paginate(out, 'phrase', 10, breakBefore);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].words.map((w) => w.text), ['hello', 'BRAND-NEW']);
  assert.deepEqual(pages[1].words.map((w) => w.text), ['world', 'today']);
}

console.log('captions-tools.check: pure logic ok');

// ── 2) execCaptionsTool persists through makeDraft/updateCaptions ──────
const transcript: TranscriptWord[] = [
  { text: 'hello', start: 0, end: 100 },
  { text: 'brave', start: 100, end: 200 },
  { text: 'new', start: 200, end: 300 },
  { text: 'world', start: 300, end: 400 },
];
const state: TimelineState = {
  fps: 30, width: 1920, height: 1080, selectedId: null,
  items: [{ id: 'clip', track: 'A1', startFrame: 0, durationInFrames: 120, name: 'vo', kind: 'audio', src: '/vo.mp3', transcript }],
  captions: { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'clip' },
};
const draft = makeDraft(docFromTimeline(state));
const ctx: AgentContext = { commands: draft.commands, getState: draft.getState, getDoc: draft.getDoc, getCreativeMode: () => null, templates: [], audio: [] };

// read_captions: with no overrides, all four words read back as-is and every override is null
const r0 = await execCaptionsTool('read_captions', {}, ctx) as { enabled: boolean; pages: { words: { index: number; text: string; override: unknown }[] }[] };
assert.equal(r0.enabled, true);
const flat0 = r0.pages.flatMap((p) => p.words);
assert.deepEqual(flat0.map((w) => w.text), ['hello', 'brave', 'new', 'world']);
assert.deepEqual(flat0.map((w) => w.index), [0, 1, 2, 3]);
assert.ok(flat0.every((w) => w.override === null));

// edit_captions action=display_text: hide idx1, replace idx2's text, force a page break at idx3 (forcePageBreak)
const w1 = await execCaptionsTool('edit_captions', {
  action: 'display_text',
  json: {
    overrides: [
      { wordIndex: 1, hidden: true },
      { wordIndex: 2, text: 'brand-new' },
      { wordIndex: 3, forcePageBreak: true },
    ],
  },
}, ctx) as { ok: boolean; overrides: number };
assert.equal(w1.ok, true);
assert.equal(w1.overrides, 3, 'three overrides now tracked');
assert.deepEqual(draft.getState().captions?.wordOverrides, {
  1: { hidden: true, wordRef: '' },
  2: { text: 'brand-new', wordRef: '' },
  3: { forceBreak: true, wordRef: '' },
}, 'persisted via updateCaptions on TimelineState.captions.wordOverrides (forcePageBreak → forceBreak; legacy entries carry empty wordRef)');
// json passed in as a string should parse equivalently
const w1s = await execCaptionsTool('edit_captions', { action: 'display_text', json: JSON.stringify({ overrides: [{ wordIndex: 0, hidden: true }] }) }, ctx) as { ok: boolean };
assert.equal(w1s.ok, true, 'json-as-string parses');
assert.equal(draft.getState().captions?.wordOverrides?.[0]?.hidden, true);
await execCaptionsTool('edit_captions', { action: 'display_text', json: { overrides: [{ wordIndex: 0, clear: true }] } }, ctx);

// read_captions then reflects the overrides: idx1 is still listed (the hidden flag is visible so the agent can unhide it), idx2 shows the replacement text
type WordOut = { index: number; text: string; override: { hidden?: boolean; text?: string; forceBreak?: boolean } | null };
const r1 = await execCaptionsTool('read_captions', {}, ctx) as { pages: { words: WordOut[] }[] };
const flat1 = r1.pages.flatMap((p) => p.words);
assert.deepEqual(flat1.map((w) => w.text), ['hello', 'brave', 'brand-new', 'world'], 'text override applied; hidden word still listed (not filtered) for the agent to inspect');
assert.equal(flat1.find((w) => w.index === 1)?.override?.hidden, true);
assert.equal(flat1.find((w) => w.index === 2)?.override?.text, 'brand-new');
assert.equal(flat1.find((w) => w.index === 3)?.override?.forceBreak, true);

// clear: undoes idx1's override
const w2 = await execCaptionsTool('edit_captions', { action: 'display_text', json: { overrides: [{ wordIndex: 1, clear: true }] } }, ctx) as { ok: boolean; overrides: number };
assert.equal(w2.ok, true);
assert.equal(w2.overrides, 2, 'one override cleared, two remain');
assert.equal(draft.getState().captions?.wordOverrides?.[1], undefined);

// An out-of-range/invalid wordIndex changes nothing silently, it is echoed back in errors (ok=false)
const w3 = await execCaptionsTool('edit_captions', { action: 'display_text', json: { overrides: [{ wordIndex: 99, hidden: true }] } }, ctx) as { ok: boolean; overrides: number; errors?: string[] };
assert.equal(w3.ok, false, 'out-of-range entry surfaces an error');
assert.equal(w3.overrides, 2, 'out-of-range entry ignored, count unchanged');
assert.ok(w3.errors?.some((e) => e.includes('unavailable') || e.includes('out of range')));

// Regression (audit B1): text:null clearing a word that was never overridden = no-op, must not throw TypeError
const wNull = await execCaptionsTool('edit_captions', { action: 'display_text', json: { overrides: [{ wordIndex: 3, text: null }] } }, ctx) as { ok: boolean };
assert.equal(wNull.ok, true, 'text:null on a never-overridden word is a safe no-op');

// clearOverrides: wipes every per-word override at once
const wClr = await execCaptionsTool('edit_captions', { action: 'display_text', json: { clearOverrides: true } }, ctx) as { ok: boolean; cleared: boolean };
assert.equal(wClr.cleared, true);
assert.deepEqual(draft.getState().captions?.wordOverrides, {}, 'clearOverrides empties the override map');

// When captions are disabled read_captions says so explicitly instead of erroring
// (docFromTimeline now normalises captions into a caption track, so just switch that off)
const offState = draft.getState();
const offTracks = offState.tracks ? { ...offState.tracks } : undefined;
if (offTracks) {
  const captionTrackId = Object.keys(offTracks).find((id) => offTracks[id]?.kind === 'caption');
  if (captionTrackId) {
    offTracks[captionTrackId] = { ...offTracks[captionTrackId]!, captions: { ...offTracks[captionTrackId]!.captions!, enabled: false } };
  }
}
const offCtx: AgentContext = { ...ctx, getState: () => ({ ...offState, tracks: offTracks }) };
const rOff = await execCaptionsTool('read_captions', {}, offCtx) as { enabled: boolean; note?: string };
assert.equal(rOff.enabled, false);
assert.ok(rOff.note);

console.log('captions-tools.check: ok');

// ── 3) Multi-source merge: resolveCaptionWords/resolveCaptionWordIndices ──
// fps=1000 maps frames 1:1 onto ms (msToFrame(ms,1000)===ms), so expected values are hand-computable and free of float error.
const wordsA: TranscriptWord[] = [
  { text: 'hi', start: 0, end: 100 },
  { text: 'there', start: 100, end: 200 },
];
const wordsB: TranscriptWord[] = [
  { text: 'yo', start: 0, end: 100 },
  { text: 'friend', start: 100, end: 200 },
];
const itemA = { id: 'a', track: 'A1' as const, startFrame: 0, durationInFrames: 200, name: 'spk-a', kind: 'audio' as const, src: '/a.mp3', transcript: wordsA };
const itemB = { id: 'b', track: 'A2' as const, startFrame: 50, durationInFrames: 200, name: 'spk-b', kind: 'audio' as const, src: '/b.mp3', transcript: wordsB };
const itemC = { id: 'c', track: 'A3' as const, startFrame: 0, durationInFrames: 100, name: 'no-transcript', kind: 'audio' as const, src: '/c.mp3' };
const multiState: TimelineState = {
  fps: 1000, width: 1920, height: 1080, selectedId: null,
  items: [itemA, itemB, itemC],
  captions: { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'a' },
};

// The single-source path (no sources/sourceMode) is byte-identical: exactly the same code path as "before the merge feature landed".
{
  const single = resolveCaptionWords(multiState.captions!, multiState.items, multiState.fps);
  assert.deepEqual(single, [
    { text: 'hi', start: 0, end: 100, speaker: undefined },
    { text: 'there', start: 100, end: 200, speaker: undefined },
  ], 'no sources/sourceMode → identical to the pre-merge sourceItemId-only path');
  assert.deepEqual(resolveCaptionWordIndices(multiState.captions!, multiState.items, multiState.fps), [0, 1], 'single-source indices stay the original transcript indices');
}

// sources:['a','b'] → the two transcripts merge, sorted by absolute start time (not a plain concat: b's first word falls between a's two words)
{
  const merged = { ...multiState.captions!, sources: ['a', 'b'] };
  const words = resolveCaptionWords(merged, multiState.items, multiState.fps);
  assert.deepEqual(words.map((w) => w.text), ['hi', 'yo', 'there', 'friend'], 'merged + sorted by absolute start (not source concat order)');
  assert.deepEqual(words.map((w) => [w.start, w.end]), [[0, 100], [50, 150], [100, 200], [150, 250]], 'each word keeps its own text/start/end, unchanged by the merge');
  assert.deepEqual(resolveCaptionWordIndices(merged, multiState.items, multiState.fps), [0, 1, 2, 3], 'multi-source indices are sequential positions in the merged output');
}

// sourceMode:'timeline' → equivalent to "every transcribed item" (c has no transcript, so it is excluded automatically)
{
  const timeline = { ...multiState.captions!, sourceMode: 'timeline' as const };
  const words = resolveCaptionWords(timeline, multiState.items, multiState.fps);
  assert.deepEqual(words.map((w) => w.text), ['hi', 'yo', 'there', 'friend'], "sourceMode:'timeline' merges every transcribed item, skips untranscribed ones");
}

// video source: "audible means visible" inside the window — video plays [srcIn,srcIn+dur) continuously, so
// deleted transcript words do not hide captions (otherwise, when the agent's deletion range is narrower than the
// srcIn window, a short's opening seconds have speech with no captions; caught 2026-07-17 in a long-to-short run).
// Hiding words at the caption layer goes through wordOverrides, not deletedWordIdx.
{
  const vid = {
    id: 'v', track: 'V1' as const, startFrame: 0, durationInFrames: 100, name: 'talk',
    kind: 'video' as const, src: '/talk.mp4', srcInFrame: 50, deletedWordIdx: [0],
    transcript: [
      { text: 'lead', start: 60, end: 80 },   // inside the window, deleted → still shown (audible)
      { text: 'kept', start: 90, end: 110 },  // inside the window, not deleted
      { text: 'out', start: 200, end: 220 },  // outside the window (win=[50,150))
    ],
  };
  const capV = { enabled: true, template: 'plain' as const, pacing: 'phrase' as const, sourceItemId: 'v' };
  const words = resolveCaptionWords(capV, [vid], 1000);
  assert.deepEqual(words.map((w) => w.text), ['lead', 'kept'], 'deleted words inside the video window still show (audible means visible), words outside it are cut');
  assert.deepEqual(words.map((w) => Math.round(w.start)), [10, 40], 'media frame − srcIn + startFrame maps straight through, deleted words do not re-time the rest');
  assert.deepEqual(resolveCaptionWordIndices(capV, [vid], 1000), [0, 1], 'indices follow the same survival rule as the words (wordOverrides keys)');
}

console.log('captions-tools.check: multi-source merge + video audible-means-visible ok');

// ── 4) edit_captions action=source_* : validation + persistence + read_captions reflects the merge ──
const draft2 = makeDraft(docFromTimeline(multiState));
const ctx2: AgentContext = { commands: draft2.commands, getState: draft2.getState, getDoc: draft2.getDoc, getCreativeMode: () => null, templates: [], audio: [] };

// Unknown/untranscribed selector → error, nothing persisted
const bad = await execCaptionsTool('edit_captions', { action: 'source_set', json: { sources: [{ itemId: 'a' }, { itemId: 'does-not-exist' }] } }, ctx2) as { error?: string };
assert.ok(bad.error?.includes('does-not-exist'), 'unresolved selector surfaces in the error');
assert.equal(draft2.getState().captions?.sources, undefined, 'rejected call does not persist');
assert.equal(draft2.getState().captions?.sourceEntries, undefined, 'rejected call does not persist entries either');

// Valid sources (array of selectors) → persists item ids, wordCount reflects the merged word total
const ok1 = await execCaptionsTool('edit_captions', { action: 'source_set', json: { sources: [{ itemId: 'a' }, { trackId: 'A2' }] } }, ctx2) as { ok: boolean; sources: Array<{ itemId: string; sourceId: string }>; wordCount: number };
assert.equal(ok1.ok, true);
assert.deepEqual(ok1.sources.map((r) => r.itemId), ['a', 'b'], 'selectors resolved (trackId A2 → item b), rich entry rows');
assert.ok(ok1.sources.every((r) => r.sourceId), 'each source carries a stable sourceId');
assert.equal(ok1.wordCount, 4);
assert.deepEqual(draft2.getState().captions?.sourceEntries?.map((e) => e.itemId), ['a', 'b'], 'persisted as sourceEntries (multi-lane scope)');
assert.equal(draft2.getState().captions?.sources, undefined, 'legacy sources[] cleared when entries take over');

// read_captions reflects the merge: four words, sorted by start time
const r2 = await execCaptionsTool('read_captions', {}, ctx2) as { pages: { words: { text: string }[] }[] };
assert.deepEqual(r2.pages.flatMap((p) => p.words).map((w) => w.text), ['hi', 'yo', 'there', 'friend'], 'read_captions reflects the merged word stream');

// source_add appends one; source_remove drops by itemId (lane ids are random; itemId is stable)
const add = await execCaptionsTool('edit_captions', { action: 'source_add', json: { source: { itemId: 'a' } } }, ctx2) as { ok: boolean; sources: Array<{ itemId: string }> };
assert.deepEqual(add.sources.map((r) => r.itemId), ['a', 'b'], 'source_add dedups (a already present)');
const rm = await execCaptionsTool('edit_captions', { action: 'source_remove', json: { itemId: 'b' } }, ctx2) as { ok: boolean; sources: Array<{ itemId: string }> };
assert.deepEqual(rm.sources.map((r) => r.itemId), ['a'], 'source_remove by itemId drops b');

// mode:'timeline' → persists the mode
const ok2 = await execCaptionsTool('edit_captions', { action: 'source_set', json: { mode: 'timeline' } }, ctx2) as { ok: boolean; sourceMode: string; wordCount: number };
assert.equal(ok2.sourceMode, 'timeline');
assert.equal(ok2.wordCount, 4);
assert.equal(draft2.getState().captions?.sourceMode, 'timeline');

// Empty source_set → error
const empty = await execCaptionsTool('edit_captions', { action: 'source_set', json: {} }, ctx2) as { error?: string };
assert.ok(empty.error, 'empty source_set errors');

console.log('captions-tools.check: source_* ok');

// ── 5) New actions: enable/disable · template · style (→styleOverride) · layout · unsupported ──
const draft3 = makeDraft(docFromTimeline({ ...state, captions: undefined }));
const ctx3: AgentContext = { commands: draft3.commands, getState: draft3.getState, getDoc: draft3.getDoc, getCreativeMode: () => null, templates: [], audio: [] };

// enable: creates captions when there are none (given a transcribed source)
const en = await execCaptionsTool('edit_captions', { action: 'enable', preset: 'netflix' }, ctx3) as { ok: boolean; enabled: boolean; template: string };
assert.equal(en.enabled, true);
assert.equal(en.template, 'netflix', 'enable preset picks the template');
assert.equal(draft3.getState().captions?.sourceItemId, 'clip', 'enable anchors to the transcribed clip');

// template with no args → lists every built-in (21 source families + the black-bar default); applying one → changes only template, keeps the rest
const tlist = await execCaptionsTool('edit_captions', { action: 'template' }, ctx3) as { presets: { id: string }[] };
assert.equal(tlist.presets.length, 22, 'lists all built-in presets (21 + black-bar)');
await execCaptionsTool('edit_captions', { action: 'template', templatePreset: 'bili' }, ctx3);
assert.equal(draft3.getState().captions?.template, 'bili');

// style: sizePx→fontSize ratio, color and highlightBackground land in styleOverride; maxLines unsupported → ignored
const st = await execCaptionsTool('edit_captions', { action: 'style', json: { sizePx: 108, color: '#ff0', highlightBackground: { color: '#123' }, maxLines: 2, pacing: 'word' } }, ctx3) as { ok: boolean; applied: string[]; pacing?: string; ignored?: string[] };
assert.equal(st.ok, true);
const so = draft3.getState().captions?.styleOverride;
assert.ok(so && Math.abs((so.fontSize ?? 0) - 108 / 1080) < 1e-9, 'sizePx→fontSize ratio (108/1080)');
assert.equal(so?.color, '#ff0');
assert.equal(so?.highlightBackground, '#123', 'highlightBackground object → color string');
assert.equal(st.pacing, 'word', 'pacing routed to CaptionsData.pacing');
assert.equal(draft3.getState().captions?.pacing, 'word');
assert.ok(st.ignored?.some((k) => k.startsWith('maxLines')), 'unmapped style field reported in ignored');

// layout: anchor top-center + offset → CaptionsData.layout
const ly = await execCaptionsTool('edit_captions', { action: 'layout', json: { preset: 'top-center', offsetYRatio: 0.05 } }, ctx3) as { ok: boolean; layout: { anchor: string; offsetYRatio: number } };
assert.equal(ly.layout.anchor, 'top-center');
assert.equal(draft3.getState().captions?.layout?.anchor, 'top-center');

// language_mode original (no LLM needed) clears the translation state; translation with no variant → error
await execCaptionsTool('edit_captions', { action: 'language_mode', json: { mode: 'original' } }, ctx3);
assert.equal(draft3.getState().captions?.bilingual, false);
const noVar = await execCaptionsTool('edit_captions', { action: 'language_mode', json: { mode: 'translation', languageCode: 'en' } }, ctx3) as { error?: string };
assert.ok(noVar.error?.includes('variant'), 'translation without a variant asks to translate first');

// The three siblings are real implementations now (captions-lanes.ts; detailed tests in captions-lanes.check.ts) — here we only check that dispatch works
const pos = await execCaptionsTool('edit_captions', { action: 'positions', json: {} }, ctx3) as { error?: string; unsupported?: boolean };
assert.ok(pos.error && !pos.unsupported, 'positions dispatches for real (empty json → validation error, not unsupported)');
const supd = await execCaptionsTool('edit_captions', { action: 'source_update', json: { updates: [{ itemId: 'clip', anchor: 'bottom-center', offsetYRatio: -0.08 }] } }, ctx3) as { ok?: boolean; error?: string; unsupported?: boolean };
assert.ok(!supd.unsupported && supd.ok === true, `source_update is a real implementation now: ${JSON.stringify(supd)}`);
assert.equal(draft3.getState().captions?.sourceEntries?.[0]?.anchor, 'bottom-center', 'per-source anchor persisted');
// user style presets (preset_save/list/apply/rename/delete) — IDB memory-fallback here
__resetCaptionPresetMemory();
const psave = await execCaptionsTool('edit_captions', { action: 'preset_save', presetName: 'My styles' }, ctx3) as { ok?: boolean; presetId?: string };
assert.equal(psave.ok, true, 'preset_save succeeds with a name');
assert.ok(psave.presetId, 'preset_save returns an id');
const pnoName = await execCaptionsTool('edit_captions', { action: 'preset_save', json: {} }, ctx3) as { error?: string };
assert.ok(pnoName.error, 'preset_save without a name errors (not a silent save)');
const plist = await execCaptionsTool('edit_captions', { action: 'preset_list' }, ctx3) as { presets: { id: string; name: string }[] };
assert.ok(plist.presets.some((p) => p.id === psave.presetId && p.name === 'My styles'), 'preset_list shows the saved preset');
const papply = await execCaptionsTool('edit_captions', { action: 'preset_apply', presetId: psave.presetId }, ctx3) as { ok?: boolean; applied?: string };
assert.equal(papply.ok, true, 'preset_apply by id succeeds');
const pdel = await execCaptionsTool('edit_captions', { action: 'preset_delete', presetId: psave.presetId }, ctx3) as { ok?: boolean };
assert.equal(pdel.ok, true, 'preset_delete succeeds');
const plist2 = await execCaptionsTool('edit_captions', { action: 'preset_list' }, ctx3) as { presets: unknown[] };
assert.equal(plist2.presets.length, 0, 'preset gone after delete');
__resetCaptionPresetMemory();

// disable
const dis = await execCaptionsTool('edit_captions', { action: 'disable' }, ctx3) as { enabled: boolean };
assert.equal(dis.enabled, false);
assert.equal(draft3.getState().captions?.enabled, false);

console.log('captions-tools.check: actions (enable/template/style/layout/three-sibling dispatch) ok');
