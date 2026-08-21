import { Icon } from '../components/icons';

interface DirectoryImportActionsProps {
  onPickFolder?: () => void;
  onWatchFolder?: () => void;
  onStopWatch: () => void;
  watchingFolder: string | null;
  watchBusy: boolean;
  run: (action: () => void) => void;
}

export function DirectoryImportActions(props: DirectoryImportActionsProps) {
  const pickFolder = props.onPickFolder;
  const watchFolder = props.onWatchFolder;
  return <>
    {pickFolder && <button onClick={() => props.run(pickFolder)}>
      <Icon name="folderPlus" size={16} />Import folder…
    </button>}
    {watchFolder && (props.watchingFolder
      ? <button onClick={() => props.run(props.onStopWatch)}>
        <Icon name="x" size={15} />{props.watchBusy
          ? `Stop preparing watch folder “${props.watchingFolder}”`
          : `Stop watching “${props.watchingFolder}”`}
      </button>
      : <button disabled={props.watchBusy} onClick={() => props.run(watchFolder)}>
        <Icon name="folder" size={15} />{props.watchBusy
          ? 'Choosing a folder to watch…'
          : 'Watch folder (automatically import new media)…'}
      </button>)}
  </>;
}
