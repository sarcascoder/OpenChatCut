// Runnable self-check: `npx tsx src/agent/followup-tools.check.ts`
// The core of ask_followup_questions is serializing fields into <widget> text, which the UI's parseWidgets
// then parses into a form card. This check verifies that round trip: buildFollowupWidget → parseWidgets is
// field-lossless, and that execFollowupTool's __followup contract, the option-less downgrade and the
// empty-fields error all hold.
import assert from 'node:assert';
import { buildFollowupWidget, execFollowupTool, FOLLOWUP_TOOL_NAMES } from './followup-tools';
import { parseWidgets, type FormMulti, type FormSingle, type WidgetField } from '../../components/chat/widget-parse';
import type { AgentContext } from '../context';

const ctx = {} as AgentContext; // followup never touches editor state

// ---- round trip: single + multi fields survive buildFollowupWidget → parseWidgets ----
const text = buildFollowupWidget(
  [
    // CJK label + option displays: proves non-ASCII survives the widget serializer round-trip.
    // label "aspect ratio"; displays "landscape 16:9" / "portrait 9:16"
    { id: 'ratio', label: '\u753b\u5e45\u6bd4\u4f8b', type: 'single', options: [{ value: '16:9', display: '\u6a2a\u5c4f 16:9' }, { value: '9:16', display: '\u7ad6\u5c4f 9:16' }], required: true },
    { id: 'topics', label: 'Key topics', type: 'multi', options: [{ value: 'a', display: 'Life' }, { value: 'b', display: 'Works' }], allowOther: true },
  ],
  'A few things to confirm before we start:',
);
const segs = parseWidgets(text);
assert.strictEqual(segs.length, 2, 'should be two segments: text + widget');
assert.ok(segs[0].type === 'text' && segs[0].text.includes('A few things to confirm'), 'the prompt should become the leading text segment');
assert.ok(segs[1].type === 'widget', 'the second segment should be a widget');
const fields = segs[1].type === 'widget' ? segs[1].fields : [];
assert.strictEqual(fields.length, 2, 'should parse out 2 fields');
const [ratio, topics] = fields as [FormSingle, FormMulti];
assert.strictEqual(ratio.kind, 'single');
assert.strictEqual(ratio.id, 'ratio');
assert.strictEqual(ratio.label, '\u753b\u5e45\u6bd4\u4f8b', 'a CJK label must survive the round trip');
assert.strictEqual(ratio.required, true, 'required should be preserved');
assert.deepStrictEqual(ratio.options, [{ value: '16:9', display: '\u6a2a\u5c4f 16:9' }, { value: '9:16', display: '\u7ad6\u5c4f 9:16' }]);
assert.strictEqual(topics.kind, 'multi');
assert.strictEqual(topics.allowOther, true, 'allow_other should be preserved');

// ---- an option-less field downgrades to a prompt line and produces no widget field ----
const freeText = buildFollowupWidget([{ id: 'title', label: 'Video title', type: 'single', options: [] }], '');
const freeSegs = parseWidgets(freeText);
assert.ok(!freeSegs.some((s) => s.type === 'widget'), 'an option-less field should produce no widget card');
assert.ok(freeSegs.some((s) => s.type === 'text' && s.text.includes('- Video title')), 'an option-less field should downgrade to a question line');

// ---- mixed: one with options + one free text → the widget card holds only the one with options, the free text goes into the leading text ----
const mixed = buildFollowupWidget(
  [
    { id: 'q1', label: 'With options', type: 'single', options: ['x', 'y'] },
    { id: 'q2', label: 'Free text', type: 'single', options: [] },
  ],
  '',
);
const mixedSegs = parseWidgets(mixed);
const mixedWidget = mixedSegs.find((s) => s.type === 'widget');
assert.ok(mixedWidget && mixedWidget.type === 'widget' && mixedWidget.fields.length === 1, 'the field with options becomes a card of its own');
assert.ok(mixedSegs.some((s) => s.type === 'text' && s.text.includes('- Free text')), 'the free-text field downgrades to a question line');

// ---- special characters (quotes/angle brackets/&) survive esc → decodeEntities ----
const escaped = buildFollowupWidget([{ id: 'q', label: 'A & B <c> "d"', type: 'single', options: [{ value: 'v', display: 'x & y' }] }], '');
const escFields = (parseWidgets(escaped).find((s) => s.type === 'widget') as { type: 'widget'; fields: WidgetField[] }).fields;
assert.strictEqual(escFields[0].label, 'A & B <c> "d"', 'special characters in a label round-trip losslessly');
const escOpt = (escFields[0] as FormSingle).options[0] as { display?: string; value?: string };
assert.strictEqual(escOpt.display ?? escOpt.value, 'x & y', 'special characters in an option round-trip losslessly');

// ---- execFollowupTool contract: valid input returns __followup, empty fields errors ----
assert.ok(FOLLOWUP_TOOL_NAMES.has('ask_followup_questions'));
const ok = execFollowupTool('ask_followup_questions', { fields: [{ id: 'r', label: 'Ratio', type: 'single', options: ['16:9', '9:16'] }], prompt: 'Pick one' }, ctx) as { __followup?: string; note?: string };
assert.ok(typeof ok.__followup === 'string' && ok.__followup.includes('<widget>'), 'a valid call should return __followup widget text');
assert.ok(typeof ok.note === 'string' && ok.note.length > 0, 'should carry a note about waiting for an answer');
const empty = execFollowupTool('ask_followup_questions', { fields: [] }, ctx) as { error?: string };
assert.ok(empty.error, 'empty fields should error');
const noRenderable = execFollowupTool('ask_followup_questions', { fields: [{ label: '', type: 'single', options: [] }] }, ctx) as { error?: string };
assert.ok(noRenderable.error, 'no renderable field should error');
const badName = execFollowupTool('nope', { fields: [] }, ctx) as { error?: string };
assert.ok(badName.error, 'an unknown tool name should error');

console.log('followup-tools.check.ts ✓ (widget round trip / option-less downgrade / special characters / exec contract)');
