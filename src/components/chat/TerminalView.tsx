import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { theme } from '../../theme';

/**
 * Hosts one PTY-backed terminal. The session lives in the main process, so this
 * component may be hidden and re-shown without killing a running `claude`.
 * It is only mounted on desktop; the browser build has no window.openChatCutDesktop.
 */
export function TerminalView({ projectRoot }: { projectRoot: string | null }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<string | null>(null);

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

    // No project folder is open yet (folder-backed projects Stage 3 has not
    // landed), so there is nothing to spawn a shell in. Show the terminal
    // shell with the same message `startTerminal` returning null would
    // produce, rather than silently leaving a blank pane -- a bare `return`
    // here before `term.open` would skip creating xterm at all.
    if (!projectRoot) {
      term.write('\r\nThis folder has not been granted. Open a project folder first.\r\n');
      return () => { term.dispose(); };
    }

    let disposed = false;
    const unsubscribe = desktop.subscribeTerminal((event) => {
      if (event.id !== sessionRef.current) return;
      if (event.type === 'data') term.write(event.chunk);
      else term.write(`\r\n[process exited with code ${event.code}]\r\n`);
    });

    void desktop.startTerminal(projectRoot, term.cols, term.rows).then((id) => {
      if (disposed) { if (id) void desktop.stopTerminal(id); return; }
      sessionRef.current = id;
      if (!id) {
        term.write('\r\nThis folder has not been granted. Open a project folder first.\r\n');
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
  }, [projectRoot]);

  return <div ref={hostRef} style={{ flex: 1, minHeight: 0, padding: 8, background: theme.panel }} />;
}
