// Standalone self-check for the chroma-key effect.
// Does not import effects.ts — its `.frag?raw` import relies on Vite's raw-loader, which bare
// `npx tsx` cannot resolve (it parses .frag as JS and throws), so like fx.check.ts this file
// mirrors the id/props of FX_EFFECTS['builtin:fx-chroma-key'] by hand (must stay in sync with effects.ts),
// and reads the frag source as text with fs to check the contract.
// Run with: npx tsx src/gl/fx/chroma-key.check.ts
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fxUniforms, type FxDef } from './uniforms';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mirrors the 'builtin:fx-chroma-key' entry in effects.ts
const chromaKey: FxDef = {
  id: 'builtin:fx-chroma-key', name: 'Chroma Key / Green Screen', desc: '', frag: '',
  props: [
    { key: 'keyColor', label: '', kind: 'color', default: [0, 1, 0], uniform: 'u_keyColor' },
    { key: 'similarity', label: '', default: 0.18, min: 0, max: 0.6 },
    { key: 'smoothness', label: '', default: 0.08, min: 0.001, max: 0.4 },
    { key: 'spill', label: '', default: 0.5, min: 0, max: 1 },
  ],
};

// 1) Default uniform mapping: numeric props use u_<key>, the color prop uses an explicit uniform override
assert.deepStrictEqual(fxUniforms(chromaKey), {
  u_keyColor: [0, 1, 0],
  u_similarity: 0.18,
  u_smoothness: 0.08,
  u_spill: 0.5,
}, 'chroma-key default uniform mapping');

// 2) Out-of-range overrides are clamped to [min,max] (color is clamped per channel to [0,1])
assert.deepStrictEqual(
  fxUniforms(chromaKey, { similarity: 99, smoothness: -1, spill: 2, keyColor: [2, -1, 0.5] }),
  { u_keyColor: [1, 0, 0.5], u_similarity: 0.6, u_smoothness: 0.001, u_spill: 1 },
  'out-of-range overrides are clamped',
);

// 3) frag source contract: the uniform names line up with what runtime.ts renderFx binds
const frag = readFileSync(join(__dirname, 'chroma-key.frag'), 'utf8');
assert.ok(frag.includes('#version 300 es'), 'declares GLSL 300 es');
assert.ok(frag.includes('uniform sampler2D u_input'), 'references u_input (the input texture renderFx binds)');
assert.ok(frag.includes('in vec2 v_texCoord'), 'declares the v_texCoord varying (supplied by the vertex shader)');
assert.ok(/\bvoid\s+main\s*\(/.test(frag), 'declares main()');
assert.ok(/\bout\s+vec4\s+fragColor\b/.test(frag), 'declares out vec4 fragColor');
assert.ok(frag.includes('fragColor ='), 'writes fragColor inside main');

// The uniform name behind each props key (uniform ?? u_<key>) must really be declared in the frag,
// otherwise runtime's setUniform gets no location and the effect silently does nothing
for (const p of chromaKey.props) {
  const uniformName = p.uniform ?? `u_${p.key}`;
  assert.ok(frag.includes(uniformName), `frag declares ${uniformName} (for props.${p.key})`);
}

console.log('chroma-key.check: ok');
