import { useRef } from 'react';
import type { TrackKind } from '../../editor/types';
import type { EditorCommands } from '../../editor/store';
import { Icon, type IconName } from '../icons';

const OPTIONS: Array<{ kind: TrackKind; label: string; icon: IconName }> = [
  { kind: 'video', label: 'Video track', icon: 'film' },
  { kind: 'audio', label: 'Audio / music track', icon: 'volume' },
  { kind: 'caption', label: 'Caption track', icon: 'captions' },
];

export function TrackCreateControl({ commands }: { commands: EditorCommands }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const create = (kind: TrackKind) => {
    commands.createTrack(kind);
    if (ref.current) ref.current.open = false;
  };
  const createTimeline = () => {
    commands.createTimeline();
    if (ref.current) ref.current.open = false;
  };
  return (
    <details ref={ref} className="cc-track-create" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
    }}>
      <summary className="cc-tip" data-tip="New track" aria-label="New track">
        <Icon name="plus" size={16} />
      </summary>
      <div className="cc-track-create-menu">
        <div className="cc-track-create-title">New track</div>
        {OPTIONS.map((option) => (
            <button key={option.kind} onClick={() => create(option.kind)}>
              <Icon name={option.icon} size={14} />
              <span>{option.label}</span>
            </button>
        ))}
        <div className="cc-track-create-separator" />
        <button onClick={createTimeline}>
          <Icon name="plus" size={14} />
          <span>New sequence</span>
        </button>
      </div>
    </details>
  );
}
