import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EditorCommands } from '../editor/store';
import type { TimelineItem, TimelineState } from '../editor/types';
import { Icon } from '../components/icons';
import { analyzeMotion } from './analyzeMotion';
import { buildTrackingKeyframeActions, trackingTargets, type TrackingApplyMode } from './keyframeActions';
import { TrackingError, type TrackingProgress, type TrackingRegion, type TrackingResult } from './types';
import { TrackingRegionPicker } from './TrackingRegionPicker';
import './motion-tracking.css';

interface MotionTrackingDialogProps { state: TimelineState; commands: EditorCommands; item: TimelineItem; onClose: () => void }
interface AnalysisState {
  progress: TrackingProgress | null; result: TrackingResult | null; error: string | null; running: boolean;
  run: () => Promise<void>; cancel: () => void; reset: () => void; setError: (message: string | null) => void;
}

const STABILIZE = '__stabilize__';
const INITIAL_REGION: TrackingRegion = { x: 0.35, y: 0.3, width: 0.3, height: 0.4 };

function errorLabel(error: unknown): string {
  if (!(error instanceof TrackingError)) return error instanceof Error ? error.message : String(error);
  return ({
    'load-failed': 'Could not read the selected video',
    'seek-failed': 'Timed out while reading video frames',
    'flat-target': 'The selected area lacks texture. Choose a target with clearer edges and detail.',
    'invalid-region': 'The selected area is too small. Draw a larger box.',
  })[error.code];
}

function useTrackingAnalysis(state: TimelineState, item: TimelineItem, region: TrackingRegion, minConfidence: number): AnalysisState {
  const [progress, setProgress] = useState<TrackingProgress | null>(null);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const run = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true); setResult(null); setError(null);
    setProgress({ processedFrames: 0, totalFrames: 1, confidence: null });
    try {
      setResult(await analyzeMotion({
        src: item.src!, fps: state.fps, srcInFrame: item.srcInFrame ?? 0,
        durationInFrames: item.durationInFrames, playbackRate: item.playbackRate ?? 1,
        region, minConfidence, signal: controller.signal, onProgress: setProgress,
      }));
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(errorLabel(cause));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  };
  const reset = () => { setProgress(null); setResult(null); setError(null); };
  return { progress, result, error, running, run, cancel: () => abortRef.current?.abort(), reset, setError };
}

function TrackingHeader({ item, close }: { item: TimelineItem; close: () => void }) {
  return <header className="cc-tracking-header">
    <div><h2 id="cc-tracking-title">Motion tracking <em>Experimental</em></h2><p>{item.name} · Analyzed locally — media is not uploaded</p></div>
    <button type="button" autoFocus onClick={close} aria-label="Close"><Icon name="x" size={17} /></button>
  </header>;
}

interface TrackingSettingsProps {
  targets: TimelineItem[]; targetId: string; running: boolean; minConfidence: number; percent: number;
  result: TrackingResult | null; locked: boolean; error: string | null;
  onTarget: (id: string) => void; onConfidence: (value: number) => void;
}

function TrackingSettings(props: TrackingSettingsProps) {
  return <aside>
    <label><span>Apply mode</span><select value={props.targetId} disabled={props.running} onChange={(event) => props.onTarget(event.target.value)}>
      <option value={STABILIZE}>Stabilize the selected video</option>
      {props.targets.map((target) => <option key={target.id} value={target.id}>{`Make “${target.name}” follow the target`}</option>)}
    </select></label>
    <label><span>Minimum confidence</span><strong>{props.minConfidence.toFixed(2)}</strong><input type="range" min={0.5} max={0.9} step={0.01} value={props.minConfidence} disabled={props.running} onChange={(event) => props.onConfidence(Number(event.target.value))} /></label>
    <div className="cc-tracking-progress"><div><span>{props.running ? 'Tracking frames…' : props.result ? 'Tracking complete' : 'Waiting for target selection'}</span><strong>{props.percent}%</strong></div><i><b style={{ transform: `scaleX(${props.percent / 100})` }} /></i></div>
    {props.result && <div className={`cc-tracking-result${props.result.stoppedBecauseLost ? ' warning' : ''}`}>
      <strong>{`${props.result.points.length} valid tracking points`}</strong>
      <span>{`Average confidence ${props.result.averageConfidence.toFixed(2)}`}</span>
      {props.result.stoppedBecauseLost && <small>The target was repeatedly lost, so tracking stopped early. Low-confidence frames will not become keyframes.</small>}
    </div>}
    {props.locked && <p className="cc-tracking-error">The target track is locked</p>}
    {props.error && <p className="cc-tracking-error">{props.error}</p>}
    <p className="cc-tracking-note">Applying replaces the target’s existing X/Y keyframes. You can refine them manually under Transform.</p>
  </aside>;
}

interface TrackingFooterProps { analysis: AnalysisState; applied: boolean; canApply: boolean; apply: () => void }
function TrackingFooter({ analysis, applied, canApply, apply }: TrackingFooterProps) {
  return <footer><span>{applied ? 'Applied. One undo restores all previous tracking keyframes.' : ''}</span><div>
    {analysis.running
      ? <button type="button" onClick={analysis.cancel}>Cancel tracking</button>
      : <button type="button" onClick={() => void analysis.run()}>{analysis.result ? 'Analyze again' : 'Start analysis'}</button>}
    <button type="button" className="primary" disabled={!canApply || applied} onClick={apply}>Apply keyframes</button>
  </div></footer>;
}

export function MotionTrackingDialog({ state, commands, item, onClose }: MotionTrackingDialogProps) {
  const targets = useMemo(() => trackingTargets(state, item), [state, item]);
  const [targetId, setTargetId] = useState(targets[0]?.id ?? STABILIZE);
  const [region, setRegion] = useState<TrackingRegion>(INITIAL_REGION);
  const [minConfidence, setMinConfidence] = useState(0.68);
  const [applied, setApplied] = useState(false);
  const analysis = useTrackingAnalysis(state, item, region, minConfidence);
  const mode: TrackingApplyMode = targetId === STABILIZE ? 'stabilize' : 'follow';
  const target = mode === 'stabilize' ? item : targets.find((candidate) => candidate.id === targetId) ?? null;
  const locked = !!target && !!state.tracks?.[target.track]?.locked;
  const percent = analysis.progress ? Math.round(analysis.progress.processedFrames * 100 / Math.max(1, analysis.progress.totalFrames)) : 0;
  const close = () => { analysis.cancel(); onClose(); };
  const apply = () => {
    if (!analysis.result || !target || locked) return;
    const actions = buildTrackingKeyframeActions({ state, source: item, target, result: analysis.result, mode });
    if (!actions.length) return analysis.setError('The valid tracking points do not overlap the target clip long enough');
    commands.batch(actions, 'Apply experimental motion tracking');
    setApplied(true);
  };
  const changeRegion = (next: TrackingRegion) => { setRegion(next); analysis.reset(); setApplied(false); };
  const changeTarget = (id: string) => { setTargetId(id); setApplied(false); };
  const changeConfidence = (value: number) => { setMinConfidence(value); analysis.reset(); setApplied(false); };
  return createPortal(<div className="cc-tracking-overlay" role="dialog" aria-modal="true" aria-labelledby="cc-tracking-title" onClick={analysis.running ? undefined : close}>
    <section className="cc-tracking-dialog" onClick={(event) => event.stopPropagation()}>
      <TrackingHeader item={item} close={close} />
      <div className="cc-tracking-body"><main>
        <TrackingRegionPicker item={item} fps={state.fps} region={region} points={analysis.result?.points ?? []} disabled={analysis.running} onChange={changeRegion} />
        <p>Drag around a clearly textured target in the first frame. Hold Ctrl/⌘ and scroll to zoom the preview. Its path appears after analysis.</p>
      </main><TrackingSettings targets={targets} targetId={targetId} running={analysis.running} minConfidence={minConfidence} percent={percent} result={analysis.result} locked={locked} error={analysis.error} onTarget={changeTarget} onConfidence={changeConfidence} /></div>
      <TrackingFooter analysis={analysis} applied={applied} canApply={!!analysis.result && analysis.result.points.length >= 2 && !!target && !locked} apply={apply} />
    </section>
  </div>, document.body);
}
