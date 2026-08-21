// Dashboard banner inviting the user to migrate the project store to SQLite.
// Shown only while the store is still on JSON files, hidden on failure, and
// dismissible (localStorage) — never blocks the dashboard.
import { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { loadMigrationStatus, STORAGE_BANNER_DISMISS_KEY, STORAGE_MIGRATED_EVENT } from './storageMigration';

const bannerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  marginBottom: 18, padding: '9px 12px',
  background: theme.panelAlt, border: `0.5px solid ${theme.borderLight}`, borderRadius: 6,
  fontSize: 12.5, lineHeight: 1.5, color: theme.text,
};
const bannerText: React.CSSProperties = { flex: 1 };
const primaryBtn: React.CSSProperties = {
  background: theme.accent, border: 'none', color: theme.onAccent, cursor: 'pointer',
  fontSize: 12.5, padding: '6px 14px', borderRadius: 4, whiteSpace: 'nowrap',
};
const dismissBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer',
  fontSize: 12.5, padding: '4px 8px', borderRadius: 4, whiteSpace: 'nowrap',
};

export function StorageMigrationBanner({ onOpenDialog }: { onOpenDialog: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    try {
      if (localStorage.getItem(STORAGE_BANNER_DISMISS_KEY) === '1') return;
    } catch {
      return;
    }
    const check = () => loadMigrationStatus()
      .then((status) => { if (alive) setVisible(!status.enabled); })
      .catch(() => { /* banner is optional; never surface errors */ });
    void check();
    // A completed migration must hide the banner without a page reload.
    window.addEventListener(STORAGE_MIGRATED_EVENT, check);
    return () => {
      alive = false;
      window.removeEventListener(STORAGE_MIGRATED_EVENT, check);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_BANNER_DISMISS_KEY, '1'); } catch { /* best effort */ }
    setVisible(false);
  };

  return (
    <div style={bannerStyle} role="status">
      <span style={bannerText}>
        Migrate project data to SQLite: more reliable writes, faster loading, full-text search. Original JSON files stay read-only, so you can always roll back.
      </span>
      <button type="button" style={primaryBtn} onClick={onOpenDialog}>Migrate to SQLite</button>
      <button type="button" style={dismissBtn} onClick={dismiss}>Dismiss</button>
    </div>
  );
}
