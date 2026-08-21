import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  type Prompt,
} from '@modelcontextprotocol/sdk/types.js';

const PROMPTS: Prompt[] = [
  {
    name: 'create-short-video',
    description: 'Cut the current project into a tightly paced vertical short video (hook, build, climax, close).',
    arguments: [{ name: 'topic', description: 'Topic/focus (optional)', required: false }],
  },
  {
    name: 'transcribe-and-caption',
    description: 'Transcribe the audio/video clips on the timeline and generate captions (clips without an audio track are skipped automatically).',
    arguments: [{ name: 'track', description: 'Track alias, defaults to the audio track', required: false }],
  },
  {
    name: 'add-background-music',
    description: 'Find and place suitable background music for the current timeline, with loudness normalization.',
    arguments: [{ name: 'mood', description: 'Mood direction (optional)', required: false }],
  },
  {
    name: 'generate-script',
    description: 'Write narration/voiceover copy from the current media and plan the shot list.',
    arguments: [{ name: 'topic', description: 'Topic', required: true }],
  },
  {
    name: 'export-project',
    description: 'Export the current project as a finished film (MP4) and report the export history.',
    arguments: [{ name: 'format', description: 'mp4 / prores (default mp4)', required: false }],
  },
  {
    name: 'clean-up-draft',
    description: 'Review the timeline: remove filler words and silent pauses, and tighten the gaps.',
    arguments: [],
  },
];

const PROMPT_TEXT: Record<string, string> = {
  'create-short-video': 'Cut the current timeline into a tightly paced vertical short video: first review the media and settle on the hook, build, climax and close, then do the edit, music, captions and the pre-publish check. Topic: {topic}.',
  'transcribe-and-caption': 'Transcribe the audio/video clips on the {track} track and generate captions; just skip clips with no audio track, and report which clips were skipped when you are done.',
  'add-background-music': 'Choose and place suitable background music for the current timeline, normalize it to about -14 LUFS, and make sure it does not clash with the voiceover. {topic}',
  'export-project': 'Export the current project as a finished film (MP4 by default), check media integrity before exporting, and report the export history and file location when done.',
  'clean-up-draft': 'Review the current timeline: remove filler words from the voiceover, delete silent pauses and tighten the gaps, and keep the captions in sync with the picture.',
};

export function registerMcpPrompts(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    const topic = typeof args.topic === 'string' ? args.topic.trim() : '';
    const track = typeof args.track === 'string' ? args.track.trim() : '';
    const mood = typeof args.mood === 'string' ? args.mood.trim() : '';
    const template = name === 'generate-script'
      ? `Write a piece of narration/voiceover copy around "${topic}": first settle the structure (opening hook, main points, closing call to action), then plan a shot list that matches the media.`
      : PROMPT_TEXT[name];
    if (!template) throw new Error(`Unknown prompt ${name}`);
    const text = template
      .replace(/\{topic\}/g, topic || 'the current media')
      .replace(/\{track\}/g, track || 'A1');
    return {
      description: PROMPTS.find((prompt) => prompt.name === name)?.description,
      messages: [{
        role: 'user',
        content: { type: 'text', text: mood ? `${text} (mood: ${mood})` : text },
      }],
    };
  });
}
