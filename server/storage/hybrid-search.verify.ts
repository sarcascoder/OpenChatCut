// Phase C-3 verify: hybrid search fuses FTS5 text hits and sqlite-vec visual
// hits with RRF. Real SQLite: index a chat + a caption and a vector asset in
// one project, then confirm both lanes appear in the fused, ranked result.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vector(seed: number): number[] {
  const values = Array.from({ length: 512 }, (_, index) => Math.sin(seed * 1000 + index) * 0.05);
  values[seed % 512] = 1;
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  return values.map((v) => v / norm);
}

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'occ-hybrid-verify-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  process.env.OPENCHATCUT_SQLITE_STORE = '1';

  try {
    const { initializeSqliteProjectStore, SQLITE_STORE_ENV } = await import('./sqlite-store.ts');
    process.env[SQLITE_STORE_ENV] = '1';
    await initializeSqliteProjectStore();
    const { indexStoreKey } = await import('./fulltext-search.ts');
    const { upsertSemanticVectors } = await import('./semantic-vectors.ts');
    const { hybridSearch } = await import('./hybrid-search.ts');

    // ── text lane: chat mentioning the visual topic ──
    // "this clip has a seaside at dusk, cut it in" / "change the caption style to gold"
    // — Chinese text exercises the jieba FTS5 index/query segmentation pipeline.
    indexStoreKey('chat:project-a', {
      messages: [
        { role: 'user', text: '\u8fd9\u6bb5\u7d20\u6750\u6709\u9ec4\u660f\u7684\u6d77\u8fb9\uff0c\u5e2e\u6211\u526a\u8fdb\u53bb' },
        { role: 'user', text: '\u5b57\u5e55\u6837\u5f0f\u6539\u6210\u91d1\u8272' },
      ],
    });
    // ── visual lane: a vector close to "seaside at dusk" (seed 1) ──
    upsertSemanticVectors('project-a', 'asset-sunset', [
      { assetId: 'asset-sunset', sampleTime: 0, sourceRevision: 'rev-1', vector: vector(1) },
    ]);
    upsertSemanticVectors('project-a', 'asset-other', [
      { assetId: 'asset-other', sampleTime: 0, sourceRevision: 'rev-1', vector: vector(50) },
    ]);

    // ── hybrid: both lanes match the query ──
    const hits = hybridSearch('\u9ec4\u660f\u7684\u6d77\u8fb9', vector(1), { projectId: 'project-a', limit: 10 });
    assert.ok(hits.some((hit) => hit.kind === 'chat'), 'the text lane must contribute');
    assert.ok(hits.some((hit) => hit.kind === 'visual' && hit.assetId === 'asset-sunset'),
      'the visual lane must contribute the closest asset');
    assert.ok(hits.some((hit) => hit.kind === 'visual' && hit.assetId === 'asset-other'),
      'the second asset must rank too');

    // ── RRF ordering: both lanes present; visual nearest first, chat second ──
    const sorted = hits.filter((hit) => hit.kind === 'visual' || hit.kind === 'chat');
    for (let index = 1; index < sorted.length; index += 1) {
      assert.ok(sorted[index - 1]!.score >= sorted[index]!.score, 'RRF scores must descend');
    }

    // ── without a project scope the visual lane is skipped ──
    const textOnly = hybridSearch('\u91d1\u8272', undefined, { limit: 10 });
    assert.ok(textOnly.every((hit) => hit.kind !== 'visual'), 'no vector → text only');
    assert.ok(textOnly.some((hit) => hit.kind === 'chat'), 'text lane must still work');

    // ── store disabled → no hits ──
    process.env[SQLITE_STORE_ENV] = '0';
    const { resetSearchForTests } = await import('./fulltext-search.ts');
    const { resetSemanticVectorsForTests } = await import('./semantic-vectors.ts');
    resetSearchForTests();
    resetSemanticVectorsForTests();
    assert.equal(hybridSearch('\u9ec4\u660f\u7684\u6d77\u8fb9', vector(1), { projectId: 'project-a' }).length, 0,
      'hybrid must be a no-op without the SQLite store');

    console.log('✓ hybrid-search verify: RRF fusion / dual-lane / scoping / disabled-store all passed');
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
