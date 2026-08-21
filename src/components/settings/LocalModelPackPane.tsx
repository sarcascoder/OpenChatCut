import { useCallback, useEffect, useState } from 'react';
import { theme } from '../../theme';
import {
  cancelModelPackInstall,
  deleteModelPack,
  fetchModelPackCatalog,
  installModelPack,
  type ModelPackCatalogEntry,
  type ModelPackId,
} from '../../../shared/model-packs';
import { executeModelPackMutation, type ModelPackMutation } from './model-pack-actions';

const POLL_MS = 1_000;
type PackErrors = Partial<Record<ModelPackId, string | undefined>>;

function formatBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GB` : `${Math.round(mib)} MB`;
}

function progressPercent(pack: ModelPackCatalogEntry): number {
  const task = pack.task;
  if (!task || task.status !== 'downloading') return 0;
  if (task.bytesTotal > 0) return Math.min(100, Math.round(task.bytesDone / task.bytesTotal * 100));
  if (task.filesTotal > 0) return Math.min(100, Math.round(task.filesDone / task.filesTotal * 100));
  return 0;
}

function usePackCatalog() {
  const [packs, setPacks] = useState<readonly ModelPackCatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setPacks(await fetchModelPackCatalog());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const downloading = (packs ?? []).some((pack) => pack.status === 'downloading');
  useEffect(() => {
    if (!downloading) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [downloading, refresh]);
  return { packs, loadError, refresh };
}

function usePackActions(refresh: () => Promise<void>) {
  const [busyId, setBusyId] = useState<ModelPackId | null>(null);
  const [errors, setErrors] = useState<PackErrors>({});
  const perform = useCallback(async (id: ModelPackId, action: ModelPackMutation) => {
    setBusyId(id);
    setErrors((current) => ({ ...current, [id]: undefined }));
    try {
      await executeModelPackMutation(id, action);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors((current) => ({ ...current, [id]: message }));
    } finally {
      setBusyId(null);
    }
  }, [refresh]);
  return {
    busyId,
    errors,
    cancel: (id: ModelPackId) => perform(id, cancelModelPackInstall),
    install: (id: ModelPackId) => perform(id, installModelPack),
    remove: (id: ModelPackId) => perform(id, deleteModelPack),
  };
}

interface LocalModelPackPaneProps {
  packIds: readonly ModelPackId[];
  title?: string;
  description?: string;
}

export function LocalModelPackPane({ packIds, title = 'Local intelligence models', description = 'Models are never installed automatically. Once installed, beat and music-semantic analysis runs locally.' }: LocalModelPackPaneProps) {
  const { packs, loadError, refresh } = usePackCatalog();
  const actions = usePackActions(refresh);
  const visiblePacks = packs?.filter((pack) => packIds.includes(pack.id)) ?? [];
  return (
    <section style={sectionStyle} aria-labelledby="local-model-packs-heading">
      <div>
        <div id="local-model-packs-heading" style={{ fontSize: 12.5, fontWeight: 650 }}>{title}</div>
        <div style={{ marginTop: 3, fontSize: 11.5, color: theme.textDim }}>{description}</div>
      </div>
      {loadError && <div role="alert" style={errorStyle}>{`Cannot load model packs: ${loadError}`}</div>}
      {!loadError && !packs && <div style={hintStyle}>Loading…</div>}
      {visiblePacks.map((pack) => (
        <PackCard key={pack.id} pack={pack} busy={actions.busyId === pack.id}
          error={actions.errors[pack.id]} install={actions.install} remove={actions.remove}
          cancel={actions.cancel} />
      ))}
    </section>
  );
}

interface PackCardProps {
  pack: ModelPackCatalogEntry;
  busy: boolean;
  error?: string;
  install: (id: ModelPackId) => Promise<unknown>;
  remove: (id: ModelPackId) => Promise<unknown>;
  cancel: (id: ModelPackId) => Promise<unknown>;
}

function PackCard({ pack, busy, error: actionError, install, remove, cancel }: PackCardProps) {
  const error = actionError ?? pack.error ?? pack.task?.error;
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 650 }}>{pack.label}</span>
            <PackStatus pack={pack} />
          </div>
          <PackMetadata pack={pack} />
        </div>
        <PackActions pack={pack} busy={busy} install={install} remove={remove} cancel={cancel} />
      </div>
      {pack.status === 'downloading' && <PackProgress pack={pack} />}
      {error && <div role="alert" style={{ ...errorStyle, marginTop: 7 }}>{error}</div>}
    </div>
  );
}


function PackMetadata({ pack }: { pack: ModelPackCatalogEntry }) {
  return <>
    <div style={{ marginTop: 3, fontSize: 11, color: theme.textDim }}>
      {formatBytes(pack.sizeBytes)} · {pack.license} · {`Recommended memory ${formatBytes(pack.recommendedMemoryBytes)}`}
    </div>
    <div style={{ marginTop: 5, fontSize: 11.5, color: theme.text }}>
      {pack.capabilities.map((capability) => capability).join(' · ')}
    </div>
    <div style={{ marginTop: 3, fontSize: 11, color: theme.textDim }}>{pack.description}</div>
  </>;
}

function PackProgress({ pack }: { pack: ModelPackCatalogEntry }) {
  const percent = progressPercent(pack);
  return <div style={{ marginTop: 8 }}>
    <div style={progressTrack}><div style={{ ...progressFill, width: `${percent}%` }} /></div>
    <div style={{ marginTop: 3, fontSize: 10.5, color: theme.textDim }}>
      {`Installing ${percent}% (${pack.task?.filesDone ?? 0}/${pack.task?.filesTotal ?? pack.files.length} files)`}
    </div>
  </div>;
}

function PackStatus({ pack }: { pack: ModelPackCatalogEntry }) {
  const display = pack.status === 'installed'
    ? { text: 'Installed', color: theme.success }
    : pack.status === 'downloading'
      ? { text: 'Installing', color: theme.accent }
      : pack.status === 'error'
        ? { text: 'Install error', color: theme.danger }
        : { text: 'Not installed', color: theme.textDim };
  return <span style={{ fontSize: 10.5, color: display.color }}>{display.text}</span>;
}

function PackActions({ pack, busy, install, remove, cancel }: Omit<PackCardProps, 'error'>) {
  if (pack.status === 'downloading') {
    return <button type="button" disabled={busy} onClick={() => void cancel(pack.id)} style={smallButton}>Cancel</button>;
  }
  if (pack.status === 'installed') {
    return <button type="button" disabled={busy} onClick={() => void remove(pack.id)} style={smallButton}>Delete</button>;
  }
  return <div style={{ display: 'flex', gap: 5 }}>
    {pack.status === 'error' && (
      <button type="button" disabled={busy} onClick={() => void remove(pack.id)} style={smallButton}>Delete</button>
    )}
    <button type="button" disabled={busy} onClick={() => void install(pack.id)} style={installButton}>
      {pack.status === 'error' ? 'Reinstall' : 'Install'}
    </button>
  </div>;
}

const sectionStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16, paddingTop: 14,
  borderTop: `0.5px solid ${theme.border}`,
};
const cardStyle: React.CSSProperties = {
  padding: '10px 11px', borderRadius: 6, border: `0.5px solid ${theme.border}`, background: theme.panel,
};
const hintStyle: React.CSSProperties = { fontSize: 11.5, color: theme.textDim };
const errorStyle: React.CSSProperties = { fontSize: 11, color: theme.danger, overflowWrap: 'anywhere' };
const smallButton: React.CSSProperties = {
  border: `1px solid ${theme.border}`, borderRadius: 6, background: 'transparent', color: theme.text,
  fontSize: 11, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
};
const installButton: React.CSSProperties = { ...smallButton, borderColor: theme.accent, color: theme.accent };
const progressTrack: React.CSSProperties = {
  height: 4, overflow: 'hidden', borderRadius: 2, background: theme.border,
};
const progressFill: React.CSSProperties = {
  height: '100%', borderRadius: 2, background: theme.accent, transition: 'width 180ms ease',
};
