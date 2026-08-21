export { ISOLATE_VOICE_TOOL_SCHEMAS, ISOLATE_VOICE_TOOL_NAMES } from './schemas/isolate-voice-tools';
// isolate_voice — generate, attach, or clear a speech-isolation track.
import type { AgentContext } from '../context';
import type { MediaAsset, TimelineItem } from '../../editor/types';
import { isolateVoiceOnSrc } from '../../audio/isolateVoice';
import { captureTimelineItemSource, validateTimelineItemSourceResult } from '../../editor/mediaSourceRevision';

type Args = Record<string, unknown>;

function findItem(items: TimelineItem[], id: unknown): TimelineItem | null {
  const q = String(id ?? '');
  if (!q) return null;
  return items.find((it) => it.id === q || it.id.startsWith(q)) ?? null;
}

function findAsset(
  assets: MediaAsset[],
  id: unknown,
): { asset?: MediaAsset; error?: string; candidates?: Array<{ id: string; name: string; kind: string }> } {
  const query = String(id ?? '').trim();
  if (!query) return { error: 'missing asset id' };
  const exact = assets.find((asset) => asset.id === query);
  const matches = exact ? [exact] : assets.filter((asset) => asset.id.startsWith(query));
  if (!matches.length) return { error: `asset ${query} not found` };
  if (matches.length > 1) {
    return {
      error: `asset prefix ${query} is not unique`,
      candidates: matches.slice(0, 6).map((asset) => ({ id: asset.id, name: asset.name, kind: asset.kind })),
    };
  }
  return { asset: matches[0] };
}

export async function execIsolateVoiceTool(
  name: string,
  args: Args,
  ctx: AgentContext,
): Promise<unknown> {
  if (name !== 'isolate_voice') return { error: `unknown tool ${name}` };

  const state = ctx.getState();
  const item = findItem(state.items, args.itemId);
  if (!item) {
    return {
      error: `clip ${args.itemId ?? '(itemId missing)'} not found`,
      available: state.items
        .filter((it) => it.kind === 'video' || it.kind === 'audio')
        .map((it) => ({ itemId: it.id, name: it.name, kind: it.kind })),
    };
  }
  if (item.kind !== 'video' && item.kind !== 'audio') {
    return { error: `isolate_voice only works on video/audio, current kind=${item.kind}` };
  }

  const action = String(args.action ?? 'apply').toLowerCase();
  if (action === 'clear') {
    if (!item.denoisedSrc) {
      return { ok: true, itemId: item.id, action: 'clear', note: 'there was no voice isolation to begin with' };
    }
    ctx.commands.setItemDenoise(item.id, null);
    return { ok: true, itemId: item.id, action: 'clear', denoisedSrc: null };
  }

  const strength = Number.isFinite(Number(args.strength))
    ? Math.max(0, Math.min(100, Number(args.strength)))
    : 70;

  if (action === 'attach') {
    const assets = ctx.getDoc().assets ?? [];
    const sourceMatch = findAsset(assets, args.sourceAssetId);
    if (!sourceMatch.asset) return { error: `sourceAssetId: ${sourceMatch.error}`, candidates: sourceMatch.candidates };
    const sourceAsset = sourceMatch.asset;
    if (sourceAsset.kind !== 'audio' && sourceAsset.kind !== 'video') {
      return { error: `sourceAssetId must be video/audio, current kind=${sourceAsset.kind}` };
    }
    if (!item.src || item.src !== sourceAsset.src) {
      return {
        error: 'sourceAssetId does not match the target clip source',
        itemSrc: item.src ?? null,
        sourceAssetId: sourceAsset.id,
        sourceSrc: sourceAsset.src,
      };
    }

    const denoisedMatch = findAsset(assets, args.denoisedAssetId);
    if (!denoisedMatch.asset) return { error: `denoisedAssetId: ${denoisedMatch.error}`, candidates: denoisedMatch.candidates };
    const denoisedAsset = denoisedMatch.asset;
    if (denoisedAsset.kind !== 'audio') {
      return { error: `denoisedAssetId must be audio, current kind=${denoisedAsset.kind}` };
    }
    if (denoisedAsset.id === sourceAsset.id || denoisedAsset.src === sourceAsset.src) {
      return { error: 'denoisedAssetId cannot be the same as the source asset' };
    }

    const unchanged = item.denoisedSrc === denoisedAsset.src
      && (item.denoiseStrength ?? 100) === strength;
    ctx.commands.setItemDenoise(item.id, denoisedAsset.src, strength);
    return {
      ok: true,
      itemId: item.id,
      action: 'attach',
      sourceAssetId: sourceAsset.id,
      denoisedAssetId: denoisedAsset.id,
      denoisedSrc: denoisedAsset.src,
      strength,
      unchanged,
      note: 'Attached the isolated audio from the media pool; neither the source asset nor any shared asset was modified.',
    };
  }

  if (action !== 'apply') {
    return { error: `unknown action ${action} (use apply, attach or clear)` };
  }

  if (args.sourceAssetId) {
    const sourceMatch = findAsset(ctx.getDoc().assets ?? [], args.sourceAssetId);
    if (!sourceMatch.asset) return { error: `sourceAssetId: ${sourceMatch.error}`, candidates: sourceMatch.candidates };
    if (sourceMatch.asset.src !== item.src) return { error: 'sourceAssetId does not match the target clip source' };
  }

  const src = item.src ?? '';
  if (!src.startsWith('/media/uploads/')) {
    return {
      error: 'isolate_voice needs a /media/uploads source file (finalize/upload it to the media pool first). blob: placeholder previews cannot be isolated yet.',
      src: src || null,
    };
  }

  const sourceSnapshot = captureTimelineItemSource(item, ctx.getDoc().assets ?? []);
  try {
    const r = await isolateVoiceOnSrc(src, strength, {
      force: args.force === true,
      sourceRevision: sourceSnapshot.sourceRevision,
    });
    const currentItem = ctx.getState().items.find((candidate) => candidate.id === item.id);
    const validation = validateTimelineItemSourceResult(
      sourceSnapshot,
      currentItem,
      ctx.getDoc().assets ?? [],
      r.sourceRevision,
    );
    if (validation.status === 'stale') {
      return {
        ok: false,
        status: 'stale',
        stale: true,
        itemId: item.id,
        action: 'apply',
        reason: validation.reason,
        sourceRevision: validation.sourceRevision,
        currentSourceRevision: validation.currentSourceRevision,
        resultSourceRevision: validation.resultSourceRevision,
        note: 'The source asset changed during isolation; the derived result was discarded and the timeline was not modified.',
      };
    }
    ctx.commands.setItemDenoise(item.id, r.path, r.strength);
    return {
      ok: true,
      itemId: item.id,
      action: 'apply',
      denoisedSrc: r.path,
      strength: r.strength,
      engine: r.engine ?? 'ffmpeg-open-box',
      sourceRevision: r.sourceRevision,
      bytes: r.bytes,
      note: 'Open-box ffmpeg denoise attached; original src unchanged. action=clear to remove.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'isolate_voice request failed';
    return {
      error: msg,
      hint: /503|ffmpeg|spawn/i.test(msg)
        ? 'Local ffmpeg is unavailable; denoise externally and re-import, or install ffmpeg.'
        : 'Check that the dev server has /api/isolate-voice mounted and that the source file is under /media/uploads.',
    };
  }
}
