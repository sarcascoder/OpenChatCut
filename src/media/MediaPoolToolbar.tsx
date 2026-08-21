import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { MusicAutoAnalysisPreference } from '../audio/intelligence/MusicAnalysisBadge';
import { Icon } from '../components/icons';
import type { MediaAsset } from '../editor/types';
import { SemanticSearchControls } from './semantic-search/SemanticSearchControls';
import type { SemanticMatch } from './semantic-search/types';
import type { MediaSortKey, MediaTypeFilter } from './mediaPoolFilter';
import { mediaViewToggleLabel } from './mediaView';
import { DirectoryImportActions } from './DirectoryImportActions';

export type MediaToolbarMenu = 'sort' | 'filter' | 'actions' | null;
const SORT_OPTIONS = [['newest', 'Newest first'], ['name', 'Name A–Z'], ['duration', 'Duration']] as const;
const FILTER_OPTIONS = [['all', 'All'], ['video', 'Video'], ['image', 'Image'], ['gif', 'GIF'], ['svg', 'SVG'], ['audio', 'Audio']] as const;

interface MediaPoolToolbarProps {
  scopeId: string;
  assets: MediaAsset[];
  query: string;
  sort: MediaSortKey;
  type: MediaTypeFilter;
  favoritesOnly: boolean;
  view: 'grid' | 'list';
  menu: MediaToolbarMenu;
  busy: boolean;
  uploadRatio: number | null;
  canAddSolid: boolean;
  semanticOpenRequest?: number;
  onQueryChange: (value: string) => void;
  onSemanticResults: (matches: SemanticMatch[] | null) => void;
  onUpload: () => void;
  onPickFolder?: () => void;
  onWatchFolder?: () => void;
  onStopWatch: () => void;
  watchingFolder: string | null;
  watchBusy: boolean;
  onMobileUpload: (restoreFocus: () => void) => void;
  onAddSolid: () => void;
  onCreateFolder: (restoreFocus: () => void) => void;
  onViewChange: () => void;
  onMenuChange: (menu: MediaToolbarMenu) => void;
  onSortChange: (sort: MediaSortKey) => void;
  onTypeChange: (type: MediaTypeFilter) => void;
  onFavoritesChange: () => void;
}

interface ToolbarMenuLifecycle {
  menuRef: RefObject<HTMLDivElement | null>;
  actionsStyle: CSSProperties;
  toggle: (menu: Exclude<MediaToolbarMenu, null>, anchor: HTMLButtonElement) => void;
  close: (restoreFocus?: boolean) => void;
  restoreFocus: () => void;
}

function useMenuLifecycleEffects(
  menu: MediaToolbarMenu,
  menuRef: RefObject<HTMLDivElement | null>,
  anchorRef: RefObject<HTMLButtonElement | null>,
  close: (restoreFocus?: boolean) => void,
  setActionsStyle: (style: CSSProperties) => void,
): void {
  useLayoutEffect(() => {
    if (!menu) return;
    const updatePosition = () => {
      if (!anchorRef.current || !menuRef.current) return;
      const anchor = anchorRef.current.getBoundingClientRect();
      const popover = menuRef.current.getBoundingClientRect();
      const left = Math.min(window.innerWidth - popover.width - 8, Math.max(8, anchor.right - popover.width));
      const top = anchor.bottom + popover.height + 8 <= window.innerHeight
        ? anchor.bottom + 4
        : Math.max(8, anchor.top - popover.height - 4);
      setActionsStyle({ left, top, visibility: 'visible' });
    };
    const isOutside = (target: Node) =>
      !menuRef.current?.contains(target) && !anchorRef.current?.contains(target);
    const onPointerDown = (event: PointerEvent) => { if (isOutside(event.target as Node)) close(); };
    const onFocus = (event: FocusEvent) => { if (isOutside(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
    };
    updatePosition();
    menuRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocus);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, close, menu, menuRef, setActionsStyle]);
}

function useToolbarMenuLifecycle(
  menu: MediaToolbarMenu,
  onMenuChange: (menu: MediaToolbarMenu) => void,
): ToolbarMenuLifecycle {
  const menuRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [actionsStyle, setActionsStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const restoreFocus = useCallback(() => {
    queueMicrotask(() => anchorRef.current?.focus());
  }, []);
  const close = useCallback((shouldRestoreFocus = false) => {
    onMenuChange(null);
    if (shouldRestoreFocus) restoreFocus();
  }, [onMenuChange, restoreFocus]);
  const toggle = useCallback((next: Exclude<MediaToolbarMenu, null>, anchor: HTMLButtonElement) => {
    anchorRef.current = anchor;
    onMenuChange(menu === next ? null : next);
  }, [menu, onMenuChange]);
  useMenuLifecycleEffects(menu, menuRef, anchorRef, close, setActionsStyle);
  return { menuRef, actionsStyle, toggle, close, restoreFocus };
}

export function MediaPoolToolbar(props: MediaPoolToolbarProps) {
  const lifecycle = useToolbarMenuLifecycle(props.menu, props.onMenuChange);
  return (
    <div className="cc-media-toolbar">
      <label className="cc-media-search">
        <Icon name="search" size={16} />
        <input aria-label="Search media" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="Search" />
      </label>
      <SemanticSearchControls scopeId={props.scopeId} assets={props.assets} onResultsChange={props.onSemanticResults} openRequest={props.semanticOpenRequest} />
      <button className="cc-media-icon cc-tip" aria-label="Upload media" data-tip="Upload media" disabled={props.busy} onClick={props.onUpload}><Icon name="upload" size={19} /></button>
      {props.busy && props.uploadRatio != null && <span className="cc-media-upload-pct" title="Uploading">{Math.round(props.uploadRatio * 100)}%</span>}
      <button className="cc-media-icon cc-tip" aria-label={mediaViewToggleLabel(props.view)} data-tip={mediaViewToggleLabel(props.view)} onClick={props.onViewChange}><Icon name={props.view === 'grid' ? 'list' : 'grid'} size={19} /></button>
      <SortMenu {...props} lifecycle={lifecycle} />
      <FilterMenu {...props} lifecycle={lifecycle} />
      <ActionsMenu {...props} lifecycle={lifecycle} />
    </div>
  );
}

type MenuProps = MediaPoolToolbarProps & { lifecycle: ToolbarMenuLifecycle };
function portalToolbarPopover(popover: ReactNode): ReactNode {
  return popover && typeof document !== 'undefined' ? createPortal(popover, document.body) : popover;
}


function SortMenu(props: MenuProps) {
  const open = props.menu === 'sort';
  const popover = open && <div
    ref={props.lifecycle.menuRef}
    role="dialog"
    aria-label="Sort media"
    className="cc-media-popover cc-media-sort-menu cc-media-toolbar-menu-fixed"
    style={props.lifecycle.actionsStyle}
  >
    {SORT_OPTIONS.map(([value, label]) => <button aria-pressed={props.sort === value} key={value} className={props.sort === value ? 'selected' : ''} onClick={() => { props.onSortChange(value); props.lifecycle.close(true); }}>{label}</button>)}
  </div>;
  return (
    <div className="cc-media-menu-anchor">
      <button className={`cc-media-icon cc-tip${open ? ' active' : ''}`} aria-label="Sort media" data-tip="Sort" aria-haspopup="dialog" aria-expanded={open} onClick={(event) => props.lifecycle.toggle('sort', event.currentTarget)}><Icon name="sort" size={19} /></button>
      {portalToolbarPopover(popover)}
    </div>
  );
}

function FilterMenu(props: MenuProps) {
  const open = props.menu === 'filter';
  const popover = open && <div
    ref={props.lifecycle.menuRef}
    role="dialog"
    aria-label="Filter media"
    className="cc-media-popover cc-media-filter-menu cc-media-toolbar-menu-fixed"
    style={props.lifecycle.actionsStyle}
  >
    {FILTER_OPTIONS.map(([value, label]) => <button aria-pressed={props.type === value} key={value} className={props.type === value ? 'selected' : ''} onClick={() => props.onTypeChange(value)}>{label}</button>)}
    <button aria-pressed={props.favoritesOnly} className={props.favoritesOnly ? 'selected' : ''} onClick={props.onFavoritesChange}><span className="cc-media-menu-label"><Icon name="star" size={13} filled={props.favoritesOnly} /> Favorite</span></button>
  </div>;
  return (
    <div className="cc-media-menu-anchor">
      <button className={`cc-media-icon cc-tip${open || props.type !== 'all' || props.favoritesOnly ? ' active' : ''}`} aria-label="Filter media" data-tip="Filter" aria-haspopup="dialog" aria-expanded={open} onClick={(event) => props.lifecycle.toggle('filter', event.currentTarget)}><Icon name="filter" size={19} /></button>
      {portalToolbarPopover(popover)}
    </div>
  );
}

function ActionsMenu(props: MenuProps) {
  const open = props.menu === 'actions';
  const run = (action: () => void, restoreFocus = false) => {
    action();
    props.lifecycle.close(restoreFocus);
  };
  const runModal = (action: (restoreFocus: () => void) => void) => {
    action(props.lifecycle.restoreFocus);
    props.lifecycle.close();
  };
  const popover = open && <div ref={props.lifecycle.menuRef} role="dialog" aria-label="More actions" className="cc-media-popover cc-media-actions-menu cc-media-toolbar-menu-fixed" style={props.lifecycle.actionsStyle}>
    <button onClick={() => runModal(props.onMobileUpload)}><Icon name="qrCode" size={15} />Upload from phone</button>
    {props.canAddSolid && <button onClick={() => run(props.onAddSolid, true)}><span className="cc-media-solid-icon">C</span>Add solid color</button>}
    <button onClick={() => runModal(props.onCreateFolder)}><Icon name="folderPlus" size={16} />New folder</button>
    <DirectoryImportActions
      onPickFolder={props.onPickFolder}
      onWatchFolder={props.onWatchFolder}
      onStopWatch={props.onStopWatch}
      watchingFolder={props.watchingFolder}
      watchBusy={props.watchBusy}
      run={(action) => run(action)}
    />
    <MusicAutoAnalysisPreference />
  </div>;
  return (
    <div className="cc-media-menu-anchor">
      <button className={`cc-media-icon cc-tip cc-tip-r${open ? ' active' : ''}`} aria-label="More actions" data-tip="More actions" aria-haspopup="dialog" aria-expanded={open} onClick={(event) => props.lifecycle.toggle('actions', event.currentTarget)}><Icon name="more" size={19} /></button>
      {portalToolbarPopover(popover)}
    </div>
  );
}
