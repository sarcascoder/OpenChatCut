// The headless renderer runs in its own process and reads every asset over HTTP
// from Remotion's static serve bundle, which knows nothing about the web
// server's /media/local/<id> route. Missing resolution is a 404, and a 404 is
// not reliably loud — render.mjs documents the sibling stale-uploads case
// arriving as a blank still rather than an error. So the end-to-end case here
// never asserts "nothing was thrown": it decodes the exported file and asserts
// real non-blank pixels and audible audio, matching the same source served the
// /media/uploads way.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import { createMediaHandle, resolveMediaHandle } from '../server/media-handles.ts';
import { registerMediaRoot } from '../server/media-roots.ts';
import {
  collectMediaLocalSrcs,
  materializeMediaLocalSrcs,
  mediaLocalIdFromSrc,
  rewriteMediaLocalSrcs,
} from './media-local.mjs';
import { renderTimeline, setMediaHandleResolver, setUploadsDirProvider } from './render.mjs';

const run = promisify(execFile);
const width = 160;
const height = 90;
const fps = 30;
// timelineDuration() floors a timeline at one second, so a shorter clip would
// leave genuinely blank tail frames and defeat the non-blank assertion below.
const frameCount = fps;
const frameBytes = width * height * 3;
const softwareH264 = { id: 'libx264', label: 'Software (libx264)', hardware: false, transport: 'server' };
const unknownId = 'f'.repeat(32);

if (!ffmpegPath) throw new Error('ffmpeg-static binary unavailable');

// ── 1. Recognising and rewriting the URL form ──────────────────────────────
const sampleId = '0123456789abcdef0123456789abcdef';
assert.equal(mediaLocalIdFromSrc(`/media/local/${sampleId}`), sampleId);
assert.equal(mediaLocalIdFromSrc(`/media/local/${sampleId}?v=2`), sampleId);
assert.equal(mediaLocalIdFromSrc('/media/local/'), null, 'a missing id is not a handle');
assert.equal(mediaLocalIdFromSrc('/media/local/../../etc/passwd'), null, 'traversal is not a handle');
assert.equal(mediaLocalIdFromSrc(`/media/local/${sampleId}/extra`), null, 'only one segment is a handle');
assert.equal(mediaLocalIdFromSrc('/media/uploads/a.mp4'), null);

const props = {
  state: {
    items: [{ src: `/media/local/${sampleId}`, effects: [{ lutUrl: `/media/local/${sampleId}?v=2` }] }],
    assets: [{ src: '/media/uploads/keep.mp4' }],
  },
};
const collected = collectMediaLocalSrcs(props);
assert.deepEqual(
  [...collected].sort(),
  [`/media/local/${sampleId}`, `/media/local/${sampleId}?v=2`].sort(),
  'the walk must reach srcs nested anywhere in the input props',
);
const rewritten = rewriteMediaLocalSrcs(props, new Map([[`/media/local/${sampleId}`, '/resolved.mp4']]));
assert.equal(rewritten.state.items[0].src, '/resolved.mp4');
assert.equal(rewritten.state.items[0].effects[0].lutUrl, `/media/local/${sampleId}?v=2`, 'untouched srcs survive');
assert.equal(rewritten.state.assets[0].src, '/media/uploads/keep.mp4', 'uploads srcs are left alone');
assert.equal(props.state.items[0].src, `/media/local/${sampleId}`, 'the caller state is not mutated');

const directory = await mkdtemp(join(tmpdir(), 'openchatcut-media-local-'));
try {
  const sourceDir = join(directory, 'project');
  const uploadsDir = join(directory, 'uploads');
  const serveDir = join(directory, 'serve');
  await Promise.all([mkdir(sourceDir), mkdir(uploadsDir), mkdir(serveDir)]);

  const source = join(sourceDir, 'source.mp4');
  await run(ffmpegPath, [
    '-v', 'error',
    '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=${fps}:duration=1.5`,
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    source,
  ]);
  await copyFile(source, join(uploadsDir, 'source.mp4'));

  await registerMediaRoot(sourceDir);
  const id = await createMediaHandle(source);
  assert.ok(id, 'the fixture path must be admitted by the media allowlist');

  // ── 2. What gets materialized into the serve bundle ──────────────────────
  // Remotion's bundled static file server lstat()s the final path component and
  // answers 404 for a symlink, and derives Content-Type from the extension
  // alone. Both were measured directly; a regression on either is the silent
  // blank-frame failure again, so pin the shape here as well as end to end.
  const materialized = await materializeMediaLocalSrcs({
    serveUrl: serveDir,
    srcs: [`/media/local/${id}`, `/media/local/${id}?v=2`],
    resolveHandle: resolveMediaHandle,
  });
  const entries = await readdir(materialized.directory);
  assert.deepEqual(entries, [`${id}.mp4`], 'one entry per id, carrying the source extension');
  const entry = await lstat(join(materialized.directory, `${id}.mp4`));
  assert.ok(entry.isFile(), 'the entry must be a regular file');
  assert.ok(!entry.isSymbolicLink(), 'a symlink here is served as 404, whatever it looks like on disk');
  assert.equal(entry.size, (await lstat(source)).size, 'the entry must hold the source bytes');
  assert.equal(
    materialized.urlBySrc.get(`/media/local/${id}?v=2`),
    materialized.urlBySrc.get(`/media/local/${id}`),
    'the same id is materialized once however many srcs reference it',
  );
  await materialized.dispose();
  assert.deepEqual(
    await readdir(join(serveDir, 'media', 'local-render')),
    [],
    'per-render entries must be removed, so concurrent renders cannot outlive each other',
  );

  await assert.rejects(
    materializeMediaLocalSrcs({ serveUrl: serveDir, srcs: [`/media/local/${unknownId}`], resolveHandle: resolveMediaHandle }),
    /is not registered/,
    'an unknown id must fail loudly instead of leaving a hole in the picture',
  );

  // ── 3. End to end: the exported file has to contain the media ────────────
  setUploadsDirProvider(() => uploadsDir);
  setMediaHandleResolver(resolveMediaHandle);
  process.env.OPENCHATCUT_DISABLE_HARDWARE_ENCODING = '1';

  const timeline = (src) => ({
    id: 'media-local-resolve-verification',
    fps,
    width,
    height,
    fit: 'contain',
    items: [{
      id: 'clip-1',
      name: 'source.mp4',
      kind: 'video',
      src,
      track: 'V1',
      startFrame: 0,
      durationInFrames: frameCount,
      srcInFrame: 0,
      width,
      height,
    }],
    tracks: { V1: { kind: 'video' } },
    trackOrder: ['V1'],
    selectedId: null,
    selectedIds: [],
    assets: [],
  });

  const uploadsOut = join(directory, 'from-uploads.mp4');
  const localOut = join(directory, 'from-local.mp4');
  await renderTimeline({
    state: timeline('/media/uploads/source.mp4'),
    outputLocation: uploadsOut, codec: 'h264', h264Profile: softwareH264,
  });
  await renderTimeline({
    state: timeline(`/media/local/${id}`),
    outputLocation: localOut, codec: 'h264', h264Profile: softwareH264,
  });

  const [uploadsFrames, localFrames] = await Promise.all([decodeRgb(uploadsOut), decodeRgb(localOut)]);
  const blank = uploadsFrames.findIndex((frame) => variance(frame) < 100);
  assert.equal(blank, -1, `the /media/uploads baseline is itself blank at frame ${blank} — the fixture is wrong`);
  for (let frame = 0; frame < frameCount; frame += 1) {
    assert.ok(
      variance(localFrames[frame]) >= 100,
      `/media/local frame ${frame} is blank (variance ${variance(localFrames[frame]).toFixed(2)}) — the renderer did not read the file`,
    );
    const distance = meanSquaredError(localFrames[frame], uploadsFrames[frame]);
    assert.ok(
      distance < 50,
      `/media/local frame ${frame} does not match the /media/uploads render of the same file (MSE ${distance.toFixed(2)})`,
    );
  }

  // Audio takes a different route than picture: Remotion downloads audio assets
  // by URL in the render process and muxes them with ffmpeg, so silence here
  // would mean the resolution worked for the browser and not for the muxer.
  const localAudio = await decodePcm(localOut);
  assert.ok(localAudio.length > 0, 'the /media/local export has no audio stream');
  const localRms = rootMeanSquare(localAudio);
  assert.ok(localRms > 500, `the /media/local export is silent (RMS ${localRms.toFixed(1)})`);

  await assert.rejects(
    renderTimeline({
      state: timeline(`/media/local/${unknownId}`),
      outputLocation: join(directory, 'unknown.mp4'), codec: 'h264', h264Profile: softwareH264,
    }),
    new RegExp(unknownId),
    'an unresolvable id must fail the export, not render it blank',
  );

  console.log(
    `media-local-resolve.verify: ${frameCount}/${frameCount} /media/local frames match the /media/uploads`
    + ` render of the same file and are non-blank (audio RMS ${localRms.toFixed(1)}); unknown ids fail loudly`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function decodeRgb(path) {
  const { stdout } = await run(ffmpegPath, [
    '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ], { encoding: 'buffer', maxBuffer: frameBytes * frameCount * 4 });
  assert.equal(stdout.length, frameBytes * frameCount, `unexpected decoded byte count for ${path}`);
  return Array.from({ length: frameCount }, (_, index) =>
    stdout.subarray(index * frameBytes, (index + 1) * frameBytes));
}

async function decodePcm(path) {
  const { stdout } = await run(ffmpegPath, [
    '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', '16000', 'pipe:1',
  ], { encoding: 'buffer', maxBuffer: 16_000 * 2 * 30 });
  return new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2));
}

function variance(frame) {
  let total = 0;
  let squares = 0;
  let samples = 0;
  for (let index = 0; index < frame.length; index += 12) {
    total += frame[index];
    squares += frame[index] * frame[index];
    samples += 1;
  }
  const mean = total / samples;
  return squares / samples - mean * mean;
}

function meanSquaredError(left, right) {
  let total = 0;
  let samples = 0;
  for (let index = 0; index < left.length; index += 12) {
    const delta = left[index] - right[index];
    total += delta * delta;
    samples += 1;
  }
  return total / samples;
}

function rootMeanSquare(samples) {
  let total = 0;
  for (let index = 0; index < samples.length; index += 1) total += samples[index] * samples[index];
  return Math.sqrt(total / Math.max(1, samples.length));
}
