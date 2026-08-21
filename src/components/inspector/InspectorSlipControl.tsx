import { useEffect, useState } from 'react';
import type { SlipPlan, SlipResult } from '../../editor/slip';
import type { TimelineItem } from '../../editor/types';
import { Icon } from '../icons';

interface InspectorSlipControlProps {
  item: TimelineItem;
  plan: SlipPlan;
  onSlip: (deltaInFrames: number) => SlipResult;
}

export function InspectorSlipControl({ item, plan, onSlip }: InspectorSlipControlProps) {
  const [step, setStep] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setStep(1);
    setNotice(null);
  }, [item.id]);

  const run = (direction: -1 | 1) => {
    const result = onSlip(direction * Math.max(1, Math.round(step)));
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setNotice(result.clamped
      ? result.sourceDomain === 'edited-stream' ? 'Reached the edited word-stream boundary' : 'Reached the source media boundary'
      : null);
  };

  const sourceFrame = (value: number) => value.toFixed(Number.isInteger(value) ? 0 : 2);
  const canEarlier = plan.minDeltaInFrames < -1e-6;
  const canLater = plan.maxDeltaInFrames > 1e-6;
  const sourceStep = plan.sourceDomain === 'edited-stream'
    ? 1
    : Math.max(0.01, item.playbackRate ?? 1);
  const sourceOutFrame = Math.max(plan.sourceWindow.startFrame, plan.sourceWindow.endFrame - sourceStep);
  const displayedRate = plan.sourceDomain === 'edited-stream' ? 1 : (item.playbackRate ?? 1);

  return (
    <div className="cc-insp-stack">
      <div className="cc-insp-row">
        <span className="cc-insp-label">{plan.sourceDomain === 'edited-stream' ? 'Edited word-stream range' : 'Source range'}</span>
        <span className="cc-insp-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {sourceFrame(plan.sourceWindow.startFrame)}–{sourceFrame(sourceOutFrame)}f
        </span>
        <span className="cc-insp-val">{displayedRate.toFixed(2)}×</span>
      </div>
      <div className="cc-insp-row">
        <label className="cc-insp-label" htmlFor={`slip-step-${item.id}`}>Step size</label>
        <input
          id={`slip-step-${item.id}`}
          className="cc-insp-number"
          type="number"
          min={1}
          step={1}
          value={step}
          onChange={(event) => setStep(Math.max(1, Number(event.target.value) || 1))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') run(event.shiftKey ? -1 : 1);
          }}
          aria-describedby={`slip-help-${item.id}`}
        />
        <span className="cc-insp-val">Timeline frames</span>
      </div>
      <div className="cc-insp-actions">
        <button
          type="button"
          className="cc-insp-btn"
          disabled={!canEarlier}
          onClick={() => run(-1)}
          title="Slip the source range forward; timeline position and duration stay unchanged"
        >
          <Icon name="prev" size={11} />Forward
        </button>
        <button
          type="button"
          className="cc-insp-btn"
          disabled={!canLater}
          onClick={() => run(1)}
          title="Slip the source range backward; timeline position and duration stay unchanged"
        >
          Backward<Icon name="next" size={11} />
        </button>
      </div>
      <div id={`slip-help-${item.id}`} className="cc-insp-muted" style={{ fontSize: 10 }}>
        {notice ?? 'Enter slips backward · Shift+Enter slips forward; only the source in-point changes.'}
      </div>
    </div>
  );
}
