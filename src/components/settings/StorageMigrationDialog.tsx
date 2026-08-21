// Storage migration dialog: move the project store from JSON files to a
// single SQLite database. User-initiated only; the JSON directory stays
// read-only forever afterwards. Visual vocabulary follows MediaCleanupDialog.
import { useCallback, useEffect, useState } from 'react';
import { theme, themeAlpha } from '../../theme';
import { Icon } from '../icons';
import { fetchWithEditorSession } from '../../persist/projectStoreTransport';
import { cleanupLegacyJson, loadMigrationStatus, STORAGE_MIGRATED_EVENT, type MigrationStatus } from './storageMigration';

interface MigrateResponse {
  summary?: { imported: number; skipped: number; quarantined: number };
  status?: MigrationStatus;
  error?: string;
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 120, background: themeAlpha.shadow(0.55),
  display: 'grid', placeItems: 'center',
};
const panel: React.CSSProperties = {
  width: 480, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 96px)',
  display: 'flex', flexDirection: 'column',
  background: theme.panel, border: `0.5px solid ${theme.borderLight}`, borderRadius: 6,
  boxShadow: `0 24px 64px ${themeAlpha.shadow(0.5)}`, color: theme.text,
};
const head: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px',
  borderBottom: `0.5px solid ${theme.border}`,
};
const title: React.CSSProperties = { fontSize: 13.5, fontWeight: 600 };
const sub: React.CSSProperties = { color: theme.textDim, fontSize: 12 };
const miniBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer',
  fontSize: 13, padding: '2px 6px', borderRadius: 5, marginLeft: 'auto',
};
const body: React.CSSProperties = { padding: '12px 16px', overflowY: 'auto' };
const stateRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '5px 0', fontSize: 12.5,
};
const stateLabel: React.CSSProperties = { color: theme.textMuted };
const stateValue: React.CSSProperties = { fontWeight: 550 };
const notice: React.CSSProperties = {
  color: theme.textDim, fontSize: 12.5, lineHeight: 1.6, margin: '10px 0 4px',
};
const warnLine: React.CSSProperties = { color: theme.gold, fontSize: 12.5, lineHeight: 1.6, marginTop: 4 };
const message: React.CSSProperties = { fontSize: 12.5, padding: '2px 0 6px' };
const footer: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end',
  padding: '12px 16px', borderTop: `0.5px solid ${theme.border}`,
};
const secondaryBtn: React.CSSProperties = {
  background: 'transparent', border: `0.5px solid ${theme.border}`, color: theme.text,
  cursor: 'pointer', fontSize: 12.5, padding: '6px 14px', borderRadius: 4,
};
const primaryBtn: React.CSSProperties = {
  background: theme.accent, border: 'none', color: theme.onAccent, cursor: 'pointer',
  fontSize: 12.5, padding: '6px 14px', borderRadius: 4,
};
const primaryBtnDisabled: React.CSSProperties = { ...primaryBtn, opacity: 0.5, cursor: 'default' };

export function StorageMigrationDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupConfirmed, setCleanupConfirmed] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await loadMigrationStatus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const migrate = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetchWithEditorSession('/api/project-store/migrate', { method: 'POST' });
      const body = await response.json() as MigrateResponse;
      if (!response.ok) {
        setError(body.error ?? 'Migration failed');
        return;
      }
      if (body.status?.phase !== 'complete' || !body.status.receipt || body.status.enabled !== true) {
        setError(body.status?.error ?? 'Migration is not complete; the JSON file directory remains active');
        setStatus(body.status ?? await loadMigrationStatus());
        return;
      }
      setResult(`Migrated ${body.summary?.imported ?? 0} entries, skipped ${body.summary?.skipped ?? 0}` + ', and new projects will now use SQLite by default');
      setStatus(body.status);
      // Emit completion only after the authoritative SQLite receipt is visible.
      window.dispatchEvent(new Event(STORAGE_MIGRATED_EVENT));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const migrated = status?.enabled === true;

  const cleanup = async () => {
    setCleanupBusy(true);
    setError(null);
    try {
      const body = await cleanupLegacyJson();
      setResult(`Removed ${body.removed} old JSON files`);
      setCleanupOpen(false);
      setCleanupConfirmed(false);
      setStatus(await loadMigrationStatus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCleanupBusy(false);
    }
  };

  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={panel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={head}>
          <span style={{ color: theme.accent, display: 'inline-flex' }}><Icon name="database" size={15} /></span>
          <b style={title}>Data storage</b>
          <span style={sub}>Project data storage</span>
          <button type="button" onClick={onClose} style={miniBtn} title="Close">✕</button>
        </div>

        <div style={body}>
          {status && (
            <div>
              <div style={stateRow}>
                <span style={stateLabel}>Current storage</span>
                <b style={{ ...stateValue, color: migrated ? theme.success : undefined }}>
                  {migrated ? 'SQLite database' : 'JSON file directory'}
                </b>
              </div>
              <div style={stateRow}>
                <span style={stateLabel}>Local data entries</span>
                <span style={stateValue}>{status.jsonKeyCount}</span>
              </div>
              {status.receipt && (
                <div style={stateRow}>
                  <span style={stateLabel}>Migrated at</span>
                  <span>{new Date(status.receipt.importedAt).toLocaleString()}</span>
                </div>
              )}
              {status.sqliteKeyCount > 0 && (
                <div style={stateRow}>
                  <span style={stateLabel}>SQLite entries</span>
                  <span>{status.sqliteKeyCount}</span>
                </div>
              )}
            </div>
          )}

          <div style={notice}>
            After migration, project data lives in a single SQLite database: transactional writes, faster loads and full-text search. The original JSON files stay read-only, so older versions, rollbacks and data rescue always work.
            <div style={warnLine}>
              New edits go to SQLite after migration; if you roll back to an older version, edits made after migration will not appear there.
            </div>
          </div>

          {error && <div style={{ ...message, color: theme.danger }}>{error}</div>}
          {result && <div style={{ ...message, color: theme.success }}>{result}</div>}
        </div>

        <div style={footer}>
          <button type="button" style={secondaryBtn} onClick={onClose}>Close</button>
          {!migrated && (
            <button
              type="button"
              style={busy ? primaryBtnDisabled : primaryBtn}
              disabled={busy}
              onClick={() => { void migrate(); }}
            >
              {busy ? 'Migrating…' : 'Migrate to SQLite'}
            </button>
          )}
          {migrated && (status?.jsonKeyCount ?? 0) > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', marginTop: 10 }}>
              <button
                type="button"
                style={secondaryBtn}
                onClick={() => setCleanupOpen((open) => !open)}
              >
                {`Clean up old JSON data (${status?.jsonKeyCount ?? 0} files)`}
              </button>
              {cleanupOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: theme.text }}>
                    <input
                      type="checkbox"
                      checked={cleanupConfirmed}
                      onChange={(e) => setCleanupConfirmed(e.target.checked)}
                    />
                    I confirm the migration is complete and I do not need to roll back to the old version (old versions will see empty data after deletion)
                  </label>
                  <button
                    type="button"
                    style={cleanupConfirmed && !cleanupBusy ? primaryBtn : primaryBtnDisabled}
                    disabled={!cleanupConfirmed || cleanupBusy}
                    onClick={() => { void cleanup(); }}
                  >
                    {cleanupBusy ? 'Cleaning up…' : 'Confirm cleanup'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
