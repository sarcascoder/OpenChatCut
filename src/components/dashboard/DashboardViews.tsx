import { useEffect } from 'react';
import type { ProjectMeta } from '../../persist/projectStoreCoordinators';
import { theme } from '../../theme';
import { MediaCleanupDialog } from '../../media/MediaCleanupDialog';
import { ShortcutsDialog } from '../../shortcuts/ShortcutsDialog';
import { DashboardHeaderLinks } from '../DashboardHeaderLinks';
import { BrandMark, Icon, OpenChatCutWordmark } from '../icons';
import { McpGuideDialog } from '../settings/McpGuide';
import { bindAction } from '../../shortcuts/actionRegistry';
import { SettingsDialog } from '../settings/SettingsDialog';
import { StorageMigrationDialog } from '../settings/StorageMigrationDialog';
import { StorageMigrationBanner } from '../settings/StorageMigrationBanner';
import { SkinPicker } from '../settings/SkinPicker';
import {
  card, importBtn, miniBtn, modelSetupButton, modelSetupCard, modelSetupIcon,
  nameInput, newCard, searchBox, searchClear, searchEmpty, searchIcon, searchInput,
  settingsBtn, thumb,
} from './dashboardStyles';
import { relativeProjectTime, type DashboardModel, type DashboardProps } from './useDashboardModel';

function ModelSetupCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section role="status" style={modelSetupCard}>
      <span style={modelSetupIcon}><Icon name="sparkles" size={18} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', color: theme.textStrong, fontSize: 13.5 }}>Configure a model to start using the Agent</strong>
        <span style={{ display: 'block', marginTop: 3, color: theme.textDim, fontSize: 11.5, lineHeight: 1.5 }}>
          Configure any cloud or local model to use conversational editing in the editor.
        </span>
      </span>
      <button type="button" onClick={onOpen} style={modelSetupButton}>Configure Model</button>
    </section>
  );
}

function ProjectSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label style={searchBox}>
      <span style={searchIcon}><Icon name="search" size={13} /></span>
      <input
        type="search"
        aria-label="Search projects"
        placeholder="Search projects"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') onChange(''); }}
        autoComplete="off"
        spellCheck={false}
        style={searchInput}
      />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search" style={searchClear}><Icon name="x" size={12} /></button>}
    </label>
  );
}

export function DashboardTitlebarContent({ model }: { model: DashboardModel }) {
  return (
    <>
      <BrandMark size={20} />
      <OpenChatCutWordmark />
      <span style={{ color: theme.textDim, fontSize: 13 }}>· My Projects</span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <DashboardHeaderLinks />
        <button onClick={() => model.setDialog('mcp', true)} data-tip="External agents (MCP)" aria-label="External agents (MCP)" className="cc-header-btn cc-tip cc-tip-r" style={settingsBtn}><Icon name="plug" size={16} /></button>
        <button onClick={() => model.setDialog('shortcuts', true)} data-tip="Edit keyboard shortcuts" aria-label="Edit keyboard shortcuts" className="cc-header-btn cc-tip cc-tip-r" style={settingsBtn}><Icon name="keyboard" size={16} /></button>
        <SkinPicker />
        <button onClick={() => model.setDialog('storage', true)} data-tip="Data storage" aria-label="Data storage" className="cc-header-btn cc-tip cc-tip-r" style={settingsBtn}><Icon name="database" size={16} /></button>
        <button onClick={() => model.setDialog('settings', true)} data-tip="Settings · API Keys" aria-label="Settings · API Keys" className="cc-header-btn cc-tip cc-tip-r" style={settingsBtn}><Icon name="sliders" size={16} /></button>
      </span>
    </>
  );
}

function ProjectToolbar({ projects, model }: { projects: ProjectMeta[]; model: DashboardModel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Projects</h1>
      {model.transfer.note && <span style={{ color: theme.textDim, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.transfer.note}</span>}
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <ProjectSearch value={model.query} onChange={model.setQuery} />
        <button onClick={() => model.setDialog('cleanup', true)} style={importBtn} title="Clean up uploaded assets no project references (leftovers from tests/deleted projects)"><Icon name="trash" size={13} /> Clean Up Media</button>
        <button onClick={() => model.transfer.fileRef.current?.click()} disabled={model.transfer.busy} style={importBtn} title="Import a .ccproj project file (legacy .ccproj.json is also supported)"><Icon name="upload" size={13} /> Import Project</button>
        <input ref={model.transfer.fileRef} type="file" accept=".ccproj,.json,application/json,application/x-openchatcut-project" onChange={model.transfer.pickImport} style={{ display: 'none' }} />
        <span style={{ color: theme.textDim, fontSize: 12.5 }}>
          {model.normalizedQuery
            ? `${model.visibleProjects.length} of ${projects.length}`
            : `${projects.length} total`}
        </span>
      </span>
    </div>
  );
}

function ProjectName({ project, model }: { project: ProjectMeta; model: DashboardModel }) {
  if (model.rename.editingId === project.id) {
    return <input
      autoFocus
      value={model.rename.draft}
      onChange={(event) => model.rename.setDraft(event.target.value)}
      onBlur={model.rename.commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') model.rename.commit();
        if (event.key === 'Escape') model.rename.cancel();
      }}
      style={nameInput}
    />;
  }
  return <div onDoubleClick={() => model.rename.start(project)} title="Double-click to rename" style={{ fontSize: 13, fontWeight: 550, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.name}</div>;
}

function ProjectActions({ project, props, model }: { project: ProjectMeta; props: DashboardProps; model: DashboardModel }) {
  if (model.rename.confirmId === project.id) {
    return <button
      onClick={() => {
        void model.transfer.run(props.onDelete(project.id).then(() => `Permanently deleted “${project.name}”`));
        model.rename.setConfirmId(null);
      }}
      disabled={model.transfer.busy}
      style={{ ...miniBtn, color: theme.danger }}
      title="Permanently delete this project and purge assets only it references"
    >Confirm Delete</button>;
  }
  return (
    <>
      <button onClick={() => model.rename.start(project)} style={miniBtn} title="Rename"><Icon name="pencil" size={13} /></button>
      <button onClick={() => props.onDuplicate(project.id)} style={miniBtn} title="Duplicate"><Icon name="copy" size={13} /></button>
      <button onClick={() => void model.transfer.run(props.onExport(project.id, project.name))} disabled={model.transfer.busy} style={miniBtn} title="Export as streaming .ccproj (with assets; importable on another machine)"><Icon name="download" size={13} /></button>
      <button onClick={() => model.rename.setConfirmId(project.id)} style={miniBtn} title="Delete"><Icon name="trash" size={13} /></button>
    </>
  );
}

function ProjectCard({ project, props, model }: { project: ProjectMeta; props: DashboardProps; model: DashboardModel }) {
  return (
    <div style={card}>
      <button onClick={() => props.onOpen(project.id)} style={thumb} title={`Open ${project.name}`}>
        {model.thumbs[project.id]
          ? <img src={model.thumbs[project.id]} alt="" draggable={false} loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          : <span style={{ color: theme.borderLight, display: 'inline-flex' }}><Icon name="play" size={26} /></span>}
      </button>
      <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ProjectName project={project} model={model} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: theme.textDim, fontVariantNumeric: 'tabular-nums' }}>{relativeProjectTime(project.updatedAt)}</span>
          <div style={{ display: 'flex', gap: 2 }} className="acts"><ProjectActions project={project} props={props} model={model} /></div>
        </div>
      </div>
    </div>
  );
}

function ProjectGrid({ props, model }: { props: DashboardProps; model: DashboardModel }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))', alignItems: 'start', gap: 16 }}>
        <button onClick={props.onNew} style={newCard} title="New Project">
          <span style={{ fontSize: 30, color: theme.textDim, lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 13, color: theme.textDim }}>New Project</span>
        </button>
        {model.visibleProjects.map((project) => <ProjectCard key={project.id} project={project} props={props} model={model} />)}
      </div>
      {model.normalizedQuery && model.visibleProjects.length === 0 && (
        <div role="status" style={searchEmpty}><Icon name="search" size={14} />{`No projects match “${model.query.trim()}”`}</div>
      )}
    </>
  );
}

export function DashboardContent({ props, model }: { props: DashboardProps; model: DashboardModel }) {
  return (
    <main style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 24px 80px' }}>
        <StorageMigrationBanner onOpenDialog={() => model.setDialog('storage', true)} />
        {model.modelSnapshot.loaded && model.modelSnapshot.choices.length === 0 && <ModelSetupCard onOpen={() => model.setDialog('settings', true)} />}
        <ProjectToolbar projects={props.projects} model={model} />
        <ProjectGrid props={props} model={model} />
      </div>
    </main>
  );
}

export function DashboardDialogs({ model }: { model: DashboardModel }) {
  // The settings dialog's Anthropic pane summons the MCP guide through the
  // action registry; in the editor the top bar answers, here the dashboard's
  // own dialog state does. Without this the button silently does nothing on
  // the projects page, which is exactly where a new user starts.
  useEffect(() => bindAction('open-mcp-guide', () => model.setDialog('mcp', true)), [model]);
  return (
    <>
      {model.dialogs.settings && <SettingsDialog onClose={() => model.setDialog('settings', false)} />}
      {model.dialogs.shortcuts && <ShortcutsDialog onClose={() => model.setDialog('shortcuts', false)} />}
      {model.dialogs.mcp && <McpGuideDialog onClose={() => model.setDialog('mcp', false)} />}
      {model.dialogs.cleanup && <MediaCleanupDialog onClose={() => model.setDialog('cleanup', false)} />}
      {model.dialogs.storage && <StorageMigrationDialog onClose={() => model.setDialog('storage', false)} />}
    </>
  );
}
