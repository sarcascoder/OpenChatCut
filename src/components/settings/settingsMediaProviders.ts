import {
  modelSelect,
  modelText,
  routeSelect,
  secret,
  text,
  type SettingsField,
  type SettingsGroup,
  type SettingsVendorPage,
} from './settingsFields';

const MINIMAX_NOTE = 'One MiniMax key covers every capability (image / voice / video / music) — configure once.';

const COMMON_TRANSCRIPTION_FIELDS: readonly SettingsField[] = [
  {
    name: 'TRANSCRIPTION_LANGUAGE',
    label: 'Transcription language',
    kind: 'select',
    defaultLabel: 'Chinese (zh)',
    options: [
      { value: 'zh', label: 'Chinese (zh)' },
      { value: 'en', label: 'English (en)' },
      { value: 'ja', label: 'Japanese (ja)' },
      { value: 'ko', label: 'Korean (ko)' },
      { value: 'es', label: 'Spanish (es)' },
      { value: 'fr', label: 'French (fr)' },
      { value: 'de', label: 'German (de)' },
    ],
  },
  {
    name: 'TRANSCRIPTION_DIARIZATION',
    label: 'Speaker diarization',
    kind: 'select',
    defaultLabel: 'On',
    options: [
      { value: '1', label: 'On' },
      { value: '0', label: 'Off' },
    ],
  },
  {
    name: 'AUTO_TRANSCRIBE_INGEST',
    label: 'Auto-transcribe on import',
    kind: 'select',
    defaultLabel: 'Local engine only (free)',
    note: 'Whether media is transcribed as soon as it lands in the media pool. Local Whisper is free and runs on this machine; for paid cloud providers, keep this off or transcribe manually.',
    options: [
      { value: 'off', label: 'Off (transcribe manually)' },
      { value: 'local', label: 'Local engine only (free)' },
      { value: 'all', label: 'All engines (including paid cloud)' },
    ],
  },
];

const transcriptionPage = (
  provider: string,
  vendor: SettingsVendorPage['vendor'],
  title: string,
  fields: readonly SettingsField[],
  note?: string,
): SettingsVendorPage => ({
  key: `transcription/${provider}`,
  vendor,
  title,
  note,
  fields: [...fields, ...COMMON_TRANSCRIPTION_FIELDS],
});

export const localAsrPage = transcriptionPage('local', 'localasr', 'Local model (Whisper)', [
  {
    name: 'LOCAL_ASR_MODEL',
    label: 'Default model',
    kind: 'select',
    defaultLabel: 'Auto (by device memory)',
    note: 'The selected model must be downloaded first; when unset, the device memory picks automatically (≥6GB → Small, otherwise Base).',
    options: [
      { value: 'tiny', label: 'Whisper Tiny (~100MB · fastest)' },
      { value: 'base', label: 'Whisper Base (~80MB · balanced)' },
      { value: 'small', label: 'Whisper Small (~250MB · recommended)' },
      { value: 'medium', label: 'Whisper Medium (~1.1GB · highest accuracy)' },
    ],
  },
], 'Transcription runs on this machine: free, offline, and private. Download models on demand below. OpenChatCut selects the best available backend and falls back to CPU when WebGPU is unavailable. Local transcription does not support speaker diarization.');

export const VOICE_SETTINGS_GROUP: SettingsGroup = {
  key: 'voice',
  title: 'Voice / TTS',
  hint: 'submit_voice · Text to voiceover; any one vendor works.',
  route: routeSelect('PREFERRED_VOICE_VENDOR', [
    { value: 'elevenlabs', label: 'ElevenLabs' },
    { value: 'doubao', label: 'Doubao' },
    { value: 'minimax', label: 'MiniMax' },
    { value: 'inworld', label: 'Inworld' },
    { value: 'fishaudio', label: 'Fish Audio' },
    { value: 'speechify', label: 'Speechify' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'gemini', label: 'Google Gemini' },
    { value: 'mistral', label: 'Mistral Voxtral' },
    { value: 'cartesia', label: 'Cartesia' },
  ]),
  vendors: [
    {
      key: 'voice/elevenlabs', vendor: 'elevenlabs', title: 'ElevenLabs',
      note: 'The key is also used for sound-effect generation (submit_sound).',
      fields: [
        secret('ELEVENLABS_API_KEY', 'API Key'),
        text('ELEVENLABS_BASE_URL', 'Base URL', 'Default https://api.elevenlabs.io'),
        modelSelect('ELEVENLABS_TTS_MODEL', 'Voice model', 'eleven_multilingual_v2',
          ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5']),
        modelText('ELEVENLABS_SOUND_MODEL', 'Sound model', 'eleven_text_to_sound_v2'),
      ],
    },
    {
      key: 'voice/doubao', vendor: 'doubao', title: 'Doubao TTS · Volcano', fields: [
        secret('DOUBAO_TTS_APP_ID', 'App ID'),
        secret('DOUBAO_TTS_ACCESS_KEY', 'Access Key'),
        text('DOUBAO_TTS_BASE_URL', 'Base URL', 'Default https://openspeech.bytedance.com'),
        modelText('DOUBAO_TTS_RESOURCE_ID', 'Voice resource ID', 'seed-tts-2.0'),
      ],
    },
    {
      key: 'voice/minimax', vendor: 'minimax', title: 'MiniMax', note: MINIMAX_NOTE, fields: [
        secret('MINIMAX_API_KEY', 'API Key'),
        text('MINIMAX_BASE_URL', 'Base URL', 'Default https://api.minimaxi.com'),
        modelSelect('MINIMAX_TTS_MODEL', 'Voice model', 'speech-2.6-hd',
          ['speech-2.6-hd', 'speech-2.8-hd', 'speech-2.8-turbo', 'speech-2.6-turbo', 'speech-02-hd', 'speech-02-turbo']),
      ],
    },
    {
      key: 'voice/inworld', vendor: 'inworld', title: 'Inworld', fields: [
        secret('INWORLD_TTS_API_KEY', 'API Key'),
        text('INWORLD_TTS_BASE_URL', 'Base URL', 'Default https://api.inworld.ai'),
        modelText('INWORLD_TTS_MODEL', 'Voice model', 'inworld-tts-2'),
      ],
    },
    {
      key: 'voice/fishaudio', vendor: 'fishaudio', title: 'Fish Audio', fields: [
        secret('FISHAUDIO_TTS_API_KEY', 'API Key'),
        text('FISHAUDIO_TTS_BASE_URL', 'Base URL', 'Default https://api.fish.audio'),
        modelText('FISHAUDIO_TTS_MODEL', 'Voice model', 's2.1-pro'),
      ],
    },
    {
      key: 'voice/speechify', vendor: 'speechify', title: 'Speechify', fields: [
        secret('SPEECHIFY_TTS_API_KEY', 'API Key'),
        text('SPEECHIFY_TTS_BASE_URL', 'Base URL', 'Default https://api.sws.speechify.com'),
        modelSelect('SPEECHIFY_TTS_MODEL', 'Voice model', 'simba-multilingual',
          ['simba-multilingual', 'simba-english', 'simba-3.2']),
      ],
    },
    {
      key: 'voice/openai', vendor: 'openai', title: 'OpenAI', fields: [
        secret('OPENAI_API_KEY', 'API Key'),
        text('IMAGE_BASE_URL', 'Base URL', 'Default https://api.openai.com'),
        modelText('OPENAI_TTS_MODEL', 'Voice model', 'gpt-4o-mini-tts'),
      ],
    },
    {
      key: 'voice/gemini', vendor: 'gemini', title: 'Google Gemini', fields: [
        secret('GEMINI_API_KEY', 'API Key'),
        text('GEMINI_BASE_URL', 'Base URL', 'Default https://generativelanguage.googleapis.com'),
        modelText('GEMINI_TTS_MODEL', 'Voice model', 'gemini-2.5-flash-preview-tts'),
      ],
    },
    {
      key: 'voice/mistral', vendor: 'mistral', title: 'Mistral Voxtral', fields: [
        secret('LLM_MISTRAL_API_KEY', 'API Key'),
        text('LLM_MISTRAL_BASE_URL', 'Base URL', 'Default https://api.mistral.ai/v1'),
        modelText('MISTRAL_TTS_MODEL', 'Voice model', 'voxtral-mini-tts-2603'),
      ],
    },
    {
      key: 'voice/cartesia', vendor: 'cartesia', title: 'Cartesia', fields: [
        secret('CARTESIA_API_KEY', 'API Key'),
        modelText('CARTESIA_TTS_MODEL', 'Voice model', 'sonic-3'),
      ],
    },
  ],
};

export const TRANSCRIPTION_SETTINGS_GROUP: SettingsGroup = {
  key: 'transcription',
  title: 'Transcription / Script Editing',
  hint: 'transcribe_track · Word-level captions, filler cleanup, word deletion.',
  route: routeSelect('PREFERRED_TRANSCRIPTION_PROVIDER', [
    { value: 'assemblyai', label: 'AssemblyAI (cloud)' },
    { value: 'local', label: 'Local model (free · offline)' },
    { value: 'openai', label: 'OpenAI (cloud)' },
    { value: 'mistral', label: 'Mistral Voxtral (cloud)' },
    { value: 'deepgram', label: 'Deepgram (cloud)' },
    { value: 'groq', label: 'Groq (cloud)' },
    { value: 'elevenlabs', label: 'ElevenLabs Scribe (cloud)' },
    { value: 'cartesia', label: 'Cartesia (cloud)' },
  ], 'AssemblyAI (default)'),
  vendors: [
    transcriptionPage('assemblyai', 'assemblyai', 'AssemblyAI', [secret('ASSEMBLYAI_API_KEY', 'API Key')]),
    localAsrPage,
    transcriptionPage('openai', 'openai', 'OpenAI', [
      secret('OPENAI_API_KEY', 'API Key'),
      text('IMAGE_BASE_URL', 'Base URL', 'Default https://api.openai.com'),
      modelText('OPENAI_TRANSCRIPTION_MODEL', 'Transcription model', 'gpt-4o-mini-transcribe'),
    ]),
    transcriptionPage('mistral', 'mistral', 'Mistral Voxtral', [
      secret('LLM_MISTRAL_API_KEY', 'API Key'),
      text('LLM_MISTRAL_BASE_URL', 'Base URL', 'Default https://api.mistral.ai/v1'),
      modelText('MISTRAL_TRANSCRIPTION_MODEL', 'Transcription model', 'voxtral-mini-latest'),
    ]),
    transcriptionPage('deepgram', 'deepgram', 'Deepgram', [
      secret('DEEPGRAM_API_KEY', 'API Key'),
      modelText('DEEPGRAM_TRANSCRIPTION_MODEL', 'Transcription model', 'nova-3'),
    ]),
    transcriptionPage('groq', 'groq', 'Groq', [
      secret('GROQ_API_KEY', 'API Key'),
      text('GROQ_BASE_URL', 'Base URL', 'Default https://api.groq.com/openai/v1'),
      modelText('GROQ_TRANSCRIPTION_MODEL', 'Transcription model', 'whisper-large-v3-turbo'),
    ]),
    transcriptionPage('elevenlabs', 'elevenlabs', 'ElevenLabs Scribe', [
      secret('ELEVENLABS_API_KEY', 'API Key'),
      modelText('ELEVENLABS_TRANSCRIPTION_MODEL', 'Transcription model', 'scribe_v2'),
    ]),
    transcriptionPage('cartesia', 'cartesia', 'Cartesia', [
      secret('CARTESIA_API_KEY', 'API Key'),
      modelText('CARTESIA_TRANSCRIPTION_MODEL', 'Transcription model', 'ink-whisper'),
    ]),
  ],
};

export const ROUTE_NEEDS: Record<string, readonly (readonly string[])[]> = {
  'gpt-image-2': [['IMAGE_API_KEY'], ['OPENAI_API_KEY']],
  'nano-banana': [['GEMINI_API_KEY']],
  'image-01': [['MINIMAX_API_KEY']],
  elevenlabs: [['ELEVENLABS_API_KEY']],
  doubao: [['DOUBAO_TTS_APP_ID', 'DOUBAO_TTS_ACCESS_KEY']],
  minimax: [['MINIMAX_API_KEY']],
  openai: [['OPENAI_API_KEY']],
  gemini: [['GEMINI_API_KEY']],
  mistral: [['LLM_MISTRAL_API_KEY']],
  cartesia: [['CARTESIA_API_KEY']],
  assemblyai: [['ASSEMBLYAI_API_KEY']],
  local: [[]],
  deepgram: [['DEEPGRAM_API_KEY']],
  groq: [['GROQ_API_KEY']],
  seedance2: [['SEEDANCE_API_KEY']],
  kling: [['KLING_API_KEY']],
  hailuo: [['MINIMAX_API_KEY']],
  mureka: [['MUREKA_API_KEY']],
  atlas: [['ATLASCLOUD_API_KEY']],
  sonilo: [['SONILO_API_KEY']],
};
