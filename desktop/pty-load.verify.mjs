// Proves the prebuilt PTY binary matches the Electron ABI we ship against.
// How to run: npx electron desktop/pty-load.verify.mjs (wired into verify:desktop-window).
// A native module that loads under plain node can still fail under Electron,
// so this must run in Electron, not in tsx.
import { app } from 'electron';
import assert from 'node:assert/strict';

app.on('ready', async () => {
  try {
    const pty = await import('@homebridge/node-pty-prebuilt-multiarch');
    const spawn = pty.spawn ?? pty.default?.spawn;
    assert.equal(typeof spawn, 'function', 'the pty module must export spawn()');
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const args = process.platform === 'win32' ? ['/c', 'echo PTY-OK'] : ['-c', 'echo PTY-OK'];
    const child = spawn(shell, args, { name: 'xterm-color', cols: 80, rows: 24, cwd: process.cwd() });
    let out = '';
    child.onData((d) => { out += d; });
    await new Promise((resolve) => child.onExit(() => resolve()));
    assert.ok(out.includes('PTY-OK'), `the pty must deliver output, got: ${JSON.stringify(out)}`);
    console.log('pty-load.verify: the prebuilt PTY loads and runs under the Electron ABI');
    app.exit(0);
  } catch (error) {
    console.error('pty-load.verify FAILED:', error);
    app.exit(1);
  }
});
