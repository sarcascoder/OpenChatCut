import { useState, useEffect } from 'react';
import { theme } from '../theme';
import { Icon } from './icons';
import { ExportHistory } from './ExportHistory';
import { GenerationActivity } from './GenerationActivity';
import { SkinPicker } from './settings/SkinPicker';
import { McpGuideDialog } from './settings/McpGuide';
import { invokeAction, bindAction } from '../shortcuts/actionRegistry';
import { DesktopWindowControls } from './DesktopWindowControls';
import { TopBarIconButton } from './TopBarIconButton';


interface TopBarProps {
  projectId: string;
  projectName: string;
  canUndo: boolean;
  canRedo: boolean;
  exporting?: boolean;
  exportJobCount?: number;
  onResumeGeneration?: () => Promise<void>;
  onHome?: () => void;
  onRename?: (name: string) => void;
}

export function TopBar({ projectId, projectName, canUndo, canRedo, exporting, exportJobCount = 0, onHome, onRename, onResumeGeneration }: TopBarProps) {
  const isMacDesktop = window.openChatCutDesktop?.platform === 'darwin';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const [mcpOpen, setMcpOpen] = useState(false);
  // The settings dialog (and anything else) can summon the MCP guide through the
  // action registry: the Anthropic pane names this panel as the way in for
  // Claude Code subscribers, so it has to be able to actually open it.
  useEffect(() => bindAction('open-mcp-guide', () => setMcpOpen(true)), []);
  const commit = () => { setEditing(false); if (onRename && draft.trim() && draft.trim() !== projectName) onRename(draft.trim()); };

  return (
    <header className={`cc-topbar cc-window-titlebar${isMacDesktop ? ' cc-window-titlebar--mac' : ''}`} style={{ gridColumn: '1 / -1', gridRow: 1, position: 'relative', height: '100%', display: 'flex', alignItems: 'center', padding: '0 6px', borderBottom: `0.5px solid ${theme.border}`, background: theme.panel, gap: 4 }}>
      <DesktopWindowControls />
      {/* home in a rounded chip + a vertical divider */}
      <button className="cc-tip" data-tip="Back to projects" aria-label="Back to projects" onClick={onHome}
        style={{ width: 28, height: 28, background: 'none', border: 'none', borderRadius: 4, cursor: onHome ? 'pointer' : 'default', padding: 0, lineHeight: 0, display: 'grid', placeItems: 'center', color: theme.textDim }}
        onMouseEnter={(e) => { if (onHome) { e.currentTarget.style.color = theme.text; e.currentTarget.style.background = theme.panelAlt; } }}
        onMouseLeave={(e) => { e.currentTarget.style.color = theme.textDim; e.currentTarget.style.background = 'none'; }}>
        <Icon name="home" size={16} />
      </button>
      <span style={{ width: 1, height: 20, background: theme.border, margin: '0 4px' }} />

      {/* center: project title (no collaboration on local single machine, no collaborator users icon)*/}
      <div className="cc-topbar-title" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', fontSize: 12, color: theme.text }}>
        {editing ? (
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            style={{ font: 'inherit', fontSize: 14, textAlign: 'center', background: theme.panelAlt, color: theme.text, border: `0.5px solid ${theme.accent}`, borderRadius: 5, padding: '2px 8px', minWidth: 200 }} />
        ) : (
          <span onDoubleClick={() => { if (onRename) { setDraft(projectName); setEditing(true); } }} title={onRename ? 'Double-click to rename' : undefined} style={{ cursor: onRename ? 'text' : 'default' }}>{projectName}</span>
        )}
      </div>

      <div className="cc-topbar-actions">

      {/* right: undo · redo · shortcuts · history · layout · export · avatar */}
      <TopBarIconButton icon="undo" label="Undo" onClick={() => invokeAction('undo', undefined, 'toolbar')} disabled={!canUndo} />
      <TopBarIconButton icon="redo" label="Redo" onClick={() => invokeAction('redo', undefined, 'toolbar')} disabled={!canRedo} />
      <TopBarIconButton icon="keyboard" label="Edit keyboard shortcuts" onClick={() => invokeAction('keyboard-shortcuts', undefined, 'toolbar')} />
      <TopBarIconButton icon="plug" label="External agents (MCP)" onClick={() => setMcpOpen(true)} />
      <span id="cc-agent-change-log-slot" style={{ display: 'contents' }} />
      <TopBarIconButton icon="palette" label="Design style (brand)" onClick={() => invokeAction('open-design', undefined, 'toolbar')} />
      <SkinPicker />
      <GenerationActivity projectId={projectId} onResume={onResumeGeneration} />
      <TopBarIconButton icon="history" label="Version History" onClick={() => invokeAction('open-history', undefined, 'toolbar')} />
      {/* self-contained: trigger + popover, global export history, zero props */}
      <ExportHistory />
      <TopBarIconButton icon="layoutPanel" label="Toggle panel layout" onClick={() => invokeAction('toggle-layout', undefined, 'toolbar')} />
      <button onClick={() => invokeAction('open-export', undefined, 'toolbar')}
        className="cc-tip cc-tip-r"
        data-tip={exporting ? 'View background export tasks' : 'Export MP4'}
        aria-label={exporting ? 'View background export tasks' : 'Export MP4'}
        style={{ minWidth: 58, height: 26, background: theme.accent, color: theme.onAccent, border: 'none', borderRadius: 2, padding: '0 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginLeft: 4 }}>
        {exporting ? `${Math.max(1, exportJobCount)} exports` : 'Export'}
      </button>
      <div title="Account" style={{ width: 20, height: 20, borderRadius: '50%', marginLeft: 2, background: 'conic-gradient(from 210deg, #6d6cff, #ff5f9e, #ffb35f, #6d6cff)', flexShrink: 0 }} />
      </div>
      {mcpOpen && <McpGuideDialog onClose={() => setMcpOpen(false)} />}
    </header>
  );
}
