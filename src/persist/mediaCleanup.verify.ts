// Pure-logic check for media cleanup: reference diffing and the exclusive-ownership semantics of cascade delete (running the real flow through the in-memory projectStore).
// How to run: npx tsx src/persist/mediaCleanup.check.ts (wired into verify:persist, runs with pretest).
import assert from 'node:assert/strict';
import { collectAllUploadRefs, unreferencedOf } from './mediaCleanup';
import { createProject, listProjectDocIds, purgeProject } from './projectStore';
import type { ProjectDoc } from '../editor/types';

// ── unreferencedOf: on-disk − referenced ────────────────────────────────
{
  // '\u674e\u767d_01_\u5f00\u7bc7.mp3' = "Li Bai_01_opening.mp3" - non-ASCII filename coverage
  const files = [
    { name: 'a.mp4', bytes: 10, mtimeMs: 1 },
    { name: '\u674e\u767d_01_\u5f00\u7bc7.mp3', bytes: 20, mtimeMs: 2 },
    { name: 'kept.png', bytes: 30, mtimeMs: 3 },
  ];
  const refs = new Set(['/media/uploads/kept.png']);
  const orphans = unreferencedOf(files, refs);
  assert.deepEqual(orphans.map((f) => f.name), ['a.mp4', '\u674e\u767d_01_\u5f00\u7bc7.mp3'], 'referenced files stay out of the orphan list (Chinese names behave the same)');
  console.log('unreferencedOf: OK');
}

// ── reference union + exclusive-ownership check (in-memory projectStore) ──
{
  const doc = (src: string): ProjectDoc => ({
    version: 3,
    assets: [{ id: 'a1', name: 'x', kind: 'video', src, durationInFrames: 30 }],
    mediaFolders: [],
    timelines: [{ id: 'tl1', name: 'Sequence 1', fps: 30, width: 1920, height: 1080, selectedId: null, items: [] } as never],
    activeTimelineId: 'tl1',
  } as never);
  const shared = '/media/uploads/shared.mp4';
  const solo = '/media/uploads/solo.mp4';
  const p1 = await createProject('A', doc(shared));
  const p2 = await createProject('B', doc(shared));
  const p3 = await createProject('C', doc(solo));

  let refs = await collectAllUploadRefs();
  assert.ok(refs.has(shared) && refs.has(solo), 'the union contains every reference');

  // With p3 excluded, solo has no referrer → cascade delete should remove it; shared survives because p2 still holds it
  refs = await collectAllUploadRefs(p3.id);
  assert.ok(!refs.has(solo) && refs.has(shared), 'once itself is excluded: exclusive media is exposed, shared media stays protected');

  // After deleting p1, shared is still referenced by p2
  await purgeProject(p1.id);
  refs = await collectAllUploadRefs();
  assert.ok(refs.has(shared), 'while a copy remains, the shared media reference is not lost');

  for (const m of [p2, p3]) await purgeProject(m.id);
  assert.equal((await listProjectDocIds()).length, 0, 'no documents left after purge');
  console.log('collectAllUploadRefs/cascade semantics: OK');
}

console.log('\nmediaCleanup.check: ALL PASSED');
