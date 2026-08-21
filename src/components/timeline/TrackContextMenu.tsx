import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TrackDeletePlan } from './trackDelete';
import type { TrackKind } from '../../editor/types';
import { Icon, type IconName } from '../icons';

interface TrackContextMenuProps {
  kind: TrackKind;
  x: number;
  y: number;
  hidden: boolean;
  muted: boolean;
  locked: boolean;
  canTighten: boolean;
  hasContents: boolean;
  hasSelectable: boolean;
  deleteBlockedReason: TrackDeletePlan['blockedReason'];
  onInsert: () => void;
  onTighten: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onToggleHidden: () => void;
  onToggleMuted: () => void;
  onToggleLocked: () => void;
  onRename: () => void;
  onOpenDuck: (rect: DOMRect) => void;
  onOpenCaptionStyle: (rect: DOMRect) => void;
  onOpenTranslate: (rect: DOMRect) => void;
  onDelete: () => void;
  onClose: () => void;
}

function MenuItem({ label, icon, checked, disabled, danger, chevron, onClick }: {
  label: string;
  icon: IconName;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  chevron?: boolean;
  onClick: (rect: DOMRect) => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-haspopup={chevron ? 'menu' : undefined}
      className={`cc-caption-cue-menu-item${danger ? ' danger' : ''}`}
      disabled={disabled}
      onClick={(event) => onClick(event.currentTarget.getBoundingClientRect())}
    >
      <span className="cc-caption-cue-menu-icon" aria-hidden><Icon name={icon} size={15} /></span>
      <span className="cc-caption-cue-menu-label">{label}</span>
      {checked && <span className="cc-track-context-menu-check" aria-hidden><Icon name="check" size={13} /></span>}
      {chevron && <span className="cc-caption-cue-menu-chevron" aria-hidden>›</span>}
    </button>
  );
}

const Separator = () => <div className="cc-caption-cue-menu-separator" role="separator" />;

function insertMenuItem(kind: TrackKind): { label: string; icon: IconName } {
  if (kind === 'audio') return { label: 'Insert audio', icon: 'music' };
  if (kind === 'caption') return { label: 'Insert captions', icon: 'captions' };
  return { label: 'Insert assets', icon: 'insert' };
}

export function TrackContextMenu({
  kind, x, y, hidden, muted, locked, canTighten, hasContents, hasSelectable, deleteBlockedReason,
  onInsert, onTighten, onSelectAll, onClear, onToggleHidden, onToggleMuted, onToggleLocked,
  onRename, onOpenDuck, onOpenCaptionStyle, onOpenTranslate, onDelete, onClose,
}: TrackContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const run = (action: () => void) => () => { action(); onClose(); };
  const open = (action: (rect: DOMRect) => void) => (fallbackRect: DOMRect) => {
    const anchorRect = ref.current?.getBoundingClientRect() ?? fallbackRect;
    onClose();
    action(anchorRect);
  };
  const insert = insertMenuItem(kind);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y, hidden, muted, locked, kind]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="cc-caption-cue-menu cc-track-context-menu"
      role="menu"
      aria-label="Track menu"
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <MenuItem label={insert.label} icon={insert.icon} disabled={locked} onClick={run(onInsert)} />
      <MenuItem label="Close gaps" icon="magnet" disabled={locked || !canTighten} onClick={run(onTighten)} />
      <Separator />
      <MenuItem label="Select all" icon="check" disabled={!hasSelectable} onClick={run(onSelectAll)} />
      <MenuItem label="Clear" icon="x" disabled={locked || !hasContents} onClick={run(onClear)} danger />
      <Separator />
      <MenuItem label={hidden ? 'Show track' : 'Hide track'} icon={hidden ? 'eyeOff' : 'eye'} checked={hidden} onClick={run(onToggleHidden)} />
      {kind !== 'caption' && <MenuItem label={muted ? 'Unmute' : 'Mute track'} icon={muted ? 'volumeOff' : 'volume'} checked={muted} onClick={run(onToggleMuted)} />}
      <MenuItem label={locked ? 'Unlock track' : 'Lock track'} icon={locked ? 'lock' : 'unlock'} checked={locked} onClick={run(onToggleLocked)} />
      <MenuItem label="Rename track" icon="pencil" onClick={run(onRename)} />
      <Separator />
      {kind === 'caption' ? (
        <>
          <MenuItem label="Caption styles" icon="palette" chevron onClick={open(onOpenCaptionStyle)} />
          <MenuItem label="Translate all" icon="text" chevron onClick={open(onOpenTranslate)} />
        </>
      ) : (
        <MenuItem label="Auto duck" icon="sliders" chevron onClick={open(onOpenDuck)} />
      )}
      <Separator />
      <MenuItem label="Delete track" icon="trash" disabled={deleteBlockedReason !== null} danger onClick={run(onDelete)} />
    </div>
  );
}
