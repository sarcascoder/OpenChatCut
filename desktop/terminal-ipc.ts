// Guarded entry points for the terminal panel. The renderer is untrusted --
// src/template-host.ts evaluates AI- and plugin-authored JSX through
// `new Function` behind a regex denylist whose own header says it is hardening,
// NOT a VM boundary -- so everything reachable from the renderer is, in
// principle, reachable from generated code. Three properties are enforced here
// and each is pinned by an executed assertion in desktop/terminal-ipc.verify.ts:
//   - the renderer never names a command: `PtySpawnOptions` carries only
//     { cwd, cols, rows }, and the shell is chosen by defaultShell() below
//     (verify: the key set of the options handed to the injected spawn is
//     asserted to be exactly cwd/cols/rows);
//   - the cwd must be a directory the user chose in a trusted OS dialog: the
//     path is canonicalised and then matched EXACTLY against the grants in
//     project-root-grants.ts, never by prefix (verify: an ungranted directory,
//     $HOME, and a `..` traversal out of a granted root are each refused, and
//     deleting the grant check makes the verify fail);
//   - every refusal carries the identical message, so the error surface is not
//     a directory-existence oracle (verify: refusals collected from a denied
//     directory, a missing directory, $HOME, a non-string cwd and out-of-range
//     dimensions are asserted to collapse to one distinct string).
// What this does NOT do: nothing here bounds what can be typed into a session
// once it exists. isTerminalWritePayload only caps the SIZE of one keystroke
// payload so a runaway renderer cannot exhaust main-process memory; it does not
// inspect the bytes. Anything that can reach these channels can run arbitrary
// commands inside a granted directory with the user's own privileges. The grant
// is the whole boundary.
import { realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  TERMINAL_CHANNELS,
  isTerminalDimension,
  isTerminalSessionId,
  isTerminalWritePayload,
} from '../shared/terminal-session.ts';
import { CHILD_ENV_NAMES } from '../server/codex/app-server.ts';
import { assertTrustedDesktopSenderUrl } from './page-origin.ts';
import { isProjectRootGranted } from './project-root-grants.ts';
import { TerminalRegistry, type PtyLike, type PtySpawn } from './terminal-session.ts';

// These desktop modules are ESM (bundled with `esbuild --format=esm`), so there
// is no bare `require` in scope -- referencing one throws ReferenceError, proven
// by running a probe under tsx. createRequire gives a CommonJS resolver that
// works both under tsx and inside the Electron main process, and calling it
// lazily inside the functions below keeps `electron` and the native pty binary
// out of module evaluation, so desktop/terminal-ipc.verify.ts can import this
// file under tsx on a machine with neither available.
const nodeRequire = createRequire(import.meta.url);

/** Carries no path, errno or syscall: the renderer learns only that it was refused. */
export class TerminalAccessError extends Error {
  constructor() {
    super('terminal is not available for this directory');
    this.name = 'TerminalAccessError';
  }
}

export interface TerminalControllerOptions {
  readonly spawn: PtySpawn;
  readonly send: (channel: string, payload: unknown) => void;
}

export interface TerminalController {
  start(cwd: unknown, cols: unknown, rows: unknown): Promise<string>;
  write(id: unknown, data: unknown): void;
  resize(id: unknown, cols: unknown, rows: unknown): void;
  stop(id: unknown): void;
  disposeAll(): void;
}

export function createTerminalController(options: TerminalControllerOptions): TerminalController {
  const registry = new TerminalRegistry({
    spawn: options.spawn,
    onData: (id, chunk) => options.send(TERMINAL_CHANNELS.data, { id, chunk }),
    onExit: (id, code) => options.send(TERMINAL_CHANNELS.exit, { id, code }),
  });

  return {
    async start(cwd: unknown, cols: unknown, rows: unknown): Promise<string> {
      try {
        if (typeof cwd !== 'string') throw new TerminalAccessError();
        if (!isTerminalDimension(cols) || !isTerminalDimension(rows)) throw new TerminalAccessError();
        // Canonicalise before the grant check so a traversal or symlink spelling
        // of a granted directory resolves to the same key, and one that escapes
        // it does not. isProjectRootGranted canonicalises again on its own side
        // and matches exactly, never by prefix, so a subdirectory of a granted
        // root is NOT itself granted.
        const canonical = await realpath(resolve(cwd));
        if (!(await isProjectRootGranted(canonical))) throw new TerminalAccessError();
        // The canonical path, not the renderer's spelling, is what the pty gets.
        return registry.start({ cwd: canonical, cols, rows });
      } catch {
        // A refusal, a missing directory, an EACCES, a NUL byte in the string:
        // all leave through this one throw, with one message and no detail.
        throw new TerminalAccessError();
      }
    },
    write(id: unknown, data: unknown): void {
      // Malformed input is dropped rather than thrown: an unknown or oversized
      // payload tells the renderer nothing about which sessions exist.
      if (!isTerminalSessionId(id) || !isTerminalWritePayload(data)) return;
      registry.write(id, data);
    },
    resize(id: unknown, cols: unknown, rows: unknown): void {
      if (!isTerminalSessionId(id)) return;
      if (!isTerminalDimension(cols) || !isTerminalDimension(rows)) return;
      registry.resize(id, cols, rows);
    },
    stop(id: unknown): void {
      if (!isTerminalSessionId(id)) return;
      registry.stop(id);
    },
    disposeAll(): void {
      registry.disposeAll();
    },
  };
}

/**
 * The shell is chosen here, in the main process, never by the renderer. It is
 * read from the user's own environment, which the renderer cannot write.
 */
function defaultShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: process.env.COMSPEC ?? 'cmd.exe', args: [] };
  return { file: process.env.SHELL ?? '/bin/zsh', args: ['-l'] };
}

/** Terminal-specific additions to the shared child allowlist. */
const TERMINAL_ENV_NAMES = ['SHELL', 'TERM_PROGRAM'] as const;
const TERMINAL_ENV_PREFIXES = ['LC_'] as const;

/**
 * Builds the PTY's environment from the same allowlist every other child this
 * app spawns gets (CHILD_ENV_NAMES in server/codex/app-server.ts), rather than
 * handing over all of `process.env`.
 *
 * This is hygiene and consistency with house policy, NOT a security boundary,
 * and it does not narrow the residual above by one inch: the session runs as
 * the user's own uid, so it can read anything the user can read, this file
 * included. It is here because passing the main process's whole environment
 * made this spawn the one place in the repo that ignored the policy
 * codex-agent.verify.ts already pins by execution. The login shell (`-l`)
 * rebuilds the rest from the user's own profile.
 *
 * Pinned by execution in desktop/terminal-ipc.verify.ts: a sentinel set in
 * process.env is asserted absent from the result, and removing this filter
 * makes that verify fail.
 */
export function terminalEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of [...CHILD_ENV_NAMES, ...TERMINAL_ENV_NAMES]) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && TERMINAL_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      environment[name] = value;
    }
  }
  // Set, not inherited: this panel owns its emulator (xterm.js in the renderer),
  // so the terminfo name is ours to state. Inheriting it would let a `TERM=dumb`
  // launch environment degrade the panel. node-pty's `name` option would be a
  // second, contradicting source for the same value -- unixTerminal.js uses
  // `opt.env` verbatim when supplied and ignores `name` -- so it is not passed.
  environment.TERM = 'xterm-256color';
  return environment;
}

function spawnRealPty(options: { cwd: string; cols: number; rows: number }): PtyLike {
  // Loaded lazily: the native binary is only pulled in when a terminal is
  // actually opened, so importing this module under tsx never touches it.
  //
  // The cast below is unavoidable -- createRequire's CommonJS resolver
  // returns `any`, and there is no static import of a module we deliberately
  // load at runtime -- but it is cast to the PACKAGE'S OWN declared type
  // (`typeof import(...)`), not a hand-written shape. That lets `tsc` check
  // the real `spawn()` return type (`IPty`) against `PtyLike` at the `return`
  // below: if the library's `onExit` shape ever drifts from `PtyLike.onExit`,
  // this becomes a compile error instead of a silent runtime mismatch. A
  // prior version of this cast asserted a hand-rolled `{ spawn: (...) =>
  // PtyLike }` shape, which erased that check entirely and hid the real
  // onExit contract (`{ exitCode, signal }`, not a bare number) from `tsc`.
  const pty = nodeRequire('@homebridge/node-pty-prebuilt-multiarch') as
    typeof import('@homebridge/node-pty-prebuilt-multiarch');
  const shell = defaultShell();
  return pty.spawn(shell.file, shell.args, {
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: terminalEnvironment(),
  });
}

export function installTerminalIpc(
  trustedOrigin: string,
  send: (channel: string, payload: unknown) => void,
): { disposeAll(): void } {
  // `electron` is required lazily for the same reason as the pty: a static
  // `import { ipcMain } from 'electron'` makes this module unloadable under tsx
  // ("does not provide an export named 'ipcMain'"), which would take the verify
  // with it.
  const { ipcMain } = nodeRequire('electron') as typeof import('electron');
  const controller = createTerminalController({ spawn: spawnRealPty, send });
  // Sender validation matches the sibling install*Ipc modules (directory-watch-ipc.ts,
  // update-ipc.ts, project-store-ipc.ts): main.ts's trustedDesktopHandler wrapper is
  // private to main.ts and is not exported from page-origin.ts.
  ipcMain.handle(TERMINAL_CHANNELS.start, async (event, cwd: unknown, cols: unknown, rows: unknown) => {
    assertTrustedDesktopSenderUrl(event.senderFrame?.url ?? '', trustedOrigin);
    return controller.start(cwd, cols, rows);
  });
  ipcMain.handle(TERMINAL_CHANNELS.write, (event, id: unknown, data: unknown) => {
    assertTrustedDesktopSenderUrl(event.senderFrame?.url ?? '', trustedOrigin);
    controller.write(id, data);
  });
  ipcMain.handle(TERMINAL_CHANNELS.resize, (event, id: unknown, cols: unknown, rows: unknown) => {
    assertTrustedDesktopSenderUrl(event.senderFrame?.url ?? '', trustedOrigin);
    controller.resize(id, cols, rows);
  });
  ipcMain.handle(TERMINAL_CHANNELS.stop, (event, id: unknown) => {
    assertTrustedDesktopSenderUrl(event.senderFrame?.url ?? '', trustedOrigin);
    controller.stop(id);
  });
  return { disposeAll: () => controller.disposeAll() };
}
