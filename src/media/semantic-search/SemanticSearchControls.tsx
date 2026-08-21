import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/icons';
import type { MediaAsset } from '../../editor/types';
import { isSemanticMedia } from './mediaFrames';
import { resolveSemanticPanelRect } from './semanticPanelPosition';
import { MAX_SEMANTIC_QUERY_LENGTH, type SemanticMatch } from './types';
import { useSemanticSearch } from './useSemanticSearch';
import {
  DEFAULT_SAMPLING_CONFIG,
  normalizeSamplingConfig,
  readSamplingConfig,
  writeSamplingConfig,
  type SemanticSamplingConfig,
} from './samplingConfig';
import { showAppToast } from '../../ui/appToast';
import './semantic-search.css';

interface SemanticSearchControlsProps {
  scopeId: string;
  assets: MediaAsset[];
  onResultsChange: (matches: SemanticMatch[] | null) => void;
  openRequest?: number;
}

export function SemanticSearchControls({ scopeId, assets, onResultsChange, openRequest = 0 }: SemanticSearchControlsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);
  const semantic = useSemanticSearch(scopeId, assets);
  const visualAssets = useMemo(() => assets.filter(isSemanticMedia), [assets]);
  const names = useMemo(() => new Map(assets.map((asset) => [asset.id, asset.name])), [assets]);
  useEffect(() => {
    onResultsChange(searchedQuery ? semantic.state.matches : null);
  }, [onResultsChange, searchedQuery, semantic.state.matches]);
  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);
  return <div ref={anchorRef} className="cc-semantic-anchor">
    <button type="button" className={`cc-media-icon cc-semantic-trigger cc-tip${open || searchedQuery ? ' active' : ''}`}
      aria-label="Semantic search" data-tip="Local semantic search" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen((value) => !value)}>
      <Icon name="sparkles" size={17} />
    </button>
    {open && <SemanticPanelPortal anchorRef={anchorRef} assets={visualAssets} names={names} query={query} setQuery={setQuery}
      setSearchedQuery={setSearchedQuery} semantic={semantic} onClose={() => setOpen(false)} />}
  </div>;
}

type SemanticApi = ReturnType<typeof useSemanticSearch>;

interface SemanticPanelProps {
  assets: MediaAsset[];
  names: Map<string, string>;
  query: string;
  setQuery: (value: string) => void;
  setSearchedQuery: (value: string) => void;
  semantic: SemanticApi;
  onClose: () => void;
}

function SemanticPanelPortal(props: SemanticPanelProps & { anchorRef: RefObject<HTMLDivElement | null> }) {
  const { anchorRef, onClose } = props;
  const panelRef = useRef<HTMLElement>(null);
  const position = useSemanticPanelPosition(anchorRef, panelRef);
  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [anchorRef, onClose]);
  return createPortal(<SemanticPanel {...props} panelRef={panelRef} style={position} />, document.body);
}

function useSemanticPanelPosition(
  anchorRef: RefObject<HTMLDivElement | null>,
  panelRef: RefObject<HTMLElement | null>,
): CSSProperties {
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const anchorRect = anchor.getBoundingClientRect();
      const bounds = anchor.closest('.cc-library-panel')?.getBoundingClientRect()
        ?? document.documentElement.getBoundingClientRect();
      setPosition(resolveSemanticPanelRect(
        anchorRect, bounds, { width: window.innerWidth, height: window.innerHeight }, panel.offsetHeight,
      ));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, panelRef]);
  return position;
}

function SemanticPanel(props: SemanticPanelProps & {
  panelRef: RefObject<HTMLElement | null>;
  style: CSSProperties;
}) {
  const { semantic } = props;
  const runSearch = () => {
    const next = props.query.trim();
    props.setSearchedQuery(next);
    void semantic.search(next);
  };
  const clearSearch = () => {
    props.setQuery('');
    props.setSearchedQuery('');
    void semantic.search('');
  };
  const rebuild = async () => {
    if (await semantic.reset()) await semantic.index();
  };
  const disable = () => {
    props.setQuery('');
    props.setSearchedQuery('');
    semantic.cancel();
  };
  return <section ref={props.panelRef} style={props.style} className="cc-semantic-panel" role="dialog" aria-label="Local semantic search">
    <PanelHeader onClose={props.onClose} />
    {semantic.state.status === 'idle' || semantic.state.status === 'error'
      ? <EnableView state={semantic.state} onEnable={() => void semantic.enable()}
          onInstall={() => void semantic.installAndEnable()} />
      : <ReadyView {...props} state={semantic.state} runSearch={runSearch} clearSearch={clearSearch}
          index={() => void semantic.index()} rebuild={() => void rebuild()} cancel={semantic.cancel} disable={disable} />}
  </section>;
}

function PanelHeader({ onClose }: { onClose: () => void; }) {
  return <header>
    <div><strong>Local semantic search</strong><span>Media never leaves this device</span></div>
    <button type="button" aria-label="Close" onClick={onClose}><Icon name="x" size={15} /></button>
  </header>;
}

interface ViewProps {
  state: SemanticApi['state'];
}

function EnableView({ state, onEnable, onInstall }: ViewProps & {
  onEnable: () => void;
  onInstall: () => void;
}) {
  const packAbsent = state.pack === 'absent' || state.pack === 'error';
  const packDownloading = state.pack === 'downloading';
  return <div className="cc-semantic-empty">
    <span className="cc-semantic-empty-icon"><Icon name="sparkles" size={18} /></span>
    <div><strong>Search by visual content</strong>
      <p>Indexing and search run entirely on this machine — assets never upload, and the editor is unaffected until you enable it.</p>
    </div>
    {packAbsent && (
      <div className="cc-semantic-pack-missing">
        <p>{state.pack === 'error'
          ? 'Model pack download failed — retry in Settings → Local models.'
          : 'First use requires downloading an optional model pack (~178 MB). The model runs locally; assets never leave this machine.'}</p>
        <button type="button" className="primary" onClick={onInstall}>
          <Icon name="download" size={13} />Download and enable
        </button>
      </div>
    )}
    {packDownloading && (
      <div className="cc-semantic-pack-missing">
        <p>{`Downloading the visual-semantics pack… ${state.packProgress}%`}</p>
      </div>
    )}
    {!packAbsent && !packDownloading && <>
      {state.error && <span className="cc-semantic-error">Semantic search is unavailable. Please try again.</span>}
      <button type="button" className="primary" onClick={onEnable}><Icon name="sparkles" size={13} />Enable local model</button>
    </>}
  </div>;
}

interface ReadyViewProps extends ViewProps, Omit<SemanticPanelProps, 'semantic' | 'onClose'> {
  runSearch: () => void;
  clearSearch: () => void;
  index: () => void;
  rebuild: () => void;
  cancel: () => void;
  disable: () => void;
}

function ReadyView(props: ReadyViewProps) {
  const { state } = props;
  if (state.status === 'loading') return <LoadingView state={state} cancel={props.cancel} />;
  const busy = state.status === 'indexing' || state.status === 'searching';
  return <div className="cc-semantic-ready">
    <form onSubmit={(event) => { event.preventDefault(); props.runSearch(); }}>
      <Icon name="search" size={15} />
      <input value={props.query} maxLength={MAX_SEMANTIC_QUERY_LENGTH} onChange={(event) => props.setQuery(event.target.value)} placeholder="For example: seaside sunset, city at night" disabled={busy} />
      {props.query && <button type="button" onClick={props.clearSearch}><Icon name="x" size={14} /></button>}
      <button type="submit" className="primary" disabled={busy || !props.query.trim()}>Search</button>
    </form>
    <IndexStatus {...props} />
    <SamplingSettings />
    <SearchResults state={state} names={props.names} />
    <TextResults state={state} names={props.names} />
    <DuplicateResults state={state} names={props.names} />
  </div>;
}

function LoadingView({ state, cancel }: ViewProps & { cancel: () => void }) {
  return <div className="cc-semantic-loading">
    <strong>Preparing the local model…</strong>
    <progress max={100} value={state.modelProgress} />
    <span>{Math.round(state.modelProgress)}% · {state.device === 'webgpu' ? 'GPU accelerated' : 'CPU mode'}</span>
    <button type="button" onClick={cancel}>Cancel</button>
  </div>;
}

function IndexStatus(props: ReadyViewProps) {
  const { assets, state } = props;
  const indexing = state.status === 'indexing';
  const allIndexed = assets.length > 0 && state.indexedAssets >= assets.length;
  return <div className="cc-semantic-index-status">
    <div><strong>{indexing ? 'Building index…' : 'Local index'}</strong><span>{indexing
      ? `Processed ${state.indexedAssets} / ${state.totalAssets}`
      : `Indexed ${Math.min(state.indexedAssets, assets.length)} / ${assets.length} visual assets`}</span></div>
    {indexing ? <button type="button" onClick={props.cancel}>Cancel</button> : <div>
      <button type="button" disabled={allIndexed || assets.length === 0} onClick={props.index}>Index new media</button>
      <button type="button" onClick={props.rebuild}>Rebuild</button>
      <button type="button" onClick={props.disable}>Disable local model</button>
    </div>}
    {state.skippedAssets > 0 && <small>{`${state.skippedAssets} assets could not be decoded and were skipped`}</small>}
  </div>;
}

function SearchResults({ state, names }: ViewProps & { names: Map<string, string> }) {
  if (state.matches.length === 0) return null;
  return <div className="cc-semantic-results">
    <strong>{`${state.matches.length} semantic results`}</strong>
    {state.matches.slice(0, 5).map((match) => <span key={`${match.assetId}:${match.sampleTime}`}>
      <b>{names.get(match.assetId) ?? match.assetId}</b>
      <em>{match.sampleTime > 0 ? formatTime(match.sampleTime) : `${Math.round(match.score * 100)}%`}</em>
    </span>)}
  </div>;
}

function describeTextHit(ref: string): string {
  const separator = ref.lastIndexOf(':');
  if (separator <= 0) return ref;
  const prefix = ref.slice(0, separator);
  const tail = ref.slice(separator + 1);
  if (prefix.startsWith('chat:')) return `Chat message ${Number(tail) + 1}`;
  if (tail === 'captions') return 'Captions';
  if (tail === 'transcript') return 'Transcript';
  return ref;
}

function TextResults({ state }: ViewProps & { names: Map<string, string> }) {
  if (state.textHits.length === 0) return null;
  return <div className="cc-semantic-results">
    <strong>{`Related text (${state.textHits.length})`}</strong>
    {state.textHits.slice(0, 5).map((hit) => <span key={`${hit.kind}:${hit.ref}`}>
      <b>{describeTextHit(hit.ref)}</b>
      <em>{hit.kind}</em>
    </span>)}
  </div>;
}

function DuplicateResults({ state, names }: ViewProps & { names: Map<string, string> }) {
  if (state.duplicates.length === 0) return null;
  return <div className="cc-semantic-results">
    <strong>Possible duplicate media</strong>
    {state.duplicates.slice(0, 3).map((match) => <span key={`${match.leftAssetId}:${match.rightAssetId}`}>
      <b>{names.get(match.leftAssetId)} ↔ {names.get(match.rightAssetId)}</b>
      <em>{Math.round(match.score * 100)}%</em>
    </span>)}
  </div>;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

function SamplingSettings() {
  const [draft, setDraft] = useState<SemanticSamplingConfig>(() => readSamplingConfig());
  const update = (field: keyof SemanticSamplingConfig) => (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setDraft((current) => ({ ...current, [field]: Number(event.target.value) }));
  };
  const save = () => {
    writeSamplingConfig(normalizeSamplingConfig(draft));
    showAppToast('Sampling settings saved. Rebuild the index for changes to apply.');
  };
  const reset = () => {
    writeSamplingConfig(DEFAULT_SAMPLING_CONFIG);
    setDraft(DEFAULT_SAMPLING_CONFIG);
    showAppToast('Sampling settings reset. Rebuild the index for changes to apply.');
  };
  return <details className="cc-semantic-sampling">
    <summary>Sampling settings</summary>
    <p className="cc-semantic-sampling-note">Index frame sampling and search parameters; applies to web and desktop. Rebuild the index for indexing-related changes to take effect.</p>
    <label>
      <span>Fallback interval (s)</span>
      <input type="number" min={1} max={300} value={draft.intervalSeconds}
        onChange={update('intervalSeconds')} />
    </label>
    <label>
      <span>Max fallback frames</span>
      <input type="number" min={1} max={480} value={draft.maxFallbackFrames}
        onChange={update('maxFallbackFrames')} />
    </label>
    <label>
      <span>Scene-aware cap</span>
      <input type="number" min={1} max={480} value={draft.maxSceneFrames}
        onChange={update('maxSceneFrames')} />
    </label>
    <label>
      <span>Search result count</span>
      <input type="number" min={1} max={100} value={draft.resultLimit}
        onChange={update('resultLimit')} />
    </label>
    <label>
      <span>Search result relative floor</span>
      <input type="number" min={0} max={1} step={0.01} value={draft.relativeFloor}
        onChange={update('relativeFloor')} />
    </label>
    <label>
      <span>Duplicate similarity threshold</span>
      <input type="number" min={0} max={0.999} step={0.001} value={draft.duplicateThreshold}
        onChange={update('duplicateThreshold')} />
    </label>
    <label>
      <span>Long-video threshold (s)</span>
      <input type="number" min={10} max={600} value={draft.longVideoSeconds}
        onChange={update('longVideoSeconds')} />
    </label>
    <div className="cc-semantic-sampling-actions">
      <button type="button" onClick={save}>Save</button>
      <button type="button" onClick={reset}>Reset defaults</button>
    </div>
  </details>;
}
