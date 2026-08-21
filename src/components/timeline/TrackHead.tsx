// Track header unit: highlighted track label + show/mute/lock/caption menu/dodge/delete actions,
// plus the "Auto-dodge · mix role" popover. Cross-track menu exclusivity stays in Timeline;
// this component only renders and forwards commands.
import type { ReactNode } from 'react';
import { theme } from '../../theme';
import { Icon } from '../icons';
import type { EditorCommands } from '../../editor/store';
import type { TrackFlags, TrackId, TrackKind } from '../../editor/types';
import type { TrackDeletePlan } from './trackDelete';
import { MenuDrillHeader } from './MenuDrillHeader';

const flagBtn = (active: boolean): React.CSSProperties => ({
  width: 20, height: 20, display: 'grid', placeItems: 'center',
  background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0,
  color: theme.textMuted, opacity: active ? 0.35 : 1, flexShrink: 0,
});

interface TrackHeadProps {
  trackId: TrackId;
  kind: TrackKind;
  /** Stable title, e.g. Video 1 / V1 — never the custom name. */
  trackName: string;
  /** Optional custom name rendered as a second row under the title. */
  customName?: string;
  config: TrackFlags;
  deleteBlockedReason: TrackDeletePlan['blockedReason'];
  onDelete: () => void;
  /** caption menu open on this track → raise head above neighbors */
  menuElevated: boolean;
  width: number;
  commands: EditorCommands;
  onToggleCaptions: () => void;
  onToggleCaptionMenu: (rect: DOMRect) => void;
  onToggleDuckMenu: (rect: DOMRect) => void;
  duckMenuPos: { left: number; top: number } | null;
  onCloseDuckMenu: () => void;
  onBackDuckMenu?: () => void;
  /** the open CaptionStyleMenu (fixed-positioned), when this track owns it */
  children?: ReactNode;
}

function trackDeleteTitle(
  blockedReason: TrackDeletePlan['blockedReason'],
): string {
  if (blockedReason === 'last-video') return 'Keep at least one video track';
  if (blockedReason === 'locked') return 'Unlock the track first';
  return 'Delete track';
}

export function TrackHead({
  trackId, kind, trackName, customName, config, deleteBlockedReason, onDelete, menuElevated, width,
  commands, onToggleCaptions, onToggleCaptionMenu, onToggleDuckMenu, duckMenuPos, onCloseDuckMenu, onBackDuckMenu, children,
}: TrackHeadProps) {
  const hidden = config.hidden ?? false;
  const muted = config.muted ?? false;
  const locked = config.locked ?? false;
  const isCaption = kind === 'caption';
  const deleteTitle = trackDeleteTitle(deleteBlockedReason);
  const tagColor = kind === 'video' ? theme.trackVideo : kind === 'audio' ? theme.trackAudioA1 : theme.trackCaption;
  const nameTitle = config.role === 'anchor' ? `${trackName} · ${'Anchor (ducking)'}`
    : config.role === 'follower' ? `${trackName} · ${'Follower (ducking)'}`
      : trackName;
  return (
    <div className="cc-track-head" style={{ width, ...(menuElevated ? { zIndex: 40 } : {}) }}>
      <div className="cc-track-head-controls">
        <span className="cc-track-name" title={`${nameTitle}(${trackId})`} style={{ background: tagColor }}>
          <span className="cc-track-name-title">{trackName}</span>
          {customName && <span className="cc-track-name-custom">{customName}</span>}
        </span>
        <button style={flagBtn(hidden)} title={hidden ? 'Show track' : 'Hide track'} onClick={isCaption ? onToggleCaptions : () => commands.toggleTrackFlag(trackId, 'hidden')}><Icon name={hidden ? 'eyeOff' : 'eye'} size={14} /></button>
        {!isCaption && <button style={flagBtn(muted)} title={muted ? 'Unmute' : 'Mute track'} onClick={() => commands.toggleTrackFlag(trackId, 'muted')}><Icon name={muted ? 'volumeOff' : 'volume'} size={14} /></button>}
        <button style={{ ...flagBtn(false), color: locked ? theme.gold : theme.textMuted }} title={locked ? 'Unlock track' : 'Lock track (no moving / trimming / deleting / dropping)'} onClick={() => commands.toggleTrackFlag(trackId, 'locked')}><Icon name={locked ? 'lock' : 'unlock'} size={14} /></button>
        {isCaption && <button data-caption-menu-trigger style={flagBtn(false)} title="Caption style & translation" onClick={(e) => onToggleCaptionMenu(e.currentTarget.getBoundingClientRect())}><Icon name="chevronDown" size={12} /></button>}
        {!isCaption && <button data-duck-menu-trigger style={{ ...flagBtn(false), color: config.role === 'anchor' || config.role === 'follower' ? theme.gold : theme.textMuted }} title="Auto-ducking (mix roles: anchor speech / follower music)" onClick={(e) => onToggleDuckMenu(e.currentTarget.getBoundingClientRect())}><Icon name="sliders" size={13} /></button>}
        <button
          type="button"
          className="cc-track-fixed-action"
          disabled={deleteBlockedReason !== null}
          title={deleteTitle}
          onClick={onDelete}
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
      {children}
      {duckMenuPos && (
        <DuckMenu trackId={trackId} config={config} pos={duckMenuPos} commands={commands} onClose={onCloseDuckMenu} onBack={onBackDuckMenu ?? onCloseDuckMenu} />
      )}
    </div>
  );
}

// Duck (auto-dodge) role menu is a track-head menu item, not a
// permanent widget. Sets the per-track role (anchor speech / follower music) + duck depth;
// the engine (TimelineComposition duckGain) already reacts to it.
function DuckMenu({ trackId, config, pos, commands, onClose, onBack }: {
  trackId: TrackId;
  config: TrackFlags;
  pos: { left: number; top: number };
  commands: EditorCommands;
  onClose: () => void;
  onBack: () => void;
}) {
  return (
    <div className="cc-caption-style-menu cc-duck-menu" style={{ position: 'fixed', left: pos.left, top: pos.top }} onPointerDown={(e) => e.stopPropagation()}>
      <MenuDrillHeader title="Auto duck" onBack={onBack} />
      <div className="cc-caption-style-list">
        {([
          { role: null, label: 'Close', hint: 'Not part of auto-ducking' },
          { role: 'anchor', label: 'Anchor · Speech', hint: 'Speech ducks the other tracks' },
          { role: 'follower', label: 'Follower · Background music', hint: 'Automatically lowered while the anchor speaks' },
        ] as const).map((opt) => (
          <button key={opt.label} className={(config.role ?? null) === opt.role ? 'active' : ''}
            onClick={() => { commands.updateTrack(trackId, { role: opt.role }); if (opt.role !== 'follower') onClose(); }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.25 }}>
              <span>{opt.label}</span>
              <span style={{ fontSize: 11, color: theme.textMuted }}>{opt.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {config.role === 'follower' && (
        <div style={{ borderTop: `0.5px solid ${theme.border}`, padding: '7px 10px 9px' }}>
          <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 5 }}>Duck depth (dB)</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[-6, -12, -18, -24].map((db) => {
              const cur = config.audioRouting?.duckDepthDb ?? -12;
              return (
                <button key={db} onClick={() => commands.updateTrack(trackId, { audioRouting: { duckDepthDb: db } })}
                  style={{ flex: 1, padding: '4px 0', borderRadius: 4, border: `0.5px solid ${theme.borderLight}`, cursor: 'pointer',
                    background: cur === db ? `color-mix(in srgb, ${theme.select} 30%, ${theme.hover})` : 'transparent', color: cur === db ? theme.textStrong : theme.textMuted, fontSize: 11 }}>
                  {db}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
