// Channel names and id shape for the terminal panel, shared by the Electron
// main process and the renderer. Deliberately free of Electron and Node-only
// imports so the renderer can import it too.

export const TERMINAL_CHANNELS = {
  start: 'openchatcut:terminal-start',
  write: 'openchatcut:terminal-write',
  resize: 'openchatcut:terminal-resize',
  stop: 'openchatcut:terminal-stop',
  data: 'openchatcut:terminal-data',
  exit: 'openchatcut:terminal-exit',
} as const;

/** Session ids are 32 lowercase hex characters, minted by the main process. */
const SESSION_ID = /^[0-9a-f]{32}$/;

export function isTerminalSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID.test(value);
}

/**
 * Bounds keystroke payloads so a runaway renderer cannot exhaust main-process
 * memory. Measured in UTF-16 characters, not bytes: this module is imported by
 * both the Electron main process and the renderer, and the renderer bundle has
 * no `Buffer` global (this repo's Vite config carries no Node polyfill for it),
 * so `string.length` is the one length check that works identically in both.
 */
export const TERMINAL_WRITE_LIMIT_CHARS = 8192;

export function isTerminalWritePayload(value: unknown): value is string {
  return typeof value === 'string' && value.length <= TERMINAL_WRITE_LIMIT_CHARS;
}

/** xterm will not render usefully outside these bounds; they also cap ioctl arguments. */
export function isTerminalDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000;
}
