import { createPortal } from 'react-dom';
import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { MediaAsset, MediaFolder } from '../editor/types';
import { theme } from '../theme';
import { AssetExportButton } from './AssetExportButton';
import { folderPath } from './mediaPoolFormat';
import { AssetMenuDestinations } from './AssetMenuDestinations';
import type { MediaSortKey, MediaTypeFilter } from './mediaPoolFilter';

interface AssetMenuPortalProps {
  asset?: MediaAsset;
  position: CSSProperties | null;
  fps: number;
  folders: MediaFolder[];
  missing: boolean;
  confirmDelete: boolean;
  canRelink: boolean;
  canRemove: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onFavorite: () => void;
  onRename: () => void;
  onRelink: () => void;
  onRemove: () => void;
  onMove: (folderId?: string) => void;
  onAddTimeline: () => void;
  onAddChat: () => void;
  /** Transcribe the menu's asset selection (enabled when any is transcribable). */
  onTranscribe?: () => void;
  /** Open the transcript viewer for the menu's anchor asset. */
  onViewTranscript?: () => void;
}

interface BlankMediaMenuActionsProps {
  clipboardCount: number;
  visibleCount: number;
  allVisibleSelected: boolean;
  view: 'grid' | 'list';
  sort: MediaSortKey;
  type: MediaTypeFilter;
  onPaste: () => void;
  onSelectAll: () => void;
  onUpload: () => void;
  onSemanticSearch: () => void;
  onMobileUpload: () => void;
  onCreateFolder: () => void;
  onViewToggle: () => void;
  onSort: (value: MediaSortKey) => void;
  onType: (value: MediaTypeFilter) => void;
}

export function BlankMediaMenuActions(props: BlankMediaMenuActionsProps) {
  return <>
    <button type="button" disabled={!props.clipboardCount} onClick={props.onPaste}>Paste copies{props.clipboardCount > 1 ? ` (${props.clipboardCount})` : ''}</button>
    <button type="button" disabled={!props.visibleCount} onClick={props.onSelectAll}>{props.allVisibleSelected ? 'Deselect all' : 'Select all'}</button>
    <hr />
    <button type="button" onClick={props.onSemanticSearch}>Local semantic search</button>
    <button type="button" onClick={props.onMobileUpload}>Upload from phone</button>
    <button type="button" onClick={props.onUpload}>Upload media</button>
    <button type="button" onClick={props.onCreateFolder}>New folder</button>
    <button type="button" onClick={props.onViewToggle}>{props.view === 'grid' ? 'Switch to list view' : 'Switch to grid view'}</button>
    <label><span>Sort</span><select aria-label="Sort media" value={props.sort} onChange={(event) => props.onSort(event.target.value as MediaSortKey)}>
      <option value="newest">Newest first</option><option value="name">Name A–Z</option><option value="duration">Duration</option>
    </select></label>
    <label><span>Filter</span><select aria-label="Filter media" value={props.type} onChange={(event) => props.onType(event.target.value as MediaTypeFilter)}>
      <option value="all">All</option><option value="video">Video</option><option value="image">Image</option><option value="audio">Audio</option>
    </select></label>
  </>;
}

export function BlankMediaMenuPortal(props: BlankMediaMenuActionsProps & { position: { top: number; left: number }; onClose: () => void }) {
  const { onClose } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [onClose]);
  return createPortal(
    <div ref={menuRef} className="cc-media-popover cc-media-blank-menu" style={props.position} role="menu" aria-label="Media pool background menu" onClick={(event) => event.stopPropagation()}>
      <BlankMediaMenuActions {...props} />
    </div>,
    document.body,
  );
}

function usePopoverDismiss(
  active: boolean,
  onClose: () => void,
  menuRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    menuRef.current?.querySelector<HTMLElement>('button:not(:disabled), select')?.focus();
  }, [active, menuRef]);
  useEffect(() => {
    if (!active) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [active, menuRef, onClose]);
}

export function AssetMenuPortal(props: AssetMenuPortalProps) {
  const { asset, onClose, position } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(!!asset && !!position, onClose, menuRef);
  if (!props.asset || !props.position) return null;
  return createPortal(
      <div
        ref={menuRef}
        className="cc-media-popover cc-asset-menu-portal"
        style={props.position}
        role="menu"
        aria-label={`Manage ${props.asset.name}`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) props.onClose();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <AssetMenuActions {...props} asset={props.asset} />
      </div>,
    document.body,
  );
}

interface FolderMenuPortalProps {
  folder?: MediaFolder;
  position: CSSProperties | null;
  /** Empty folders only — delete is disabled when the folder still has children. */
  canDelete: boolean;
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function FolderMenuPortal(props: FolderMenuPortalProps) {
  const { folder, onClose, position } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(!!folder && !!position, onClose, menuRef);
  if (!folder || !position) return null;
  return createPortal(
    <div
      ref={menuRef}
      className="cc-media-popover cc-asset-menu-portal"
      style={position}
      role="menu"
      aria-label={`Manage folder ${folder.name}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={props.onOpen}>Open</button>
      <button type="button" onClick={props.onRename}>Rename</button>
      <button
        type="button"
        className="danger"
        disabled={!props.canDelete}
        title={props.canDelete ? undefined : 'Only empty folders can be deleted; move or delete their contents first'}
        onClick={props.onDelete}
      >
        Delete
      </button>
    </div>,
    document.body,
  );
}

function AssetMenuActions(props: AssetMenuPortalProps & { asset: MediaAsset }) {
  const { asset } = props;
  return (
    <>
      {!props.missing && <AssetExportButton asset={asset} fps={props.fps} onError={props.onError} onComplete={props.onClose} />}
      {props.onTranscribe && <button type="button" onClick={props.onTranscribe}>{asset.transcribeStatus === 'failed' ? 'Retranscribe' : 'Transcript'}</button>}
      {props.onViewTranscript && <button type="button" onClick={props.onViewTranscript}>View transcript</button>}
      <button type="button" onClick={props.onFavorite}>{asset.favorite ? 'Unfavorite' : 'Favorite'}</button>
      <button type="button" onClick={props.onRename}>Rename</button>
      {props.canRelink && asset.kind !== 'motion-graphic' && <button type="button" onClick={props.onRelink}>Relink file</button>}
      {props.canRemove && <button type="button" className="danger" onClick={props.onRemove}>{props.confirmDelete ? 'Confirm Delete' : 'Delete'}</button>}
      <label className="cc-asset-menu-move">
        <span>Move to</span>
        <select aria-label={`Move ${asset.name}`} value={asset.folderId ?? ''} onChange={(event) => props.onMove(event.target.value || undefined)}>
          <option value="">Master</option>
          {props.folders.map((folder) => <option key={folder.id} value={folder.id}>{folderPath(folder, props.folders)}</option>)}
        </select>
      </label>
      <AssetMenuDestinations assetName={asset.name} onAddTimeline={props.onAddTimeline} onAddChat={props.onAddChat} />
    </>
  );
}

export function MissingMediaBanner({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) return null;
  return (
    <div className="cc-media-missing-banner" style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      margin: '0 10px 8px', padding: '8px 10px', borderRadius: 4,
      background: theme.panelAlt, border: `0.5px solid ${theme.border}`,
      borderLeft: `2px solid ${theme.accent}`, fontSize: 12, color: theme.textMuted,
    }}>
      <span style={{ flex: 1, minWidth: 140 }}>
        {`${count} assets are missing or failed to load. Pick a folder to search, or relink from each row.`}
      </span>
      <button type="button" onClick={onOpen} style={{
        background: theme.hover, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 3,
        padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>
        Relink Offline Media
      </button>
    </div>
  );
}

interface RelinkAllDialogProps {
  open: boolean;
  busy: boolean;
  message: string | null;
  missingAssets: MediaAsset[];
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onPickFolder: (files: FileList | null) => void;
  onRelink: (id: string) => void;
}

export function RelinkAllDialog(props: RelinkAllDialogProps) {
  if (!props.open) return null;
  return (
    <div className="cc-modal-backdrop" role="dialog" aria-modal="true" aria-label="Relink Offline Media" onClick={props.onClose}>
      <div className="cc-modal" style={{ width: 'min(420px, 92vw)', maxHeight: '70vh', overflow: 'auto' }} onClick={(event) => event.stopPropagation()}>
        <strong>Relink Offline Media</strong>
        <p style={{ margin: '8px 0 12px', fontSize: 12, color: theme.textMuted, lineHeight: 1.45 }}>Files in this project were moved or renamed. Pick a folder to batch-relink by filename, or relink each asset below.</p>
        <input
          ref={(node) => {
            props.inputRef.current = node;
            // React does not understand webkitdirectory; without it the button
            // opens a plain file picker and folder relink can never work.
            node?.setAttribute('webkitdirectory', '');
            node?.setAttribute('directory', '');
          }}
          type="file" multiple hidden onChange={(event) => props.onPickFolder(event.target.files)}
        />
        <button type="button" className="primary" disabled={props.busy} onClick={() => props.inputRef.current?.click()} style={{ width: '100%', marginBottom: 10 }}>
          {props.busy ? 'Matching by filename…' : 'Pick a folder to batch relink (match by filename)'}
        </button>
        {props.message && <div style={{ fontSize: 12, color: `color-mix(in srgb, ${theme.success} 65%, ${theme.textStrong})`, margin: '0 0 10px' }}>{props.message}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {props.missingAssets.map((asset) => <RelinkRow key={asset.id} asset={asset} onRelink={props.onRelink} />)}
          {props.missingAssets.length === 0 && <div style={{ fontSize: 12, color: theme.textDim }}>Nothing left to relink</div>}
        </div>
        <div style={{ marginTop: 12 }}><button type="button" onClick={props.onClose}>Close</button></div>
      </div>
    </div>
  );
}

function RelinkRow({ asset, onRelink }: { asset: MediaAsset; onRelink: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 4, background: theme.panelAlt }}>
      <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</span>
      <button type="button" className="primary" onClick={() => onRelink(asset.id)} style={{ flexShrink: 0 }}>Relink file</button>
    </div>
  );
}
