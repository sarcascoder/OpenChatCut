import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { PlayerRef } from '@remotion/player';
import type { TimelineItem, TrackId } from '../editor/types';
import { emitSelectionRef, transcriptRefFromDomSelection, useSelectionRefMode } from '../agent/selection-refs';
import { useTranscript } from './useTranscript';
import { preferredTranscriptionProvider } from './provider';
import { hasOperationalTranscript, msToFrame, type TranscriptWord } from './types';
import { analyzeSilences } from './segment';
import { ScriptView } from './TranscriptViews';
import { theme } from '../theme';
import { Icon } from '../components/icons';
import { clipLabel, isLikelyNonSpeech, mediaOnTrack, pickDefaultTrack, trackTitle, type TranscriptTrackOption } from './trackOptions';

export type { TranscriptTrackOption } from './trackOptions';

interface TranscriptPanelProps {
  playerRef: RefObject<PlayerRef | null>;
  fps: number;
  items: TimelineItem[];
  /** ordered tracks with A1/V1 aliases from EditorCore */
  trackOptions: TranscriptTrackOption[];
  onSetItemTranscript: (id: string, words: TranscriptWord[]) => void;
  onToggleWord: (id: string, idx: number) => void;
  onCleanScript: (id: string, opts: { silenceFrames?: number; removeFillers: boolean }) => void;
  onSetGapCap: (id: string, afterWordIndex: number, maxMs: number | null) => void;
  onSetTranscriptPlayOrder: (id: string, playOrder: number[] | null) => void;
  onReorderTrackItems: (track: TrackId, orderedIds: string[]) => void;
  onClearEdits: (id: string) => void;
  onImportSrt: (file: File) => void;
  onOpenCaptionStyles?: (sourceItemIds: string[]) => void;
}

const MANY_CLIPS = 10;

export function TranscriptPanel({
  playerRef, fps, items, trackOptions,
  onSetItemTranscript, onToggleWord, onCleanScript, onSetGapCap, onSetTranscriptPlayOrder, onReorderTrackItems, onClearEdits,
  onImportSrt, onOpenCaptionStyles,
}: TranscriptPanelProps) {
  const { status, error, progressNote, runMany, reset } = useTranscript();
  const localProvider = preferredTranscriptionProvider() === 'local';
  const defaultId = useMemo(() => pickDefaultTrack(trackOptions, items), [trackOptions, items]);
  const [track, setTrack] = useState<TrackId | null>(defaultId);
  // Both views use ScriptView (speaker blocks + Gap rows). segment uses a lower
  // gap display threshold so more breaths show; paragraph is slightly coarser.
  const [view, setView] = useState<'paragraph' | 'segment'>('segment');
  const [editMode, setEditMode] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [compressSec, setCompressSec] = useState(0.5);
  const [removeFillers, setRemoveFillers] = useState(true);
  const [pauseResult, setPauseResult] = useState<string | null>(null);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const [includeMusic, setIncludeMusic] = useState(false);
  /** many clips: default show only the focused section to keep the list usable */
  const [showAllSections, setShowAllSections] = useState(false);
  const dragClipFrom = useRef<string | null>(null);
  const [dragOverClipId, setDragOverClipId] = useState<string | null>(null);
  // selection mode (transcript-selected): drag-select words → structured reference
  const pickMode = useSelectionRefMode();
  const bodyRef = useRef<HTMLDivElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);

  // Keep selection valid when project tracks change.
  useEffect(() => {
    if (!track || !trackOptions.some((t) => t.id === track)) {
      setTrack(defaultId);
    }
  }, [track, trackOptions, defaultId]);

  const activeTrack = trackOptions.find((t) => t.id === track) ?? null;
  const busy = status === 'uploading' || status === 'processing';

  const allClips = useMemo(() => (track ? mediaOnTrack(items, track) : []), [items, track]);
  const speechClips = useMemo(() => allClips.filter((c) => !isLikelyNonSpeech(c)), [allClips]);
  const clips = includeMusic ? allClips : (speechClips.length ? speechClips : allClips);
  const skippedMusic = includeMusic ? 0 : allClips.length - clips.length;

  const transcribed = clips.filter((c) => (c.transcript?.length ?? 0) > 0);
  const focusItem =
    (focusItemId && clips.find((c) => c.id === focusItemId))
    || transcribed[0]
    || clips[0]
    || null;

  const editable = hasOperationalTranscript(focusItem);
  /** any clip on the track already has words (not only the focused chip) */
  const trackHasWords = transcribed.length > 0;
  const focusDeleted = new Set(focusItem?.deletedWordIdx ?? []);

  // Tracks that actually have media (for selector)
  const selectable = useMemo(
    () => trackOptions.filter((t) => mediaOnTrack(items, t.id).length > 0),
    [trackOptions, items],
  );

  const jumpToClip = (id: string) => {
    setFocusItemId(id);
    // when only showing current section, still try scroll after paint
    requestAnimationFrame(() => {
      document.getElementById(`cc-tx-sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const focusIndex = focusItem ? clips.findIndex((c) => c.id === focusItem.id) : -1;

  // Selection mode: a native text selection over the word spans becomes a
  // transcript-selection reference (word id / text / source media ms + keptSegments frame map).
  const pickFromDomSelection = () => {
    if (!pickMode || !bodyRef.current) return;
    const reference = transcriptRefFromDomSelection(bodyRef.current, clips, fps);
    if (reference) emitSelectionRef(reference);
  };

  const transcribeTrack = async () => {
    if (!clips.length) return;
    const jobs = clips.map((c) => ({ path: c.src!, itemId: c.id, label: clipLabel(c) }));
    reset();
    try {
      await runMany(jobs, (itemId, r) => {
        onSetItemTranscript(itemId, r.words);
        setFocusItemId(itemId);
      });
    } catch { /* hook holds error */ }
  };

  const sectionsToShow = useMemo(() => {
    if (showAllSections || clips.length <= MANY_CLIPS) return clips;
    // dense mode: only the focused clip (fallback first)
    const cur = focusItem ?? clips[0];
    return cur ? [cur] : clips;
  }, [clips, showAllSections, focusItem]);

  const applyPause = () => {
    if (!hasOperationalTranscript(focusItem)) return;
    const w = focusItem.transcript;
    const { count, savedMs } = analyzeSilences(w, compressSec * 1000);
    const fillers = w.filter((x) => /^[\s]*([uU][hm]+|[eE]r+m?|\u55ef|\u5443|\u554a|\u5514|\u989d)[\s.,]*$/.test(x.text)).length;
    onCleanScript(focusItem.id, { silenceFrames: Math.round(compressSec * fps), removeFillers });
    setPauseResult(
      `Compressed ${count} long pauses down to ${compressSec}s (saving about ${(savedMs / 1000).toFixed(1)}s)`
      + (removeFillers ? ` · ${fillers} filler words removed` : ''),
    );
  };

  const aliasLabel = activeTrack ? trackTitle(activeTrack) : '—';

  return (
    <div className="cc-transcript-panel">
      <div className="cc-transcript-toolbar">
        <button type="button" onClick={() => setPauseOpen((v) => !v)} className="cc-tx-btn" disabled={!editable}>
          <Icon name="clock" size={13} />Pauses
        </button>
        <select value={view} onChange={(e) => setView(e.target.value as 'paragraph' | 'segment')} className="cc-tx-select">
          <option value="paragraph">Paragraph view</option>
          <option value="segment">Segment view</option>
        </select>
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          disabled={!editable}
          title={editable ? 'Click a word to delete it = cut that audio' : "Transcribe this track's audio first"}
          className={`cc-tx-btn${editMode ? ' active' : ''}`}
        >
          <Icon name="pencil" size={13} />Edit
        </button>
        <input
          ref={srtInputRef}
          type="file"
          accept=".srt,application/x-subrip,text/plain"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) onImportSrt(file);
          }}
        />
        <button type="button" className="cc-tx-btn" title="Import SRT" onClick={() => srtInputRef.current?.click()}>
          <Icon name="upload" size={13} />Import SRT
        </button>
        <button
          type="button"
          className="cc-tx-btn"
          disabled={!onOpenCaptionStyles}
          title={onOpenCaptionStyles ? 'Caption styles' : 'Create a caption track first'}
          onClick={() => onOpenCaptionStyles?.(transcribed.map((item) => item.id))}
        >
          <Icon name="captions" size={13} />Caption styles
        </button>
        <span className="cc-tx-spacer" />
        {pauseOpen && (
          <div className="cc-tx-popover">
            <div className="cc-tx-muted" style={{ marginBottom: 6 }}>Pause length</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="range" min={0.1} max={2} step={0.05} value={compressSec}
                onChange={(e) => setCompressSec(Number(e.target.value))} style={{ flex: 1, accentColor: theme.accentDeep }} />
              <span style={{ fontSize: 12, width: 42, textAlign: 'right' }}>{compressSec.toFixed(2)}s</span>
            </div>
            <label className="cc-tx-check">
              <input type="checkbox" checked={removeFillers} onChange={(e) => setRemoveFillers(e.target.checked)} />
              Remove filler words (um / uh…)
            </label>
            {pauseResult && <div style={{ fontSize: 11, marginBottom: 8 }}>{pauseResult}</div>}
            <button type="button" onClick={applyPause} disabled={!editable} className="cc-tx-btn primary block">Apply</button>
          </div>
        )}
      </div>

      {/* Track chips — alias · name, never bare UUID */}
      <div className="cc-tx-tracks" role="tablist" aria-label="Transcription tracks">
        {selectable.length === 0 ? (
          <span className="cc-tx-muted">No audio or video track on the timeline can be transcribed yet</span>
        ) : (
          selectable.map((t) => {
            const n = mediaOnTrack(items, t.id).length;
            const speechN = mediaOnTrack(items, t.id).filter((c) => !isLikelyNonSpeech(c)).length;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={track === t.id}
                className={`cc-tx-track-chip${track === t.id ? ' selected' : ''}`}
                onClick={() => { setTrack(t.id); setFocusItemId(null); setPauseResult(null); }}
                title={t.id}
              >
                <span className="cc-tx-track-alias">{t.alias}</span>
                {t.name ? <span className="cc-tx-track-name">{t.name}</span> : null}
                <span className="cc-tx-track-count">{speechN || n}</span>
              </button>
            );
          })
        )}
      </div>

      {editMode && editable && focusItem && (
        <div className="cc-tx-editbar">
          <span>Click words to delete/restore (current clip). Deleted <b>{focusDeleted.size}</b> words</span>
          {focusDeleted.size > 0 && (
            <button type="button" onClick={() => onClearEdits(focusItem.id)} className="cc-tx-btn sm">Restore all</button>
          )}
        </div>
      )}

      {pickMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 12px', fontSize: 11, color: theme.accent, flexShrink: 0 }}>
          Selection mode: drag across words to quote them (release to add to chat)
        </div>
      )}
      <div className="cc-tx-body" ref={bodyRef} onMouseUp={pickFromDomSelection} style={pickMode ? { cursor: 'text' } : undefined}>
        {!track || selectable.length === 0 ? (
          <div className="cc-tx-empty-card blank">
            <div className="cc-tx-empty-icon" aria-hidden><Icon name="mic" size={14} /></div>
            <div className="cc-tx-empty-title">No transcribable tracks yet</div>
            <p className="cc-tx-muted">Add narration / voiceover or a video with speech to the timeline, then open the transcript.</p>
          </div>
        ) : !trackHasWords ? (
          <div className="cc-tx-empty-card">
            <div className="cc-tx-empty-kicker">{aliasLabel}</div>
            <div className="cc-tx-empty-title">Transcribe word-level script</div>
            <p className="cc-tx-muted">
              {localProvider
                ? `Word-level Chinese transcription · on-device model · all ${clips.length} clips on this track transcribe one by one (free, offline, media stays on this machine). Then click words to cut them (delete a word = cut the audio).`
                : `Word-level Chinese transcription · speaker diarization · all ${clips.length} clips on this track upload one by one. Then click words to cut them (delete a word = cut the audio).`}
            </p>
            {skippedMusic > 0 && (
              <label className="cc-tx-check music">
                <input type="checkbox" checked={includeMusic} onChange={(e) => setIncludeMusic(e.target.checked)} />
                {`Include likely background music (${skippedMusic} clips skipped)`}
              </label>
            )}
            <ul className="cc-tx-cliplist">
              {clips.map((c) => (
                <li key={c.id}>
                  <Icon name={c.kind === 'video' ? 'video' : 'volume'} size={13} />
                  <span className="cc-tx-clipname">{clipLabel(c)}</span>
                  <span className="cc-tx-clipdur">{(c.durationInFrames / fps).toFixed(1)}s</span>
                </li>
              ))}
            </ul>
            {!clips.length ? (
              <p className="cc-tx-muted">
                This track only has background-music clips. Turn on "Include likely background music" or switch to a voiceover track.
              </p>
            ) : (
              <button type="button" onClick={() => void transcribeTrack()} disabled={busy} className="cc-tx-btn primary lg">
                {busy ? (progressNote ?? 'Transcribing…') : `Transcribe ${activeTrack?.alias ?? ''} (${clips.length} clips)`}
              </button>
            )}
            {status === 'error' && <div className="cc-tx-error">{error}</div>}
          </div>
        ) : (
          <>
            {clips.length > 1 && (
              <div className="cc-tx-nav">
                <div className="cc-tx-nav-bar">
                  <select
                    className="cc-tx-nav-select"
                    value={focusItem?.id ?? clips[0]?.id ?? ''}
                    onChange={(e) => jumpToClip(e.target.value)}
                    title="Jump to clip"
                    aria-label="Jump to clip"
                  >
                    {clips.map((c, i) => {
                      const n = c.transcript?.length ?? 0;
                      return (
                        <option key={c.id} value={c.id}>
                          {i + 1}/{clips.length} · {clipLabel(c, 40)}{n ? ` · ${n} words` : ' · not transcribed'}{c.transcriptStale ? ' · expired' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <div className="cc-tx-nav-step">
                    <button
                      type="button"
                      className="cc-tx-btn sm"
                      disabled={focusIndex <= 0}
                      onClick={() => focusIndex > 0 && jumpToClip(clips[focusIndex - 1]!.id)}
                      title="Previous clip"
                    >
                      ‹
                    </button>
                    <span className="cc-tx-nav-count">
                      {Math.max(1, focusIndex + 1)}/{clips.length}
                    </span>
                    <button
                      type="button"
                      className="cc-tx-btn sm"
                      disabled={focusIndex < 0 || focusIndex >= clips.length - 1}
                      onClick={() => focusIndex >= 0 && focusIndex < clips.length - 1 && jumpToClip(clips[focusIndex + 1]!.id)}
                      title="Next clip"
                    >
                      ›
                    </button>
                  </div>
                  <button type="button" className="cc-tx-btn sm" disabled={busy} onClick={() => void transcribeTrack()}>
                    {busy ? '…' : 'Re-transcribe'}
                  </button>
                </div>
                {clips.length > MANY_CLIPS && (
                  <label className="cc-tx-nav-mode">
                    <input
                      type="checkbox"
                      checked={showAllSections}
                      onChange={(e) => setShowAllSections(e.target.checked)}
                    />
                    {`Show all ${clips.length} clips in full (default shows only the current clip to keep the list short)`}
                  </label>
                )}
              </div>
            )}
            <div className="cc-tx-sections">
              {sectionsToShow.map((c) => {
                const cWords = c.transcript ?? [];
                const cDel = new Set(c.deletedWordIdx ?? []);
                const active = focusItem?.id === c.id;
                const operational = hasOperationalTranscript(c);
                const idx = clips.findIndex((x) => x.id === c.id);
                const minDisplayMs = view === 'paragraph' ? 400 : 250;
                const canDragClip = clips.length > 1 && !!track;
                return (
                  <section
                    key={c.id}
                    id={`cc-tx-sec-${c.id}`}
                    className={`cc-tx-section${active ? ' active' : ''}${dragOverClipId === c.id ? ' drag-over' : ''}`}
                    draggable={canDragClip}
                    onClick={() => setFocusItemId(c.id)}
                    onDragStart={(e) => {
                      if (!canDragClip) return;
                      dragClipFrom.current = c.id;
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', `clip:${c.id}`);
                    }}
                    onDragEnd={() => {
                      dragClipFrom.current = null;
                      setDragOverClipId(null);
                    }}
                    onDragOver={(e) => {
                      if (!canDragClip || !dragClipFrom.current || dragClipFrom.current === c.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverClipId(c.id);
                    }}
                    onDragLeave={() => setDragOverClipId((id) => (id === c.id ? null : id))}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const fromId = dragClipFrom.current;
                      dragClipFrom.current = null;
                      setDragOverClipId(null);
                      if (!fromId || !track || fromId === c.id) return;
                      const ids = clips.map((x) => x.id);
                      const from = ids.indexOf(fromId);
                      const to = ids.indexOf(c.id);
                      if (from < 0 || to < 0) return;
                      const next = [...ids];
                      const [moved] = next.splice(from, 1);
                      if (!moved) return;
                      next.splice(to, 0, moved);
                      onReorderTrackItems(track, next);
                      setFocusItemId(fromId);
                    }}
                  >
                    <header className="cc-tx-section-head">
                      <span
                        className={`cc-tx-section-grip${canDragClip ? ' active' : ''}`}
                        title={canDragClip ? "Drag the card to reorder this track's clips on the timeline" : undefined}
                      >
                        ⋮⋮
                      </span>
                      <span className="cc-tx-section-title">
                        {clips.length > 1 ? `${idx + 1}. ` : ''}{clipLabel(c, 36)}
                      </span>
                      <span className="cc-tx-muted">
                        {(c.durationInFrames / fps).toFixed(1)}s
                        {cWords.length ? ` · ${cWords.length} words` : ' · not transcribed'}
                        {c.transcriptStale ? ' · transcription expired, view only' : c.transcriptPlayOrder?.length ? ' · speech reordered' : ''}
                      </span>
                    </header>
                    {!cWords.length ? (
                      <div className="cc-tx-muted" style={{ padding: '4px 0 8px' }}>This clip has not been transcribed yet</div>
                    ) : (
                      <ScriptView
                        words={cWords}
                        deleted={cDel}
                        editMode={editMode && active && operational}
                        fps={fps}
                        gapCapsMs={c.gapCapsMs}
                        silenceFrames={c.silenceFrames}
                        playOrder={c.transcriptPlayOrder}
                        minDisplayMs={minDisplayMs}
                        onWord={(w) => {
                          if (pickMode) return; // selection mode: words are for drag-select, not seek/delete
                          if (!operational) return;
                          setFocusItemId(c.id);
                          if (editMode) onToggleWord(c.id, w.gi);
                          else playerRef.current?.seekTo(c.startFrame + msToFrame(w.start, fps));
                        }}
                        onDeleteGap={(afterGi) => {
                          if (!operational) return;
                          setFocusItemId(c.id);
                          onSetGapCap(c.id, afterGi, 0);
                        }}
                        onCapGap={(afterGi, maxMs) => {
                          if (!operational) return;
                          setFocusItemId(c.id);
                          onSetGapCap(c.id, afterGi, maxMs);
                        }}
                        onReorderSpeech={(order) => {
                          if (!operational) return;
                          setFocusItemId(c.id);
                          onSetTranscriptPlayOrder(c.id, order);
                        }}
                      />
                    )}
                  </section>
                );
              })}
            </div>
            {(status === 'error' || error) && <div className="cc-tx-error">{error}</div>}
            {busy && progressNote && <div className="cc-tx-muted" style={{ marginTop: 8 }}>{progressNote}</div>}
            {!busy && trackHasWords && (
              <>
                <div className="cc-tx-muted" style={{ marginTop: 10 }}>
                  {`Transcribed ${transcribed.length}/${clips.length} clips`}
                  {transcribed.length < clips.length ? ' · click "Re-transcribe" to fill in failed clips' : ''}
                  {clips.length > MANY_CLIPS && !showAllSections ? ' · showing only the current clip' : ''}
                </div>
                {localProvider && (
                  <div className="cc-tx-muted" style={{ marginTop: 4 }}>
                    Local transcription does not separate speakers — everything is one speaker.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
