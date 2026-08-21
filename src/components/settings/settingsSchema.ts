// Set the information architecture of the panel (first-level classification → second-level capability group → third-level provider page → fields) and pure display logic.
// Three columns: Left tree = Category → Capability; Middle column = Vendor list under this capability; Right column = Configuration page of the selected vendor.
// Agent LLM saves independent API URLs, API Keys and models for each vendor; the capability to generate classes can be additionally provided
// Default provider route. Layout/interaction is in SettingsDialog.tsx, vendor icons are in vendorIcons.tsx.
// Security invariant: the secret field only has a Boolean status, and the value will never be backfilled; the model/routing field is a non-secret configuration,
// The current value is echoed through the models channel of GET /api/keys (server-side NON_SECRET_NAMES whitelist).
import {
  LLM_PROVIDER_PRESETS,
  isLocalLlmProvider,
  llmProviderConfigNames,
} from '../../../shared/llm-providers';
import type { CodexAgentStatus } from '../../../shared/codex-agent';
import type { VendorId } from './vendorIcons';
import {
  directory,
  modelSelect,
  modelText,
  routeSelect,
  secret,
  text,
  type KeyStatusResponse,
  type SelectOption,
  type SettingsCategory,
  type SettingsField,
  type SettingsGroup,
  type SettingsVendorPage,
} from './settingsFields';
import {
  ROUTE_NEEDS,
  TRANSCRIPTION_SETTINGS_GROUP,
  VOICE_SETTINGS_GROUP,
  localAsrPage,
} from './settingsMediaProviders';

export type {
  FieldKind,
  KeyState,
  KeyStatusResponse,
  SelectOption,
  SettingsCategory,
  SettingsField,
  SettingsGroup,
  SettingsVendorPage,
} from './settingsFields';

const llmPage = (preset: (typeof LLM_PROVIDER_PRESETS)[number]): SettingsVendorPage => {
  const names = llmProviderConfigNames(preset.id);
  return {
    key: `llm/${preset.id}`,
    vendor: preset.id as VendorId,
    title: preset.label,
    note: preset.id === 'anthropic'
      ? 'The built-in Agent requires an Anthropic API key. Claude Code subscription users should connect through “External agents (MCP)”; OpenChatCut does not accept Claude OAuth.'
      : 'Each provider keeps its own endpoint, key, and model. Test the connection, then choose from the models returned by that API.',
    ...(preset.id === 'anthropic'
      ? { noteAction: { label: 'External agents (MCP)', action: 'open-mcp-guide' } }
      : {}),
    fields: [
      {
        name: names.baseUrl,
        label: 'API URL',
        kind: 'text',
        defaultLabel: preset.baseUrl,
        note: 'Enter the complete API prefix. You can use the official endpoint, your own gateway, or a compatible relay.',
      },
      secret(names.apiKey, isLocalLlmProvider(preset.id) ? 'API Key (optional)' : 'API Key'),
      ...(preset.id === 'openai' ? [{
        name: 'LLM_OPENAI_API_MODE',
        label: 'API format',
        kind: 'select' as const,
        defaultLabel: 'Responses API (recommended)',
        note: 'Choose the protocol your service actually supports. OpenAI uses the Responses API; compatible services use Chat Completions.',
        options: [{ value: 'chat', label: 'Chat Completions API' }],
      }] : []),
      {
        name: names.model,
        label: 'Model',
        kind: 'text',
        defaultLabel: preset.defaultModel,
        discoverableModel: true,
        note: 'After testing, choose a returned model or enter a model ID manually.',
        options: [{ value: preset.defaultModel, label: preset.defaultModel }],
      },
    ],
  };
};

const CODEX_PAGE: SettingsVendorPage = {
  key: 'llm/codex',
  vendor: 'openai',
  title: 'OpenAI · Codex',
  connection: 'codex',
  note: 'Sign in with a ChatGPT subscription. The official Codex CLI manages credentials, renewal, and logout; OpenChatCut never reads or displays OAuth credentials.',
  fields: [
    {
      name: 'CODEX_MODEL',
      label: 'Codex model',
      kind: 'text',
      defaultLabel: 'Codex default model',
      discoverableModel: true,
      note: 'After signing in, load the models available to this account or enter a model ID manually.',
    },
    {
      name: 'CODEX_REASONING_EFFORT',
      label: 'Reasoning effort',
      kind: 'select',
      options: [{ value: '', label: 'Model default' }],
      note: 'Load models to see the effort levels supported by the current model. Leave this unset to use the model default.',
    },
  ],
};

const AGENT_VENDOR_PAGES: readonly SettingsVendorPage[] = LLM_PROVIDER_PRESETS.flatMap((preset) => {
  const page = llmPage(preset);
  return preset.id === 'openai' ? [page, CODEX_PAGE] : [page];
});

// Vision bypass configuration: rendered by VisionModelPane (localStorage, not
// a server key page). No fields — vendorConfigured stays false for it.
const VISION_PAGE: SettingsVendorPage = {
  key: 'llm/vision', vendor: 'vision', title: 'Vision understanding', fields: [],
};

// Outbound network proxy: applies to every overseas API the server talks to
// (Agent models, AI generation, model-pack downloads, R2). Empty = use the
// HTTPS_PROXY/HTTP_PROXY environment variables (Clash etc.).
const PROXY_PAGE: SettingsVendorPage = {
  key: 'agent/proxy', vendor: 'proxy', title: 'Network proxy', kind: 'settings',
  note: 'If reaching overseas models (Gemini / OpenAI / Anthropic / Mistral, etc.) fails on your network, '
    + 'enter a local proxy address here (e.g. http://127.0.0.1:7890). '
    + 'Leave it empty to use the system environment variables (HTTPS_PROXY / HTTP_PROXY). '
    + 'Scope: Agent models, AI generation, model downloads, R2 cloud sync.',
  fields: [
    text('PROXY_URL', 'Proxy address', 'e.g. http://127.0.0.1:7890'),
  ],
};

const AGENT_VENDOR_PAGES_WITH_VISION: readonly SettingsVendorPage[] = [
  ...AGENT_VENDOR_PAGES,
  VISION_PAGE,
];

// MiniMax serves 4 capabilities for the same Key/Base URL pair, and only the model fields of that capability are linked to the capability on the page.
const MINIMAX_NOTE = 'One MiniMax key covers every capability (image / voice / video / music) — configure once.';
const minimaxPage = (cap: string, modelField: SettingsField, title = 'MiniMax', vendor: VendorId = 'minimax'): SettingsVendorPage => ({
  key: `${cap}/${vendor}`, vendor, title, note: MINIMAX_NOTE,
  fields: [
    secret('MINIMAX_API_KEY', 'API Key'),
    text('MINIMAX_BASE_URL', 'Base URL', 'Default https://api.minimaxi.com'),
    modelField,
  ],
});

// BytePlus ModelArk serves image (Seedream) and video (Seedance) from the same Key/Base URL,
// separate from LLM_BYTEPLUS_* (Agent chat) — same sharing convention as MiniMax above.
const BYTEPLUS_NOTE = 'One BytePlus ModelArk key covers both image and video generation; it stays independent of the BytePlus config under “Agent Brain”.';
const byteplusPage = (cap: string, modelField: SettingsField, title = 'BytePlus · ModelArk'): SettingsVendorPage => ({
  key: `${cap}/byteplus`, vendor: 'byteplus', title, note: BYTEPLUS_NOTE,
  fields: [
    secret('BYTEPLUS_API_KEY', 'API Key'),
    text('BYTEPLUS_BASE_URL', 'Base URL', 'Default https://ark.ap-southeast.bytepluses.com/api/v3'),
    modelField,
  ],
});

export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  {
    key: 'agent', title: 'Agent Model', icon: 'sparkles',
    groups: [
      { key: 'llm', title: 'Agent Brain',
        hint: 'Core of chat and tool calls — chat is unavailable until configured.',
        vendors: AGENT_VENDOR_PAGES_WITH_VISION },
    ],
  },
  {
    key: 'proxy', title: 'Network proxy', icon: 'plug',
    groups: [
      { key: 'proxy', title: 'Network proxy', hint: 'One place to configure the proxy address the server uses to reach overseas APIs.', vendors: [PROXY_PAGE] },
    ],
  },
  {
    key: 'generation', title: 'AI Generation', icon: 'image',
    groups: [
      { key: 'image', title: 'Image', hint: 'submit_image · Text-to-image / image-to-image; any one vendor works.',
        route: routeSelect('PREFERRED_IMAGE_VENDOR', [
          { value: 'gpt-image-2', label: 'OpenAI gpt-image' },
          { value: 'nano-banana', label: 'Gemini Nano Banana' },
          { value: 'image-01', label: 'MiniMax' },
          { value: 'wavespeed', label: 'WaveSpeed' },
          { value: 'byteplus', label: 'BytePlus · Seedream' },
        ]),
        vendors: [
          { key: 'image/openai', vendor: 'openai', title: 'OpenAI', fields: [
            secret('IMAGE_API_KEY', 'API Key (gpt-image)'),
            text('IMAGE_BASE_URL', 'Base URL', 'Default https://api.openai.com'),
          ] },
          { key: 'image/gemini', vendor: 'gemini', title: 'Google Gemini', fields: [
            secret('GEMINI_API_KEY', 'API Key (Nano Banana)'),
            text('GEMINI_BASE_URL', 'Base URL', 'Default https://generativelanguage.googleapis.com'),
            modelText('GEMINI_IMAGE_MODEL', 'Image model', 'gemini-3.1-flash-image'),
          ] },
          minimaxPage('image', modelSelect('MINIMAX_IMAGE_MODEL', 'Image model', 'image-01', ['image-01', 'image-01-live'])),
          { key: 'image/wavespeed', vendor: 'wavespeed', title: 'WaveSpeed', fields: [
            secret('WAVESPEED_API_KEY', 'API Key'),
            text('WAVESPEED_BASE_URL', 'Base URL', 'Default https://api.wavespeed.ai'),
            modelText('WAVESPEED_IMAGE_MODEL', 'Image model', 'wavespeed-ai/flux-dev'),
          ] },
          byteplusPage('image', modelText('BYTEPLUS_IMAGE_MODEL', 'Image model', 'seedream-4-5-251128',
            'After testing, choose a returned model or enter a model ID manually.', true), 'BytePlus · Seedream'),
        ] },
      VOICE_SETTINGS_GROUP,
      { key: 'video', title: 'Video', hint: 'submit_video · Text / image to video; any one vendor works.',
        route: routeSelect('PREFERRED_VIDEO_VENDOR', [
          { value: 'seedance2', label: 'Seedance' },
          { value: 'kling', label: 'Kling' },
          { value: 'hailuo', label: 'MiniMax Hailuo' },
          { value: 'byteplus', label: 'BytePlus · Seedance' },
        ]),
        vendors: [
          { key: 'video/seedance', vendor: 'seedance', title: 'Seedance · Volcano', fields: [
            secret('SEEDANCE_API_KEY', 'API Key'),
            text('SEEDANCE_BASE_URL', 'Base URL', 'Default https://ark.cn-beijing.volces.com/api/v3'),
            modelText('SEEDANCE_VIDEO_MODEL', 'Video model', 'doubao-seedance-2-0-260128'),
          ] },
          { key: 'video/kling', vendor: 'kling', title: 'Kling', fields: [
            secret('KLING_API_KEY', 'API Key'),
            text('KLING_BASE_URL', 'Base URL', 'Default https://api-singapore.klingai.com'),
            modelText('KLING_VIDEO_MODEL', 'Video model', 'kling-v3-omni'),
          ] },
          minimaxPage('video', modelSelect('MINIMAX_VIDEO_MODEL', 'Video model', 'MiniMax-Hailuo-02',
            ['MiniMax-Hailuo-02', 'MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-2.3-Fast', 'S2V-01']), 'MiniMax Hailuo', 'hailuo'),
          byteplusPage('video', modelText('BYTEPLUS_VIDEO_MODEL', 'Video model', 'seedance-1-5-pro-251215',
            'After testing, choose a returned model or enter a model ID manually.', true), 'BytePlus · Seedance'),
        ] },
      { key: 'music', title: 'Music', hint: 'submit_music · Text or finished cut to soundtrack; any one vendor works.',
        route: routeSelect('PREFERRED_MUSIC_VENDOR', [
          { value: 'mureka', label: 'Mureka' },
          { value: 'minimax', label: 'MiniMax' },
          { value: 'atlas', label: 'Atlas Cloud' },
          { value: 'sonilo', label: 'Sonilo' },
        ]),
        vendors: [
          { key: 'music/mureka', vendor: 'mureka', title: 'Mureka', fields: [
            secret('MUREKA_API_KEY', 'API Key'),
            text('MUREKA_BASE_URL', 'Base URL', 'Default https://api.mureka.ai'),
            modelText('MUREKA_MUSIC_MODEL', 'Music model', 'auto'),
          ] },
          minimaxPage('music', modelSelect('MINIMAX_MUSIC_MODEL', 'Music model', 'music-2.6',
            ['music-3.0', 'music-2.6', 'music-3.0-free', 'music-2.6-free', 'music-cover', 'music-cover-free'])),
          { key: 'music/atlas', vendor: 'atlas', title: 'Atlas Cloud', fields: [
            secret('ATLASCLOUD_API_KEY', 'API Key'),
            text('ATLASCLOUD_API_BASE', 'Base URL', 'Default https://api.atlascloud.ai/api/v1'),
            modelSelect('ATLASCLOUD_MUSIC_MODEL', 'Music model', 'minimax/music-2.6', ['minimax/music-2.6']),
          ] },
          { key: 'music/sonilo', vendor: 'sonilo', title: 'Sonilo',
            note: 'Score-to-picture: hand Sonilo the rendered video and the music follows the on-screen rhythm (an optional one-line style prompt; leaving it blank is fine). '
              + 'The music comes licensed for commercial use (terms apply); every track carries a license_id for your records. '
              + 'The same key also drives score-to-picture sound effects (submit_sound, royalty-free).',
            fields: [
              secret('SONILO_API_KEY', 'API Key'),
              text('SONILO_BASE_URL', 'Base URL', 'Default https://api.sonilo.com'),
            ] },
        ] },
    ],
  },
  {
    key: 'assets', title: 'Assets · Transcription', icon: 'folder',
    groups: [
      { key: 'stock', title: 'Stock Media', hint: 'search_stock_media · Search commercially usable photos / videos.',
        vendors: [
          { key: 'stock/pexels', vendor: 'pexels', title: 'Pexels', fields: [secret('PEXELS_API_KEY', 'API Key')] },
          { key: 'stock/pixabay', vendor: 'pixabay', title: 'Pixabay', fields: [secret('PIXABAY_API_KEY', 'API Key')] },
          { key: 'stock/unsplash', vendor: 'unsplash', title: 'Unsplash', fields: [secret('UNSPLASH_ACCESS_KEY', 'Access Key')] },
          { key: 'stock/freesound', vendor: 'freesound', title: 'Freesound', fields: [secret('FREESOUND_API_KEY', 'API Key')] },
        ] },
      TRANSCRIPTION_SETTINGS_GROUP,
    ],
  },
  {
    key: 'cloud', title: 'Storage', icon: 'cloud',
    groups: [
      { key: 'storage', title: 'Media Storage', hint: 'Where projects and media are stored locally, plus optional R2 cloud backup.',
        vendors: [
          { key: 'storage/projects', vendor: 'localdisk', title: 'Project storage folder',
            note: 'Where projects, version history, and media are stored. It defaults to the app data folder; '
              + 'point it at a folder of your own (external drive, sync folder) and uninstalling or reinstalling the app never touches your work. '
              + 'Saving copies the existing data to the new folder (the old folder is kept, not deleted) and takes effect after an app restart.',
            fields: [
              directory('OPENCHATCUT_DATA_DIR', 'Project storage folder', 'Default app data folder',
                'On desktop, click "Choose folder"; you can also type an absolute path (~/ accepted). Clear it to return to the default folder.'),
            ] },
          { key: 'storage/local', vendor: 'localdisk', title: 'Local Disk',
            note: 'The desktop app stores media in the system app data folder by default; the browser dev build uses public/media/uploads/. '
              + 'Pick any local folder or external drive; on save, media in the old folder is copied to the new one (the originals are kept), '
              + 'media paths inside projects stay the same, and preview plus render/export follow the new folder.',
            fields: [
              directory('MEDIA_DIR', 'Media storage directory', 'system default media directory',
                'On desktop, click “Choose Folder”; in a browser, you can also enter an absolute path manually. Clearing returns to the current environment’s default directory.'),
            ] },
          { key: 'storage/r2', vendor: 'r2', title: 'Cloudflare R2',
            note: 'Until this is configured, media stays on this machine only (the folder on the “Local Disk” page). Once configured, every upload is also written through to R2 (the bucket stays private, '
              + 'reads go back through the local server, src paths are unchanged); missing local files are fetched back from the cloud automatically. Changes take effect immediately. '
              + 'Create a bucket in the R2 console → R2 API Token (Object Read & Write) to get the four values below.',
            fields: [
              { name: 'R2_ENABLED', label: 'Cloud sync', kind: 'toggle',
                note: 'When off, new uploads stay local only (keys kept, files already in the cloud unaffected); re-enable to resume write-through.' },
              secret('R2_ACCOUNT_ID', 'Account ID'),
              secret('R2_ACCESS_KEY_ID', 'Access Key ID'),
              secret('R2_SECRET_ACCESS_KEY', 'Secret Access Key'),
              secret('R2_BUCKET', 'Bucket name'),
            ] },
        ] },
    ],
  },
  {
    key: 'tools', title: 'Power Tools', icon: 'sliders',
    groups: [
      { key: 'sandbox', title: 'Sandbox Execution', hint: 'run_code · Run ffmpeg / node / python in a cloud sandbox.',
        vendors: [
          { key: 'sandbox/e2b', vendor: 'e2b', title: 'E2B',
            note: 'An isolated Linux sandbox in the cloud that never touches local files. The Agent uses it for run_code: ffprobe to inspect media duration / '
              + 'size and codec, ffmpeg to transcode / extract frames / process audio and video, and node / python skill scripts; the results come back and '
              + 'local tools apply them to the timeline. Leaving it unconfigured only affects those tools — editing and preview are unaffected.',
            fields: [
              secret('E2B_API_KEY', 'API Key'),
              text('E2B_TEMPLATE', 'Template ID (optional)', undefined,
                'The default template has no ffmpeg; for transcode / frame-extraction tasks, build a template with ffmpeg and enter its ID.'),
            ] },
        ] },
      { key: 'web', title: 'Web Scraping', hint: 'web_browser · Fetch web pages for the Agent to reference.',
        vendors: [
          { key: 'web/firecrawl', vendor: 'firecrawl', title: 'Firecrawl',
            fields: [secret('FIRECRAWL_API_KEY', 'API Key')] },
        ] },
    ],
  },
  {
    key: 'interface', title: 'Interface', icon: 'layoutPanel',
    groups: [
      { key: 'display', title: 'Show', hint: 'Interface scaling and display settings.',
        vendors: [
          { key: 'display/scale', vendor: 'localasr', title: 'Interface scale',
            note: 'Adjust the zoom level of the whole editor (80%–150%). On desktop it takes effect as soon as you save; you can also use Ctrl/Cmd + +/- to adjust quickly and Ctrl/Cmd + 0 to reset. In the browser, use the browser’s own zoom.',
            fields: [
              { name: 'UI_SCALE', label: 'Interface scale', kind: 'select', defaultLabel: '100%',
                options: [
                  { value: '0.8', label: '80%' },
                  { value: '0.9', label: '90%' },
                  { value: '1', label: '100%' },
                  { value: '1.1', label: '110%' },
                  { value: '1.25', label: '125%' },
                  { value: '1.5', label: '150%' },
                ] },
            ] },
        ] },
    ],
  },
  {
    key: 'local', title: 'Local models', icon: 'database',
    groups: [
      { key: 'local', title: 'Local models', hint: 'Local transcription, beat and music analysis, visual semantic search. Models install on demand and data never leaves this machine.',
        vendors: [
          { key: 'local/asr', vendor: 'localasr', title: 'Local transcription', icon: 'mic', kind: 'local-models', fields: localAsrPage.fields },
          { key: 'local/music/packs', vendor: 'localasr', title: 'Beat and music analysis', icon: 'music', kind: 'local-models', fields: [] },
          { key: 'local/semantic/setup', vendor: 'localasr', title: 'Visual semantic search', icon: 'search', kind: 'local-models', fields: [] },
        ] },
    ],
  },
];

/** Temporary changes: field name in map = temporary storage; '' = clear explicitly (model fields will return to default).*/
export type StagedValues = Record<string, string>;

export function omitKey(obj: StagedValues, name: string): StagedValues {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== name));
}

/** '' is explicitly cleared and sent as is; non-null values ​​are sent after trimming; pure blank input is regarded as unchanged (to prevent misclearing).*/
export function buildPatch(values: StagedValues): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const [name, raw] of Object.entries(values)) {
    if (raw === '') patch[name] = '';
    else if (raw.trim() !== '') patch[name] = raw.trim();
  }
  return patch;
}

export function savedMessage(): string {
  return 'Saved · Tools take effect immediately; the Agent sees it from the next message';
}

/** Whether the field goes through the non-confidential models value channel (current value echo; temporary baseline = current value on the server; clear = return to default).*/
export function isModelField(field: SettingsField): boolean {
  return field.kind === 'select' || field.kind === 'toggle' || field.defaultLabel !== undefined;
}

/** Current model/routing value on the server ('' = not set = use default).*/
export function modelValue(status: KeyStatusResponse | null, name: string): string {
  return status?.models?.[name] ?? '';
}

/** provider page "Configured": All secrets in the page are configured (doubao = double keys);
 * Pages without secret (local disk) to see if any field has been set.*/
export function vendorConfigured(
  status: KeyStatusResponse | null,
  page: SettingsVendorPage,
  codexStatus?: CodexAgentStatus | null,
): boolean {
  if (page.connection === 'codex') {
    return Boolean(codexStatus?.installed && codexStatus.account?.type === 'chatgpt');
  }
  if (!status) return false;
  if (isLocalLlmProvider(page.vendor)) {
    const names = llmProviderConfigNames(page.vendor);
    return Boolean(status.models[names.model]?.trim());
  }
  const secrets = page.fields.filter((f) => f.kind === 'secret');
  if (secrets.length === 0) return page.fields.some((f) => Boolean(status.keys[f.name]?.configured));
  return secrets.every((f) => Boolean(status.keys[f.name]?.configured));
}
/** Determination of configured capability group: LLM and proxy are page-backed; others use server capability flags. */
export function groupConfigured(
  status: KeyStatusResponse | null,
  group: SettingsGroup,
  codexStatus?: CodexAgentStatus | null,
): boolean {
  if (group.key === 'llm' || group.key === 'proxy') {
    return group.vendors.some((page) => vendorConfigured(status, page, codexStatus));
  }
  return status ? Boolean(status.caps[group.key]) : false;
}

/** Classification logo: Number of configured capabilities/Total number of capabilities (capability level count).*/
export function categoryGroupStats(
  status: KeyStatusResponse | null,
  category: SettingsCategory,
  codexStatus?: CodexAgentStatus | null,
): { done: number; total: number } {
  return {
    done: category.groups.filter((group) => groupConfigured(status, group, codexStatus)).length,
    total: category.groups.length,
  };
}

/** Select key → ability group in the left tree (the group key is globally unique); if not found, fall back to the first group.*/
export function findGroup(key: string): SettingsGroup {
  return SETTINGS_CATEGORIES.flatMap((c) => c.groups).find((g) => g.key === key)
    ?? SETTINGS_CATEGORIES[0].groups[0];
}

/** Complete options for select rendering: insert "default (xxx)" before model select; routing select comes with "ask every time".*/
export function selectOptions(field: SettingsField): readonly SelectOption[] {
  const base = field.options ?? [];
  if (field.defaultLabel === undefined) return base;
  return [{ value: '', label: `Default (${field.defaultLabel})` }, ...base];
}

// Routing requirements live beside the provider groups so settings and capability
// expansion share one focused provider-data surface.

/** Routing drop-down option copy: Add the "(not configured)" suffix when the provider has not configured it, and it is still optional (there is a fallback inquiry guardrail on the Agent side).
 * Non-routing select (model drop-down) returns unchanged.*/
export function selectOptionLabel(
  status: KeyStatusResponse | null, field: SettingsField, opt: SelectOption,
): string {
  if (!field.name.startsWith('PREFERRED_') || opt.value === '') return opt.label;
  const needs = ROUTE_NEEDS[opt.value];
  const has = (n: string): boolean => Boolean(status?.keys[n]?.configured);
  const ok = Boolean(needs?.some((group) => group.every(has)));
  return ok ? opt.label : `${opt.label} (not configured)`;
}

/** Input box placeholder: secret / Ordinary text never backfills, only describes the status; model text describes the default value.*/
export function fieldPlaceholder(field: SettingsField, configured: boolean, stagedClear: boolean): string {
  if (isModelField(field)) {
    if (stagedClear) return 'Restore default · Takes effect after save';
    return field.defaultLabel ? `Default ${field.defaultLabel}` : 'Default';
  }
  if (stagedClear) return 'Will be cleared · Takes effect after save';
  if (configured) return field.placeholder ? 'Customized · Leave empty to keep' : 'Configured · Leave empty to keep';
  return field.placeholder ? field.placeholder : 'Not configured · Paste to enable';
}
