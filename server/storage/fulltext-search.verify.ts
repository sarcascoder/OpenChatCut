// Phase C-2 verify: FTS5 full-text search with jieba segmentation.
// Real SQLite + FTS5: chat/caption/transcript indexing, Chinese 2-char words,
// deletion sync, post-migration rebuild, bm25 ranking.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'occ-fts-verify-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  process.env.OPENCHATCUT_SQLITE_STORE = '1';

  try {
    const { initializeSqliteProjectStore, SQLITE_STORE_ENV } = await import('./sqlite-store.ts');
    process.env[SQLITE_STORE_ENV] = '1';
    await initializeSqliteProjectStore();
    const {
      indexStoreKey,
      removeStoreKey,
      rebuildSearchIndex,
      resetSearchForTests,
      searchContent,
    } = await import('./fulltext-search.ts');
    const { segmentForIndex } = await import('./search-tokenizer.ts');

    // ── tokenizer: Chinese 2-char words and mixed text ──
    // CJK below stays as escapes: jieba segmentation is the behaviour under test.
    // "subtitle" / "turn down the background music volume" ("background music") / "export 4K video"
    assert.equal(segmentForIndex('\u5b57\u5e55'), '\u5b57\u5e55', 'a 2-char word must stay whole');
    assert.ok(segmentForIndex('\u628a\u80cc\u666f\u97f3\u4e50\u7684\u97f3\u91cf\u964d\u4f4e').includes('\u80cc\u666f\u97f3\u4e50'), 'domain words must segment');
    assert.ok(segmentForIndex('\u5bfc\u51fa4K\u89c6\u9891').includes('4K'), 'latin runs must stay intact');

    // ── chat indexing: per-message rows ──
    // "turn down the background music volume a bit" / "sure, make the caption
    // style gold too" (thinking: "adjusting the style"); query "background music volume"
    indexStoreKey('chat:project-a', {
      messages: [
        { role: 'user', text: '\u628a\u80cc\u666f\u97f3\u4e50\u7684\u97f3\u91cf\u964d\u4f4e\u4e00\u70b9' },
        { role: 'assistant', text: '\u597d\u7684\uff0c\u5b57\u5e55\u6837\u5f0f\u4e5f\u6539\u6210\u91d1\u8272', thinking: '\u8c03\u6574\u6837\u5f0f' },
        { role: 'tool', text: '', tool: { name: 'set_item_volume' } },
      ],
    });
    const chatHits = searchContent('\u80cc\u666f\u97f3\u4e50\u97f3\u91cf');
    assert.ok(chatHits.some((hit) => hit.kind === 'chat' && hit.ref.startsWith('chat:project-a:')),
      'chat text must be searchable by segmented words');
    const assistantHits = searchContent('\u5b57\u5e55\u6837\u5f0f'); // "caption style"
    assert.ok(assistantHits.some((hit) => hit.ref.endsWith(':1')), 'assistant message must match');

    // ── project indexing: captions (cue text) + transcript words ──
    // cue "the seaside at dusk"; transcript words "transition", "subtitle"
    indexStoreKey('project:project-a', {
      timelines: [{
        tracks: {
          C1: {
            captions: {
              enabled: true,
              cues: [{ startFrame: 0, text: '\u9ec4\u660f\u7684\u6d77\u8fb9' }],
            },
          },
        },
      }],
      assets: [{
        id: 'asset-1',
        transcript: { words: [{ text: '\u8f6c\u573a' }, { text: '\u5b57\u5e55' }] },
      }],
    });
    const captionHits = searchContent('\u9ec4\u660f'); // "dusk"
    assert.ok(captionHits.some((hit) => hit.kind === 'caption' && hit.projectId === 'project-a'),
      'caption cue text must be searchable');
    const transcriptHits = searchContent('\u8f6c\u573a'); // "transition"
    assert.ok(transcriptHits.some((hit) => hit.kind === 'transcript'),
      'transcript words must be searchable');

    // ── project scoping ──
    const scoped = searchContent('\u5b57\u5e55', { projectId: 'project-b' }); // "subtitle"
    assert.equal(scoped.length, 0, 'another project must not see the hits');

    // ── bm25 ranking: exact multi-token match ranks above partial ──
    // "turn the background music volume down a bit more" vs "a completely
    // unrelated topic of discussion"; query "background music" + "volume"
    indexStoreKey('chat:project-b', {
      messages: [
        { role: 'user', text: '\u80cc\u666f\u97f3\u4e50\u97f3\u91cf\u518d\u4f4e\u4e00\u70b9' },
        { role: 'user', text: '\u5b8c\u5168\u65e0\u5173\u7684\u8bdd\u9898\u8ba8\u8bba' },
      ],
    });
    const ranked = searchContent('\u80cc\u666f\u97f3\u4e50 \u97f3\u91cf');
    assert.ok(ranked.length > 0);
    assert.ok(ranked[0]!.score >= ranked[ranked.length - 1]!.score, 'scores must descend');

    // ── hash-gated refresh: same content does not duplicate rows ──
    indexStoreKey('chat:project-b', {
      messages: [{ role: 'user', text: '\u80cc\u666f\u97f3\u4e50\u97f3\u91cf\u518d\u4f4e\u4e00\u70b9' }],
    });
    const afterRefresh = searchContent('\u80cc\u666f\u97f3\u4e50\u97f3\u91cf', { projectId: 'project-b' });
    assert.equal(afterRefresh.length, 1, 'unchanged content must not re-index');

    // ── deletion sync ──
    removeStoreKey('chat:project-b');
    assert.equal(searchContent('\u80cc\u666f\u97f3\u4e50\u97f3\u91cf', { projectId: 'project-b' }).length, 0,
      'deleted key must drop its rows');

    // ── rebuild (post-migration backfill) ──
    // Seed a kv row first: rebuild scans the kv table (created by store writes).
    const { sqliteWriteEntry } = await import('./sqlite-store.ts');
    await sqliteWriteEntry('chat:rebuild-src', {
      // "rebuild-index test text"; query below is "rebuild index"
      messages: [{ role: 'user', text: '\u91cd\u5efa\u7d22\u5f15\u6d4b\u8bd5\u6587\u672c' }],
    });
    const rebuilt = rebuildSearchIndex();
    assert.ok(rebuilt.indexed >= 1, 'rebuild must scan chat/project keys');
    assert.ok(searchContent('\u91cd\u5efa\u7d22\u5f15').some((hit) => hit.ref.startsWith('chat:rebuild-src:')),
      'rebuild must restore hits');

    // ── search unavailable without SQLite enabled ──
    process.env[SQLITE_STORE_ENV] = '0';
    resetSearchForTests();
    // "subtitle"
    assert.equal(searchContent('\u5b57\u5e55').length, 0, 'search must be a no-op without the SQLite store');

    console.log('✓ fulltext-search verify: tokenizer/index/search/ranking/scoping/delete-sync/rebuild all passed');
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
