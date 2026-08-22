import { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import {
  acquire,
  disposeProject,
  rememberRoot,
  rememberedRoot,
  release,
  safeFit,
} from './terminalSessions';

/**
 * Shows the terminal belonging to a project. The Terminal instance, its
 * scrollback and its PTY subscription live in `terminalSessions`, outside the
 * React tree, so this component can unmount -- on collapse, on a tab switch, or
 * when the user navigates home -- without the session ending or output being
 * lost. This component only attaches the existing DOM node and keeps it fitted.
 *
 * The working directory comes from `projectRoot` once folder-backed projects
 * supply one, otherwise from the folder the user picked, which is remembered per
 * project. `selectProjectFolder` opens the trusted OS dialog AND records the
 * grant (desktop/project-root-grants.ts), which is exactly what the main
 * process's cwd check requires -- so a folder chosen here is admitted for the
 * same reason an opened project would be, not by any weakening of the guard.
 *
 * Grants persist across app restarts (desktop/project-root-grants.ts), so a
 * remembered folder reopens without re-picking. A refusal therefore means the
 * folder is genuinely unusable now -- moved, deleted, or never granted -- not
 * merely that the app was restarted.
 */
export function TerminalView({ projectId, projectRoot }: {
  projectId: string;
  projectRoot: string | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [chosenRoot, setChosenRoot] = useState<string | null>(() => rememberedRoot(projectId));
  const [picking, setPicking] = useState(false);
  const [refused, setRefused] = useState(false);

  // An open project wins; the remembered pick is the fallback while none exists.
  const root = projectRoot ?? chosenRoot;

  const chooseFolder = useCallback(async () => {
    const desktop = window.openChatCutDesktop;
    if (!desktop) return;
    setPicking(true);
    try {
      const picked = await desktop.selectProjectFolder();
      if (!picked) return;
      // Changing folder is the one case that must end the old shell: its cwd is
      // no longer the one the user means by "this project's terminal".
      await disposeProject(projectId);
      rememberRoot(projectId, picked);
      setRefused(false);
      setChosenRoot(picked);
    } finally {
      setPicking(false);
    }
  }, [projectId]);

  useEffect(() => {
    const desktop = window.openChatCutDesktop;
    const host = hostRef.current;
    if (!desktop || !host) return;

    const entry = acquire(projectId, host);
    safeFit(entry, host);

    // Wire input and output exactly once per live terminal. Doing this per
    // mount would attach a second handler on every remount, so one keystroke
    // would reach the shell twice.
    if (!entry.unsubscribe) {
      entry.term.onData((data) => {
        if (entry.sessionId) void desktop.writeTerminal(entry.sessionId, data);
      });
      entry.unsubscribe = desktop.subscribeTerminal((event) => {
        if (event.id !== entry.sessionId) return;
        if (event.type === 'data') entry.term.write(event.chunk);
        else {
          entry.term.write(`\r\n[process exited with code ${event.code}]\r\n`);
          entry.sessionId = null;
        }
      });
    }

    if (!root) {
      if (!entry.greeted) {
        entry.greeted = true;
        entry.term.write('\r\nChoose a folder above to open a terminal here.\r\n');
      }
    } else if (entry.root !== root) {
      // A different folder than this terminal was started for: start fresh.
      // Stop the previous shell first -- `chooseFolder` disposes the whole
      // terminal, but a root arriving from an opened project does not, and
      // leaving the old PTY running would strand it with no way to reach it.
      const previous = entry.sessionId;
      entry.sessionId = null;
      if (previous) void desktop.stopTerminal(previous);
      entry.root = root;
      entry.starting = true;
      void desktop.startTerminal(root, entry.term.cols, entry.term.rows).then((id) => {
        entry.starting = false;
        entry.sessionId = id;
        if (!id) {
          setRefused(true);
          // The main process refuses with a deliberately uniform error, so this
          // cannot say WHY. Since grants now survive restarts, the likely cause
          // is that the folder moved or was deleted.
          entry.term.write('\r\nThis folder is not available. Choose it again, or pick another.\r\n');
        }
      });
    }

    const observer = new ResizeObserver(() => {
      // Skips while hidden, and runs on the transition back to visible.
      if (!safeFit(entry, host)) return;
      if (entry.sessionId) {
        void desktop.resizeTerminal(entry.sessionId, entry.term.cols, entry.term.rows);
      }
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      // Detach only. The session, its scrollback and its subscription outlive
      // this component so navigating away and back returns to it unchanged.
      release(entry);
    };
  }, [projectId, root]);

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
          border: `0.5px solid ${theme.border}`,
          background: refused ? theme.hover : 'transparent',
          color: theme.text, cursor: picking ? 'default' : 'pointer', opacity: picking ? 0.5 : 1,
        }}>{!root ? 'Choose folder' : refused ? 'Reopen folder' : 'Change folder'}</button>
    </div>
    <div ref={hostRef} style={{ flex: 1, minHeight: 0, padding: 8, background: theme.panel }} />
  </>;
}
