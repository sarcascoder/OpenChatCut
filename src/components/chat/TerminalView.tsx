import { useCallback, useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { theme } from '../../theme';

/**
 * Hosts one PTY-backed terminal. The session lives in the main process, so this
 * component may be hidden and re-shown without killing a running `claude`.
 * It is only mounted on desktop; the browser build has no window.openChatCutDesktop.
 *
 * The working directory comes from `projectRoot` once folder-backed projects
 * supply one. Until then the user can pick a folder here: `selectProjectFolder`
 * opens the trusted OS dialog AND records the grant (desktop/project-root-grants.ts),
 * which is exactly what the main process's cwd check requires -- so a folder
 * chosen here is admitted for the same reason an opened project would be, not
 * by any weakening of the guard.
 */
export function TerminalView({ projectRoot }: { projectRoot: string | null }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [chosenRoot, setChosenRoot] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // An open project wins; the manual pick is the fallback while none exists.
  const root = projectRoot ?? chosenRoot;

  const chooseFolder = useCallback(async () => {
    const desktop = window.openChatCutDesktop;
    if (!desktop) return;
    setPicking(true);
    try {
      const picked = await desktop.selectProjectFolder();
      if (picked) setChosenRoot(picked);
    } finally {
      setPicking(false);
    }
  }, []);

  useEffect(() => {
    const desktop = window.openChatCutDesktop;
    const host = hostRef.current;
    if (!desktop || !host) return;

    // xterm paints to a canvas and cannot resolve CSS custom properties, so
    // `theme.panel` ("var(--cc-panel)") must be resolved to a real colour first.
    const resolved = getComputedStyle(host).getPropertyValue('--cc-panel').trim();
    const term = new Terminal({
      fontSize: 12,
      fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
      theme: resolved ? { background: resolved } : undefined,
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    // Build the xterm shell first either way: a bare `return` before term.open()
    // would leave a silently blank pane rather than a readable message.
    if (!root) {
      term.write('\r\nChoose a folder above to open a terminal there.\r\n');
      return () => { term.dispose(); };
    }

    let disposed = false;
    const unsubscribe = desktop.subscribeTerminal((event) => {
      if (event.id !== sessionRef.current) return;
      if (event.type === 'data') term.write(event.chunk);
      else term.write(`\r\n[process exited with code ${event.code}]\r\n`);
    });

    void desktop.startTerminal(root, term.cols, term.rows).then((id) => {
      if (disposed) { if (id) void desktop.stopTerminal(id); return; }
      sessionRef.current = id;
      if (!id) {
        // The main process refuses with a deliberately uniform error, so this
        // cannot say WHY -- only that the folder was not usable.
        term.write('\r\nThat folder is not available for a terminal. Choose another.\r\n');
      }
    });

    term.onData((data) => {
      const id = sessionRef.current;
      if (id) void desktop.writeTerminal(id, data);
    });

    const observer = new ResizeObserver(() => {
      fit.fit();
      const id = sessionRef.current;
      if (id) void desktop.resizeTerminal(id, term.cols, term.rows);
    });
    observer.observe(host);

    return () => {
      disposed = true;
      observer.disconnect();
      unsubscribe();
      const id = sessionRef.current;
      if (id) void desktop.stopTerminal(id);
      sessionRef.current = null;
      term.dispose();
    };
  }, [root]);

  return <>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
      borderBottom: `0.5px solid ${theme.border}`, flexShrink: 0, minWidth: 0,
    }}>
      <span title={root ?? undefined} style={{
        flex: 1, minWidth: 0, fontSize: 11, color: root ? theme.textMuted : theme.textDim,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl',
      }}>{root ?? 'No folder chosen'}</span>
      <button type="button" onClick={() => void chooseFolder()} disabled={picking}
        title="Choose the folder this terminal opens in"
        style={{
          flexShrink: 0, padding: '3px 8px', fontSize: 11, borderRadius: 5,
          border: `0.5px solid ${theme.border}`, background: 'transparent',
          color: theme.text, cursor: picking ? 'default' : 'pointer', opacity: picking ? 0.5 : 1,
        }}>{root ? 'Change folder' : 'Choose folder'}</button>
    </div>
    <div ref={hostRef} style={{ flex: 1, minHeight: 0, padding: 8, background: theme.panel }} />
  </>;
}
