// Route check for /media/local/<id>, exercised over a real vite dev server and real
// HTTP requests (not just the pure-function parsers in isolation): only a registered,
// still-verified id serves real bytes; everything else — unregistered, malformed,
// path-shaped, or swapped-for-a-symlink-after-registration — 404s.
// How to run: npx tsx server/plugins/media-local-route.verify.ts (wired into verify:server-extra).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { clearMediaRoots, registerMediaRoot } from '../media-roots.ts';
import { clearMediaHandles, createMediaHandle } from '../media-handles.ts';
import {
  mediaLocalHandleFromUrl,
  registerUploadRoutes,
  verifyLocalMediaTarget,
  type UploadRouteDependencies,
} from './upload-routes.ts';

interface RawResult { status: number; contentType: string | undefined; body: Buffer; }

/**
 * A GET issued with node:http's low-level `path` option, which is sent verbatim on the
 * request line — unlike `fetch`/WHATWG `URL`, it does NOT dot-segment-normalize
 * `../../etc/passwd` before the request leaves the client. That normalization would
 * otherwise quietly "fix" a traversal attempt before it ever reaches the server,
 * making it look defended when the route's own parsing was never actually exercised.
 * This is what lets the path-shaped-id assertions below prove the *server's* rejection,
 * not the HTTP client's.
 */
function rawGet(origin: string, path: string): Promise<RawResult> {
  const { promise, resolve, reject } = Promise.withResolvers<RawResult>();
  const url = new URL(origin);
  const req = request({
    hostname: url.hostname,
    port: url.port,
    path,
    method: 'GET',
  }, (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => resolve({
      status: res.statusCode ?? 0,
      contentType: res.headers['content-type'],
      body: Buffer.concat(chunks),
    }));
  });
  req.on('error', reject);
  req.end();
  return promise;
}

const base = await mkdtemp(join(tmpdir(), 'occ-local-route-'));
const project = join(base, 'Project');
const outside = join(base, 'Outside');
await mkdir(project, { recursive: true });
await mkdir(outside, { recursive: true });
const fixtureBytes = Buffer.from('local-media-route-fixture-bytes-not-json');
await writeFile(join(project, 'clip.mp4'), fixtureBytes);
await writeFile(join(outside, 'secret.txt'), 'outside-root-secret');

clearMediaRoots();
clearMediaHandles();
await registerMediaRoot(project);
const id = await createMediaHandle(join(project, 'clip.mp4'));
assert.ok(id, 'fixture: the handle must exist');

// ── Pure-function coverage: mediaLocalHandleFromUrl's real contract ────────────────
//
// By the time this runs inside the route handler, connect (vite's middleware
// dispatcher) has already stripped the '/media/local' mount prefix from req.url — the
// function never sees the full '/media/local/<id>' path, only the mount-relative
// remainder ('/<id>' or '/<id>?query'), exactly like mediaName() in
// ./upload-route-http.ts treats req.url as pre-stripped for the sibling
// '/media/uploads' mount. These assertions describe that real input shape.

assert.equal(mediaLocalHandleFromUrl(`/${id}`), id, 'a mount-relative url yields its id');
assert.equal(mediaLocalHandleFromUrl(`/${id}?t=1`), id, 'a query string is ignored');

for (const bad of [
  '/',
  '',
  '/../../etc/passwd',
  '/..%2f..%2fetc%2fpasswd',
  '/a/b',
  '/%2e%2e%2f',
  `/${id.slice(0, 10)}`, // truncated: fewer than 16 hex chars
  `/${id.repeat(3)}`, // over-long: more than 64 hex chars
  `/${id.toUpperCase()}`, // ids are always lowercase hex
]) {
  assert.equal(mediaLocalHandleFromUrl(bad), null, `must reject: ${JSON.stringify(bad)}`);
}

console.log('media-local-route.verify: mediaLocalHandleFromUrl rejects every non-id mount-relative input');

// ── verifyLocalMediaTarget in isolation ─────────────────────────────────────────────

assert.equal(
  await verifyLocalMediaTarget(join(project, 'clip.mp4')),
  true,
  'an unchanged admitted file must re-verify',
);
assert.equal(
  await verifyLocalMediaTarget(join(project, 'does-not-exist.mp4')),
  false,
  'a missing path fails closed',
);

// ── Real HTTP, over a real vite dev server mounting registerUploadRoutes ───────────

const routeDependencies: UploadRouteDependencies = {
  resolveUpload: async () => null,
  syncLegacy: async () => undefined,
};
const mediaLocalRoutePlugin: Plugin = {
  name: 'media-local-route-verification',
  configureServer(vite) {
    registerUploadRoutes(vite, routeDependencies);
  },
};

let server: ViteDevServer | undefined;
try {
  server = await createServer({
    root: base,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    plugins: [mediaLocalRoutePlugin],
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('media-local verification server has no TCP address');
  const origin = `http://127.0.0.1:${address.port}`;

  // -- THE ASSERTION THAT WAS MISSING: a freshly registered valid id serves real bytes --
  const served = await globalThis.fetch(`${origin}/media/local/${id}`);
  const servedBytes = Buffer.from(await served.arrayBuffer());
  assert.equal(served.status, 200, `expected 200 for a valid id, got ${served.status}: ${servedBytes.toString('utf8')}`);
  assert.deepEqual(
    servedBytes,
    fixtureBytes,
    'a valid, registered id must serve the exact bytes of the admitted file',
  );

  // -- an unregistered but well-formed id 404s --
  const neverRegistered = randomBytes(16).toString('hex');
  assert.notEqual(neverRegistered, id);
  const unknown = await globalThis.fetch(`${origin}/media/local/${neverRegistered}`);
  assert.equal(unknown.status, 404, 'a well-formed but never-registered id must 404');

  // -- forged/truncated/over-long ids 404 --
  for (const malformed of [id.slice(0, 10), id.repeat(3), `${id.slice(0, -2)}zz`]) {
    const response = await globalThis.fetch(`${origin}/media/local/${malformed}`);
    assert.equal(response.status, 404, `malformed id must 404: ${malformed}`);
  }

  // -- path-shaped ids 404, dispatched as raw request lines so no HTTP client
  // normalizes the traversal away before the server ever sees it --
  for (const rawPath of [
    '/media/local/../../etc/passwd',
    '/media/local/..%2f..%2fetc%2fpasswd',
    '/media/local/a/b',
    '/media/local/%2e%2e%2f',
    '/media/local/',
  ]) {
    const response = await rawGet(origin, rawPath);
    assert.equal(response.status, 404, `path-shaped request must 404: ${rawPath}`);
    assert.equal(response.contentType?.includes('application/json'), true,
      `must be our own 404 (json), not an unrelated handler: ${rawPath}`);
    assert.equal(
      response.body.toString('utf8').includes('/etc/passwd')
      || response.body.toString('utf8').includes('secret'),
      false,
      `404 body must not leak filesystem content or paths: ${rawPath}`,
    );
  }
  console.log('media-local-route.verify: unregistered, malformed and path-shaped ids all 404 over real HTTP');

  // -- TOCTOU end-to-end: swap the already-registered handle's target for a symlink
  // pointing outside every root, then re-request the SAME id through the SAME route --
  await rm(join(project, 'clip.mp4'));
  await symlink(join(outside, 'secret.txt'), join(project, 'clip.mp4'));

  const swapped = await globalThis.fetch(`${origin}/media/local/${id}`);
  assert.equal(swapped.status, 404, 'a handle whose target was swapped for an outside symlink must 404, not serve it');
  const swappedBody = await swapped.text();
  assert.equal(swappedBody.includes('outside-root-secret'), false, '404 must not leak the outside file');

  console.log('media-local-route.verify: a handle target swapped for an outside symlink after registration 404s end to end');
} finally {
  await server?.close();
}

// ── verifyLocalMediaTarget: remaining swap shapes, now that the HTTP server is done
// with the fixture path ──────────────────────────────────────────────────────────────

assert.equal(
  await verifyLocalMediaTarget(join(project, 'clip.mp4')),
  false,
  'the symlink swap from the HTTP section above must still fail direct re-verification',
);

// A non-symlink swap (unlink + recreate with a different identity) is a same-path
// regular file, still inside the root — verifyLocalMediaTarget pins path identity
// (real file, not a symlink, at that exact path) at serve time, not byte-for-byte
// content since handle creation; a stronger per-handle content pin is out of scope
// for the containment guarantee this function provides.
await rm(join(project, 'clip.mp4'));
await writeFile(join(project, 'clip.mp4'), 'a different file entirely, same path');
assert.equal(
  await verifyLocalMediaTarget(join(project, 'clip.mp4')),
  true,
  'a same-path regular file re-verifies (fstat/lstat identity matches, as designed)',
);

await rm(join(project, 'clip.mp4'));
assert.equal(
  await verifyLocalMediaTarget(join(project, 'clip.mp4')),
  false,
  'a deleted path fails closed',
);

await rm(base, { recursive: true, force: true });

console.log('media-local-route.verify: TOCTOU re-verification rejects a symlink swap and fails closed on a missing file');
