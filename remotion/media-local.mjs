// Makes `/media/local/<id>` srcs readable by the headless renderer.
//
// The renderer is a separate process that does not talk to the web server: it
// reads every asset over HTTP from Remotion's own static file server, rooted at
// the serve bundle. `/media/uploads/*` works there because render.mjs replaces
// <serveUrl>/media/uploads with a symlink to the one live uploads directory.
// `/media/local/<id>` cannot reuse that trick — ids resolve to arbitrary
// absolute paths under potentially several registered media roots, so there is
// no single directory to link.
//
// Instead each render materializes only the ids its own input props reference,
// into a private per-render directory under the serve root, and the srcs are
// rewritten to point at it. Two properties of Remotion's bundled static file
// server (node_modules/@remotion/renderer/dist/serve-handler/index.js) were
// measured by serving real files through it. Only the first dictates the shape:
//
//   1. It lstat()s the final path component and answers 404 for a symlink
//      ("symlinks" is off and not configurable from here). A per-file symlink —
//      the obvious analogue of the uploads link — is therefore invisible to the
//      renderer. Only an intermediate *directory* component may be a symlink,
//      which is why the uploads link works. So the entry has to be a real
//      directory entry for the file: a hard link, or a copy when the source
//      lives on another filesystem. This one is load-bearing: a symlink here
//      404s, and that was reproduced through a real render.
//   2. Content-Type comes from the file extension alone. A bare handle id has
//      none, and the server then sends no Content-Type header at all. This one
//      is NOT load-bearing on 4.0.509 — mp4, png and wav all rendered
//      byte-identically from extensionless entries, because @remotion/media
//      sniffs the container, <img> sniffs, and the server-side audio download
//      does too. The materialized name carries the source extension anyway, to
//      keep Content-Type correct for a future consumer that does need it.
//
// A missing entry is a 404, and a 404 is not reliably loud: what surfaces
// depends on which element holds the src and on the Remotion version. Measured
// on 4.0.509 the picture paths did throw (<Img> after retrying, <Video> after
// falling back to <OffthreadVideo>), but render.mjs documents the same 404
// arriving as a blank still for the stale-uploads case. So nothing here should
// be trusted to raise; the verify asserts decoded output, not absence of error.
import { createWriteStream, constants as fsConstants } from 'node:fs';
import { link, lstat, mkdir, mkdtemp, open as openFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

/** URL prefix minted by the web server (server/plugins/upload-routes.ts). */
export const MEDIA_LOCAL_PREFIX = '/media/local/';
/**
 * URL prefix of the per-render materialized copies. Deliberately NOT under
 * MEDIA_LOCAL_PREFIX: a rewritten src must never look like an unresolved one,
 * so that re-walking already-rewritten props cannot mistake it for a handle.
 */
export const MEDIA_LOCAL_RENDER_PREFIX = '/media/local-render/';

/** One path segment after the prefix, plus an optional query/fragment. */
const MEDIA_LOCAL_URL = /^\/media\/local\/([^/?#]+)(?:[?#].*)?$/;
/** Same id shape the serving route accepts — see mediaLocalHandleFromUrl. */
const HANDLE_ID = /^[a-f0-9]{16,64}$/;
/** Conservative: the extension is pasted into a filename we then serve. */
const SAFE_EXTENSION = /^\.[A-Za-z0-9]{1,10}$/;

/** The handle id in a `/media/local/<id>` src, or null when it is not one. */
export function mediaLocalIdFromSrc(value) {
  if (typeof value !== 'string') return null;
  const id = MEDIA_LOCAL_URL.exec(value)?.[1];
  return id && HANDLE_ID.test(id) ? id : null;
}

/**
 * Every distinct `/media/local/…` string anywhere in `value`.
 *
 * Membership is `startsWith(MEDIA_LOCAL_PREFIX)`, not "is a valid handle URL",
 * on purpose: a malformed one must reach materializeMediaLocalSrcs and throw
 * there rather than be quietly skipped.
 */
export function collectMediaLocalSrcs(value) {
  const found = new Set();
  const seen = new WeakSet();
  const walk = (node) => {
    if (typeof node === 'string') {
      if (node.startsWith(MEDIA_LOCAL_PREFIX)) found.add(node);
      return;
    }
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    for (const child of Array.isArray(node) ? node : Object.values(node)) walk(child);
  };
  walk(value);
  return found;
}

/**
 * A copy of `value` with every src in `urlBySrc` replaced. Remotion serializes
 * input props into the browser, so they have to be JSON-shaped to reach a
 * render at all; this rebuild relies on that and would recurse forever on a
 * cyclic object rather than detecting one.
 */
export function rewriteMediaLocalSrcs(value, urlBySrc) {
  if (typeof value === 'string') return urlBySrc.get(value) ?? value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((child) => rewriteMediaLocalSrcs(child, urlBySrc));
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, rewriteMediaLocalSrcs(child, urlBySrc)]),
  );
}

/**
 * Open an admitted path defensively and describe the inode actually opened.
 *
 * resolveMediaHandle only proves the path was inside a registered media root
 * when the handle was minted (see the TOCTOU note on resolveAllowedMediaPath in
 * server/media-roots.ts), which may be long before this render. This mirrors
 * verifyLocalMediaTarget in server/plugins/upload-routes.ts: O_NOFOLLOW so a
 * substituted symlink fails to open instead of being followed out of the root,
 * plus a device+inode comparison against a fresh lstat. The open descriptor is
 * returned so the copy fallback can read the very bytes that were verified.
 */
async function openVerifiedTarget(absolutePath, id) {
  const noFollow = process.platform === 'win32' ? 0 : fsConstants.O_NOFOLLOW;
  let handle;
  try {
    handle = await openFile(absolutePath, fsConstants.O_RDONLY | noFollow);
  } catch {
    throw new Error(`media handle ${id} no longer points at a readable file`);
  }
  try {
    const [descriptor, onDisk] = await Promise.all([handle.stat(), lstat(absolutePath)]);
    if (!descriptor.isFile() || descriptor.dev !== onDisk.dev || descriptor.ino !== onDisk.ino) {
      throw new Error(`media handle ${id} does not point at a stable regular file`);
    }
    return { handle, dev: descriptor.dev, ino: descriptor.ino };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

/**
 * Put the verified file at `destination` as a real directory entry.
 *
 * A hard link is preferred: it costs no bytes, which is the whole reason the
 * uploads path uses a symlink rather than a per-render copy. It is not
 * available everywhere (another filesystem, or one without hard links), and
 * link()'s treatment of a final symlink is platform-dependent, so the created
 * entry is checked against the inode that was verified rather than assumed.
 * Anything other than "this is exactly that inode" falls back to copying from
 * the already-open descriptor, whose bytes a later on-disk substitution cannot
 * change. `createHardLink` is injectable so the verify can force the fallback
 * without a second filesystem.
 */
async function placeVerifiedFile(source, destination, verified, createHardLink) {
  try {
    await createHardLink(source, destination);
    const placed = await lstat(destination);
    if (placed.isFile() && placed.dev === verified.dev && placed.ino === verified.ino) return;
    await rm(destination, { force: true });
  } catch {
    await rm(destination, { force: true }).catch(() => undefined);
  }
  await pipeline(
    verified.handle.createReadStream({ autoClose: false, start: 0 }),
    createWriteStream(destination),
  );
}

/**
 * Materialize every src in `srcs` under `serveUrl` and map it to the URL the
 * renderer should request instead. Throws on anything it cannot resolve — an
 * unresolvable id must fail the render, never leave a hole in the picture.
 *
 * Each render gets its own mkdtemp directory so that disposing one render's
 * entries does not touch another's. That follows from the directory being
 * unique per call; no test exercises two concurrent renders.
 *
 * @param {object} args
 * @param {string} args.serveUrl  absolute path of the serve bundle directory
 * @param {Iterable<string>} args.srcs
 * @param {(id: string) => string | null} args.resolveHandle
 * @param {(source: string, destination: string) => Promise<void>} [args.createHardLink]
 */
export async function materializeMediaLocalSrcs({ serveUrl, srcs, resolveHandle, createHardLink = link }) {
  const root = path.join(serveUrl, 'media', 'local-render');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'render-'));
  const urlBySrc = new Map();
  const nameById = new Map();
  try {
    for (const src of srcs) {
      const id = mediaLocalIdFromSrc(src);
      if (!id) throw new Error(`renderer: ${src} is not a usable /media/local/<id> reference`);
      let name = nameById.get(id);
      if (!name) {
        const target = resolveHandle(id);
        // Indistinguishable from "denied", exactly as the serving route treats it.
        if (!target) throw new Error(`renderer: media handle ${id} is not registered on this process`);
        const extension = path.extname(target);
        name = `${id}${SAFE_EXTENSION.test(extension) ? extension : ''}`;
        const verified = await openVerifiedTarget(target, id);
        try {
          await placeVerifiedFile(target, path.join(directory, name), verified, createHardLink);
        } finally {
          await verified.handle.close().catch(() => undefined);
        }
        nameById.set(id, name);
      }
      urlBySrc.set(src, `${MEDIA_LOCAL_RENDER_PREFIX}${path.basename(directory)}/${name}`);
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  return {
    urlBySrc,
    directory,
    dispose: () => rm(directory, { recursive: true, force: true }).catch(() => undefined),
  };
}
