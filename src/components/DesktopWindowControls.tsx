type DesktopWindowAction = 'close' | 'minimize' | 'toggle-maximize';

interface DesktopWindowControlButtonsProps {
  onAction: (action: DesktopWindowAction) => void;
}

export function DesktopWindowControlButtons({
  onAction,
}: DesktopWindowControlButtonsProps) {
  return (
    <div className="cc-window-controls" aria-label={'Window controls'}>
      <button
        type="button"
        className="cc-window-control cc-window-control--close cc-tip"
        aria-label={'Close window'}
        data-tip={'Close window'}
        onClick={() => onAction('close')}
      >
        <span className="cc-window-control-glyph" aria-hidden="true">×</span>
      </button>
      <button
        type="button"
        className="cc-window-control cc-window-control--minimize cc-tip"
        aria-label={'Minimize window'}
        data-tip={'Minimize window'}
        onClick={() => onAction('minimize')}
      >
        <span className="cc-window-control-glyph" aria-hidden="true">−</span>
      </button>
      <button
        type="button"
        className="cc-window-control cc-window-control--maximize cc-tip"
        aria-label={'Zoom window'}
        data-tip={'Zoom window'}
        onClick={() => onAction('toggle-maximize')}
      >
        <span className="cc-window-control-glyph" aria-hidden="true">+</span>
      </button>
    </div>
  );
}

export function DesktopWindowControls() {
  const desktop = window.openChatCutDesktop;
  if (desktop?.platform !== 'darwin') return null;

  return (
    <DesktopWindowControlButtons
      onAction={(action) => { void desktop.windowAction(action); }}
    />
  );
}
