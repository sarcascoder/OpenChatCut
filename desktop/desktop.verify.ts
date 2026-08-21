// Desktop shell pure-logic check: env parse round-trip, mini-connect prefix routing
// semantics (the plugin mount contract), static MIME. Run: npx tsx desktop/desktop.check.ts (in npm test).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseEnvText } from './env-file.ts';
import { createMiniConnect, matchRoute, rewriteUrl } from './mini-connect.ts';
import { staticMime } from './static-files.ts';

// ── env-file ────────────────────────────────────────────────────────────
{
  const env = parseEnvText([
    'LLM_API_KEY=sk-plain',
    'A_QUOTED="v#1"',
    "B_SINGLE='x y'",
    'C_COMMENT=val # trailing note',
    'D_EMPTY=',
    '# whole-line comment',
    'not a kv line',
    '  E_SPACED =  padded  ',
  ].join('\n'));
  assert.equal(env.LLM_API_KEY, 'sk-plain');
  assert.equal(env.A_QUOTED, 'v#1', 'paired quotes stripped, inner # kept');
  assert.equal(env.B_SINGLE, 'x y');
  assert.equal(env.C_COMMENT, 'val', 'unquoted value truncates at #');
  assert.ok(!('D_EMPTY' in env), 'empty value never seeds');
  assert.equal(env.E_SPACED, 'padded');
  console.log('env-file parse: OK');
}

// ── mini-connect route semantics ─────────────────────────────────────────
{
  assert.equal(matchRoute('/export', '/export'), '/');
  assert.equal(matchRoute('/export', '/export/job'), '/job', 'whole-segment prefix hits');
  assert.equal(matchRoute('/export', '/exportx'), null, 'non-segment boundary misses');
  assert.equal(matchRoute('/', '/anything'), '/anything');
  assert.equal(rewriteUrl('/export/job?a=1', '/export/job'), '/?a=1', 'query preserved');
  assert.equal(rewriteUrl('/upload?name=x', '/upload'), '/?name=x');
  assert.equal(rewriteUrl('/media/uploads/%E4%B8%AD.mp4', '/media/uploads'), '/%E4%B8%AD.mp4');
  console.log('mini-connect match/rewrite: OK');
}

// ── mini-connect dispatch: next, url rewrite/restore, 404, async → 500 ───
type FakeRes = ServerResponse & { statusCode: number; body: string; ended: boolean };
function fakeRes(): FakeRes {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 0, body: '', ended: false, headersSent: false, writableEnded: false,
    setHeader: (k: string, v: string) => { headers[k] = v; },
    writeHead(code: number) { res.statusCode = code; (res as { headersSent: boolean }).headersSent = true; return res; },
    end(chunk?: string) { res.ended = true; (res as { writableEnded: boolean }).writableEnded = true; if (chunk) res.body += chunk; },
    on: () => res,
  };
  return res as unknown as FakeRes;
}
function fakeReq(url: string): IncomingMessage {
  return { url, method: 'GET', headers: {} } as unknown as IncomingMessage;
}

async function tick(): Promise<void> { await new Promise((r) => setTimeout(r, 0)); }

{
  const errors: unknown[] = [];
  const app = createMiniConnect((e) => errors.push(e));
  const seen: string[] = [];
  app.use('/a', (req, _res, next) => { seen.push(`a:${req.url}`); next(); });
  app.use('/a/b', (req, _res, next) => { seen.push(`ab:${req.url}`); next(); });
  app.use((req, res) => { seen.push(`root:${req.url}`); res.writeHead(200); res.end('done'); });

  const res = fakeRes();
  app.handle(fakeReq('/a/b/c?q=1'), res);
  assert.deepEqual(seen, ['a:/b/c?q=1', 'ab:/c?q=1', 'root:/a/b/c?q=1'], 'rewritten per layer, the fallback layer sees the original url');
  assert.equal(res.statusCode, 200);

  const res404 = fakeRes();
  const app2 = createMiniConnect(() => {});
  app2.use('/only', (_req, res2) => { res2.writeHead(200); res2.end(); });
  app2.handle(fakeReq('/other'), res404);
  assert.equal(res404.statusCode, 404, 'no match → 404');

  const res500 = fakeRes();
  const app3 = createMiniConnect((e) => errors.push(e));
  app3.use('/boom', async () => { throw new Error('kaput'); });
  app3.handle(fakeReq('/boom'), res500);
  await tick();
  assert.equal(res500.statusCode, 500, 'async rejection → 500');
  assert.match(res500.body, /kaput/);
  assert.equal(errors.length, 1);
  console.log('mini-connect dispatch: OK');
}

// ── staticMime ──────────────────────────────────────────────────────────
{
  assert.equal(staticMime('index.html'), 'text/html; charset=utf-8');
  assert.equal(staticMime('app.js'), 'text/javascript', 'ES module strict MIME');
  assert.equal(staticMime('style.css'), 'text/css');
  assert.equal(staticMime('font.woff2'), 'font/woff2');
  assert.equal(staticMime('lut.cube'), 'text/plain; charset=utf-8');
  assert.equal(staticMime('clip.mp4'), 'video/mp4', 'media goes through the media-dir table');
  console.log('staticMime: OK');
}

// Editor windows must keep their MCP bridge heartbeat alive while in the
// background: Electron throttles background timers by default, which drops
// the long-poll touch cadence below the 35s online lease and leaves the
// editor registered but connected:false (issue #86).
{
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const prefs = main.match(/webPreferences:\s*\{[\s\S]*?\}/g) ?? [];
  assert.ok(prefs.length >= 2, 'main and transcript windows define webPreferences');
  for (const block of prefs) {
    assert.match(block, /backgroundThrottling:\s*false/, 'every editor webPreferences keeps the bridge heartbeat running in the background');
  }
}

console.log('\ndesktop.check: ALL PASSED');
