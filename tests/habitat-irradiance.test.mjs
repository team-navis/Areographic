import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bakeHabitatIrradiance, createHabitatIrradiance } from '../src/world/habitat-irradiance.js';

const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const closeRGB = (a, b) => a.forEach((v, i) => close(v, b[i]));

test('default diffuse bake is finite, bounded and small enough to remain a probe volume', () => {
  const grid = bakeHabitatIrradiance();
  assert.equal(grid.fields.length, 4);
  assert.ok(grid.stats.validProbes > grid.stats.probes * .9);
  assert.ok(grid.stats.textureBytes < 64 * 1024);
  for (const field of grid.fields) for (let i = 0; i < field.length; i++) {
    assert.ok(Number.isFinite(field[i]));
    // Signed SH directional terms are allowed; no uncontrolled energy amplification.
    assert.ok(Math.abs(field[i]) < 12);
  }
  for (let i = 0; i < grid.fields[0].length; i += 4) {
    assert.ok(grid.fields[0][i] >= 0 && grid.fields[0][i + 1] >= 0 && grid.fields[0][i + 2] >= 0);
    assert.ok(grid.fields[1][i + 3] >= 0 && grid.fields[1][i + 3] <= 1.00001);
  }
});

test('without emitters the bake creates no light from room albedo or probe visibility', () => {
  const grid = bakeHabitatIrradiance({ emitters: [] });
  for (const field of grid.fields) for (let i = 0; i < field.length; i++) if (i % 4 !== 3) assert.equal(field[i], 0);
  assert.ok(grid.fields[0].some(v => v === 1), 'valid probes are still represented');
});

test('diffuse energy scales linearly with fixture energy across both bounce stages', () => {
  const base = bakeHabitatIrradiance({ lightScale: 1 }), brighter = bakeHabitatIrradiance({ lightScale: 2 });
  for (let f = 0; f < 4; f++) for (let i = 0; i < base.fields[f].length; i++) {
    close(brighter.fields[f][i], base.fields[f][i] * (i % 4 === 3 ? 1 : 2));
  }
});

test('desk geometry blocks bounce below the desk and preserves brighter open floor', () => {
  const furnished = createHabitatIrradiance(), empty = createHabitatIrradiance({ blocks: [] });
  try {
    const under = furnished.sample([1, .04, -2.4], [0, 1, 0]);
    const unobstructed = empty.sample([1, .04, -2.4], [0, 1, 0]);
    assert.ok(under.irradiance[0] < unobstructed.irradiance[0] * .65);
    assert.ok(under.visibility < unobstructed.visibility);
    assert.ok(furnished.sample([0, .04, 0], [0, 1, 0]).irradiance[0] > under.irradiance[0]);
  } finally { furnished.dispose(); empty.dispose(); }
});

test('an isolated 18 mm worktop still blocks fixture light and leaves its underside softly lit', () => {
  // No cabinets or other furniture can account for this shadow: the thin sheet alone must block it.
  const deck = { min: [-3.55, .762, -2.97], max: [3.55, .780, -2.02], albedo: [.45, .44, .41] };
  const thin = createHabitatIrradiance({ blocks: [deck] }), empty = createHabitatIrradiance({ blocks: [] });
  try {
    const below = thin.sample([1, .04, -2.4], [0, 1, 0]);
    const withoutDeck = empty.sample([1, .04, -2.4], [0, 1, 0]);
    assert.ok(below.irradiance[0] < withoutDeck.irradiance[0] * .7);
    const underside = thin.sample([1, .762, -2.4], [0, -1, 0]);
    assert.equal(underside.influence, 1);
    assert.ok(underside.irradiance.every(value => Number.isFinite(value) && value > 0));
    const top = thin.sample([1, .780, -2.4], [0, 1, 0]);
    assert.equal(top.influence, 1, 'normal offsets place both sides in valid air probes');
  } finally { thin.dispose(); empty.dispose(); }
});

test('world-floor translation is invariant and outside materials retain their original diffuse IBL', () => {
  const origin = createHabitatIrradiance(), translated = createHabitatIrradiance({ floorY: 137.4 });
  try {
    const local = origin.sample([0, 1.5, -2.98], [0, 0, 1]);
    const world = translated.sample(new THREE.Vector3(0, 138.9, -2.98), new THREE.Vector3(0, 0, 1));
    closeRGB(local.irradiance, world.irradiance); close(local.visibility, world.visibility);
    const ramp = translated.sample([-9, 137.5, 1], [0, 1, 0]);
    assert.deepEqual(ramp.irradiance, [0, 0, 0]); assert.equal(ramp.influence, 0); assert.equal(ramp.environmentDiffuseWeight, 1);
  } finally { origin.dispose(); translated.dispose(); }
});

test('runtime intensity and diffuse IBL controls do not require another bake', () => {
  const light = createHabitatIrradiance();
  try {
    const before = light.sample([0, .02, 0], [0, 1, 0]);
    light.setIntensity(1.5); light.setEnvironmentDiffuseWeight(0);
    const after = light.sample([0, .02, 0], [0, 1, 0]);
    closeRGB(after.irradiance, before.irradiance.map(c => c * 1.5));
    assert.equal(after.environmentDiffuseWeight, 0);
    assert.throws(() => light.setIntensity(-1), RangeError);
    assert.throws(() => light.setEnvironmentDiffuseWeight(1.1), RangeError);
    assert.throws(() => light.sample([0, 1, 0], [0, 0, 0]), RangeError);
  } finally { light.dispose(); }
});

test('shader installation preserves enamel hooks, skips optics, and restores hooks on disposal', () => {
  const light = createHabitatIrradiance(), enamel = new THREE.MeshStandardMaterial(), glass = new THREE.MeshPhysicalMaterial({ transparent: true }), screen = new THREE.MeshBasicMaterial();
  const priorHook = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.55);'); };
  const priorKey = () => 'existing-enamel-floor'; enamel.onBeforeCompile = priorHook; enamel.customProgramCacheKey = priorKey;
  assert.equal(light.applyToMaterials([enamel, glass, screen, enamel]), 1);
  assert.equal(light.applyToMaterials([enamel]), 1);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  enamel.onBeforeCompile(shader, {});
  assert.ok(shader.fragmentShader.includes('roughnessFactor = max(roughnessFactor, 0.55)'));
  assert.ok(shader.fragmentShader.includes('irradiance += habitatIrradiance'));
  assert.ok(shader.fragmentShader.includes('iblIrradiance *= mix'));
  assert.ok(!/\bradiance\s*\*=/.test(shader.fragmentShader), 'specular radiance is not attenuated');
  assert.ok(enamel.customProgramCacheKey().startsWith('existing-enamel-floor|'));
  assert.equal(shader.uniforms.habitatIrradiance0.value.isData3DTexture, true);
  assert.equal(shader.uniforms.habitatIrradiance0.value.type, THREE.HalfFloatType);
  light.dispose(); light.dispose();
  assert.equal(enamel.onBeforeCompile, priorHook); assert.equal(enamel.customProgramCacheKey, priorKey);
  assert.throws(() => light.applyToMaterials([enamel]), /disposed/);
  enamel.dispose(); glass.dispose(); screen.dispose();
});
