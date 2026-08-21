// Runs the .check.ts files whose import chain uses Vite-only `?raw` / .frag (bare tsx cannot resolve them).
// esbuild bundles them into a single ESM file (?raw -> file text), then node runs it directly.
// Usage: node scripts/run-check.mjs <path to check file>
import { build } from 'esbuild';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = process.argv[2];
if (!entry) {
  console.error('usage: node scripts/run-check.mjs <check.ts>');
  process.exit(2);
}

const rawPlugin = {
  name: 'vite-raw',
  setup(b) {
    // `import x from './y.frag?raw'` -> the file contents of y.frag as a string (matches Vite semantics)
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -'?raw'.length)),
      namespace: 'raw-text',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw-text' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
      resolveDir: dirname(args.path),
    }));
  },
};

const dir = await mkdtemp(join(tmpdir(), 'cc-check-'));
const outfile = join(dir, 'check.mjs');
try {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    plugins: [rawPlugin],
    loader: { '.frag': 'text', '.vert': 'text' },
    logLevel: 'silent',
  });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(dir, { recursive: true, force: true });
}
