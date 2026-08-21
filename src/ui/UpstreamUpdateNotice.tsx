import { useEffect, useSyncExternalStore } from 'react';
import {
  dismissUpstreamUpdate,
  getUpstreamUpdateState,
  hasDesktopUpdateSupport,
  startAutomaticUpstreamUpdateCheck,
  subscribeUpstreamUpdate,
} from './upstreamUpdate';
import {
  resolveUpstreamUpdateAction,
  runUpstreamUpdateCommand,
  upstreamUpdateMessage,
} from './upstreamUpdateAction';
import { UpstreamUpdateNoticeView } from './UpstreamUpdateNoticeView';

export function UpstreamUpdateNotice() {
  const update = useSyncExternalStore(
    subscribeUpstreamUpdate,
    getUpstreamUpdateState,
    getUpstreamUpdateState,
  );

  useEffect(() => { startAutomaticUpstreamUpdateCheck(); }, []);

  if (!update.visible) return null;

  const desktopUpdate = hasDesktopUpdateSupport();
  const action = resolveUpstreamUpdateAction(update, desktopUpdate);
  const showAction = update.phase !== 'current';

  return (
    <UpstreamUpdateNoticeView
      message={upstreamUpdateMessage(update, desktopUpdate)}
      actionLabel={showAction ? action.label : undefined}
      actionDisabled={action.disabled}
      closeLabel="Close"
      onAction={showAction ? () => { runUpstreamUpdateCommand(action.command); } : undefined}
      onDismiss={dismissUpstreamUpdate}
    />
  );
}
