// Runnable self-check: `npx tsx src/agent/tools/skill-tools.check.ts`
// The manage_skill current / activate contract (creative-mode dump and switching): current in both empty/set states,
// activate validating the id + landing via ctx.setCreativeMode + clearing on an empty string, and the error when the host wires no setter.
// Custom-skill CRUD goes through IDB (browser only), under node refresh silently skips — this verifies with built-in skills only.
import assert from 'node:assert';
import { execSkillTool, SKILL_TOOL_NAMES, SKILL_TOOL_SCHEMAS } from './skill-tools';
import { CREATIVE_SKILLS } from '../skills/skills-catalog';
import type { AgentContext } from '../context';

assert.ok(SKILL_TOOL_NAMES.has('manage_skill'));
const actions = (SKILL_TOOL_SCHEMAS[0].input_schema as unknown as { properties: { action: { enum: string[] } } }).properties.action.enum;
for (const a of ['list', 'get', 'current', 'activate', 'create', 'update', 'delete']) {
  assert.ok(actions.includes(a), `schema should contain action ${a}`);
}

// Fake host: a readable/writable creative-mode slot
let mode: string | null = null;
const ctx = {
  getCreativeMode: () => mode,
  setCreativeMode: (id: string | null) => { mode = id; },
} as unknown as AgentContext;

const builtinId = CREATIVE_SKILLS[0]?.id ?? null;

// ---- current: nothing selected → active:null ----
{
  const r = await execSkillTool('manage_skill', { action: 'current' }, ctx) as { active: unknown; note?: string };
  assert.strictEqual(r.active, null, 'with no mode selected it should return active:null');
  assert.ok(r.note?.includes('No creative mode'), 'should carry the not-selected note');
}

// ---- activate a built-in skill → lands + returns a brief; current reads back the same one ----
// (under node getPluginSkill uses Vite `?raw`, so built-in files are unreachable → CREATIVE_SKILLS is empty,
// skip the built-in activation assertions and just check the management contract does not break when empty.)
if (builtinId) {
  const r = await execSkillTool('manage_skill', { action: 'activate', skillId: builtinId }, ctx) as {
    ok?: boolean; active?: { id: string; builtin: boolean }; note?: string;
  };
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.active?.id, builtinId);
  assert.strictEqual(r.active?.builtin, true, 'built-in skills should be flagged builtin');
  assert.ok(r.note?.includes('next message'), 'should state when it is injected (system is built once per runAgent)');
  assert.strictEqual(mode, builtinId, 'ctx.setCreativeMode should have been called');

  const cur = await execSkillTool('manage_skill', { action: 'current' }, ctx) as { active: { id: string } };
  assert.strictEqual(cur.active.id, builtinId, 'current should read back the activated mode');

  const unknown = await execSkillTool('manage_skill', { action: 'activate', skillId: 'skill_nope' }, ctx) as { error?: string };
  assert.ok(unknown.error?.includes('no skill'), 'an unknown id should error');
  assert.strictEqual(mode, builtinId, 'erroring should not change the current mode');
}

// ---- activate an empty string → clears ----
{
  const r = await execSkillTool('manage_skill', { action: 'activate', skillId: '' }, ctx) as { ok?: boolean; active?: unknown };
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.active, null);
  assert.strictEqual(mode, null, 'an empty string should clear the mode');
}

// ---- host wires no setter (ctx in the old check shape) → explicit error ----
{
  const bare = { getCreativeMode: () => null } as unknown as AgentContext;
  const r = await execSkillTool('manage_skill', { action: 'activate', skillId: builtinId ?? 'skill_any' }, bare) as { error?: string };
  assert.ok(r.error, 'a host without setCreativeMode should error rather than fail silently');
}

console.log('skill-tools.check: ALL PASSED');
