// Registry lifecycle for terminal sessions, exercised with a fake pty so this
// runs under tsx with no native module and no real shell.
// How to run: npx tsx desktop/terminal-session.verify.ts (wired into verify:desktop-window).
import assert from 'node:assert/strict';
import { MAX_TERMINAL_SESSIONS, TerminalRegistry, type PtyLike, type PtySpawn } from './terminal-session.ts';
import { isTerminalSessionId } from '../shared/terminal-session.ts';

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
    written: [], resized: [], killed: false,
    write(data) { this.written.push(data); },
    resize(cols, rows) { this.resized.push({ cols, rows }); },
    kill() { this.killed = true; },
    onData(listener) { onData = listener; },
    onExit(listener) { onExit = listener; },
    emitData(chunk) { onData(chunk); },
    emitExit(code) { onExit(code); },
  } as FakePty;
}

const spawned: FakePty[] = [];
const spawn: PtySpawn = () => { const p = makeFakePty(); spawned.push(p); return p; };

const data: Array<{ id: string; chunk: string }> = [];
const exits: Array<{ id: string; code: number }> = [];
const registry = new TerminalRegistry({
  spawn,
  onData: (id, chunk) => data.push({ id, chunk }),
  onExit: (id, code) => exits.push({ id, code }),
});

// -- start mints an opaque id and spawns exactly one pty --
const id = registry.start({ cwd: '/tmp/project', cols: 80, rows: 24 });
assert.ok(isTerminalSessionId(id), 'the session id must be 32 hex characters');
assert.equal(spawned.length, 1, 'start must spawn exactly one pty');
assert.equal(registry.size(), 1);

// -- ids are unpredictable: a second session must not be derivable from the first --
const second = registry.start({ cwd: '/tmp/project', cols: 80, rows: 24 });
assert.notEqual(second, id, 'each session must get its own id');

// -- writes and resizes reach the right pty --
assert.equal(registry.write(id, 'ls\r'), true);
assert.deepEqual(spawned[0]!.written, ['ls\r']);
assert.deepEqual(spawned[1]!.written, [], 'a write must not reach another session');
assert.equal(registry.resize(id, 120, 40), true);
assert.deepEqual(spawned[0]!.resized, [{ cols: 120, rows: 40 }]);

// -- unknown ids are refused rather than throwing --
assert.equal(registry.write('f'.repeat(32), 'x'), false);
assert.equal(registry.resize('f'.repeat(32), 80, 24), false);
assert.equal(registry.stop('f'.repeat(32)), false);

// -- output is forwarded with its session id --
spawned[0]!.emitData('hello');
assert.deepEqual(data, [{ id, chunk: 'hello' }]);

// -- exit removes the session so its id cannot be reused --
spawned[0]!.emitExit(0);
assert.deepEqual(exits, [{ id, code: 0 }]);
assert.equal(registry.has(id), false, 'an exited session must be forgotten');
assert.equal(registry.write(id, 'x'), false, 'writes to an exited session must be refused');

// -- concurrent sessions are bounded: a loop of starts cannot spawn shells forever --
const capRegistry = new TerminalRegistry({ spawn, onData: () => {}, onExit: () => {} });
const capIds: string[] = [];
for (let index = 0; index < MAX_TERMINAL_SESSIONS; index += 1) {
  capIds.push(capRegistry.start({ cwd: '/tmp/project', cols: 80, rows: 24 }));
}
assert.equal(capRegistry.size(), MAX_TERMINAL_SESSIONS);
const spawnedAtCap = spawned.length;
assert.throws(
  () => capRegistry.start({ cwd: '/tmp/project', cols: 80, rows: 24 }),
  'starting past the ceiling must throw rather than spawn',
);
assert.equal(spawned.length, spawnedAtCap, 'a refused start must not spawn anything');

// -- closing one session frees one slot: the ceiling is not a one-way latch --
assert.equal(capRegistry.stop(capIds[0]!), true);
const reopened = capRegistry.start({ cwd: '/tmp/project', cols: 80, rows: 24 });
assert.ok(isTerminalSessionId(reopened), 'a freed slot must be reusable');
assert.equal(capRegistry.size(), MAX_TERMINAL_SESSIONS);
capRegistry.disposeAll();
assert.equal(capRegistry.size(), 0);

// -- disposeAll kills every live pty: no orphaned shells --
registry.disposeAll();
assert.equal(spawned[1]!.killed, true, 'disposeAll must kill live sessions');
assert.equal(registry.size(), 0);

console.log('terminal-session.verify: lifecycle, id opacity, routing, disposal and the session ceiling OK');
