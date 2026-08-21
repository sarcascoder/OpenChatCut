import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('./GenerationActivity.tsx', import.meta.url), 'utf8');
const topBarButton = await readFile(new URL('./TopBarIconButton.tsx', import.meta.url), 'utf8');

assert.match(
  component,
  /<TopBarIconButton[\s\S]*?icon="sparkles"[\s\S]*?label="Generation Tasks"/,
  'the generation-tasks button must reuse the shared top-bar icon button',
);
assert.doesNotMatch(
  component,
  /title="Generation Tasks"/,
  'the generation-tasks button must not fall back to an unstyleable native title',
);
assert.match(topBarButton, /className="cc-tip cc-tip-r"/, 'the shared button must use the instant tooltip');
assert.match(topBarButton, /data-tip=\{label\}/, 'the shared button must reuse its label for the tooltip');
assert.match(topBarButton, /onMouseEnter=/, 'the shared button must give consistent hover feedback');
assert.match(topBarButton, /onMouseLeave=/, 'the shared button must restore its style after hover');
assert.equal(
  component.match(/retryClassLabel\(job\.retryClass\)/g)?.length,
  1,
  'each job must compute its retry label exactly once',
);

// Labels the panel renders. They live in the component now, so assert them at the source.
const generationActivityLabels = [
  'Generation Tasks',
  'Legacy parameter summary (cannot be safely rerun)',
  'Parameter snapshot unavailable',
  'Resuming…',
  'Resume Tasks',
  'Loading tasks…',
  'No generation tasks',
  'Open Result',
  'Retry Recoverable Tasks',
  'Check Progress',
] as const;

for (const label of generationActivityLabels) {
  assert.ok(component.includes(label), `the generation activity panel must render “${label}”`);
}

assert.match(component, /\$\{minutes\} min ago/, 'relative minutes must be formatted inline');
assert.match(component, /\$\{hours\} hr ago/, 'relative hours must be formatted inline');
assert.match(component, /\$\{Math\.floor\(hours \/ 24\)\} d ago/, 'relative days must be formatted inline');

console.log('generation activity hover and labelling verified');
