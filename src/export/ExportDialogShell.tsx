import type { ReactNode } from 'react';
import { Icon } from '../components/icons';
import type { TimelineState } from '../editor/types';
import { EXPORT_TABS } from './useExportDialogModel';
import type { ExportTab } from './useExportWorkflow';

interface ExportDialogShellProps {
  base: string;
  state: TimelineState;
  onClose: () => void;
  children: ReactNode;
}

function ExportDialogHeader({ base, state, onClose }: Omit<ExportDialogShellProps, 'children'>) {
  return (
    <header className="cc-export-header">
      <div>
        <h2 id="cc-export-title">Export</h2>
        <p>{base} · {state.width}×{state.height} · {state.fps} fps</p>
      </div>
      <button type="button" className="cc-export-close" onClick={onClose} title="Close">
        <Icon name="x" size={16} />
      </button>
    </header>
  );
}

export function ExportDialogShell({ base, state, onClose, children }: ExportDialogShellProps) {
  return (
    <div className="cc-export-overlay" onClick={onClose}>
      <div
        className="cc-export-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cc-export-title"
        onClick={(event) => event.stopPropagation()}
      >
        <ExportDialogHeader base={base} state={state} onClose={onClose} />
        <div className="cc-export-layout">{children}</div>
      </div>
    </div>
  );
}

interface ExportSidebarProps {
  tab: ExportTab;
  busy: boolean;
  onTabChange: (tab: ExportTab) => void;
}

export function ExportSidebar({ tab, busy, onTabChange }: ExportSidebarProps) {
  return (
    <aside className="cc-export-sidebar">
      <span className="cc-export-sidebar-label">Output type</span>
      <div className="cc-export-tabs" role="tablist" aria-label="Output type">
        {EXPORT_TABS.map((entry) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            aria-controls={`cc-export-content-${entry.key}`}
            id={`cc-export-tab-${entry.key}`}
            key={entry.key}
            className={`cc-export-tab${tab === entry.key ? ' active' : ''}`}
            onClick={() => onTabChange(entry.key)}
            disabled={busy}
          >
            <span className="cc-export-tab-icon"><Icon name={entry.icon} size={15} /></span>
            <span><strong>{entry.label}</strong><small>{entry.summary}</small></span>
          </button>
        ))}
      </div>
    </aside>
  );
}
