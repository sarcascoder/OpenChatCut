// Runnable check: `npx tsx src/export/fcpxml.verify.ts`.
// Verify FCPXML export: structure and escape, track→lane, MG placeholder/baked reference, and two P0 fixes —
// ① Audio transcript editing must be split into multiple asset-clips that are consistent with the playback layer (keptSegments) segment by segment;
// ② The assets are converted to the absolute file:// path under mediaDir, otherwise the NLE is full of offline assets.
import assert from 'node:assert/strict';
import { resolveAssetSrc, timelineToFcpxml } from './fcpxml';
import { keptSegments } from '../transcript/edit';
import type { TimelineState } from '../editor/types';

const clipsOf = (xml: string): string[] => xml.match(/<asset-clip[^>]*\/>/g) ?? [];
const attr = (el: string, name: string): string => el.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '';

// ── Infrastructure: single root, required nodes, XML escaping, no undefined/NaN leaks ──
{
  const state: TimelineState = {
    fps: 30, width: 1920, height: 1080, selectedId: null,
    items: [
      { id: 'mg-1', track: 'V1', startFrame: 0, durationInFrames: 60, name: 'Title \u0001\uD800& <Intro>', kind: 'motion-graphic' },
      { id: 'mg-2', track: 'V1', startFrame: 60, durationInFrames: 90, name: 'Outro Card', kind: 'motion-graphic' },
      { id: 'vo-1', track: 'A1', startFrame: 0, durationInFrames: 150, name: 'Voiceover', kind: 'audio', src: '/media/uploads/vo.mp3' },
    ],
  };
  const xml = timelineToFcpxml(state, { title: 'Check\u0000\uFFFE Project' });
  assert.ok(xml.trim().startsWith('<?xml'), 'XML declaration leads');
  assert.ok(xml.trim().endsWith('</fcpxml>'), 'fcpxml closes the doc');
  assert.equal((xml.match(/<fcpxml /g) ?? []).length, 1, 'single root element');
  for (const tag of ['<resources>', '<library>', '<sequence', '<spine>']) {
    assert.ok(xml.includes(tag), `missing ${tag}`);
  }
  assert.ok(xml.includes('frameDuration="1/30s"'), 'fps 30 → frameDuration 1/30s');
  assert.ok(xml.includes('Title &amp; &lt;Intro&gt;'), 'name must be escaped');
  assert.ok(!xml.includes('Title & <Intro>'), 'raw unescaped text must not leak');
  assert.ok(!/undefined|NaN/.test(xml), 'output must not contain undefined/NaN');
  const invalidXmlChar = [...xml].find((char) => {
    const codePoint = char.codePointAt(0)!;
    return !(codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff));
  });
  assert.equal(invalidXmlChar, undefined,
    'FCPXML sink emits only XML 1.0-legal characters in attributes and comments');
  // MG no media → placeholder gap;audio → asset-clip
  assert.equal(clipsOf(xml).length, 1, 'only audio emits an asset-clip');
  assert.equal((xml.match(/<gap name="MG:/g) ?? []).length, 2, 'two MG placeholder gaps');
  // Track → lane: video positive, audio negative
  assert.equal(attr(clipsOf(xml)[0]!, 'lane'), '-1', 'audio hangs on a negative lane');
}

// ── P0-①: Audio transcript editing → multiple paragraphs, aligned with keptSegments one by one ──
{
  // hello 0–1s | ummmm 1–3s(delete) | world 3–4s, timestamp is milliseconds
  const transcript = [
    { text: 'hello', start: 0, end: 1000 },
    { text: 'ummmm', start: 1000, end: 3000 },
    { text: 'world', start: 3000, end: 4000 },
  ];
  const segs = keptSegments(transcript, new Set([1]), 30, 0, {});
  const edited = segs.reduce((sum, seg) => sum + seg.durFrames, 0);
  const state: TimelineState = {
    fps: 30, width: 1920, height: 1080, selectedId: null,
    tracks: { A1: { kind: 'audio' } }, trackOrder: ['A1'],
    items: [{
      id: 'vo', track: 'A1', startFrame: 0, durationInFrames: edited, kind: 'audio',
      name: 'Voiceover', src: '/media/uploads/vo.wav', transcript, deletedWordIdx: [1],
    }],
  };
  const clips = clipsOf(timelineToFcpxml(state));
  assert.equal(clips.length, segs.length, `exported segments must equal played segments (${segs.length})`);
  segs.forEach((seg, i) => {
    assert.equal(attr(clips[i]!, 'offset'), `${seg.fromFrame}/30s`, `segment ${i + 1} timeline position`);
    assert.equal(attr(clips[i]!, 'duration'), `${seg.durFrames}/30s`, `segment ${i + 1} duration`);
    assert.equal(attr(clips[i]!, 'start'), `${seg.srcStartFrame}/30s`, `segment ${i + 1} source in-point`);
  });
  // Regression red line: deleted words must not be overwritten by a paragraph (source frames 30–90)
  const covers = clips.some((c) => {
    const s = Number(attr(c, 'start').split('/')[0]);
    const d = Number(attr(c, 'duration').split('/')[0]);
    return s < 90 && s + d > 30;
  });
  assert.ok(!covers, 'deleted fillers must not appear in any segment');
  // The asset duration should cover the farthest source frame actually used (duration after editing 60 < used 120)
  const assetDur = timelineToFcpxml(state).match(/<asset [^>]*duration="([^"]*)"/)?.[1];
  assert.equal(assetDur, '120/30s', 'asset duration follows the source range actually used');
}

// ── The deletion of words in the video file does not change the picture → it is still a single segment (same semantics as the rendering layer) ──
{
  const state: TimelineState = {
    fps: 30, width: 1920, height: 1080, selectedId: null,
    tracks: { V1: { kind: 'video' } }, trackOrder: ['V1'],
    items: [{
      id: 'cam', track: 'V1', startFrame: 0, durationInFrames: 60, kind: 'video',
      name: 'Camera Angle', src: '/media/uploads/cam.mp4',
      transcript: [{ text: 'a', start: 0, end: 1000 }, { text: 'b', start: 1000, end: 2000 }],
      deletedWordIdx: [0],
    }],
  };
  assert.equal(clipsOf(timelineToFcpxml(state)).length, 1, 'video item stays one continuous segment');
}

// ── P0-②: Convert the asset path to absolute file:// ──
{
  assert.equal(
    resolveAssetSrc('/media/uploads/a.mp4', '/Users/me/proj/public/media/uploads'),
    'file:///Users/me/proj/public/media/uploads/a.mp4',
    'POSIX absolute path',
  );
  // '\u5a92\u4f53' = "media", %E9%87%87%E8%AE%BF = "interview" — non-ASCII path percent-encoding
  assert.equal(
    resolveAssetSrc('/media/uploads/%E9%87%87%E8%AE%BF.mp4', '/Users/me/\u5a92\u4f53'),
    'file:///Users/me/%E5%AA%92%E4%BD%93/%E9%87%87%E8%AE%BF.mp4',
    'CJK directory and filename encode segment by segment',
  );
  assert.equal(
    resolveAssetSrc('/media/uploads/b roll.mov', '/Users/me/clips/'),
    'file:///Users/me/clips/b%20roll.mov',
    'space encoding + trailing directory slash normalized',
  );
  assert.equal(
    resolveAssetSrc('/media/uploads/a.mp4', 'D:\\Media\\Uploads'),
    'file:///D:/Media/Uploads/a.mp4',
    'Windows drive-letter path (colon kept as-is)',
  );
  // '\u5171\u4eab \u7a7a\u95f4' = "shared space" — non-ASCII UNC segments must encode per segment
  assert.equal(
    resolveAssetSrc('\\\\server\\\u5171\u4eab \u7a7a\u95f4\\\u65c5\u884c.\u6700\u7ec8\u7248.001.MOV'),
    'file://server/%E5%85%B1%E4%BA%AB%20%E7%A9%BA%E9%97%B4/%E6%97%85%E8%A1%8C.%E6%9C%80%E7%BB%88%E7%89%88.001.MOV',
    'Windows UNC path keeps the host and encodes per segment',
  );
  assert.equal(
    resolveAssetSrc('https://cdn.example.com/a.mp4', '/Users/me/clips'),
    'https://cdn.example.com/a.mp4',
    'remote URL passes through as-is, never faked as a local path',
  );
  assert.equal(
    resolveAssetSrc('/media/uploads/a.mp4'),
    'file:///media/uploads/a.mp4',
    'no mediaDir falls back to the raw path (export still emits, media offline)',
  );

  const state: TimelineState = {
    fps: 30, width: 1920, height: 1080, selectedId: null,
    tracks: { A1: { kind: 'audio' } }, trackOrder: ['A1'],
    items: [{ id: 'a', track: 'A1', startFrame: 0, durationInFrames: 30, kind: 'audio', name: 'Audio', src: '/media/uploads/\u91c7\u8bbf.wav' }],
  };
  const xml = timelineToFcpxml(state, { mediaDir: '/Users/me/clips' });
  assert.ok(xml.includes('src="file:///Users/me/clips/'), 'export threads it onto the asset src');
  assert.ok(xml.includes('name="\u91c7\u8bbf.wav"'), 'asset name uses the readable decoded filename');
  const assetOpen = xml.match(/<asset(?=[\s>])[^>]*>/)?.[0] ?? '';
  assert.ok(!/\ssrc=/.test(assetOpen), 'FCPXML 1.10 asset no longer uses the legacy src attribute');
  assert.ok(xml.includes('<media-rep kind="original-media"'), 'legacy projects fall back to the internal copy as original-media');
}

// ── Issue #27: preserve immutable original-media identity beside the internal working copy ──
{
  const internalSrc = '/media/uploads/8e45fd6f-8da8-4d6a-8a4f-339d6a8fd747.mp4';
  // '\u65c5\u884c' = "travel", '\u6700\u7ec8\u7248' = "final version" — non-ASCII filename round-trip
  const sourceFilename = '\u65c5\u884c.\u6700\u7ec8\u7248.001.MOV';
  const originalFilePath = '/Users/me/\u65c5\u884c/\u65c5\u884c.\u6700\u7ec8\u7248.001.MOV';
  const item = {
    id: 'clip-1', track: 'V1', startFrame: 0, durationInFrames: 30, kind: 'video' as const,
    name: 'Renamed By User', src: internalSrc, sourceFilename, originalFilePath,
  };
  const state: TimelineState = {
    fps: 30, width: 1920, height: 1080, selectedId: null,
    tracks: { V1: { kind: 'video' } }, trackOrder: ['V1'],
    items: [item],
    assets: [{
      id: 'asset-1', name: 'Another Display Name', kind: 'video', src: internalSrc,
      durationInFrames: 30, sourceFilename, originalFilePath,
    }],
  };
  const xml = timelineToFcpxml(state, { mediaDir: '/Users/me/.openchatcut/media' });
  const assetOpen = xml.match(/<asset(?=[\s>])[^>]*>/)?.[0] ?? '';
  assert.ok(!/\ssrc=/.test(assetOpen), 'the asset location may only live in media-rep');
  assert.ok(assetOpen.includes('name="\u65c5\u884c.\u6700\u7ec8\u7248.001.MOV"'), 'the editable display name must not override the original filename');
  assert.ok(xml.includes('kind="original-media" src="file:///Users/me/%E6%97%85%E8%A1%8C/%E6%97%85%E8%A1%8C.%E6%9C%80%E7%BB%88%E7%89%88.001.MOV"'));
  assert.ok(xml.includes('kind="proxy-media" src="file:///Users/me/.openchatcut/media/8e45fd6f-8da8-4d6a-8a4f-339d6a8fd747.mp4"'));
  // <pathurl> is the FCPXML-standard location element DaVinci Resolve reads;
  // non-ASCII segments stay native UTF-8 (Resolve does not decode
  // percent-encoded paths on macOS), only URL-breaking characters encode.
  assert.ok(xml.includes('<pathurl>file:///Users/me/\u65c5\u884c/\u65c5\u884c.\u6700\u7ec8\u7248.001.MOV</pathurl>'),
    'original-media pathurl keeps native UTF-8 path segments');
  assert.ok(xml.includes('<pathurl>file:///Users/me/.openchatcut/media/8e45fd6f-8da8-4d6a-8a4f-339d6a8fd747.mp4</pathurl>'),
    'proxy-media pathurl carries the internal working copy');
  assert.ok(!xml.includes('<pathurl>file:///Users/me/%E6%97%85%E8%A1%8C'),
    'pathurl never percent-encodes non-ASCII');
  assert.ok(
    xml.includes('src="file:///Users/me/%E6%97%85%E8%A1%8C/%E6%97%85%E8%A1%8C.%E6%9C%80%E7%BB%88%E7%89%88.001.MOV"'),
    'the src attribute keeps its percent-encoded form for NLEs that require it',
  );
  assert.equal((xml.match(/suggestedFilename="\u65c5\u884c\.\u6700\u7ec8\u7248\.001"/g) ?? []).length, 2, 'original and proxy suggestedFilename share the original stem minus the final extension');

  const encodedSeparatorXml = timelineToFcpxml({
    ...state,
    assets: [{
      ...state.assets![0]!,
      sourceFilename: 'literal%2F\u65c5\u884c.\u6700\u7ec8\u7248.001.MOV',
    }],
  }, { mediaDir: '/Users/me/.openchatcut/media' });
  assert.ok(encodedSeparatorXml.includes('suggestedFilename="literal%2F\u65c5\u884c.\u6700\u7ec8\u7248.001"'),
    'literal percent-encoded separators in sourceFilename are not URL-decoded by the serializer');
  assert.ok(!encodedSeparatorXml.includes('suggestedFilename="\u65c5\u884c.\u6700\u7ec8\u7248.001"'));

  const withoutPool = timelineToFcpxml({ ...state, assets: undefined }, { mediaDir: '/Users/me/.openchatcut/media' });
  assert.ok(withoutPool.includes('kind="original-media" src="file:///Users/me/%E6%97%85%E8%A1%8C/'), 'falls back to timeline source metadata once the pool asset is gone');

  const windowsXml = timelineToFcpxml({
    ...state,
    assets: [{ ...state.assets![0]!, originalFilePath: 'D:\\\u5a92\u4f53\\\u65c5\u884c.\u6700\u7ec8\u7248.001.MOV' }],
  }, { mediaDir: 'D:\\OpenChatCut\\media' });
  assert.ok(windowsXml.includes('src="file:///D:/%E5%AA%92%E4%BD%93/%E6%97%85%E8%A1%8C.%E6%9C%80%E7%BB%88%E7%89%88.001.MOV"'), 'Windows original path encodes legally');

  const uncXml = timelineToFcpxml({
    ...state,
    assets: [{ ...state.assets![0]!, originalFilePath: '\\\\server\\\u5171\u4eab \u7a7a\u95f4\\\u65c5\u884c.\u6700\u7ec8\u7248.001.MOV' }],
  }, { mediaDir: '\\\\server\\OpenChatCut\\media' });
  assert.ok(uncXml.includes('kind="original-media" src="file://server/%E5%85%B1%E4%BA%AB%20%E7%A9%BA%E9%97%B4/%E6%97%85%E8%A1%8C.%E6%9C%80%E7%BB%88%E7%89%88.001.MOV"'), 'UNC original path encodes legally');
  assert.ok(uncXml.includes('kind="proxy-media" src="file://server/OpenChatCut/media/8e45fd6f-8da8-4d6a-8a4f-339d6a8fd747.mp4"'), 'UNC proxy path encodes legally');
}

// ── Resolve variants retain existing differences ──
{
  const state: TimelineState = {
    fps: 30, width: 1920, height: 1080, selectedId: null,
    items: [{ id: 'a', track: 'A1', startFrame: 0, durationInFrames: 30, kind: 'audio', name: 'a', src: '/media/uploads/a.mp3' }],
  };
  const resolveXml = timelineToFcpxml(state, { nleFormat: 'fcp_xml_resolve' });
  assert.ok(resolveXml.includes('colorSpace="1-1-1 (Rec. 709)"'), 'Resolve variant carries Rec.709');
  assert.ok(resolveXml.includes('<event name="OpenChatCut Export (Resolve)">'), 'Resolve event name');
  assert.ok(!timelineToFcpxml(state).includes('colorSpace'), 'default variant carries no colorSpace');
}

console.log('fcpxml.verify: ok (structure/escaping/lane/segments/original & proxy media/FCPXML 1.10/Resolve variant)');
