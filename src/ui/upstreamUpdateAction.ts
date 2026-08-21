import {
  openUpstreamReleasePage,
  formatDisplayVersion,
  requestUpstreamUpdateCheck,
  requestUpstreamUpdateDownload,
  requestUpstreamUpdateInstall,
  type UpstreamUpdateState,
} from './upstreamUpdate';

export type UpstreamUpdateCommand = 'check' | 'download' | 'install' | 'view-release' | 'none';

export interface UpstreamUpdateAction {
  readonly label: string;
  readonly disabled: boolean;
  readonly command: UpstreamUpdateCommand;
}

export function resolveUpstreamUpdateAction(
  state: UpstreamUpdateState,
  desktopUpdate: boolean,
): UpstreamUpdateAction {
  if (state.phase === 'checking') return { label: 'Checking…', disabled: true, command: 'none' };
  if (state.phase === 'available') {
    return desktopUpdate
      ? { label: 'Download update', disabled: false, command: 'download' }
      : { label: 'View release', disabled: false, command: 'view-release' };
  }
  if (state.phase === 'downloading') {
    return {
      label: `Downloading ${Math.round(state.percent)}%`,
      disabled: true,
      command: 'none',
    };
  }
  if (state.phase === 'downloaded') {
    return { label: 'Restart and install', disabled: false, command: 'install' };
  }
  if (state.phase === 'installing') return { label: 'Restarting…', disabled: true, command: 'none' };
  if (state.phase === 'error') {
    if (state.failedOperation === 'download') {
      return { label: 'Retry download', disabled: false, command: 'download' };
    }
    if (state.failedOperation === 'install') {
      return { label: 'Retry installation', disabled: false, command: 'install' };
    }
    return { label: 'Check again', disabled: false, command: 'check' };
  }
  return { label: 'Check for updates', disabled: false, command: 'check' };
}

export function upstreamUpdateMessage(state: UpstreamUpdateState, desktopUpdate: boolean): string {
  if (state.phase === 'available') {
    const latest = formatDisplayVersion(state.latestVersion);
    const current = formatDisplayVersion(state.currentVersion);
    return desktopUpdate
      ? `OpenChatCut ${latest} is available; current version: ${current}. Download and install it directly.`
      : `OpenChatCut ${latest} is available; current version: ${current}. Visit the project repository to review the update.`;
  }
  if (state.phase === 'current') {
    return `You are using the latest version, ${formatDisplayVersion(state.currentVersion)}.`;
  }
  if (state.phase === 'downloading') {
    return `Downloading OpenChatCut ${formatDisplayVersion(state.latestVersion)}: ${Math.round(state.percent)}%`;
  }
  if (state.phase === 'downloaded') {
    return `OpenChatCut ${formatDisplayVersion(state.latestVersion)} is downloaded. Restart to finish installing.`;
  }
  if (state.phase === 'installing') return 'Restarting to install OpenChatCut…';
  if (state.phase === 'error' && state.failedOperation === 'download') return 'The update download failed. Try again.';
  if (state.phase === 'error' && state.failedOperation === 'install') return 'The update installation failed. Try again.';
  return 'Unable to check for updates. Please try again later.';
}

export function runUpstreamUpdateCommand(command: UpstreamUpdateCommand): void {
  if (command === 'check') void requestUpstreamUpdateCheck('manual');
  else if (command === 'download') void requestUpstreamUpdateDownload();
  else if (command === 'install') void requestUpstreamUpdateInstall();
  else if (command === 'view-release') openUpstreamReleasePage();
}
