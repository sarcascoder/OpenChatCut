// Runnable check: `npx tsx src/components/chat/message-groups.check.ts`.
// groupMessages folds consecutive same-name tool rows into a group (≥GROUP_MIN) and leaves the rest as-is; checks folding/threshold/order/indices.
import assert from 'node:assert/strict';
import type { DisplayMessage } from '../../agent/agent-session';
import { groupMessages, GROUP_MIN } from './message-groups';

const tool = (name: string, id = ''): DisplayMessage => ({ role: 'tool', text: '', tool: { name, args: { id }, result: { ok: true } } });
const txt = (t: string): DisplayMessage => ({ role: 'assistant', text: t });

// 20× edit_gap sandwiched between text and another tool → folds into one toolgroup, the rest stay on their own rows
const msgs: DisplayMessage[] = [
  txt('Start'),
  ...Array.from({ length: 20 }, (_, i) => tool('edit_gap', 'g' + i)),
  tool('read_timeline'),
  txt('Done'),
];
const items = groupMessages(msgs);
assert.deepStrictEqual(items.map((it) => it.kind), ['single', 'toolgroup', 'single', 'single'], '20 consecutive edit_gap calls fold into 1 group; text and other tools stay on their own rows');
const grp = items[1];
assert.ok(grp.kind === 'toolgroup');
assert.strictEqual(grp.kind === 'toolgroup' && grp.name, 'edit_gap');
assert.strictEqual(grp.kind === 'toolgroup' && grp.items.length, 20, 'the group holds all 20 calls');
assert.strictEqual(grp.kind === 'toolgroup' && grp.items[0].index, 1, 'the group keeps the original message indices (used for key/feedback)');
assert.strictEqual(grp.kind === 'toolgroup' && grp.items[19].index, 20);

// Threshold: GROUP_MIN-1 calls do not fold (own rows), GROUP_MIN calls do
const below = groupMessages(Array.from({ length: GROUP_MIN - 1 }, () => tool('search_templates')));
assert.ok(below.every((it) => it.kind === 'single'), `fewer than ${GROUP_MIN} calls do not fold`);
const at = groupMessages(Array.from({ length: GROUP_MIN }, () => tool('search_templates')));
assert.deepStrictEqual(at.map((it) => it.kind), ['toolgroup'], `exactly ${GROUP_MIN} calls fold`);

// Adjacent tools with different names are not merged (keeps the detail)
const distinct = groupMessages([tool('clean_script'), tool('read_timeline'), tool('manage_timelines')]);
assert.ok(distinct.every((it) => it.kind === 'single'), 'differently named tools stay on their own rows, no false folding');

// Two same-name runs separated by another tool → two independent groups
const split = groupMessages([...Array.from({ length: 4 }, () => tool('edit_gap')), tool('read_timeline'), ...Array.from({ length: 3 }, () => tool('edit_gap'))]);
assert.deepStrictEqual(split.map((it) => it.kind), ['toolgroup', 'single', 'toolgroup'], 'separated same-name runs each form their own group');

console.log('message-groups.check: ok (folding/threshold/indices/no false folding/split runs)');
