import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/icons';
import type { InstallResult } from '../plugins/install';
import { removePack, setPackEnabled } from '../plugins/store';
import { theme } from '../theme';
import { ExtensionDiscover } from './ExtensionDiscover';
import { ExtensionInstalled } from './ExtensionInstalled';
import {
  CENTER_TABS,
  parseRegistry,
  secondaryButton,
  type Category,
  type CenterTab,
  type RegistryEntry,
} from './ExtensionCenterModel';
import { usePluginPacks } from './pluginResources';

interface ExtensionCenterProps {
  onClose: () => void;
}

const REGISTRY_URL = import.meta.env.VITE_RESOURCE_REGISTRY_URL
  || 'https://openchatcut.com/api/resources/extensions';
const REGISTRY_CACHE_KEY = 'cc.extension-registry.en';

function readRegistryCache(): RegistryEntry[] {
  try {
    return parseRegistry(JSON.parse(localStorage.getItem(REGISTRY_CACHE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

function saveRegistryCache(entries: RegistryEntry[]): void {
  try {
    localStorage.setItem(REGISTRY_CACHE_KEY, JSON.stringify(entries));
  } catch { /* Unavailability of cache does not affect online discovery*/ }
}

async function fetchRegistry(signal: AbortSignal): Promise<RegistryEntry[]> {
  const url = new URL(REGISTRY_URL, window.location.origin);
  url.searchParams.set('locale', 'en');
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Registry request failed: ${response.status}`);
  return parseRegistry(await response.json());
}

function useRegistry(query: string, category: Category) {
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [syncFailed, setSyncFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setRegistry(readRegistryCache());
    setSyncFailed(false);
    void fetchRegistry(controller.signal).then((entries) => {
      setRegistry(entries);
      saveRegistryCache(entries);
    }).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setSyncFailed(true);
    });
    return () => controller.abort();
  }, []);
  const entries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return registry.filter((entry) => {
      if (category !== 'All' && !entry.categories.includes(category)) return false;
      return !needle || `${entry.name} ${entry.description ?? ''} ${entry.author ?? ''}`.toLocaleLowerCase().includes(needle);
    });
  }, [registry, query, category]);
  return { entries, syncFailed };
}

function useExtensionActions(onInstalled: () => void) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const runInstall = (id: string, task: Promise<InstallResult>) => {
    setBusyId(id); setStatus(null);
    void task.then((result) => {
      setBusyId(null);
      if (result.ok) {
        setStatus({ ok: true, text: `Installed "${result.pack.name}"` });
        onInstalled();
        return;
      }
      setStatus({ ok: false, text: result.errors.slice(0, 3).join('; ') });
    }).catch((error) => {
      setBusyId(null);
      setStatus({ ok: false, text: error instanceof Error ? error.message : String(error) });
    });
  };
  const runAction = (id: string, task: Promise<void>, success: string, onSuccess?: () => void) => {
    setBusyId(id); setStatus(null);
    void task.then(() => {
      setBusyId(null); setStatus({ ok: true, text: success }); onSuccess?.();
    }).catch((error) => {
      setBusyId(null);
      setStatus({ ok: false, text: error instanceof Error ? error.message : String(error) });
    });
  };
  return { busyId, status, runInstall, runAction };
}

function CenterHeader({ tab, installedCount, onTab, onClose, showLocalInstall, onLocalInstall }: {
  tab: CenterTab;
  installedCount: number;
  onTab: (tab: CenterTab) => void;
  onClose: () => void;
  showLocalInstall: boolean;
  onLocalInstall: () => void;
}) {
  return (
    <header style={{ borderBottom: `0.5px solid ${theme.border}`, padding: '11px 14px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <button type="button" onClick={onClose} aria-label="Back to library" style={{ ...secondaryButton(), padding: 4, display: 'grid', placeItems: 'center' }}><Icon name="prev" size={14} /></button>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: theme.textStrong, fontSize: 14, fontWeight: 700 }}>Extension Center</div>
          <div style={{ color: theme.textDim, fontSize: 10.5 }}>Discover, manage, and share creative extension packs</div>
        </div>
        <span style={{ flex: 1 }} />
        {tab === 'Discover' && <button type="button" onClick={onLocalInstall} style={secondaryButton()}>{showLocalInstall ? 'Hide install' : 'Install'}</button>}
      </div>
      <nav style={{ display: 'flex', gap: 18, marginTop: 11 }}>
        {CENTER_TABS.map((item) => (
          <button key={item} type="button" onClick={() => onTab(item)} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === item ? theme.accent : 'transparent'}`, color: tab === item ? theme.textStrong : theme.textDim, padding: '0 1px 7px', fontSize: 11.5, fontWeight: tab === item ? 650 : 500, cursor: 'pointer' }}>
            {item}{item === 'Installed' && installedCount > 0 ? ` ${installedCount}` : ''}
          </button>
        ))}
      </nav>
    </header>
  );
}

export function ExtensionCenter({ onClose }: ExtensionCenterProps) {
  const packs = usePluginPacks();
  const [tab, setTab] = useState<CenterTab>('Discover');
  const [category, setCategory] = useState<Category>('All');
  const [query, setQuery] = useState('');
  const [showLocalInstall, setShowLocalInstall] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const registry = useRegistry(query, category);
  const actions = useExtensionActions(() => {
    setTab('Installed');
    setShowLocalInstall(false);
  });
  return (
    <section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: theme.panel }}>
      <CenterHeader tab={tab} installedCount={packs.length} onTab={setTab} onClose={onClose} showLocalInstall={showLocalInstall} onLocalInstall={() => setShowLocalInstall((value) => !value)} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
        {actions.status && <div style={{ marginBottom: 10, padding: '7px 9px', border: `0.5px solid ${actions.status.ok ? theme.success : theme.danger}`, borderRadius: 3, background: theme.panelAlt, color: actions.status.ok ? theme.text : theme.danger, fontSize: 11 }}>{actions.status.text}</div>}
        {tab === 'Discover' && registry.syncFailed && <div style={{ marginBottom: 10, color: theme.textDim, fontSize: 10.5 }}>Official resources are temporarily unavailable. Showing the last synced content.</div>}
        {tab === 'Discover' && <ExtensionDiscover entries={registry.entries} packs={packs} busyId={actions.busyId} showLocalInstall={showLocalInstall} query={query} category={category} onQuery={setQuery} onCategory={setCategory} onInstall={actions.runInstall} />}
        {tab === 'Installed' && (
          <ExtensionInstalled
            packs={packs}
            busyId={actions.busyId}
            expandedId={expandedId}
            confirmId={confirmId}
            onExpand={setExpandedId}
            onConfirm={setConfirmId}
            onToggle={(pack) => actions.runAction(pack.id, setPackEnabled(pack.id, !pack.enabled), pack.enabled ? `Disabled "${pack.name}"` : `Enabled "${pack.name}"`)}
            onRemove={(pack) => actions.runAction(pack.id, removePack(pack.id), `Uninstalled "${pack.name}"`, () => {
              setConfirmId(null);
              setExpandedId(null);
            })}
          />
        )}
      </div>
    </section>
  );
}
