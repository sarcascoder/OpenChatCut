// Runnable self-check: `npx tsx src/components/chat/widget-parse.check.ts`
// Covers a widget sample + formatWidgetAnswer assembling the answer + tolerance for malformed widgets.
import assert from 'node:assert';
import {
  parseWidgets, formatWidgetAnswer,
  type FormMulti, type FormRichChoice, type FormSingle,
} from './widget-parse';

const REAL_EXAMPLE = `Sounds good! Before we start production, I need a few key details:

<widget>
  <form-single id="duration" label="Roughly how long should the video be?" options="60s|About 1 minute,180s|About 3 minutes,300s|About 5 minutes" allow_other="false"/>
  <form-single id="ratio" label="Video aspect ratio" options="16:9|Landscape 16:9,9:16|Portrait 9:16,1:1|Square"/>
  <form-multi id="content" label="Which topics should we focus on? (multiple)" options="Life story,Signature poems,Historical context"/>
  <form-visual id="voiceId" label="Pick a voiceover voice:" required="true">
    <visual-option value="ruyayichen" name="Refined Yichen" media="/voice-samples/doubao-ruyayichen.mp3" aspect-ratio="16:5" summary="Male / young / refined"/>
    <visual-option value="morgan" name="Morgan" media="/voice-samples/x.mp3" summary="..."/>
  </form-visual>
</widget>`;

// ---- Segment order + field parsing ----
const segs = parseWidgets(REAL_EXAMPLE);
assert.strictEqual(segs.length, 2, 'should be 2 segments (text + widget)');
assert.strictEqual(segs[0].type, 'text');
assert.ok(segs[0].type === 'text' && segs[0].text.includes('Sounds good! Before we start production'));
assert.strictEqual(segs[1].type, 'widget');
assert.ok(segs[1].type === 'widget');
const fields = segs[1].type === 'widget' ? segs[1].fields : [];
assert.strictEqual(fields.length, 4, 'should parse out 4 fields');

const [duration, ratio, content, voiceId] = fields as [
  FormSingle,
  FormSingle,
  FormMulti,
  FormRichChoice,
];

assert.strictEqual(duration.kind, 'single');
assert.strictEqual(duration.id, 'duration');
assert.strictEqual(duration.label, 'Roughly how long should the video be?');
assert.strictEqual(duration.allowOther, false);
assert.deepStrictEqual(duration.options, [
  { value: '60s', display: 'About 1 minute' },
  { value: '180s', display: 'About 3 minutes' },
  { value: '300s', display: 'About 5 minutes' },
]);

assert.strictEqual(ratio.kind, 'single');
assert.strictEqual(ratio.allowOther, false, 'allow_other should default to false');
assert.deepStrictEqual(ratio.options, [
  { value: '16:9', display: 'Landscape 16:9' },
  { value: '9:16', display: 'Portrait 9:16' },
  { value: '1:1', display: 'Square' },
]);

assert.strictEqual(content.kind, 'multi');
assert.deepStrictEqual(content.options, [
  { value: 'Life story', display: 'Life story' },
  { value: 'Signature poems', display: 'Signature poems' },
  { value: 'Historical context', display: 'Historical context' },
]);

assert.strictEqual(voiceId.kind, 'visual');
assert.strictEqual(voiceId.required, true);
assert.strictEqual(voiceId.options.length, 2);
assert.deepStrictEqual(voiceId.options[0], {
  value: 'ruyayichen',
  name: 'Refined Yichen',
  media: '/voice-samples/doubao-ruyayichen.mp3',
  description: 'Male / young / refined',
  aspectRatio: '16:5',
  submitPrompt: undefined,
});
assert.deepStrictEqual(voiceId.options[1], {
  value: 'morgan',
  name: 'Morgan',
  media: '/voice-samples/x.mp3',
  description: '...',
  aspectRatio: undefined,
  submitPrompt: undefined,
});

// ---- formatWidgetAnswer ----
const answer = formatWidgetAnswer(fields, {
  duration: '180s',
  ratio: '16:9',
  content: ['Life story', 'Signature poems'],
  voiceId: 'ruyayichen',
});
assert.strictEqual(
  answer,
  ['- Roughly how long should the video be?: About 3 minutes', '- Video aspect ratio: Landscape 16:9', '- Which topics should we focus on? (multiple): Life story, Signature poems', '- Pick a voiceover voice:: Refined Yichen'].join('\n'),
);

// Unanswered fields should be skipped; allow_other free text is shown verbatim
const partial = formatWidgetAnswer(fields, { duration: 'Custom two minutes' });
assert.strictEqual(partial, '- Roughly how long should the video be?: Custom two minutes');

// ---- Plain text with no widget: returned verbatim as one segment ----
const plain = parseWidgets('This is an ordinary reply, with no form.');
assert.strictEqual(plain.length, 1);
assert.deepStrictEqual(plain[0], { type: 'text', text: 'This is an ordinary reply, with no form.' });

// ---- Malformed widget: strip the markup without throwing when no field parses (untrusted model output leaves no markup behind) ----
const malformed = 'Text before<widget><form-single id="x"/></widget>text after';
assert.doesNotThrow(() => parseWidgets(malformed));
const malformedSegs = parseWidgets(malformed);
assert.strictEqual(malformedSegs.length, 2);
assert.deepStrictEqual(malformedSegs[0], { type: 'text', text: 'Text before' });
assert.deepStrictEqual(malformedSegs[1], { type: 'text', text: 'text after' });

// ---- Empty widget (no fields) is stripped too, leaving no markup behind ----
const empty = '<widget></widget>';
assert.doesNotThrow(() => parseWidgets(empty));
assert.deepStrictEqual(parseWidgets(empty), []);

console.log('widget-parse.check: ok');
