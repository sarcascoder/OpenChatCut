// Default keyboard preset with 56 actions. The UI can show an alternate label via labelZh.

export type ShortcutGroup =
  | 'ai'
  | 'edit'
  | 'markers'
  | 'navigation'
  | 'playback'
  | 'view';

export interface ShortcutAction {
  id: string;
  label: string;
  labelZh: string;
  group: ShortcutGroup;
  /** Human-readable bindings such as "Mod + Alt + V / Mod + Shift + B". */
  keys: string;
  /** If true, ignore when focus is in input/textarea/contenteditable (default true). */
  disabledWhenTyping?: boolean;
}

export const SHORTCUT_GROUPS: { id: ShortcutGroup; label: string; labelZh: string }[] = [
  { id: 'playback', label: 'Playback', labelZh: 'Playback' },
  { id: 'edit', label: 'Edit', labelZh: 'Edit' },
  { id: 'navigation', label: 'Navigation', labelZh: 'Navigation' },
  { id: 'markers', label: 'Markers', labelZh: 'Marker' },
  { id: 'view', label: 'View', labelZh: 'View' },
  { id: 'ai', label: 'AI', labelZh: 'AI' },
];

/** Canonical 56 actions — source of truth for help UI + matcher. */
export const SHORTCUT_CATALOG: ShortcutAction[] = [
  { id: 'play-pause', label: 'Play / Pause', labelZh: 'Play/Pause', group: 'playback', keys: 'Space' },
  { id: 'seek-back', label: 'Previous frame', labelZh: 'Previous frame', group: 'playback', keys: '←' },
  { id: 'seek-fwd', label: 'Next frame', labelZh: 'Next frame', group: 'playback', keys: '→' },
  { id: 'seek-back-sec', label: 'Step back 1 second', labelZh: 'Back 1 second', group: 'playback', keys: 'Shift + ←' },
  { id: 'seek-fwd-sec', label: 'Step forward 1 second', labelZh: 'Forward 1 second', group: 'playback', keys: 'Shift + →' },
  { id: 'shuttle-back', label: 'Shuttle backward', labelZh: 'Shuttle backward (J)', group: 'playback', keys: 'J' },
  { id: 'shuttle-fwd', label: 'Shuttle forward', labelZh: 'Shuttle forward (L)', group: 'playback', keys: 'L' },
  { id: 'shuttle-pause', label: 'Shuttle pause', labelZh: 'Shuttle pause (K)', group: 'playback', keys: 'K' },
  { id: 'shuttle-jog-back', label: 'Jog back one frame', labelZh: 'Jog back one frame (K+J)', group: 'playback', keys: 'K + J' },
  { id: 'shuttle-jog-fwd', label: 'Jog forward one frame', labelZh: 'Jog forward one frame (K+L)', group: 'playback', keys: 'K + L' },

  { id: 'undo', label: 'Undo', labelZh: 'Undo', group: 'edit', keys: 'Mod + Z' },
  { id: 'redo', label: 'Redo', labelZh: 'Redo', group: 'edit', keys: 'Mod + Shift + Z / Mod + Y' },
  { id: 'copy', label: 'Copy', labelZh: 'Duplicate', group: 'edit', keys: 'Mod + C' },
  { id: 'cut', label: 'Cut', labelZh: 'Cut', group: 'edit', keys: 'Mod + X' },
  { id: 'paste', label: 'Paste', labelZh: 'Paste', group: 'edit', keys: 'Mod + V' },
  { id: 'paste-effects', label: 'Paste Effects', labelZh: 'Paste effects', group: 'edit', keys: 'Mod + Alt + V / Mod + Shift + B' },
  { id: 'duplicate', label: 'Duplicate', labelZh: 'Duplicate clip', group: 'edit', keys: 'Mod + D' },
  { id: 'delete', label: 'Delete', labelZh: 'Delete', group: 'edit', keys: 'Backspace / Delete' },
  { id: 'split', label: 'Split', labelZh: 'Split', group: 'edit', keys: 'C / Enter' },
  { id: 'interaction-mode-selection', label: 'Selection Mode', labelZh: 'Selection mode', group: 'edit', keys: 'V' },
  { id: 'interaction-mode-trim', label: 'Trim Edit Mode', labelZh: 'Trim mode', group: 'edit', keys: 'N' },
  { id: 'interaction-mode-slip', label: 'Slip Edit Mode', labelZh: 'Slip mode', group: 'edit', keys: 'U' },
  { id: 'interaction-mode-blade', label: 'Blade Edit Mode', labelZh: 'Blade mode', group: 'edit', keys: 'B' },
  { id: 'interaction-mode-pen', label: 'Pen Edit Mode', labelZh: 'Pen mode', group: 'edit', keys: 'P' },
  { id: 'nudge-left', label: 'Nudge left 1 / 5 frames', labelZh: 'Nudge left 1/5 frames', group: 'edit', keys: 'E / Shift + E' },
  { id: 'nudge-right', label: 'Nudge right 1 / 5 frames', labelZh: 'Nudge right 1/5 frames', group: 'edit', keys: 'R / Shift + R' },
  { id: 'trim-start', label: 'Trim start', labelZh: 'Trim to in point', group: 'edit', keys: 'Q' },
  { id: 'trim-end', label: 'Trim end', labelZh: 'Trim to out point', group: 'edit', keys: 'W' },
  // disabled when typing so ⌘A still selects text in chat/inspector inputs
  { id: 'select-all', label: 'Select all', labelZh: 'Select all', group: 'edit', keys: 'Mod + A' },
  { id: 'select-after', label: 'Select clips forward', labelZh: 'Select clips forward', group: 'edit', keys: 'Y' },
  { id: 'move-up', label: 'Move clip up', labelZh: 'Move clip up a track', group: 'edit', keys: 'Alt + ↑' },
  { id: 'move-down', label: 'Move clip down', labelZh: 'Move clip down a track', group: 'edit', keys: 'Alt + ↓' },
  { id: 'move-left-boundary', label: 'Move left to boundary', labelZh: 'Snap to left edge', group: 'edit', keys: 'Ctrl + E' },
  { id: 'move-right-boundary', label: 'Move right to boundary', labelZh: 'Snap to right edge', group: 'edit', keys: 'Ctrl + R' },
  { id: 'save-version', label: 'Save version', labelZh: 'Save version', group: 'edit', keys: 'Mod + S' },

  { id: 'prev-edit', label: 'Previous edit', labelZh: 'Previous edit point', group: 'navigation', keys: '↑' },
  { id: 'next-edit', label: 'Next edit', labelZh: 'Next edit point', group: 'navigation', keys: '↓' },
  { id: 'zone-in', label: 'Mark in', labelZh: 'In point', group: 'navigation', keys: 'I' },
  { id: 'zone-out', label: 'Mark out', labelZh: 'Out point', group: 'navigation', keys: 'O' },
  { id: 'zone-clear', label: 'Clear marks', labelZh: 'Clear in/out points', group: 'navigation', keys: 'X' },
  { id: 'zone-clip', label: 'Mark clip at playhead', labelZh: 'Set in/out from clip', group: 'navigation', keys: '/' },
  { id: 'zone-selection', label: 'Mark selection', labelZh: 'Set in/out from selection', group: 'navigation', keys: '' },

  { id: 'marker-add', label: 'Add marker', labelZh: 'Add marker', group: 'markers', keys: 'M' },
  { id: 'marker-shortcut-add-and-open', label: 'Add marker and open dialog', labelZh: 'Add and edit marker', group: 'markers', keys: 'Mod + M' },
  { id: 'marker-modify-at-playhead', label: 'Modify marker at playhead', labelZh: 'Edit marker at playhead', group: 'markers', keys: 'Shift + M' },
  { id: 'marker-delete-at-playhead', label: 'Delete marker at playhead', labelZh: 'Delete marker at playhead', group: 'markers', keys: 'Alt + M' },
  { id: 'marker-prev', label: 'Previous marker', labelZh: 'Previous marker', group: 'markers', keys: 'Shift + ↑' },
  { id: 'marker-next', label: 'Next marker', labelZh: 'Next marker', group: 'markers', keys: 'Shift + ↓' },

  { id: 'snapping', label: 'Snapping', labelZh: 'Snapping', group: 'view', keys: 'S' },
  { id: 'selection-mode', label: 'Selection mode', labelZh: 'Selection mode (Alt)', group: 'view', keys: 'Alt + S' },
  { id: 'zoom-in', label: 'Timeline zoom in', labelZh: 'Zoom timeline in', group: 'view', keys: 'Mod + = / Mod + +' },
  { id: 'zoom-out', label: 'Timeline zoom out', labelZh: 'Zoom timeline out', group: 'view', keys: 'Mod + -' },
  { id: 'zoom-fit', label: 'Zoom timeline to fit', labelZh: 'Fit to view', group: 'view', keys: 'Shift + Z' },
  { id: 'fullscreen', label: 'Fullscreen preview', labelZh: 'Fullscreen', group: 'view', keys: '`' },
  { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts', labelZh: 'Keyboard shortcut list', group: 'view', keys: 'Mod + Alt + K', disabledWhenTyping: false },

  { id: 'ask-ai', label: 'Add to AI chat', labelZh: 'Focus AI chat', group: 'ai', keys: 'Tab' },
];

export const SHORTCUT_BY_ID = Object.fromEntries(
  SHORTCUT_CATALOG.map((a) => [a.id, a]),
) as Record<string, ShortcutAction>;
