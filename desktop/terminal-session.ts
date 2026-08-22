// Owns every live PTY in the main process, keyed by an opaque id the renderer
// is given but never chooses. The pty factory is injected so this module can be
// tested under tsx with no native binary and no real shell.
import { randomBytes } from 'node:crypto';

export interface PtyLike {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(listener: (chunk: string) => void): void;
  onExit(listener: (code: number) => void): void;
}

export interface PtySpawnOptions {
  readonly cwd: string;
  readonly cols: number;
  readonly rows: number;
}

export type PtySpawn = (options: PtySpawnOptions) => PtyLike;

export interface TerminalRegistryOptions {
  readonly spawn: PtySpawn;
  readonly onData: (id: string, chunk: string) => void;
  readonly onExit: (id: string, code: number) => void;
}

/**
 * A hard ceiling on live PTYs. The panel shows one terminal at a time, so this
 * is far above any real use; it exists because nothing else bounded the count
 * and a loop of start calls would otherwise spawn shells until the process ran
 * out of file descriptors. Callers surface the overflow as their own generic
 * refusal, so the renderer cannot tell a full registry from a denied directory.
 */
export const MAX_TERMINAL_SESSIONS = 32;

export class TerminalRegistry {
  readonly #options: TerminalRegistryOptions;
  readonly #sessions = new Map<string, PtyLike>();

  constructor(options: TerminalRegistryOptions) {
    this.#options = options;
  }

  /** Throws once MAX_TERMINAL_SESSIONS sessions are live. Pinned in terminal-session.verify.ts. */
  start(options: PtySpawnOptions): string {
    if (this.#sessions.size >= MAX_TERMINAL_SESSIONS) throw new Error('too many terminal sessions');
    // randomBytes, not a counter or a hash of the cwd: the id travels to an
    // untrusted renderer, so it must carry no information and be unguessable.
    const id = randomBytes(16).toString('hex');
    const pty = this.#options.spawn(options);
    this.#sessions.set(id, pty);
    pty.onData((chunk) => this.#options.onData(id, chunk));
    pty.onExit((code) => {
      this.#sessions.delete(id);
      this.#options.onExit(id, code);
    });
    return id;
  }

  has(id: string): boolean { return this.#sessions.has(id); }
  size(): number { return this.#sessions.size; }

  write(id: string, data: string): boolean {
    const pty = this.#sessions.get(id);
    if (!pty) return false;
    pty.write(data);
    return true;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const pty = this.#sessions.get(id);
    if (!pty) return false;
    pty.resize(cols, rows);
    return true;
  }

  stop(id: string): boolean {
    const pty = this.#sessions.get(id);
    if (!pty) return false;
    this.#sessions.delete(id);
    pty.kill();
    return true;
  }

  /** Kills every live session. Called on window close and before quit so no shell outlives its window. */
  disposeAll(): void {
    for (const pty of this.#sessions.values()) pty.kill();
    this.#sessions.clear();
  }
}
