import type { FormEvent, MouseEvent } from 'react';

export interface MediaPromptState {
  title: string;
  initialValue: string;
  rejectSlash?: boolean;
  onSubmit: (value: string) => void;
}

export interface MediaFolderDeleteState {
  id: string;
  name: string;
  parentId?: string;
}

export interface MediaAssetDeleteState {
  ids: string[];
  names: string[];
  usedCount: number;
}

interface MediaPoolDialogsProps {
  prompt: MediaPromptState | null;
  promptValue: string;
  folderDelete: MediaFolderDeleteState | null;
  assetDelete: MediaAssetDeleteState | null;
  assetDeleteTitle: string;
  onPromptValue: (value: string) => void;
  onSubmitPrompt: () => void;
  onClosePrompt: () => void;
  onDeleteFolder: (state: MediaFolderDeleteState) => void;
  onCloseFolderDelete: () => void;
  onDeleteAssets: (ids: string[]) => void;
  onCloseAssetDelete: () => void;
}

function PromptDialog(props: Pick<MediaPoolDialogsProps,
'prompt' | 'promptValue' | 'onPromptValue' | 'onSubmitPrompt' | 'onClosePrompt'>) {
  if (!props.prompt) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onSubmitPrompt();
  };
  return <div className="cc-modal-backdrop" role="dialog" aria-modal="true" aria-label={props.prompt.title}>
    <form className="cc-modal" onSubmit={submit}>
      <strong>{props.prompt.title}</strong>
      <input autoFocus aria-label={props.prompt.title} value={props.promptValue} onChange={(event) => props.onPromptValue(event.target.value)} />
      <div><button type="button" onClick={props.onClosePrompt}>Cancel</button><button type="submit" className="primary">OK</button></div>
    </form>
  </div>;
}

function FolderDeleteDialog(props: Pick<MediaPoolDialogsProps,
'folderDelete' | 'onDeleteFolder' | 'onCloseFolderDelete'>) {
  const state = props.folderDelete;
  if (!state) return null;
  return <div className="cc-modal-backdrop" role="dialog" aria-modal="true" aria-label="Delete empty folder">
    <div className="cc-modal">
      <strong>{`Delete empty folder "${state.name}"?`}</strong>
      <div><button onClick={props.onCloseFolderDelete}>Cancel</button><button className="danger" onClick={() => props.onDeleteFolder(state)}>Delete</button></div>
    </div>
  </div>;
}

function AssetDeleteDialog(props: Pick<MediaPoolDialogsProps,
'assetDelete' | 'assetDeleteTitle' | 'onDeleteAssets' | 'onCloseAssetDelete'>) {
  const state = props.assetDelete;
  if (!state) return null;
  const stop = (event: MouseEvent) => event.stopPropagation();
  const detail = state.usedCount > 0
    ? `Delete ${state.ids.length} media items and remove clips linked to ${state.usedCount} of them from every timeline.`
    : `Delete ${state.ids.length} media items from the media pool.`;
  return <div className="cc-modal-backdrop" role="dialog" aria-modal="true" aria-label="Delete In-Use Media" onClick={props.onCloseAssetDelete}>
    <div className="cc-modal" onClick={stop}>
      <strong>{props.assetDeleteTitle}</strong>
      <p className="cc-asset-delete-detail">{detail}</p>
      <p className="cc-asset-delete-detail" title={state.names.join('\n')}>{state.names.join(', ')}</p>
      <div><button type="button" onClick={props.onCloseAssetDelete}>Cancel</button><button type="button" className="danger" onClick={() => props.onDeleteAssets(state.ids)}>Confirm Delete</button></div>
    </div>
  </div>;
}

export function MediaPoolDialogs(props: MediaPoolDialogsProps) {
  return <>
    <PromptDialog {...props} />
    <FolderDeleteDialog {...props} />
    <AssetDeleteDialog {...props} />
  </>;
}
