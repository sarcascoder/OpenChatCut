import assert from 'node:assert/strict';
import {
  AGENT_PATH_IMPORT_SCHEMAS,
  AGENT_PATH_IMPORT_TOOL_NAMES,
  MAX_IMPORT_PATHS,
  execAgentPathImportTool,
} from './agent-path-import-tools';
import type { AgentContext } from '../context';
import type { DirectoryImportedFile } from '../../../shared/directory-import';

// -- Schema surface --
const byName = new Map(AGENT_PATH_IMPORT_SCHEMAS.map((schema) => [schema.name, schema]));
assert.equal(AGENT_PATH_IMPORT_SCHEMAS.length, 2, 'exactly import_asset and import_folder');
for (const name of ['import_asset', 'import_folder']) {
  const schema = byName.get(name);
  assert.ok(schema, `${name} schema exists`);
  assert.ok(AGENT_PATH_IMPORT_TOOL_NAMES.has(name), `${name} registered in the tool name set`);
  const properties = (schema!.input_schema as { properties?: Record<string, unknown> }).properties ?? {};
  const pathProp = properties['path'] as { type?: string } | undefined;
  assert.equal(pathProp?.type, 'string', `${name} path is a string`);
  assert.match(schema!.description ?? '', /AGENT_IMPORT_ROOTS/, `${name} documents the whitelist`);
}

// import_folder takes exactly one directory, so `path` stays required there.
assert.ok(
  (byName.get('import_folder')!.input_schema as { required?: string[] }).required?.includes('path'),
  'import_folder still requires a single path',
);

// import_asset accepts a BATCH. This is not cosmetic: every import commits and
// advances the project revision, which ends an open MCP edit session, so N files
// imported as N calls costs N sessions while one call with N paths costs one.
// The schema must advertise `paths` or an agent will never batch.
const assetSchema = byName.get('import_asset')!;
const assetProps = (assetSchema.input_schema as { properties?: Record<string, unknown> }).properties ?? {};
const pathsProp = assetProps['paths'] as { type?: string; items?: { type?: string } } | undefined;
assert.equal(pathsProp?.type, 'array', 'import_asset advertises a paths array');
assert.equal(pathsProp?.items?.type, 'string', 'paths items are strings');
assert.match(assetSchema.description ?? '', /ONE CALL/, 'the description tells the agent to batch');
assert.equal(
  (assetSchema.input_schema as { required?: string[] }).required,
  undefined,
  'import_asset requires neither key by name: either paths or path is accepted',
);

// ── Browser (window exists, no desktop bridge): clear desktop-only error ──
(globalThis as unknown as { window?: unknown }).window = {};
try {
  const browserResult = await execAgentPathImportTool('import_asset', { path: '/Volumes/MediaDrive/A.mp4' }, {} as AgentContext);
  assert.match(String(browserResult.error), /desktop app only/, 'browser gets the desktop-only error');
  assert.equal('ok' in browserResult, false, 'browser path never reports success');
} finally {
  delete (globalThis as unknown as { window?: unknown }).window;
}

// ── Missing path: rejected before any bridge call ──
const desktopBridge = {
  calls: [] as Array<{ paths: readonly string[]; projectId: string }>,
  async importAgentPaths(request: { paths: readonly string[]; projectId: string; knownHashes: readonly string[] }) {
    this.calls.push(request);
    return { imported: [], errors: [] };
  },
};
(globalThis as unknown as { window?: unknown }).window = { openChatCutDesktop: desktopBridge };
try {
  const empty = await execAgentPathImportTool('import_asset', { path: '   ' }, {} as AgentContext);
  assert.match(String(empty.error), /is required/, 'blank path rejected');
  assert.equal(desktopBridge.calls.length, 0, 'no bridge call for a blank path');
  const emptyList = await execAgentPathImportTool('import_asset', { paths: ['  ', ''] }, {} as AgentContext);
  assert.match(String(emptyList.error), /is required/, 'a list of blanks is rejected');
  assert.equal(desktopBridge.calls.length, 0, 'no bridge call for an all-blank list');
} finally {
  delete (globalThis as unknown as { window?: unknown }).window;
}

// ── Desktop with an open project: imports land in the pool ──
const importedFile: Omit<DirectoryImportedFile, 'importId'> = {
  name: 'A001.mp4',
  src: '/media/uploads/a001.mp4',
  storedName: 'a001.mp4',
  contentHash: 'a'.repeat(64),
  kind: 'video',
  size: 1234,
  sourceModifiedAt: 1786400000000,
  durationSeconds: 12,
  width: 1920,
  height: 1080,
  sourceFps: 30,
  compatibilityNormalized: true,
};
const addedAssets: Array<{ id: string; name: string }> = [];
const projectCtx = {
  getProjectId: () => 'project-84',
  getState: () => ({ fps: 30 }),
  getDoc: () => ({ assets: [] }),
  commands: { addAsset: (asset: { id: string; name: string }) => { addedAssets.push(asset); } },
} as unknown as AgentContext;
(globalThis as unknown as { window?: unknown }).window = {
  openChatCutDesktop: {
    async importAgentPaths(_request: { paths: readonly string[]; projectId: string; knownHashes: readonly string[] }) {
      return { imported: [{ ...importedFile, importId: 'import-1' }], errors: [] };
    },
  },
};
try {
  const result = await execAgentPathImportTool('import_asset', { path: '/Volumes/MediaDrive/A001.mp4' }, projectCtx);
  assert.equal(result.ok, true, 'desktop import reports ok');
  assert.equal(addedAssets.length, 1, 'the imported asset lands in the pool');
  assert.equal(addedAssets[0]!.name, 'A001.mp4', 'asset name preserved');
  const listed = (result as { imported?: Array<{ name: string }> }).imported;
  assert.equal(listed?.[0]?.name, 'A001.mp4', 'result lists the asset');
} finally {
  delete (globalThis as unknown as { window?: unknown }).window;
}

// ── Desktop without an open project ──
(globalThis as unknown as { window?: unknown }).window = { openChatCutDesktop: desktopBridge };
try {
  const noProject = await execAgentPathImportTool('import_folder', { path: '/Volumes/MediaDrive' }, { getProjectId: () => undefined } as unknown as AgentContext);
  assert.match(String(noProject.error), /no open project/, 'missing project rejected');
} finally {
  delete (globalThis as unknown as { window?: unknown }).window;
}

// ── Bridge failure surfaces the message ──
(globalThis as unknown as { window?: unknown }).window = {
  openChatCutDesktop: {
    async importAgentPaths() { throw new Error('scan failed: EACCES'); },
  },
};
try {
  const failed = await execAgentPathImportTool('import_asset', { path: '/Volumes/MediaDrive/A.mp4' }, projectCtx);
  assert.match(String(failed.error), /scan failed/, 'bridge error message surfaced');
} finally {
  delete (globalThis as unknown as { window?: unknown }).window;
}

// -- Batching: N paths must become ONE bridge call, not N --
// This is the whole point of the change; if it regresses to one call per path,
// a multi-file import silently costs one MCP edit session per file again.
{
  const batchCalls: Array<readonly string[]> = [];
  const files = ['A001.mp4', 'A002.mp4', 'A003.mp4'];
  (globalThis as unknown as { window?: unknown }).window = {
    openChatCutDesktop: {
      async importAgentPaths(request: { paths: readonly string[] }) {
        batchCalls.push(request.paths);
        return {
          imported: request.paths.map((p, i) => ({
            ...importedFile,
            name: p.split('/').pop()!,
            storedName: `a00${i + 1}.mp4`,
            contentHash: String(i).repeat(64).slice(0, 64),
            importId: `import-${i}`,
          })),
          errors: [],
        };
      },
    },
  };
  try {
    addedAssets.length = 0;
    const batched = await execAgentPathImportTool(
      'import_asset',
      { paths: files.map((f) => `/Volumes/MediaDrive/${f}`) },
      projectCtx,
    );
    assert.equal(batched.ok, true, 'a batched import reports ok');
    assert.equal(batchCalls.length, 1, 'three paths must produce exactly ONE bridge call');
    assert.equal(batchCalls[0]!.length, 3, 'all three paths travel in that single call');
    assert.equal(addedAssets.length, 3, 'every imported asset lands in the pool');

    // Duplicates collapse, so a repeated path cannot inflate the batch.
    batchCalls.length = 0;
    await execAgentPathImportTool('import_asset', { paths: ['/x/A.mp4', '/x/A.mp4', ' /x/A.mp4 '] }, projectCtx);
    assert.equal(batchCalls[0]!.length, 1, 'duplicate paths are collapsed');

    // The cap is enforced before the bridge is touched.
    batchCalls.length = 0;
    const tooMany = await execAgentPathImportTool(
      'import_asset',
      { paths: Array.from({ length: MAX_IMPORT_PATHS + 1 }, (_, i) => `/x/${i}.mp4`) },
      projectCtx,
    );
    assert.match(String(tooMany.error), /too many paths/, 'the cap is enforced');
    assert.equal(batchCalls.length, 0, 'an over-cap call never reaches the bridge');
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window;
  }
}

console.log('agent-path-import-tools.verify: schema, browser gate, pool landing and batching passed');
