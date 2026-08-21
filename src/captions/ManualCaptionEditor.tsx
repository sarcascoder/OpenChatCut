import { useEffect, useMemo, useState } from 'react';
import type { TimelineItem } from '../editor/types';
import type { TranscriptWord } from '../transcript/types';
import {
  appendManualCue, appendManualLane, isManualCaptionEntry,
  removeManualCue, removeManualLane, updateManualCue,
} from './manualCaptions';
import type { CaptionsData, CaptionSourceEntry } from './types';

interface Props {
  captions: CaptionsData;
  items: TimelineItem[];
  onUpdate: (patch: Partial<CaptionsData>) => void;
  getPlayheadMs?: () => number;
  onSeekMs?: (ms: number) => void;
}

export function ManualCaptionEditor({ captions, items, onUpdate, getPlayheadMs, onSeekMs }: Props) {
  const lanes = useMemo(() => captions.sourceEntries?.filter(isManualCaptionEntry) ?? [], [captions.sourceEntries]);
  const [open, setOpen] = useState(lanes.length > 0);
  const [laneId, setLaneId] = useState(lanes[0]?.id ?? '');
  useEffect(() => {
    if (!lanes.some((lane) => lane.id === laneId)) setLaneId(lanes[0]?.id ?? '');
  }, [lanes, laneId]);
  const addLane = () => {
    const patch = appendManualLane(captions, items);
    const lane = patch.sourceEntries?.filter(isManualCaptionEntry).at(-1);
    onUpdate(patch);
    if (lane) setLaneId(lane.id);
    setOpen(true);
  };
  const lane = lanes.find((candidate) => candidate.id === laneId) ?? lanes[0];
  return (
    <div className="cc-cap-bilingual">
      <button type="button" className="cc-cap-bilingual-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>Manual captions{lanes.length ? ` (${lanes.length} lanes)` : ''}</span>
        <span className="cc-cap-hint">{open ? 'Collapse' : 'Expand'}</span>
      </button>
      {open && <ManualLanePanel {...{ captions, lanes, lane, laneId, setLaneId, addLane, onUpdate, getPlayheadMs, onSeekMs }} />}
    </div>
  );
}

interface LanePanelProps extends Omit<Props, 'items'> {
  lanes: CaptionSourceEntry[];
  lane?: CaptionSourceEntry;
  laneId: string;
  setLaneId: (id: string) => void;
  addLane: () => void;
}

function ManualLanePanel(props: LanePanelProps) {
  const { captions, lanes, lane, laneId, setLaneId, addLane, onUpdate, getPlayheadMs, onSeekMs } = props;
  return (
    <div className="cc-cap-bilingual-body">
      <div className="cc-cap-manual-toolbar">
        {lanes.length > 0 && <select className="cc-cap-select" value={laneId} onChange={(event) => setLaneId(event.target.value)}>
          {lanes.map((entry) => <option key={entry.id} value={entry.id}>{entry.label ?? 'Manual caption lane'}</option>)}
        </select>}
        <button type="button" className="cc-cap-btn sm" onClick={addLane}>New lane</button>
        {lane && <button type="button" className="cc-cap-btn sm ghost" onClick={() => onUpdate(removeManualLane(captions, lane.id))}>Delete lane</button>}
      </div>
      {!lane && <p className="cc-cap-hint">Create a manual caption lane, then add captions at the playhead without transcription or AI.</p>}
      {lane && <ManualCueList key={lane.id} {...{ captions, lane, onUpdate, getPlayheadMs, onSeekMs }} />}
    </div>
  );
}

function ManualCueList({ captions, lane, onUpdate, getPlayheadMs, onSeekMs }: Omit<Props, 'items'> & { lane: CaptionSourceEntry }) {
  const [text, setText] = useState('');
  const [start, setStart] = useState(() => ((getPlayheadMs?.() ?? 0) / 1000).toFixed(1));
  const [duration, setDuration] = useState('3.0');
  const add = () => {
    const startMs = Number(start) * 1000;
    const patch = appendManualCue(captions, lane.id, text, startMs, startMs + Number(duration) * 1000);
    if (!patch) return;
    onUpdate(patch);
    setText('');
  };
  const syncPlayhead = () => setStart(((getPlayheadMs?.() ?? 0) / 1000).toFixed(1));
  return (
    <div className="cc-cap-manual-compose">
      <textarea className="cc-cap-input cc-cap-textarea" rows={2} value={text} onChange={(event) => setText(event.target.value)} placeholder="Enter caption text" />
      <div className="cc-cap-manual-controls">
        <label className="cc-cap-time-field"><span>Start</span><input className="cc-cap-input" type="number" min="0" step="0.1" value={start} onChange={(event) => setStart(event.target.value)} /><span>s</span></label>
        <label className="cc-cap-time-field"><span>Duration</span><input className="cc-cap-input" type="number" min="0.1" step="0.1" value={duration} onChange={(event) => setDuration(event.target.value)} /><span>s</span></label>
        <button type="button" className="cc-cap-btn sm" onClick={syncPlayhead}>Use playhead</button>
        <button type="button" className="cc-cap-btn primary sm" disabled={!text.trim()} onClick={add}>Add caption</button>
      </div>
      <div className="cc-cap-manual-list">
        {(lane.words ?? []).map((cue, index) => <ManualCueRow key={cue.id ?? `${lane.id}_${cue.start}_${cue.end}_${index}`} {...{ captions, lane, cue, index, onUpdate, onSeekMs }} />)}
      </div>
    </div>
  );
}

function ManualCueRow({ captions, lane, cue, index, onUpdate, onSeekMs }: Omit<Props, 'items' | 'getPlayheadMs'> & { lane: CaptionSourceEntry; cue: TranscriptWord; index: number }) {
  const [text, setText] = useState(cue.text);
  const [start, setStart] = useState((cue.start / 1000).toFixed(1));
  const [end, setEnd] = useState((cue.end / 1000).toFixed(1));
  const save = () => {
    const patch = updateManualCue(captions, lane.id, index, text, Number(start) * 1000, Number(end) * 1000);
    if (patch) onUpdate(patch);
  };
  return (
    <div className="cc-cap-manual-row">
      <input className="cc-cap-input" aria-label="Start time in seconds" type="number" min="0" step="0.1" value={start} onChange={(event) => setStart(event.target.value)} onClick={() => onSeekMs?.(cue.start)} />
      <input className="cc-cap-input" aria-label="End time in seconds" type="number" min="0.1" step="0.1" value={end} onChange={(event) => setEnd(event.target.value)} />
      <input className="cc-cap-input cc-cap-manual-text" aria-label="Caption text" value={text} onChange={(event) => setText(event.target.value)} />
      <div className="cc-cap-manual-actions">
        <button type="button" className="cc-cap-btn sm" onClick={save}>Save</button>
        <button type="button" className="cc-cap-btn sm ghost" onClick={() => onUpdate(removeManualCue(captions, lane.id, index))}>Delete</button>
      </div>
    </div>
  );
}
