import type { AgentContext } from '../context';
import type { CaptionAnchor, CaptionLayoutPolicy, CaptionPerSource, CaptionSlot, CaptionsData, CaptionSourceEntry } from '../../captions/types';
import { mapCaptionStyle } from '../../captions/styleMap';
import { CAPTION_STYLE_BY_ID } from '../../captions/styles';
import type { CaptionTemplate } from '../../captions/types';
import { findVariantByLang } from '../../transcript/variants';
import { resolveTrackId, type TimelineState } from '../../editor/types';
import { moveCaptionSourceEntry, normalizeCaptionSourceEntries } from '../../captions/sourceOrder';
import { hasOperationalTranscript } from '../../transcript/types';
import { isStableIdentity } from '../../transcript/identity';

// edit_captions Multi-lane tool set:
// - positions puts multiple sources into place in one call (same anchor point = stacked in the same block)
// - layout_policy single-lane / auto-stack / manual-slots + perSource overrides
// - source_update changes the visibility/anchor/slot/style/variation of a single source by selector
// Data falls into CaptionsData.sourceEntries / layoutPolicy / perSource(captions/types.ts),
// Rendering is consumed by the captions/lanes.ts engine.

type Result = Record<string, unknown>;
type Json = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const ANCHORS = new Set<string>([
  'top', 'center', 'bottom',
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]);

let seq = 0;
const laneId = (): string => `src_${(++seq).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** Now scope is upgraded to sourceEntries (copy if existing; old sources[]/sourceItemId/timeline will be upgraded in one go).*/
export function ensureEntries(c: CaptionsData, s: TimelineState): CaptionSourceEntry[] {
  if (c.sourceEntries?.length) {
    return normalizeCaptionSourceEntries(c.sourceEntries).filter((entry) =>
      entry.words !== undefined || hasOperationalTranscript(s.items.find((item) => item.id === entry.itemId)));
  }
  const transcribed = (id: string) => s.items.some((it) => it.id === id && hasOperationalTranscript(it));
  if (c.sources?.length) return c.sources.filter(transcribed).map((itemId) => ({ id: laneId(), itemId }));
  if (c.sourceMode === 'timeline') {
    return s.items
      .filter((it) => hasOperationalTranscript(it))
      .sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id))
      .map((it) => ({ id: laneId(), itemId: it.id }));
  }
  if (c.sourceItemId && transcribed(c.sourceItemId)) return [{ id: laneId(), itemId: c.sourceItemId }];
  return [];
}

/** Selector → Hit entry subscript (selector family: index/id/sourceId/itemId/trackId/assetId/label/variant/slotId).*/
export function matchEntries(entries: CaptionSourceEntry[], sel: Json, s: TimelineState): number[] | { error: string } {
  const id = str(sel.sourceId) || str(sel.id);
  if (id) {
    const hits = entries.flatMap((entry, index) => (entry.id === id ? [index] : []));
    return hits.length === 1
      ? hits
      : { error: hits.length ? `ambiguous sourceId "${id}"` : `no source with id "${id}" (look up sourceId with source_list)` };
  }
  const idx = num(sel.index);
  if (idx !== undefined) {
    if (idx < 0 || idx >= entries.length) return { error: `index ${idx} out of range (0..${entries.length - 1})` };
    return isStableIdentity(entries[idx]?.id)
      ? { error: `index ${idx} is legacy-only; use sourceId "${entries[idx]!.id}"` }
      : [idx];
  }
  if (str(sel.speakerId)) return { error: 'speakerId selector is unsupported: there are no per-speaker lanes, select by track or by item' };
  const slotId = str(sel.slotId);
  if (slotId) {
    const hits = entries.flatMap((e, i) => (e.slotId === slotId ? [i] : []));
    return hits.length ? hits : { error: `no source pinned to slot "${slotId}"` };
  }
  const label = str(sel.label);
  if (label) {
    const hits = entries.flatMap((e, i) => (e.label === label ? [i] : []));
    return hits.length ? hits : { error: `no source labeled "${label}"` };
  }
  const variant = sel.variant && typeof sel.variant === 'object' ? (sel.variant as Json) : undefined;
  if (variant) {
    const lang = str(variant.languageCode);
    const hits = entries.flatMap((e, i) => (e.variant && (!lang || e.variant.languageCode === lang) ? [i] : []));
    return hits.length ? hits : { error: `no translation-variant source${lang ? ` for "${lang}"` : ''}` };
  }
  const itemId = str(sel.itemId);
  if (itemId) {
    const hits = entries.flatMap((e, i) => (e.itemId === itemId || e.itemId.startsWith(itemId) ? [i] : []));
    return hits.length ? hits : { error: `no source on item "${itemId}"` };
  }
  const assetId = str(sel.assetId);
  if (assetId) {
    const item = s.items.find((it) => it.src === assetId || it.templateId === assetId);
    const hits = item ? entries.flatMap((e, i) => (e.itemId === item.id ? [i] : [])) : [];
    return hits.length ? hits : { error: `no source for asset "${assetId}"` };
  }
  const track = str(sel.trackId) || str(sel.track);
  if (track) {
    const tid = resolveTrackId(s, track) ?? track;
    const onTrack = new Set(s.items.filter((it) => it.track === tid).map((it) => it.id));
    const hits = entries.flatMap((e, i) => (onTrack.has(e.itemId) ? [i] : []));
    return hits.length ? hits : { error: `no source on track "${track}"` };
  }
  return { error: 'missing selector: every entry needs one of index / sourceId / trackId / itemId / label / variant to locate a lane, e.g. {"index":0} or {"trackId":"A2"} or {"variant":{"languageCode":"en"}}; look up sourceId with source_list' };
}

const entrySummary = (e: CaptionSourceEntry, i: number) => ({
  index: i, trackOrder: e.trackOrder ?? i, sourceId: e.id, itemId: e.itemId,
  ...(e.variant ? { variant: e.variant } : {}), ...(e.label ? { label: e.label } : {}),
  ...(e.anchor ? { anchor: e.anchor, offsetXRatio: e.offsetXRatio, offsetYRatio: e.offsetYRatio } : {}),
  ...(e.slotId ? { slotId: e.slotId } : {}), ...(e.visible === false ? { visible: false } : {}),
});

/** action=layout_policy — multi-source split-screen strategy (can only be overridden with perSource). */
export function execLayoutPolicy(json: Json, c: CaptionsData, ctx: AgentContext): Result {
  if (json.layoutPolicy === null) {
    ctx.commands.updateCaptions({ layoutPolicy: null });
    return { ok: true, layoutPolicy: null, note: 'cleared — back to the default auto-stack' };
  }
  const patch: Partial<CaptionsData> = {};
  const mode = str(json.mode);
  if (mode) {
    if (mode === 'single-lane' || mode === 'auto-stack') {
      const cap = num(json.maxVisibleSources);
      patch.layoutPolicy = { mode, ...(cap !== undefined ? { maxVisibleSources: Math.max(1, Math.floor(cap)) } : {}) } as CaptionLayoutPolicy;
    } else if (mode === 'manual-slots') {
      const raw = Array.isArray(json.slots) ? json.slots : null;
      if (!raw?.length) return { error: 'manual-slots needs a slot table, e.g. {"mode":"manual-slots","slots":[{"id":"top","anchor":"top-center","offsetYRatio":0.08},{"id":"bottom","anchor":"bottom-center","offsetYRatio":-0.08}]}; then pin a lane to a slot with source_update slotId' };
      const slots: CaptionSlot[] = [];
      for (const sl of raw) {
        const o = (sl ?? {}) as Json;
        const sid = str(o.id);
        const anchor = str(o.anchor);
        if (!sid || !ANCHORS.has(anchor)) return { error: `invalid slot: ${JSON.stringify(sl)} (needs id + a 3×3 anchor)` };
        slots.push({ id: sid, anchor: anchor as CaptionAnchor, offsetXRatio: num(o.offsetXRatio), offsetYRatio: num(o.offsetYRatio), widthRatio: num(o.widthRatio), heightRatio: num(o.heightRatio) });
      }
      patch.layoutPolicy = { mode, slots };
    } else {
      return { error: `unknown layout_policy mode "${mode}" (single-lane|auto-stack|manual-slots)` };
    }
  }
  if (json.perSource && typeof json.perSource === 'object') {
    const per: Record<string, CaptionPerSource> = { ...(c.perSource ?? {}) };
    for (const [sid, v] of Object.entries(json.perSource as Record<string, Json>)) {
      const ml = num((v ?? {}).maxLines);
      if (ml !== undefined) per[sid] = { ...per[sid], maxLines: Math.max(1, Math.floor(ml)) };
    }
    patch.perSource = per;
  }
  if (!('layoutPolicy' in patch) && !('perSource' in patch)) return { error: 'layout_policy examples: {"mode":"auto-stack","maxVisibleSources":2} (stacked vertically) / {"mode":"single-lane"} (only one shown per position) / {"mode":"manual-slots","slots":[…]} / {"perSource":{"<sourceId>":{"maxLines":2}}} / {"layoutPolicy":null} to clear' };
  ctx.commands.updateCaptions(patch);
  return { ok: true, layoutPolicy: patch.layoutPolicy ?? c.layoutPolicy ?? { mode: 'auto-stack' }, ...(patch.perSource ? { perSource: patch.perSource } : {}), note: 'perSource.maxLines is approximated as maxLines × the template words-per-page (pagination counts words)' };
}

/** action=positions — call multiple sources in one call (same anchor point = same block stack).*/
export function execPositions(json: Json, c: CaptionsData, ctx: AgentContext, s: TimelineState): Result {
  const raw = Array.isArray(json.positions) ? json.positions : null;
  if (!raw?.length) return { error: 'positions example (copy it and change the numbers): {"positions":[{"index":0,"anchor":"top-center","offsetYRatio":0.08},{"index":1,"anchor":"bottom-center","offsetYRatio":-0.08}]} — each entry = a selector (index/sourceId/trackId/variant…) + an anchor (3×3); sources sharing an anchor stack into one block' };
  const entries = ensureEntries(c, s);
  if (!entries.length) return { error: 'no caption source right now: first turn captions on with edit_captions action=enable (or pick sources with source_set), then position them' };
  const placed: Result[] = [];
  for (const p of raw) {
    const o = (p ?? {}) as Json;
    const anchor = str(o.anchor);
    if (!ANCHORS.has(anchor)) return { error: `invalid anchor "${anchor}". Use the 3×3 anchors: top/middle/bottom × left/center/right, e.g. top-center / bottom-center / middle-left` };
    const m = matchEntries(entries, o, s);
    if ('error' in (m as object)) return m as Result;
    for (const i of m as number[]) {
      entries[i] = { ...entries[i], anchor: anchor as CaptionAnchor, offsetXRatio: num(o.offsetXRatio), offsetYRatio: num(o.offsetYRatio) };
      placed.push(entrySummary(entries[i], i));
    }
  }
  ctx.commands.updateCaptions({ sourceEntries: entries, sources: undefined, sourceMode: 'item' });
  return { ok: true, placed, note: 'multiple sources sharing an anchor stack into one ordinary caption block at that anchor; for pixel-level left/top use action=layout (whole block)' };
}

/** action=source_update — Change the presentation of single/multiple sources according to the selector (without moving the caption track/item).*/
export function execSourceUpdate(json: Json, c: CaptionsData, ctx: AgentContext, s: TimelineState): Result {
  const raw = Array.isArray(json.updates) ? json.updates : (json.update ? [json.update] : null);
  if (!raw?.length) return { error: 'source_update example (copy it and change the numbers): {"updates":[{"index":0,"anchor":"bottom-center","offsetYRatio":-0.08},{"trackId":"A2","visible":false},{"index":1,"style":{"sizePx":54,"color":"#fff"}}]} — each entry = a selector + the fields to change (visible/anchor/offsetXRatio/offsetYRatio/slotId/style/preset/variant); look up sourceId with source_list' };
  let entries = ensureEntries(c, s);
  if (!entries.length) return { error: 'no caption source right now: first turn captions on with edit_captions action=enable (or pick sources with source_set)' };
  const updated: Result[] = [];
  const notes: string[] = [];
  for (const u of raw) {
    const o = (u ?? {}) as Json;
    const m = matchEntries(entries, o, s);
    if ('error' in (m as object)) return m as Result;
    const matchedIds = (m as number[]).map((i) => entries[i]?.id).filter((id): id is string => !!id);
    const requestedOrder = num(o.trackOrder);
    for (const sourceId of matchedIds) {
      const i = entries.findIndex((entry) => entry.id === sourceId);
      if (i < 0) continue;
      let e = { ...entries[i] };
      if (typeof o.visible === 'boolean') e.visible = o.visible;
      if (str(o.label)) e.label = str(o.label);
      const pr = num(o.priority);
      if (pr !== undefined) e.priority = pr;
      if (str(o.slotId)) e.slotId = str(o.slotId);
      const anchor = str(o.anchor);
      if (anchor) {
        if (!ANCHORS.has(anchor)) return { error: `invalid anchor "${anchor}". Use the 3×3 anchors, e.g. top-center / bottom-center / middle-left` };
        e.anchor = anchor as CaptionAnchor;
      }
      for (const k of ['offsetXRatio', 'offsetYRatio', 'widthRatio', 'heightRatio'] as const) {
        const v = num(o[k]);
        if (v !== undefined) e[k] = v;
      }
      // Variant switching: variant object or variantKind+languageCode abbreviation; requires translation to already exist (source: first translation_ensure)
      const variantObj = o.variant && typeof o.variant === 'object' ? (o.variant as Json) : undefined;
      const vKind = str(variantObj?.variantKind ?? o.variantKind);
      const vLang = str(variantObj?.languageCode ?? o.languageCode);
      if (vKind || vLang) {
        if (vKind && vKind !== 'translation') return { error: `variantKind "${vKind}" is unsupported (translation only)` };
        if (!vLang) return { error: 'switching variant needs a target translation language, e.g. {"variant":{"variantKind":"translation","languageCode":"en"}} or the shorthand {"languageCode":"en"}' };
        const item = s.items.find((it) => it.id === e.itemId);
        const v = item ? findVariantByLang(item.variants ?? [], vLang, 'translation') : undefined;
        if (!v) return { error: `item ${e.itemId.slice(0, 8)} has no "${vLang}" translation variant — run manage_transcript translation_ensure first` };
        e.variant = { variantKind: 'translation', languageCode: vLang };
      }
      if (o.variant === null) e = { ...e, variant: undefined };
      // per-source style: preset (template id → complete set of styles) and/or style explicit field
      const presetId = str(o.preset) || str(o.templatePreset);
      if (presetId) {
        const tpl = CAPTION_STYLE_BY_ID[presetId as CaptionTemplate];
        if (!tpl) return { error: `unknown preset "${presetId}"` };
        const { id: _i, label: _l, labelZh: _z, hint: _h, ...styleOnly } = tpl;
        e.style = { ...styleOnly };
      }
      if (o.style && typeof o.style === 'object') {
        const mapped = mapCaptionStyle(o.style as Json, s.height);
        e.style = { ...e.style, ...mapped.styleOverride };
        if (mapped.ignored.length) notes.push(`ignored style fields: ${mapped.ignored.join(', ')}`);
      }
      entries[i] = e;
      updated.push(entrySummary(e, i));
    }
    if (requestedOrder !== undefined) {
      matchedIds.forEach((sourceId, offset) => {
        entries = moveCaptionSourceEntry(entries, sourceId, requestedOrder + offset);
      });
    }
  }
  entries = normalizeCaptionSourceEntries(entries);
  ctx.commands.updateCaptions({ sourceEntries: entries, sources: undefined, sourceMode: 'item' });
  return { ok: true, updated: entries.map(entrySummary), ...(notes.length ? { notes } : {}) };
}
