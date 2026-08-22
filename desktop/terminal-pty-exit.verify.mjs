// Proves a REAL pty's exit event flows through TerminalRegistry with a usable
// exit code. `@homebridge/node-pty-prebuilt-multiarch`'s real `IPty.onExit`
// delivers `{ exitCode, signal }`, NOT a bare number (typings/node-pty.d.ts).
// terminal-session.verify.ts and terminal-ipc.verify.ts both inject FAKE ptys,
// so neither can see a mismatch against the library's actual contract -- that
// is exactly how a prior version of this repo shipped a `PtyLike.onExit` typed
// as `(code: number) => void`, which made the real exit event fail the
// preload's payload guard and get silently dropped, leaving a finished
// terminal looking frozen. This file drives a REAL shell through
// TerminalRegistry, same as pty-load.verify.mjs drives a real shell through
// the raw pty module, so a future contract drift fails here instead of only
// in a live Electron run.
//
// A native module that loads under plain node can still behave differently
// under Electron, so this must run in Electron, not in tsx -- and it needs
// TerminalRegistry's real TypeScript source (not a JS reimplementation of the
// same logic), which is why this process is launched with the `tsx/esm`
// loader registered via NODE_OPTIONS in package.json's verify:desktop-window.
// How to run: NODE_OPTIONS="--import tsx/esm" npx electron desktop/terminal-pty-exit.verify.mjs
// (wired into verify:desktop-window).
import { app } from 'electron';
import assert from 'node:assert/strict';

app.on('ready', async () => {
  try {
    const nodePty = await import('@homebridge/node-pty-prebuilt-multiarch');
    const spawnPty = nodePty.spawn ?? nodePty.default?.spawn;
    assert.equal(typeof spawnPty, 'function', 'the pty module must export spawn()');

    const { TerminalRegistry } = await import('./terminal-session.ts');

    const exits = [];
    const registry = new TerminalRegistry({
      spawn: (options) => {
        // A shell that exits immediately with a known, non-zero code: proves
        // the exit code that reaches the registry is the REAL one, not a
        // stand-in like 0 that could pass even if the shape were wrong.
        const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
        const args = process.platform === 'win32' ? ['/c', 'exit 3'] : ['-c', 'exit 3'];
        return spawnPty(shell, args, {
          name: 'xterm-color',
          cols: options.cols,
          rows: options.rows,
          cwd: options.cwd,
        });
      },
      onData: () => {},
      onExit: (id, code) => exits.push({ id, code }),
    });

    const id = registry.start({ cwd: process.cwd(), cols: 80, rows: 24 });
    assert.ok(registry.has(id), 'the session must be tracked before it exits');
    assert.equal(registry.size(), 1);

    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('the real pty never reported exit')), 10000);
      const intervalId = setInterval(() => {
        if (exits.length > 0) {
          clearInterval(intervalId);
          clearTimeout(timeoutId);
          resolve();
        }
      }, 50);
    });

    assert.equal(exits.length, 1, 'exactly one exit event must reach the registry callback');
    assert.equal(exits[0].id, id, 'the exit event must carry the session id');
    assert.equal(
      exits[0].code,
      3,
      'the exit code must be a usable number, not the raw { exitCode, signal } object node-pty delivers to onExit',
    );
    assert.equal(typeof exits[0].code, 'number', 'the code forwarded to callers must be a number');
    assert.equal(registry.has(id), false, 'an exited session must be forgotten by the registry');
    assert.equal(registry.size(), 0, 'no session may remain after it exits');

    console.log(
      'terminal-pty-exit.verify: a real pty exit event reaches TerminalRegistry with a usable exit code, and the session is removed',
    );
    app.exit(0);
  } catch (error) {
    console.error('terminal-pty-exit.verify FAILED:', error);
    app.exit(1);
  }
});
