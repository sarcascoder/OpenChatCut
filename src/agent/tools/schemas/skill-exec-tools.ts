import type { AgentToolSchema } from '../../tool-schema';

export const RUN_SKILL_SCRIPT_TOOL_NAMES = new Set(['run_skill_script']);

export const RUN_SKILL_SCRIPT_TOOL_SCHEMAS: AgentToolSchema[] = [
  {
    name: 'run_skill_script',
    description: 'Run a script inside an installed skill directory on this machine (whitelisted commands: bash/sh/node/npm/npx/python3/python/uv/uvx/ffmpeg/ffprobe/mkdir/cp/chmod), with the working directory locked to the skill directory. Use it for the deterministic scripts a skill ships with (such as render.mjs or check-deps.sh); the cloud sandbox cannot reach local skill files. Timeout defaults to 60s and is capped at 120s; output is capped at 512KB.',
    input_schema: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'Skill slug (the skill field returned by load_skill).' },
        command: { type: 'string', description: 'Command (the first word must be a whitelisted executable), such as bash scripts/check-deps.sh or node scripts/render.mjs.' },
        timeout: { type: 'number', description: 'Optional: timeout in milliseconds, default 60000, max 120000.' },
      },
      required: ['skill', 'command'],
    },
  },
];
