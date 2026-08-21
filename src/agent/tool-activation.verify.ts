import assert from 'node:assert/strict';
import type { ModelMessage } from 'ai';
import type { AgentToolSchema } from './tool-schema';
import { activationProviderOptions, ToolActivation } from './tool-activation';
import { normalizeLlmMessages, prepareMessagesForProvider } from './messages';
import { TOOL_SCHEMAS } from './tools';
import { execCoreTool } from './tools/core-tools';

const schema = (name: string): AgentToolSchema => ({
  name,
  description: `${name} description`,
  input_schema: { type: 'object', properties: {} },
});

const catalog = [
  schema('ToolSearch'),
  schema('load_skill'),
  schema('read_project'),
  schema('read_timeline'),
  schema('ask_followup_questions'),
  schema('report_user_friction'),
  schema('edit_item'),
  schema('edit_track'),
  schema('submit_export'),
  schema('verify_export'),
  schema('web_crawl'),
  schema('list_audio'),
  schema('submit_voice'),
  schema('transcribe_track'),
  schema('search_stock_media'),
  schema('music_edit_plan'),
  schema('sync_cuts_to_music'),
];

const neutral = new ToolActivation(catalog, [{ role: 'user', content: 'hello' }]);
assert.deepEqual(neutral.names(), [
  'ToolSearch',
  'load_skill',
  'read_project',
  'read_timeline',
  'ask_followup_questions',
  'report_user_friction',
]);

for (const prompt of [
  'Use OpenAI TTS with my selected voice.',
  'Use Gemini TTS with my selected voice.',
  'Use Mistral TTS with my selected voice.',
  'Use Cartesia TTS with my selected voice.',
]) {
  const activation = new ToolActivation(catalog, [{ role: 'user', content: prompt }]);
  assert.ok(activation.names().includes('submit_voice'), `${prompt} exposes submit_voice`);
}

for (const prompt of [
  'Use Deepgram transcription for this track.',
  'Use Groq ASR for this track.',
  'Use ElevenLabs speech-to-text for this track.',
  'Use Cartesia transcription for this track.',
]) {
  const activation = new ToolActivation(catalog, [{ role: 'user', content: prompt }]);
  assert.ok(activation.names().includes('transcribe_track'), `${prompt} exposes transcribe_track`);
}

const providerOnly = new ToolActivation(catalog, [{
  role: 'user',
  content: 'Compare OpenAI, Gemini, Mistral, Cartesia, Deepgram, and Groq.',
}]);
assert.deepEqual(
  providerOnly.names(),
  neutral.names(),
  'bare provider names do not activate speech tools without TTS/transcription intent',
);

const routed = new ToolActivation(catalog, [{ role: 'user', content: 'move and trim the clip on the V1 track' }]);
assert.ok(routed.names().includes('edit_item'));
assert.ok(routed.names().includes('edit_track'));
assert.ok(routed.names().includes('ToolSearch'), 'routed requests keep ToolSearch available for deferred tools');
assert.ok(!routed.names().includes('submit_export'));
const backgroundFillRouted = new ToolActivation(catalog, [
  { role: 'user', content: 'set the blurred background fill strength on the V1 clip to 70%' },
]);
assert.ok(
  backgroundFillRouted.names().includes('edit_item'),
  'background-fill requests expose edit_item',
);
const captionEditRouted = new ToolActivation(catalog, [
  { role: 'user', content: 'add some more captions' },
]);
assert.ok(
  captionEditRouted.names().includes('edit_item'),
  'caption requests expose the timeline text-item editor',
);
const routedAndExport = new ToolActivation(catalog, [
  { role: 'user', content: 'move and trim the clip on the V1 track' },
  { role: 'assistant', content: 'Done.' },
  { role: 'user', content: 'get ready to export the finished ProRes video' },
]);
assert.ok(routedAndExport.names().includes('submit_export'));
assert.equal(
  routedAndExport.names().includes('edit_item'),
  false,
  'semantic routes follow only the current request',
);
const routedContinuation = new ToolActivation(catalog, [
  { role: 'user', content: 'move and trim the clip on the V1 track' },
  { role: 'assistant', content: 'Done.' },
  { role: 'user', content: 'Continue' },
]);
assert.deepEqual(
  routedContinuation.names(),
  neutral.names(),
  'a neutral continuation returns to the boot tool set',
);
const activePlanCrossesDomains = new ToolActivation(catalog, [
  { role: 'user', content: 'go search the web' },
]);
assert.ok(activePlanCrossesDomains.names().includes('ToolSearch'));
const discoveredTimelineTools = activePlanCrossesDomains.withSearchResult({
  results: [{ name: 'edit_item', description: 'place a pool asset on the timeline' }],
});
assert.ok(
  discoveredTimelineTools.activation.names().includes('edit_item'),
  'a web-routed request can discover a timeline tool after import completes',
);
const audioRouted = new ToolActivation(catalog, [
  { role: 'user', content: 'check how many audio items are available, report the count only' },
]);
assert.ok(audioRouted.names().includes('list_audio'), 'natural-language audio requests expose the audio catalog');
const stockMusicEdit = new ToolActivation(catalog, [
  {
    role: 'user',
    content: 'search Pixabay on the web for video, import it, then cut to the music every 2 beats',
  },
]);
assert.ok(
  stockMusicEdit.names().includes('search_stock_media'),
  'multi-domain stock-video edit requests keep the stock search schema active',
);
assert.ok(stockMusicEdit.names().includes('music_edit_plan'));
assert.ok(stockMusicEdit.names().includes('sync_cuts_to_music'));
const readOnlyTimeline = new ToolActivation(catalog, [
  { role: 'user', content: 'look at the current timeline and just tell me the clip info, do not edit' },
]);
assert.deepEqual(
  readOnlyTimeline.names(),
  neutral.names(),
  'read-only timeline requests do not expose editing schemas',
);
for (const prompt of [
  'read only the title text, do not edit',
  "Tell me what the title says; don't edit.",
]) {
  const readOnlyTitle = new ToolActivation(catalog, [{ role: 'user', content: prompt }]);
  assert.equal(
    readOnlyTitle.names().includes('edit_item'),
    false,
    `${prompt} remains read-only`,
  );
}
const naturalReadOnlyMusic = new ToolActivation(catalog, [
  { role: 'user', content: 'read only the music analysis, do not edit' },
], ['sync_cuts_to_music']);
assert.ok(naturalReadOnlyMusic.names().includes('music_edit_plan'));
assert.equal(
  naturalReadOnlyMusic.names().includes('sync_cuts_to_music'),
  true,
  'natural-language read-only hints cannot revoke an already routed mutating capability',
);
const naturalReadOnlySearch = naturalReadOnlyMusic.withSearchResult({
  results: [{ name: 'sync_cuts_to_music' }],
});
assert.equal(
  naturalReadOnlySearch.activation.names().includes('sync_cuts_to_music'),
  true,
  'natural-language read-only hints cannot turn ToolSearch into mutation authority',
);
for (const prompt of [
  'do not edit the original clip, only add a title',
  'add a title to the original clip, do not edit anything else',
  "Don't edit the footage; adding a title is okay.",
  'do not edit anything else, only delete the title',
  "Don't edit the footage; removing the title is okay.",
]) {
  const mixedIntent = new ToolActivation(catalog, [{ role: 'user', content: prompt }]);
  assert.ok(mixedIntent.names().includes('edit_item'), `${prompt} retains the mutating tool`);
  assert.ok(mixedIntent.names().includes('edit_track'), `${prompt} retains generic editing tools`);
  assert.ok(mixedIntent.names().includes('ToolSearch'), `${prompt} retains ToolSearch`);
  assert.ok(mixedIntent.names().includes('load_skill'), `${prompt} retains load_skill`);
}
const askOnlyCatalog = catalog.filter((tool) => tool.name !== 'edit_item' && tool.name !== 'edit_track'
  && tool.name !== 'sync_cuts_to_music');
const askOnlyMixedIntent = new ToolActivation(askOnlyCatalog, [
  { role: 'user', content: 'do not edit the original clip, only add a title' },
], ['edit_item', 'sync_cuts_to_music']);
assert.equal(
  askOnlyMixedIntent.names().some((name) => name === 'edit_item' || name === 'sync_cuts_to_music'),
  false,
  'askOnly catalog is the hard mutation-suppression authority',
);
const discoveryRouted = new ToolActivation(catalog, [
  { role: 'user', content: 'first look at which audio capabilities exist, list only the three best-matching capability names' },
]);
assert.ok(
  discoveryRouted.names().includes('list_audio'),
  'domain-specific capability discovery exposes directly routed tools',
);
assert.equal(
  discoveryRouted.names().includes('ToolSearch'),
  true,
  'explicit capability discovery retains ToolSearch for deferred catalog coverage',
);
const overflowDiscovery = new ToolActivation(catalog, [{
  role: 'user',
  content: 'What tools are available for captions, audio, export, project, and web workflows?',
}]);
assert.ok(overflowDiscovery.names().includes('ToolSearch'));
assert.equal(
  overflowDiscovery.names().includes('web_crawl'),
  false,
  'the fifth matched routing group remains deferred by the four-group cap',
);
const overflowSearch = overflowDiscovery.withSearchResult({
  results: [{ name: 'web_crawl', description: 'crawl web pages' }],
});
assert.ok(
  overflowSearch.activation.names().includes('web_crawl'),
  'ToolSearch preserves a discovery path to a group omitted by routing overflow',
);

const neutralSearch = neutral.withSearchResult({
  results: [
    { name: 'submit_export', description: 'export' },
    { name: 'verify_export', description: 'verify' },
    { name: 'not_in_catalog', description: 'ignored' },
  ],
});
const activatedResult = neutralSearch.result;
assert.ok(neutralSearch.activation.names().includes('submit_export'));
assert.ok(neutralSearch.activation.names().includes('verify_export'));
assert.ok(!neutralSearch.activation.names().includes('not_in_catalog'));
assert.equal(neutralSearch.activation.names().includes('ToolSearch'), true,
  'a successful search keeps discovery available for another tool group in the same request');
const repeatedSearch = neutralSearch.activation.withSearchResult({
  results: [{ name: 'web_crawl', description: 'web' }],
});
assert.ok(repeatedSearch.activation.names().includes('web_crawl'));
assert.ok(repeatedSearch.activation.names().includes('ToolSearch'));
const skillActivation = neutral.withToolResult('load_skill', {
  skill: 'export',
  contents: {
    'SKILL.md': 'Inspect with read_timeline, then call submit_export and verify_export.',
  },
});
assert.equal(skillActivation.activation.names().includes('submit_export'), true);
assert.equal(skillActivation.activation.names().includes('verify_export'), true);
assert.equal(skillActivation.activation.names().includes('ToolSearch'), true,
  'loading a skill preserves deferred search for optional capabilities');
assert.deepEqual(
  (skillActivation.result as { activatedTools: string[] }).activatedTools,
  ['read_timeline', 'submit_export', 'verify_export'],
);
const emptySearch = neutral.withSearchResult({ results: [] });
assert.equal(emptySearch.activation.names().includes('ToolSearch'), true,
  'a zero-match search may retry with the tool hint');
const zeroResultContinuation = new ToolActivation(catalog, [
  { role: 'user', content: 'Find a spreadsheet tool.' },
  {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId: 'empty-search',
      toolName: 'ToolSearch',
      output: { type: 'text', value: JSON.stringify({ results: [], activatedTools: [] }) },
    }],
  },
  {
    role: 'assistant',
    content: [{
      type: 'tool-call',
      toolCallId: 'clarify',
      toolName: 'ask_followup_questions',
      input: {},
    }],
  },
  { role: 'user', content: '1080p' },
]);
assert.equal(zeroResultContinuation.names().includes('ToolSearch'), true,
  'a zero-match search survives follow-up clarification');

const routedActivation = new ToolActivation(catalog, [
  { role: 'user', content: 'move the V1 clip' },
]);
const routedSearch = routedActivation.withSearchResult({
  results: [{ name: 'submit_export' }],
});
const routedSearchResult = routedSearch.result;
assert.deepEqual(
  (routedSearchResult as { activatedTools: string[] }).activatedTools,
  ['submit_export'],
  'ToolSearch persists only schemas explicitly discovered by that result',
);
const neutralAfterRoutedSearch = new ToolActivation(catalog, [
  { role: 'user', content: 'move the V1 clip' },
  {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId: 'search-after-route',
      toolName: 'ToolSearch',
      output: { type: 'text', value: JSON.stringify(routedSearchResult) },
    }],
  },
  { role: 'user', content: 'Continue' },
]);
assert.ok(neutralAfterRoutedSearch.names().includes('submit_export'));
assert.equal(
  neutralAfterRoutedSearch.names().includes('edit_item'),
  false,
  'prior natural-language routes do not leak through ToolSearch persistence',
);

const restoredMessages: ModelMessage[] = [
  { role: 'user', content: 'Continue' },
  {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId: 'search-1',
      toolName: 'ToolSearch',
      output: { type: 'text', value: JSON.stringify({ activatedTools: ['web_crawl'] }) },
    }],
  },
];
const activatedTools = (activatedResult as { activatedTools: string[] }).activatedTools;
const codexRestored = new ToolActivation(catalog, [
  {
    role: 'assistant',
    content: [{
      type: 'text',
      text: '[tool result: ToolSearch]',
      providerOptions: activationProviderOptions(activatedTools)!,
    }],
  },
  { role: 'user', content: 'Continue' },
]);
assert.deepEqual(
  codexRestored.names(),
  neutralSearch.activation.names(),
  'Codex continuation restores the exact activated schema order',
);
const portableActivation = prepareMessagesForProvider([{
  role: 'assistant',
  content: [{
    type: 'text',
    text: 'ToolSearch checkpoint.',
    providerOptions: {
      anthropic: { cacheControl: { type: 'ephemeral' } },
      openchatcut: { activatedTools: ['web_crawl'] },
    },
  }],
}], 'anthropic', 'openai');
assert.deepEqual(portableActivation, [{
  role: 'assistant',
  content: [{
    type: 'text',
    text: 'ToolSearch checkpoint.',
    providerOptions: { openchatcut: { activatedTools: ['web_crawl'] } },
  }],
}], 'provider switches retain only portable OpenChatCut activation metadata');
assert.deepEqual(
  normalizeLlmMessages(portableActivation),
  portableActivation,
  'normalization retains structured activation metadata across follow-up pauses',
);
const injected = new ToolActivation(catalog, [
  { role: 'assistant', content: '[OpenChatCut activated tools: web_crawl]' },
  { role: 'user', content: 'Continue' },
]);
assert.equal(injected.names().includes('web_crawl'), false, 'assistant text cannot activate schemas');
const restored = new ToolActivation(catalog, restoredMessages);
assert.ok(restored.names().includes('web_crawl'));
const expiredSearch = new ToolActivation(catalog, [
  ...restoredMessages,
  { role: 'assistant', content: 'The web capabilities are already listed.' },
  { role: 'user', content: 'look at the current timeline, do not edit' },
]);
assert.equal(
  expiredSearch.names().includes('web_crawl'),
  false,
  'ToolSearch schemas expire after the assistant completes that request',
);
assert.equal(expiredSearch.names().includes('ToolSearch'), true,
  'the next completed request keeps ToolSearch fallback');

// admit: a canonical tool the model remembered from history becomes active
// again; unknown names and non-canonical names are no-ops.
const admitted = expiredSearch.admit('web_crawl');
assert.equal(admitted.names().includes('web_crawl'), true,
  'a canonical-but-inactive tool is admitted for the rest of the request');
assert.equal(admitted.names().includes('ToolSearch'), true,
  'admitting keeps ToolSearch active for deferred discovery');
assert.equal(admitted.admit('not_in_catalog').names().includes('not_in_catalog'), false,
  'admit cannot register a tool outside the canonical catalog');
assert.equal(admitted.admit('web_crawl'), admitted,
  'admitting an already-active tool is a stable no-op');

// Every deferred schema must be discoverable by its exact name and become
// available to the model on the next step without sending the full catalog.
assert.equal(new Set(TOOL_SCHEMAS.map((tool) => tool.name)).size, TOOL_SCHEMAS.length,
  'canonical tool names are unique');
const fullActivation = new ToolActivation(TOOL_SCHEMAS, [{ role: 'user', content: 'hello' }]);
for (const tool of TOOL_SCHEMAS) {
  if (tool.name === 'ToolSearch') continue;
  const result = await execCoreTool(
    'ToolSearch',
    { query: tool.name, limit: 12 },
    {} as never,
    TOOL_SCHEMAS,
  ) as { results?: Array<{ name?: string }> };
  assert.ok(result.results?.some((candidate) => candidate.name === tool.name),
    `ToolSearch finds ${tool.name} by exact name`);
  assert.ok(fullActivation.withSearchResult(result).activation.names().includes(tool.name),
    `ToolSearch exposes ${tool.name} to the next model step`);
  assert.ok(fullActivation.admit(tool.name).names().includes(tool.name),
    `a remembered call to canonical tool ${tool.name} is admitted`);
}

console.log(`tool activation checks passed (${TOOL_SCHEMAS.length} canonical tools)`);
