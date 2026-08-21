import assert from 'node:assert/strict';
import { matchRelinkFile } from './mediaRelinkMatch';

const file = (name: string, type = ''): File => new File([new Uint8Array([1])], name, { type });

const asset = (name: string, extra: Partial<{ sourceFilename: string; kind: string }> = {}) => ({
  name,
  sourceFilename: extra.sourceFilename,
  kind: (extra.kind ?? 'image') as 'video' | 'image' | 'audio' | 'gif' | 'svg',
});

async function main(): Promise<void> {
  // 1. Exact filename match (case-insensitive) wins.
  // CJK filenames below: "star chart", "display name", "original", "dance",
  // "footage", "missing", "other" - non-ASCII filename round-trip coverage.
  assert.equal(matchRelinkFile(asset('\u661f\u56fe.png'), [file('\u661f\u56fe.png')])?.name, '\u661f\u56fe.png');
  assert.equal(matchRelinkFile(asset('Star.png'), [file('star.PNG')])?.name, 'star.PNG');
  // sourceFilename (original file name) is preferred over display name.
  assert.equal(
    matchRelinkFile(asset('\u663e\u793a\u540d', { sourceFilename: '\u539f\u59cb.mp4' }), [file('\u539f\u59cb.mp4'), file('\u663e\u793a\u540d.mp4')])?.name,
    '\u539f\u59cb.mp4',
  );

  // 2. Stem match bridges extension changes (mp4 → mov) — the #48 report case.
  assert.equal(matchRelinkFile(asset('\u821e\u8e48.mp4', { kind: 'video' }), [file('\u821e\u8e48.mov')])?.name, '\u821e\u8e48.mov');
  assert.equal(matchRelinkFile(asset('clip.mov', { kind: 'video' }), [file('CLIP.mp4')])?.name, 'CLIP.mp4');

  // 3. Multiple stem candidates: prefer the kind-matching file.
  assert.equal(
    matchRelinkFile(asset('\u7d20\u6750', { kind: 'audio' }), [file('\u7d20\u6750.mp4'), file('\u7d20\u6750.mp3')])?.name,
    '\u7d20\u6750.mp3',
  );
  assert.equal(
    matchRelinkFile(asset('\u7d20\u6750', { kind: 'video' }), [file('\u7d20\u6750.mp4'), file('\u7d20\u6750.mp3')])?.name,
    '\u7d20\u6750.mp4',
  );

  // 4. Ambiguous stems with no kind match → null (no silent wrong relink).
  assert.equal(matchRelinkFile(asset('\u7d20\u6750', { kind: 'image' }), [file('\u7d20\u6750.mp4'), file('\u7d20\u6750.mp3')]), null);

  // 5. No name / no match → null.
  assert.equal(matchRelinkFile(asset(''), [file('x.png')]), null);
  assert.equal(matchRelinkFile(asset('\u7f3a\u5931.png'), [file('\u522b\u7684.png')]), null);

  // 6. Exact match beats stem match even when stems collide.
  assert.equal(
    matchRelinkFile(asset('a.png'), [file('a.png'), file('a.jpg')])?.name,
    'a.png',
  );

  console.log('mediaRelinkMatch.verify: all assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
