import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';

/**
 * Live terminals, owned OUTSIDE the React tree and keyed by project id.
 *
 * Why this exists: `App.tsx` renders either the editor or the dashboard, so
 * navigating home unmounts the whole editor and with it the terminal component.
 * If the xterm instance and the PTY subscription lived in that component, going
 * home would kill the session and throw away the scrollback. Keeping them here
 * means a project's terminal survives navigation, tab switches and collapse --
 * the component only borrows the DOM node.
 *
 * Two things must live here rather than in the component, for different reasons:
 *  - the Terminal, because its buffer IS the scrollback;
 *  - the PTY subscription, because output arriving while the user is on another
 *    screen has to keep reaching that buffer. A component-owned subscription
 *    would silently drop everything printed while unmounted.
 *
 * A session ends only when the folder changes (`disposeProject`, called by the
 * folder picker) or when the app quits -- the main process disposes every PTY on
 * window close, so nothing here needs to survive that. It does NOT end on
 * unmount: `release` detaches the node and leaves everything else running.
 */
export interface LiveTerminal {
  readonly term: Terminal;
  readonly fit: FitAddon;
  /** xterm is opened into this node once; mounting re-parents it, never re-creates it. */
  readonly container: HTMLDivElement;
  root: string | null;
  sessionId: string | null;
  /** Set while a start is in flight so a remount cannot spawn a second shell. */
  starting: boolean;
  /** The "choose a folder" line is written once, not on every remount. */
  greeted: boolean;
  unsubscribe: (() => void) | null;
}

const live = new Map<string, LiveTerminal>();

const STORAGE_PREFIX = 'openchatcut:terminal-root:';

/** The folder a project's terminal last used, remembered across app restarts. */
export function rememberedRoot(projectId: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + projectId);
  } catch {
    // Private mode, cleared site data, or a browser that refuses storage: the
    // terminal still works, it just cannot pre-fill the folder.
    return null;
  }
}

export function rememberRoot(projectId: string, root: string | null): void {
  try {
    if (root) window.localStorage.setItem(STORAGE_PREFIX + projectId, root);
    else window.localStorage.removeItem(STORAGE_PREFIX + projectId);
  } catch {
    // Not being able to remember is not worth failing the terminal over.
  }
}

function resolvedBackground(host: HTMLElement): string | undefined {
  // xterm paints to a canvas and cannot resolve CSS custom properties, so the
  // panel colour has to be read as a real value first.
  const value = getComputedStyle(host).getPropertyValue('--cc-panel').trim();
  return value || undefined;
}

/** The terminal for a project, created on first use and reused forever after. */
export function acquire(projectId: string, host: HTMLElement): LiveTerminal {
  const existing = live.get(projectId);
  if (existing) {
    host.appendChild(existing.container);
    return existing;
  }
  const container = document.createElement('div');
  container.style.width = '100%';
  container.style.height = '100%';
  host.appendChild(container);

  const background = resolvedBackground(host);
  const term = new Terminal({
    fontSize: 12,
    fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
    theme: background ? { background } : undefined,
    cursorBlink: true,
    // Enough history that stepping away and back does not lose the session's
    // output; the buffer is the only record, since nothing is replayed.
    scrollback: 10_000,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(container);

  const entry: LiveTerminal = {
    term, fit, container, root: null, sessionId: null,
    starting: false, greeted: false, unsubscribe: null,
  };
  live.set(projectId, entry);
  return entry;
}

/** Detach without destroying: the caller is unmounting, the session keeps running. */
export function release(entry: LiveTerminal): void {
  entry.container.remove();
}

/**
 * Fits only when the host actually has a box. While the panel is collapsed or on
 * the chat tab the node is display:none and measures 0x0, and fitting then would
 * compute nonsense dimensions or throw.
 */
export function safeFit(entry: LiveTerminal, host: HTMLElement): boolean {
  if (!host.offsetWidth || !host.offsetHeight) return false;
  try {
    entry.fit.fit();
    return true;
  } catch {
    return false;
  }
}

/** Stops the PTY and forgets the terminal entirely. Used when the folder changes. */
export async function disposeProject(projectId: string): Promise<void> {
  const entry = live.get(projectId);
  if (!entry) return;
  live.delete(projectId);
  entry.unsubscribe?.();
  entry.unsubscribe = null;
  const id = entry.sessionId;
  entry.sessionId = null;
  entry.container.remove();
  entry.term.dispose();
  if (id) await window.openChatCutDesktop?.stopTerminal(id);
}
