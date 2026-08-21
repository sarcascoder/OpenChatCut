import type { TimelineItem, TrackId, TrackKind } from '../editor/types';

/** Track row for the transcript selector (alias + human name, never raw UUID alone). */
export interface TranscriptTrackOption {
  id: TrackId;
  alias: string;
  name?: string;
  kind: TrackKind;
}

export function mediaOnTrack(items: TimelineItem[], track: TrackId): TimelineItem[] {
  return items
    .filter((item) => item.track === track && !!item.src && (item.kind === 'audio' || item.kind === 'video'))
    .sort((a, b) => a.startFrame - b.startFrame);
}

/** Background music / SFX — not for speech transcription by default. */
export function isLikelyNonSpeech(item: TimelineItem): boolean {
  const name = (item.name ?? '').toLowerCase();
  return /\u80cc\u666f\u97f3\u4e50|bgm|\bmusic\b|score|ambient|\u97f3\u6548|whoosh|sfx|instrumental/.test(name);
}

export function clipLabel(item: TimelineItem, max = 28): string {
  const name = item.name?.trim() || item.id;
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export function trackTitle(track: TranscriptTrackOption): string {
  const name = track.name?.trim();
  if (name && name !== track.alias) return `${track.alias} · ${name}`;
  return track.alias;
}

export function pickDefaultTrack(options: TranscriptTrackOption[], items: TimelineItem[]): TrackId | null {
  const scored = options
    .filter((track) => track.kind === 'audio')
    .map((track) => {
      const clips = mediaOnTrack(items, track.id);
      const speech = clips.filter((clip) => !isLikelyNonSpeech(clip));
      const name = `${track.name ?? ''} ${track.alias}`.toLowerCase();
      let score = speech.length * 10 + clips.length;
      if (/\u914d\u97f3|voice|vo|\u65c1\u767d|\u53e3\u64ad|anchor/.test(name)) score += 50;
      if (/\u80cc\u666f|music|bgm|follower/.test(name)) score -= 40;
      if (!clips.length) score -= 100;
      return { id: track.id, score };
    })
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score > -50) return scored[0].id;
  return options.find((track) => mediaOnTrack(items, track.id).length > 0)?.id ?? options[0]?.id ?? null;
}
