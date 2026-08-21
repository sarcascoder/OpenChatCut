import type { CaptionMotionPreset } from './types';
import { CAPTION_MOTION_OPTIONS } from './captionMotion';

interface CaptionMotionControlsProps {
  value: CaptionMotionPreset | undefined;
  onChange: (value: CaptionMotionPreset) => void;
}

export function CaptionMotionControls({ value, onChange }: CaptionMotionControlsProps) {
  const selected = value ?? 'none';
  return (
    <div className="cc-cap-field">
      <div className="cc-cap-label">Caption motion</div>
      <div className="cc-cap-pills" role="listbox" aria-label="Caption motion">
        {CAPTION_MOTION_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={selected === option.id}
            className={`cc-cap-pill${selected === option.id ? ' selected' : ''}`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="cc-cap-hint">Motion is timeline-frame driven, so preview and export stay aligned.</p>
    </div>
  );
}
