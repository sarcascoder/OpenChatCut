import { useState, type CSSProperties } from 'react';
import { Icon } from '../icons';
import { ScalarControl } from './ScalarControl';
import { useHistoryGesture } from './historyGesture';
import { resolveBackgroundFillToggle } from './backgroundFillControlState';

const STRENGTH_PRESETS = [
  { value: 25, label: 'Soft', preview: 'soft' },
  { value: 50, label: 'Standard', preview: 'medium' },
  { value: 75, label: 'Strong', preview: 'strong' },
  { value: 100, label: 'Maximum', preview: 'maximum' },
] as const;


interface BackgroundFillControlProps {
  enabled: boolean;
  mixed?: boolean;
  strength: number;
  strengthMixed?: boolean;
  onChange: (enabled: boolean, strength?: number) => void;
  onApplyToAll?: (strength: number) => void;
}

function BackgroundFillStrengthSlider({
  strength, mixed, onChange,
}: {
  strength: number;
  mixed: boolean;
  onChange: (strength: number) => void;
  
}) {
  const gesture = useHistoryGesture();
  return (
    <div className="cc-insp-row">
      <span className="cc-insp-label">Intensity</span>
      <input aria-label={'Background fill intensity'} className="cc-insp-range"
        style={{ '--cc-insp-range-fill': `${strength}%` } as CSSProperties}
        type="range" min={0} max={100} step="any" value={strength} disabled={mixed}
        onChange={(event) => onChange(Math.round(Number(event.target.value)))} {...gesture} />
      <span className="cc-insp-val">
        <ScalarControl ariaLabel={'Background fill intensity'} formatValue={`${Math.round(strength)}%`}
          mixed={mixed} min={0} max={100} step={1} value={strength}
          onChange={(value) => onChange(Math.round(value))}
          onGestureStart={gesture.onKeyDown} onGestureEnd={gesture.onKeyUp}
          title={'Background fill intensity'} />
      </span>
    </div>
  );
}

function BackgroundFillStrengthPicker({
  strength, mixed, onChange,
}: {
  strength: number;
  mixed: boolean;
  onChange: (strength: number) => void;
  
}) {
  return (
    <div className="cc-bg-fill-body">
      <BackgroundFillStrengthSlider
        strength={strength}
        mixed={mixed}
        onChange={onChange}

      />
      <div className="cc-bg-fill-presets" role="radiogroup" aria-label={'Background fill intensity'}>
        {STRENGTH_PRESETS.map(({ value, label, preview }) => (
          <button key={value} type="button" role="radio"
            aria-checked={!mixed && strength === value}
            className={!mixed && strength === value ? 'selected' : ''}
            onClick={() => onChange(value)}>
            <span className={`cc-bg-fill-preview ${preview}`} aria-hidden />
            <small>{label} {value}%</small>
          </button>
        ))}
      </div>
      {mixed && <div className="cc-insp-muted">Selected clips use different background intensities</div>}
    </div>
  );
}

export function BackgroundFillControlView({
  enabled, mixed = false, strength, strengthMixed = false, onChange, onApplyToAll,
}: BackgroundFillControlProps & { }) {
  const [expanded, setExpanded] = useState(true);
  const active = enabled || mixed;
  return (
    <div className="cc-bg-fill-control">
      <div className="cc-bg-fill-head">
        <label>
          <input ref={(element) => { if (element) element.indeterminate = mixed; }}
            type="checkbox" checked={enabled}
            onChange={(event) => {
              const next = resolveBackgroundFillToggle(mixed, event.target.checked, strength, strengthMixed);
              onChange(next.enabled, next.strength);
            }}
            aria-label={'Background fill'} />
          <span><strong>Background fill</strong><small>Fill empty canvas areas with a copy of the clip</small></span>
        </label>
        <div>
          {onApplyToAll && <button type="button" className="cc-bg-fill-apply"
            disabled={!active || strengthMixed} onClick={() => onApplyToAll(strength)}>Apply to all</button>}
          <button type="button" className="cc-bg-fill-disclosure" disabled={!active}
            aria-expanded={active && expanded}
            aria-label={expanded ? 'Collapse background fill effects' : 'Expand background fill effects'}
            onClick={() => setExpanded((value) => !value)}>
            <span className={expanded ? 'expanded' : ''}><Icon name="chevronDown" size={12} /></span>
          </button>
        </div>
      </div>
      {active && expanded && <BackgroundFillStrengthPicker strength={strength} mixed={strengthMixed}
 onChange={(value) => onChange(true, value)} />}
    </div>
  );
}

export function BackgroundFillControl(props: BackgroundFillControlProps) {
  return <BackgroundFillControlView {...props} />;
}
