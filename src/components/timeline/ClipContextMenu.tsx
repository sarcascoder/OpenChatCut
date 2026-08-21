import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { theme, themeAlpha } from '../../theme';
import type { EditorCommands } from '../../editor/store';
import { removeItemsFromState } from '../../editor/multiSelect';
import { setLinkGroup, unlinkItems } from '../../editor/linkGroups';
import { canMulticamItem, runMulticamSync } from '../../multicam/sync';
import { TRANSITION_LABELS, ZOOM_SHAPE_LABELS, type TimelineItem, type TimelineState, type TransitionItem } from '../../editor/types';
import { ALL_FX, LUT_EFFECTS } from '../../gl/fx/effects';
import { Icon, type IconName } from '../icons';
import { contextReferenceItems } from './clipContextSelection';

// speed presets for the variable speed submenu
const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 4] as const;
const SPEED_PRESET_EPSILON = 0.01;

function displaySpeedRate(rate: number): number {
  return Number(rate.toFixed(3));
}

function matchesSpeedPreset(rate: number, preset: number): boolean {
  return Math.abs(rate - preset) < SPEED_PRESET_EPSILON;
}

// Clip right-click menu. AI multi-camera synchronization: client audio alignment (src/multicam).

/** effects copied from a clip (the clip's effects[] stack) */
export interface FxClip {
  filters?: TimelineItem['filters'];
  transform?: TimelineItem['transform'];
  zoom?: TimelineItem['zoom'];
  fadeInFrames?: number;
  fadeOutFrames?: number;
}

interface ClipContextMenuProps {
  item: TimelineItem;
  /** Transitions (in/out) related to this clip are listed and removed by "Applied Effects" */
  transitions: TransitionItem[];
  x: number;
  y: number;
  playhead: number;
  commands: EditorCommands;
  /** Active timeline — needed for multi-select batch delete */
  timeline: TimelineState;
  /** Current multi-selection (includes item when right-clicked inside the set) */
  selectedIds: string[];
  fxClip: FxClip | null;
  onCopyFx: (fx: FxClip) => void;
  onClose: () => void;
  /** Export MG animation → ProRes 4444 alpha .mov download */
  onExportMg: (item: TimelineItem) => void;
  /** Turn to video → bake to a video clip in place */
  onConvertToVideo: (item: TimelineItem) => void;
  onAddComment: (item: TimelineItem, frame: number, clientX: number, clientY: number) => void;
  /** Add the clicked clip or its complete multi-selection as structured AI references. */
  onAddToChat: (items: TimelineItem[]) => void;
  /** Pick a local replacement for this media clip. */
  onRelinkFile: (item: TimelineItem) => void;
}

const PASTE_HINT = '⌘⌥V';

export function ClipContextMenu({ item, transitions, x, y, playhead, commands, timeline, selectedIds, fxClip, onCopyFx, onClose, onExportMg, onConvertToVideo, onAddComment, onAddToChat, onRelinkFile }: ClipContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  // Right-click on a multi-selected clip → batch ops on the whole set (NLE convention).
  const batchIds = selectedIds.includes(item.id) && selectedIds.length > 1 ? selectedIds : [item.id];
  const referenceItems = contextReferenceItems(item.id, selectedIds, timeline.items);
  const batchN = batchIds.length;
  // Multicam: need ≥2 selected video/audio with media
  const multicamIds = (batchN > 1 ? batchIds : selectedIds.length > 1 ? selectedIds : [])
    .map((id) => timeline.items.find((x) => x.id === id))
    .filter((x): x is TimelineItem => !!x && canMulticamItem(x))
    .map((x) => x.id);
  // If only one selected but right-clicked a media clip, still require multi-select
  const multicamReady = multicamIds.length >= 2;
  const multicamHint = multicamReady
    ? `Align ${multicamIds.length} clips by timecode, capture clock, or audio`
    : batchN < 2 && selectedIds.length < 2
      ? 'Select 2+ video/audio clips first'
      : 'Multicam sync needs video/audio clips with media';
  const multicamGroup = item.multicamGroupId
    ? timeline.multicamGroups?.find((group) => group.id === item.multicamGroupId)
    : timeline.multicamGroups?.find((group) => group.angles.some((angle) => angle.itemId === item.id));
  const linkedGroup = timeline.linkGroups?.find((group) => group.mode === 'linked' && group.itemIds.includes(item.id));
  const syncLockGroup = timeline.linkGroups?.find((group) => group.mode === 'sync-lock' && group.itemIds.includes(item.id));
  const toggleRelationship = (mode: 'linked' | 'sync-lock') => {
    const existing = mode === 'linked' ? linkedGroup : syncLockGroup;
    const next = existing
      ? unlinkItems(timeline, batchN > 1 ? batchIds : [item.id], mode)
      : setLinkGroup(timeline, {
          id: globalThis.crypto?.randomUUID?.() ?? `link_${Date.now().toString(36)}`,
          itemIds: batchIds,
          anchorItemId: item.id,
          mode,
        });
    if (next !== timeline) commands.applyState(next);
  };

  const runMulticam = async () => {
    if (!multicamReady || syncBusy) return;
    setSyncBusy(true);
    setSyncMsg('Reading timecode, capture clock, or audio…');
    try {
      // Prefer right-clicked item as reference when it's in the set
      const refId = multicamIds.includes(item.id) ? item.id : undefined;
      const result = await runMulticamSync({
        state: timeline,
        itemIds: multicamIds,
        referenceItemId: refId,
      });
      if (result.changed && result.nextState) commands.applyState(result.nextState);
      const methods = [...new Set(result.offsets.map((offset) => offset.method))].join(' / ');
      setSyncMsg(result.groupId
        ? (result.skippedItemIds.length
          ? `Multicam group saved (${methods}), skipped ${result.skippedItemIds.length}`
          : `Multicam group saved (${methods})`)
        : result.status === 'already_synced'
          ? 'Already in sync (offsets under 1 frame)'
          : result.status === 'failed'
            ? result.message
            : 'Cannot align selected clips (no timecode and audio confidence too low)');
      if (result.changed) {
        // brief toast then close
        window.setTimeout(() => onClose(), 900);
      }
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Multicam sync failed');
    } finally {
      setSyncBusy(false);
    }
  };
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const [showSpeed, setShowSpeed] = useState(false);
  const [showApplied, setShowApplied] = useState(false);
  // Use conservative clamping for the initial value, and accurately shrink it after measuring the actual size (expanding sub-area/weight when changing anchor)
  const [pos, setPos] = useState(() => ({ left: Math.min(x, window.innerWidth - 210), top: Math.min(y, window.innerHeight - 380) }));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
  }, [x, y, showApplied, showSpeed]);

  // List of applied effects: special effects/LUT/zoom/transition, click to remove
  const effects = item.effects ?? [];
  const applied: { key: string; label: string; remove: () => void }[] = [
    ...effects.map((fx) => ({
      key: fx.id,
      label: `${fx.assetId in LUT_EFFECTS ? 'LUT' : 'Effects'} · ${ALL_FX[fx.assetId]?.name ?? fx.assetId}`,
      remove: () => commands.setItemEffects(item.id, effects.filter((e) => e.id !== fx.id)),
    })),
    ...(item.zoom?.shape || (item.zoom?.reframeCurve?.keyframes.length ?? 0) > 0
      ? [{
          key: 'zoom',
          label: `Zoom · ${item.zoom?.shape ? ZOOM_SHAPE_LABELS[item.zoom.shape] ?? item.zoom.shape : item.zoom?.label ?? 'Keyframes'}`,
          remove: () => commands.setItemZoom(item.id, null),
        }]
      : []),
    ...transitions.map((tr) => ({
      key: tr.id,
      label: (tr.incomingItemId === item.id ? `Transition · ${TRANSITION_LABELS[tr.type] ?? tr.type} (in)` : `Transition · ${TRANSITION_LABELS[tr.type] ?? tr.type} (out)`),
      remove: () => commands.removeTransition(tr.id),
    })),
  ];
  const inside = playhead > item.startFrame && playhead < item.startFrame + item.durationInFrames;
  const isVisual = item.kind !== 'audio';
  const isDom = item.kind === 'motion-graphic' || item.kind === 'text'; // DOM clips → alpha MG export
  const canSpeed = item.kind === 'video' || item.kind === 'audio' || item.kind === 'sequence';
  const canRelink = !timeline.tracks?.[item.track]?.locked && !!item.src && ['video', 'audio', 'image', 'gif', 'svg'].includes(item.kind);
  const rate = item.playbackRate ?? 1;
  const displayedRate = displaySpeedRate(rate);
  const reviewFrame = Math.max(item.startFrame, Math.min(playhead, item.startFrame + item.durationInFrames - 1));
  const run = (fn: () => void) => () => { fn(); onClose(); };

  const copyFx = () => onCopyFx({ filters: item.filters, transform: item.transform, zoom: item.zoom, fadeInFrames: item.fadeInFrames, fadeOutFrames: item.fadeOutFrames });
  const pasteFx = () => {
    if (!fxClip) return;
    if (fxClip.filters) commands.setItemFilters(item.id, fxClip.filters);
    if (fxClip.transform) commands.setItemTransform(item.id, fxClip.transform);
    commands.setItemZoom(item.id, fxClip.zoom ?? null);
    commands.setItemFade(item.id, { fadeInFrames: fxClip.fadeInFrames ?? 0, fadeOutFrames: fxClip.fadeOutFrames ?? 0 });
  };

  // keep the menu on-screen: The height of the menu changes with the entry/expanded state. If the height is estimated to be too high, it will overflow at the bottom——
  // After the mounting and unfolding state changes, measure the real size and then clamp it (useLayoutEffect is run before drawing and does not flash).
  const style: React.CSSProperties = {
    position: 'fixed', left: pos.left, top: pos.top,
    zIndex: 100, minWidth: 200, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto',
    background: theme.panelAlt, border: `0.5px solid ${theme.borderLight}`,
    borderRadius: 5, boxShadow: `0 12px 36px ${themeAlpha.shadow(0.55)}`, padding: 5, fontSize: 12.5, color: theme.text,
  };

  return (
    <div ref={ref} style={style}>
      <Item label="Add comment" icon="clipboard" onClick={run(() => onAddComment(item, reviewFrame, x, y))} />
      <Sep />
      <Item
        label={syncBusy ? 'Syncing multicam…' : 'AI multicam sync'}
        icon="users"
        disabled={!multicamReady || syncBusy}
        onClick={() => { void runMulticam(); }}
      />
      {syncMsg && (
        <div style={{ padding: '4px 9px 6px', fontSize: 11, color: theme.textMuted, lineHeight: 1.35 }}>
          {syncMsg}
        </div>
      )}
      {!multicamReady && !syncMsg && (
        <div style={{ padding: '0 9px 6px', fontSize: 10.5, color: theme.textDim, lineHeight: 1.3 }}>
          {multicamHint}
        </div>
      )}
      {multicamGroup && (
        <div style={{ padding: '0 9px 6px', fontSize: 10.5, color: theme.textDim, lineHeight: 1.3 }}>
          {`Multicam group · ${multicamGroup.angles.length} cameras · ${multicamGroup.syncMethod}`}
        </div>
      )}
      <Item
        label={linkedGroup ? 'Unlink audio & video' : 'Link selected audio & video'}
        icon={linkedGroup ? 'unlock' : 'users'}
        disabled={!linkedGroup && batchN < 2}
        onClick={run(() => toggleRelationship('linked'))}
      />
      <Item
        label={syncLockGroup ? 'Unlock sync' : 'Sync-lock selected clips'}
        icon={syncLockGroup ? 'unlock' : 'lock'}
        disabled={!syncLockGroup && batchN < 2}
        onClick={run(() => toggleRelationship('sync-lock'))}
      />
      <Sep />
      <Item label="Duplicate" icon="copy" shortcut="⌘C" onClick={run(() => commands.duplicateItem(item.id))} />
      <Item label="Split" icon="scissors" shortcut="C" disabled={!inside} onClick={run(() => commands.splitItem(item.id, playhead))} />
      <Sep />
      <Item label={applied.length ? `Applied effects (${applied.length})` : 'Applied effects'} icon="filter" chevron disabled={applied.length === 0}
        onClick={applied.length ? () => setShowApplied((v) => !v) : undefined} />
      {showApplied && applied.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 6px 6px 35px' }}>
          {applied.map((a) => (
            <button key={a.key} title="Click to remove" onClick={run(a.remove)} style={appliedRow}
              onMouseEnter={(e) => { e.currentTarget.style.background = theme.bg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{a.label}</span>
              <span style={{ color: theme.textDim, flexShrink: 0 }}>×</span>
            </button>
          ))}
        </div>
      )}
      <Item label="Copy effects" icon="sparkles" disabled={!isVisual} onClick={run(copyFx)} />
      <Item label="Paste effects" icon="clipboard" shortcut={PASTE_HINT} disabled={!isVisual || !fxClip} onClick={run(pasteFx)} />
      <Item label={!matchesSpeedPreset(rate, 1) ? `Speed (${displayedRate}×)` : 'Speed'} icon="clock" chevron disabled={!canSpeed}
        onClick={canSpeed ? () => setShowSpeed((v) => !v) : undefined} />
      {showSpeed && canSpeed && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 9px 6px 35px' }}>
          {SPEED_PRESETS.map((s) => {
            const active = matchesSpeedPreset(rate, s);
            return (
              <button key={s} onClick={run(() => commands.setItemSpeed(item.id, s))}
                style={{
                  cursor: 'pointer', fontSize: 11, padding: '3px 8px', borderRadius: 5,
                  border: `0.5px solid ${active ? theme.accent : theme.border}`,
                  background: active ? theme.accent : 'none', color: active ? theme.onAccent : theme.text,
                }}>{s}×</button>
            );
          })}
        </div>
      )}
      <Sep />
      <Item
        label={batchN > 1 ? `Add to AI chat (${batchN})` : 'Add to AI composer'}
        icon="sparkles"
        onClick={run(() => onAddToChat(referenceItems))}
      />
      <Item label="Relink file" icon="folder" disabled={!canRelink} onClick={run(() => onRelinkFile(item))} />
      <Sep />
      <Item label="Export MG animation" icon="download" disabled={!isDom} onClick={run(() => onExportMg(item))} />
      <Item label="Convert to video" icon="film" disabled={item.kind === 'audio'} onClick={run(() => onConvertToVideo(item))} />
      <Sep />
      <Item
        label={batchN > 1 ? `Delete (${batchN})` : 'Delete'}
        icon="trash"
        danger
        shortcut="⌫"
        onClick={run(() => {
          if (batchN === 1) commands.removeItem(batchIds[0]!);
          else commands.applyState(removeItemsFromState(timeline, batchIds, false));
        })}
      />
      <Item
        label={batchN > 1 ? `Ripple delete (${batchN})` : 'Ripple delete (close gap)'}
        icon="trash"
        danger
        shortcut="⇧⌫"
        onClick={run(() => {
          if (batchN === 1) commands.rippleDeleteItem(batchIds[0]!);
          else commands.applyState(removeItemsFromState(timeline, batchIds, true));
        })}
      />
    </div>
  );
}

const appliedRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none',
  borderRadius: 5, padding: '4px 8px', fontSize: 11.5, color: theme.text, cursor: 'pointer',
};

function Sep() {
  return <div style={{ height: 0.5, background: theme.border, margin: '5px 6px' }} />;
}

function Item({ label, icon, shortcut, disabled, danger, pro, chevron, onClick }: {
  label: string; icon: IconName; shortcut?: string; disabled?: boolean; danger?: boolean; pro?: boolean; chevron?: boolean; onClick?: () => void;
}) {
  return (
    <button disabled={disabled} onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none',
        borderRadius: 6, padding: '7px 9px', fontSize: 12.5, cursor: disabled ? 'default' : 'pointer',
        color: disabled ? theme.textDim : danger ? theme.accent : theme.text, opacity: disabled ? 0.45 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = theme.bg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
      <span style={{ width: 16, display: 'grid', placeItems: 'center', lineHeight: 0, color: danger ? theme.accent : theme.textDim }}><Icon name={icon} size={15} /></span>
      <span style={{ flex: 1 }}>{label}</span>
      {pro && <span style={{ fontSize: 9, fontWeight: 700, color: theme.accent, border: `0.5px solid ${theme.accent}`, borderRadius: 3, padding: '0 3px' }}>PRO</span>}
      {chevron && <span style={{ color: theme.textDim }}>›</span>}
      {shortcut && <span style={{ color: theme.textDim, fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>{shortcut}</span>}
    </button>
  );
}
