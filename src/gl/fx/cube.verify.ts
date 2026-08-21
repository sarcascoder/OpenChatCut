// .cube parser + fxPasses LUT attachment semantics (npx tsx src/gl/fx/cube.check.ts)
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseCube, primeCube, getCubeSync, cubeSettled, type CubeLut } from './cube';
import { fxPasses, type FxDef } from './uniforms';

// ── 1. Minimal 2³ identity LUT ───────────────────────────────────────
const identity2 = `TITLE "id"
LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;
{
  const lut = parseCube(identity2);
  assert.equal(lut.size, 2);
  assert.equal(lut.title, 'id');
  assert.equal(lut.data.length, 2 * 2 * 2 * 3);
  assert.deepEqual([...lut.data.slice(0, 3)], [0, 0, 0]);
  assert.deepEqual([...lut.data.slice(-3)], [1, 1, 1]);
}

// ── 2. DOMAIN normalization (the parser maps values back into [0,1] by domain) ──
{
  const lut = parseCube(`LUT_3D_SIZE 2
DOMAIN_MIN -1 -1 -1
DOMAIN_MAX 1 1 1
${'0 0 0\n'.repeat(8)}`);
  assert.equal(lut.data[0], 0.5); // (0 on the -1..1 domain) → 0.5
}

// ── 3. Error surface (aligned one by one with the source xX) ─────────
const bad: Array<[string, string]> = [
  ['missing LUT_3D_SIZE', '0 0 0\n'],
  ['size out of range (1)', 'LUT_3D_SIZE 1\n0 0 0\n'],
  ['size out of range (65)', 'LUT_3D_SIZE 65\n'],
  ['1D rejected', 'LUT_1D_SIZE 4\n'],
  ['wrong entry count', 'LUT_3D_SIZE 2\n0 0 0\n'],
  ['non-numeric', `LUT_3D_SIZE 2\n${'0 0 x\n'.repeat(8)}`],
  ['wrong row width', `LUT_3D_SIZE 2\n${'0 0\n'.repeat(8)}`],
  ['bad DOMAIN', `LUT_3D_SIZE 2\nDOMAIN_MIN 1 1 1\nDOMAIN_MAX 1 1 1\n${'0 0 0\n'.repeat(8)}`],
];
for (const [name, text] of bad) {
  assert.throws(() => parseCube(text), `${name} should throw`);
}

// ── 4. Two real .cube LUT files ──────────────────────────────────────
for (const file of ['Sony_Slog3_s709.cube', 'CinemaGamut_CanonLog3-to-Canon709_33_Ver.1.0.cube']) {
  const lut = parseCube(readFileSync(`assets/luts/${file}`, 'utf8'));
  assert.equal(lut.size, 33, `${file} should be 33³`);
  assert.equal(lut.data.length, 33 ** 3 * 3);
  let inRange = 0;
  for (const v of lut.data) {
    assert.ok(Number.isFinite(v), `${file} contains a non-finite value`);
    if (v >= 0 && v <= 1) inRange++;
  }
  assert.ok(inRange / lut.data.length > 0.95, `most values in ${file} should fall inside [0,1]`);
}

// ── 5. fxPasses attachment semantics: not ready → intensity forced to 0; ready → lut3d attached ──
const def: FxDef = {
  id: 'builtin:test-lut', name: 't', desc: 't', frag: 'FRAG', cube: 'test://lut',
  props: [{ key: 'intensity', label: 'Intensity', default: 1, min: 0, max: 1, step: 0.01 }],
};
{
  assert.equal(cubeSettled('test://lut'), false);
  const passes = fxPasses([{ def }], 0);
  assert.equal(passes.length, 1);
  assert.equal(passes[0].lut3d, undefined);
  assert.equal(passes[0].uniforms?.u_intensity, 0, 'passes through while unloaded (intensity=0)');
}
{
  const fake: CubeLut = parseCube(identity2);
  primeCube('test://lut', fake);
  assert.equal(getCubeSync('test://lut'), fake);
  const passes = fxPasses([{ def, overrides: { intensity: 0.7 } }], 0);
  assert.equal(passes[0].lut3d, fake, 'once ready, lut3d is attached to the pass');
  assert.equal(passes[0].uniforms?.u_intensity, 0.7);
}
{
  primeCube('test://lut', null); // load-failed state = pass through forever
  const passes = fxPasses([{ def }], 0);
  assert.equal(passes[0].lut3d, undefined);
  assert.equal(passes[0].uniforms?.u_intensity, 0);
}

console.log('cube.check: ok (parsing/domain normalization/8 error cases/two real 33³ files/fxPasses tri-state)');
