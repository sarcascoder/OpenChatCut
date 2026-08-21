import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/icons';
import type { MediaAsset } from '../../editor/types';
import { enqueueMusicAnalysis, refreshMusicAnalysis } from './jobs';
import {
  getAutoMusicAnalysisEnabled,
  setAutoMusicAnalysisEnabled,
  subscribeAutoMusicAnalysis,
} from './preferences';
import type { MusicAnalysis, MusicSectionRole, MusicTag, MusicTagKind } from './types';
import { requestMusicAnalysisPackRefresh, type MusicAnalysisCardState } from './useMusicAnalysisCards';
import './music-analysis.css';

const TAG_KINDS = ['genre', 'mood', 'instrument', 'usage'] as const satisfies readonly MusicTagKind[];
const TAG_LABELS: Record<MusicTagKind, string> = {
  genre: 'Genre',
  mood: 'Mood',
  instrument: 'Instrument',
  usage: 'Usage',
};
const SECTION_LABELS: Record<MusicSectionRole, string> = {
  'intro-like': 'Intro',
  build: 'Build',
  peak: 'Peak',
  break: 'Break',
  steady: 'Steady',
  'outro-like': 'Outro',
};
const TIMING_POINT_PREVIEW_LIMIT = 48;

interface MusicAnalysisBadgeProps {
  asset: MediaAsset;
  state: MusicAnalysisCardState;
}

interface PopoverPosition {
  top: number;
  left: number;
  visibility: CSSProperties['visibility'];
}

function bestTag(analysis: MusicAnalysis, kind?: MusicTagKind): MusicTag | undefined {
  let best: MusicTag | undefined;
  for (const tag of analysis.tags) {
    if (kind && tag.kind !== kind) continue;
    if (!best || tag.score > best.score) best = tag;
  }
  return best;
}

function tagText(label: string): string {
  if (label === 'unknown') return 'Unknown';
  return label;
}

function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function timeLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function preciseTimeLabel(ms: number): string {
  const centiseconds = Math.max(0, Math.round(ms / 10));
  const minutes = Math.floor(centiseconds / 6_000);
  const seconds = ((centiseconds % 6_000) / 100).toFixed(2).padStart(5, '0');
  return `${minutes}:${seconds}`;
}

function TimingPointList({ label, points }: { label: string; points: readonly number[] }) {
  const shown = points.slice(0, TIMING_POINT_PREVIEW_LIMIT);
  const remaining = points.length - shown.length;
  return (
    <div className="cc-music-analysis-timing-row">
      <b>{label}</b>
      <p>{shown.length ? shown.map(preciseTimeLabel).join(' · ') : '—'}</p>
      {remaining > 0 && <small>{`${remaining} more timestamps`}</small>}
    </div>
  );
}

function RhythmDetails({ analysis }: { analysis: MusicAnalysis }) {
  return (
    <details className="cc-music-analysis-rhythm">
      <summary><span>Rhythm details</span><small>{`${analysis.beatsMs.length} beats · ${analysis.downbeatsMs.length} downbeats`}</small></summary>
      <TimingPointList label="Beat timestamps" points={analysis.beatsMs} />
      <TimingPointList label="Downbeat timestamps" points={analysis.downbeatsMs} />
    </details>
  );
}

function badgeText(state: MusicAnalysisCardState): string {
  if (state.state === 'checking') return 'Checking models';
  if (state.state === 'unavailable') return 'Models not installed';
  if (state.state === 'idle') return 'Analyze music';
  if (state.state === 'queued') return 'Queued';
  if (state.state === 'running') return `${Math.round(state.progress * 100)}%`;
  if (state.state === 'error') return 'Analysis failed';
  const tag = bestTag(state.analysis);
  return `${Math.round(state.analysis.bpm)} BPM${tag ? ` · ${tagText(tag.label)}` : ''}`;
}

function phaseLabel(phase: 'decode' | 'rhythm' | 'semantic'): string {
  if (phase === 'decode') return 'Decoding audio';
  if (phase === 'rhythm') return 'Analyzing rhythm';
  return 'Understanding music';
}

function usePopoverPosition(
  open: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
): PopoverPosition {
  const [position, setPosition] = useState<PopoverPosition>({ top: 8, left: 8, visibility: 'hidden' });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const anchor = trigger.getBoundingClientRect();
      const box = panel.getBoundingClientRect();
      const left = Math.min(window.innerWidth - box.width - 8, Math.max(8, anchor.right - box.width));
      const below = anchor.bottom + box.height + 6 <= window.innerHeight;
      const top = below ? anchor.bottom + 4 : Math.max(8, anchor.top - box.height - 4);
      setPosition({ left, top, visibility: 'visible' });
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (panelRef.current) observer?.observe(panelRef.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, panelRef, triggerRef]);
  return position;
}

function usePopoverDismiss(
  open: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  close: (restoreFocus?: boolean) => void,
): void {
  useEffect(() => {
    if (!open) return;
    const outside = (target: Node) => !triggerRef.current?.contains(target) && !panelRef.current?.contains(target);
    const onPointer = (event: PointerEvent) => { if (outside(event.target as Node)) close(); };
    const onFocus = (event: FocusEvent) => { if (outside(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close(true);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('focusin', onFocus);
    window.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLButtonElement>('.cc-music-analysis-close')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('keydown', onKey);
    };
  }, [close, open, panelRef, triggerRef]);
}

function stopCardInteraction(event: ReactMouseEvent<HTMLElement>): void {
  event.stopPropagation();
}

export function MusicAnalysisBadge({ asset, state }: MusicAnalysisBadgeProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
  }, []);
  const position = usePopoverPosition(open, triggerRef, panelRef);
  usePopoverDismiss(open, triggerRef, panelRef, close);
  const text = badgeText(state);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        draggable={false}
        data-music-analysis-control
        data-state={state.state}
        className="cc-music-analysis-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Music analysis: ${asset.name}, ${text}`}
        title={text}
        onPointerDown={stopCardInteraction}
        onClick={(event) => {
          stopCardInteraction(event);
          requestMusicAnalysisPackRefresh();
          setOpen((value) => !value);
        }}
        onDoubleClick={stopCardInteraction}
        onContextMenu={(event) => { event.preventDefault(); stopCardInteraction(event); }}
        onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}
      >
        <span className="cc-music-analysis-dot" aria-hidden="true" />
        <span aria-live="polite">{text}</span>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <MusicAnalysisPopover asset={asset} state={state} panelRef={panelRef} position={position} onClose={() => close(true)} />,
        document.body,
      )}
    </>
  );
}

interface MusicAnalysisPopoverProps {
  asset: MediaAsset;
  state: MusicAnalysisCardState;
  panelRef: RefObject<HTMLDivElement | null>;
  position: PopoverPosition;
  onClose: () => void;
}

function MusicAnalysisPopover({ asset, state, panelRef, position, onClose }: MusicAnalysisPopoverProps) {
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Music analysis for ${asset.name}`}
      className="cc-music-analysis-popover"
      style={position}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      data-music-analysis-control
      onClick={stopCardInteraction}
      onPointerDown={stopCardInteraction}
      onDoubleClick={stopCardInteraction}
      onContextMenu={stopCardInteraction}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header className="cc-music-analysis-head">
        <div className="cc-music-analysis-title"><strong>Music analysis</strong><span title={asset.name}>{asset.name}</span></div>
        <button type="button" className="cc-music-analysis-close" aria-label="Close" onClick={onClose}><Icon name="x" size={15} /></button>
      </header>
      <AnalysisContent state={state} />
      {state.state === 'ready' && state.modelPacksAvailable === false && (
        <p className="cc-music-analysis-state">Showing the cached result. Install the model packs before analyzing again.</p>
      )}
      <AnalysisAction asset={asset} state={state} />
    </div>
  );
}

function AnalysisAction({ asset, state }: { asset: MediaAsset; state: MusicAnalysisCardState }) {
  const busy = state.state === 'queued' || state.state === 'running' || state.state === 'checking';
  const canAnalyze = state.modelPacksAvailable === true && !busy;
  const label = state.state === 'error'
    ? 'Retry analysis'
    : state.state === 'ready'
      ? 'Analyze again'
      : 'Analyze music';
  const run = () => {
    if (state.state === 'error' || state.state === 'ready') void refreshMusicAnalysis(asset);
    else void enqueueMusicAnalysis(asset);
  };
  return <div className="cc-music-analysis-actions"><button type="button" className="cc-music-analysis-action" disabled={!canAnalyze} onClick={run}>{label}</button></div>;
}

function AnalysisContent({ state }: { state: MusicAnalysisCardState }) {
  if (state.state === 'ready') return <ReadyAnalysis analysis={state.analysis} />;
  if (state.state === 'running') return <p className="cc-music-analysis-state">{phaseLabel(state.phase)} · {Math.round(state.progress * 100)}%<progress className="cc-music-analysis-progress" max={1} value={state.progress} /></p>;
  if (state.state === 'queued') return <p className="cc-music-analysis-state">Added to the local analysis queue.</p>;
  if (state.state === 'error') return <p className="cc-music-analysis-state error">{`Analysis failed: ${state.message}`}</p>;
  if (state.state === 'unavailable') return <p className="cc-music-analysis-state">The required model packs are not installed. Download the rhythm and music semantics models separately in Local AI settings; this control never downloads them automatically.</p>;
  if (state.state === 'checking') return <p className="cc-music-analysis-state">Checking local models…</p>;
  return <p className="cc-music-analysis-state">Analyze rhythm, structure, and music meaning on this device. Audio is never uploaded.</p>;
}

function ReadyAnalysis({ analysis }: { analysis: MusicAnalysis }) {
  return (
    <>
      <div className="cc-music-analysis-metrics">
        <Metric label="Tempo" value={`${Math.round(analysis.bpm)} BPM`} />
        <Metric label="Meter" value={`${analysis.meter}/4`} />
        <Metric label="Confidence" value={percent(analysis.beatConfidence)} />
      </div>
      <RhythmDetails analysis={analysis} />
      <h4 className="cc-music-analysis-section-title">Music tags</h4>
      <dl className="cc-music-analysis-tags">
        {TAG_KINDS.map((kind) => {
          const tag = bestTag(analysis, kind);
          return <div key={kind}><dt>{TAG_LABELS[kind]}</dt><dd>{tag ? <><span>{tagText(tag.label)}</span><small>{percent(tag.score)}</small></> : '—'}</dd></div>;
        })}
      </dl>
      <h4 className="cc-music-analysis-section-title">Sections</h4>
      {analysis.sections.length > 0
        ? <ol className="cc-music-analysis-sections">{analysis.sections.map((section, index) => <li key={`${section.fromMs}:${index}`}><time>{timeLabel(section.fromMs)}–{timeLabel(section.toMs)}</time><b>{SECTION_LABELS[section.role]}</b><span className="cc-music-analysis-section-scores"><span>Energy {percent(section.energy)}</span><span>Boundary {percent(section.boundaryConfidence)}</span></span></li>)}</ol>
        : <p className="cc-music-analysis-state">No clear sections detected</p>}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="cc-music-analysis-metric"><span>{label}</span><strong>{value}</strong></div>;
}

export function MusicAutoAnalysisPreference() {
  const enabled = useSyncExternalStore(
    subscribeAutoMusicAnalysis,
    getAutoMusicAnalysisEnabled,
    getAutoMusicAnalysisEnabled,
  );
  return (
    <div className="cc-music-analysis-pref" data-music-analysis-control>
      <button
        type="button"
        role="switch"
        className="cc-music-analysis-pref-toggle"
        aria-checked={enabled}
        onClick={() => setAutoMusicAnalysisEnabled(!enabled)}
      >
        <span>Analyze newly imported audio and video</span>
        <span className="cc-music-analysis-switch" aria-hidden="true" />
      </button>
      <p className="cc-music-analysis-pref-note">Download the model packs separately in Local AI settings first. Enabling this never starts a download.</p>
    </div>
  );
}
