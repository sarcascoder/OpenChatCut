// The renderer is untrusted: it must not be able to open a terminal in a
// directory the user never granted, nor choose what gets spawned, and the
// refusal surface must not tell it which directories exist. Exercised with an
// injected fake pty so this runs under tsx with no native module and no real
// shell.
// How to run: npx tsx desktop/terminal-ipc.verify.ts (wired into verify:desktop-window).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TERMINAL_CHANNELS,
  TERMINAL_WRITE_LIMIT_CHARS,
  isTerminalSessionId,
} from '../shared/terminal-session.ts';
import { clearProjectRootGrants, grantProjectRoot } from './project-root-grants.ts';
import { TerminalAccessError, createTerminalController } from './terminal-ipc.ts';
import type { PtyLike, PtySpawnOptions } from './terminal-session.ts';

interface FakePty extends PtyLike {
  written: string[];
  resized: Array<{ cols: number; rows: number }>;
  killed: boolean;
  emitData(chunk: string): void;
  emitExit(code: number): void;
}

function makeFakePty(): FakePty {
  let onData: (chunk: string) => void = () => {};
  let onExit: (code: number) => void = () => {};
  return {
    written: [],
    resized: [],
    killed: false,
    write(data) { this.written.push(data); },
    resize(cols, rows) { this.resized.push({ cols, rows }); },
    kill() { this.killed = true; },
    onData(listener) { onData = listener; },
    onExit(listener) { onExit = listener; },
    emitData(chunk) { onData(chunk); },
    emitExit(code) { onExit(code); },
  } as FakePty;
}

const base = await mkdtemp(join(tmpdir(), 'occ-term-'));
const granted = join(base, 'Granted');
const ungranted = join(base, 'Ungranted');
const child = join(granted, 'Sub');
await mkdir(granted);
await mkdir(ungranted);
await mkdir(child);
// An alternative spelling of the granted root, to prove canonicalisation runs
// before the grant check rather than the raw string being compared.
const alias = join(base, 'Alias');
await symlink(granted, alias);

const spawns: PtySpawnOptions[] = [];
const ptys: FakePty[] = [];
const sent: Array<{ channel: string; payload: unknown }> = [];
const controller = createTerminalController({
  spawn: (options) => {
    spawns.push(options);
    const pty = makeFakePty();
    ptys.push(pty);
    return pty;
  },
  send: (channel, payload) => sent.push({ channel, payload }),
});

clearProjectRootGrants();

// -- a directory the user never chose is refused --
await assert.rejects(
  () => controller.start(ungranted, 80, 24),
  (error: Error) => error instanceof TerminalAccessError,
  'an ungranted cwd must be refused',
);
assert.equal(spawns.length, 0, 'a refused start must not spawn anything');

// -- $HOME is refused too: the renderer cannot self-authorise --
await assert.rejects(() => controller.start(homedir(), 80, 24), TerminalAccessError);
assert.equal(spawns.length, 0);

// -- a non-string cwd is refused rather than coerced --
await assert.rejects(() => controller.start({ toString: () => granted }, 80, 24), TerminalAccessError);
assert.equal(spawns.length, 0, 'a non-string cwd must not spawn anything');

// -- once granted through the trusted dialog, it works --
const canonicalGranted = await grantProjectRoot(granted);
const id = await controller.start(granted, 80, 24);
assert.ok(isTerminalSessionId(id), 'start must return an opaque session id');
assert.equal(spawns.length, 1, 'a granted cwd must spawn exactly one pty');
assert.equal(spawns[0]!.cols, 80);
assert.equal(spawns[0]!.rows, 24);
assert.equal(spawns[0]!.cwd, canonicalGranted, 'the pty must get the canonical path, not the renderer spelling');

// -- the spawn options carry no renderer-supplied command --
// Asserted on the whole key set, not just `command`/`args`: nothing the
// renderer sends can reach the spawn beyond a cwd and a geometry.
assert.deepEqual(
  Object.keys(spawns[0]!).sort(),
  ['cols', 'cwd', 'rows'],
  'the renderer must not be able to name a command, arguments or environment',
);

// -- a symlink spelling of the granted root resolves to the same grant --
const viaAlias = await controller.start(alias, 80, 24);
assert.equal(spawns.length, 2);
assert.equal(spawns[1]!.cwd, canonicalGranted, 'a symlink to a granted root must canonicalise onto it');
controller.stop(viaAlias);

// -- grants match exactly, not by prefix: a subdirectory is not granted --
await assert.rejects(() => controller.start(child, 80, 24), TerminalAccessError);

// -- a traversal spelling that escapes the granted root is refused --
await assert.rejects(() => controller.start(join(granted, '..', 'Ungranted'), 80, 24), TerminalAccessError);

// -- refusals are uniform: a missing directory looks exactly like a denied one --
const spawnsBeforeRefusals = spawns.length;
const refusals: string[] = [];
const refusedStarts: Array<() => Promise<string>> = [
  () => controller.start(ungranted, 80, 24),
  () => controller.start(join(base, 'DoesNotExist'), 80, 24),
  () => controller.start(homedir(), 80, 24),
  () => controller.start(child, 80, 24),
  () => controller.start(join(granted, '..', 'Ungranted'), 80, 24),
  () => controller.start(42, 80, 24),
  () => controller.start(granted, 0, 24),
  () => controller.start(granted, 80, 99999),
  () => controller.start(granted, 80.5, 24),
];
for (const attempt of refusedStarts) {
  try {
    await attempt();
    assert.fail('must refuse');
  } catch (error) {
    assert.ok(error instanceof TerminalAccessError, 'every refusal must be a TerminalAccessError');
    refusals.push((error as Error).message);
  }
}
assert.equal(new Set(refusals).size, 1, 'every refusal must carry the identical message');
assert.equal(refusals[0], 'terminal is not available for this directory');
assert.equal(spawns.length, spawnsBeforeRefusals, 'no refused start may spawn anything');

// -- malformed ids and oversized payloads are dropped, not thrown to the renderer --
const live = ptys[0]!;
controller.write('not-an-id', 'x');
controller.resize('not-an-id', 80, 24);
controller.stop('not-an-id');
assert.deepEqual(live.written, [], 'a malformed id must not reach any session');
assert.deepEqual(live.resized, [], 'a malformed id must not reach any session');
assert.equal(live.killed, false, 'a malformed id must not kill any session');

controller.write(id, 'x'.repeat(TERMINAL_WRITE_LIMIT_CHARS + 1));
assert.deepEqual(live.written, [], 'an oversized payload must be dropped');
controller.write(id, 123);
assert.deepEqual(live.written, [], 'a non-string payload must be dropped');
controller.write(id, 'x'.repeat(TERMINAL_WRITE_LIMIT_CHARS));
assert.equal(live.written.length, 1, 'a payload at the limit must go through');

controller.resize(id, 0, 24);
controller.resize(id, 80, 99999);
controller.resize(id, 80.5, 24);
assert.deepEqual(live.resized, [], 'out-of-range dimensions must be dropped');
controller.resize(id, 120, 40);
assert.deepEqual(live.resized, [{ cols: 120, rows: 40 }], 'valid dimensions must go through');

// -- output and exit are forwarded on the shared channels, tagged with the session id --
live.emitData('hello');
assert.deepEqual(sent.at(-1), { channel: TERMINAL_CHANNELS.data, payload: { id, chunk: 'hello' } });
live.emitExit(0);
assert.deepEqual(sent.at(-1), { channel: TERMINAL_CHANNELS.exit, payload: { id, code: 0 } });
controller.write(id, 'after-exit');
assert.equal(live.written.length, 1, 'writes to an exited session must be dropped');

// -- disposeAll leaves nothing running --
const survivor = await controller.start(granted, 80, 24);
assert.ok(isTerminalSessionId(survivor));
controller.disposeAll();
assert.equal(ptys.at(-1)!.killed, true, 'disposeAll must kill every live session');

clearProjectRootGrants();

// -- every registered channel validates its sender before touching the controller --
// This is a SOURCE-TEXT check, not an executed one: installTerminalIpc needs a live
// Electron ipcMain, which tsx cannot provide, so nothing here proves the guard runs.
// It is here to catch the regression that has bitten this repo before -- a new channel
// added next to the guarded ones without the guard -- in the same way
// export-reveal.verify.ts pins main.ts's reveal handler.
const source = await readFile(new URL('./terminal-ipc.ts', import.meta.url), 'utf8');
const handlers = source.split('ipcMain.handle(').slice(1);
assert.equal(handlers.length, 4, 'the four terminal channels must each be registered exactly once');
for (const handler of handlers) {
  const guardAt = handler.indexOf('assertTrustedDesktopSenderUrl');
  const useAt = handler.indexOf('controller.');
  assert.ok(guardAt >= 0, 'every terminal channel must validate its sender origin');
  assert.ok(useAt >= 0 && guardAt < useAt, 'the sender check must run before the controller is touched');
}

console.log('terminal-ipc.verify: grant gating, command opacity and uniform refusals hold');
