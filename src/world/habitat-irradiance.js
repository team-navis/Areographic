import * as THREE from 'three';

/**
 * Static, coarse diffuse bounce for the fictional habitat.
 *
 * This is a small CPU radiosity approximation, not path-traced GI: axis-aligned
 * surface patches receive fixture light, exchange one further diffuse bounce,
 * and feed a first-order spherical-harmonic irradiance volume. Runtime shading
 * uses four trilinear 3D-texture samples. Direct PBR lights and specular IBL stay
 * in Three's normal lighting path. Doors/furniture/light positions are static
 * bake inputs; normal maps and small fittings are intentionally not traced.
 */
const ROOM = { x0: -4.5, x1: 4.5, z0: -3, z1: 3, h: 2.7 };
const WINDOW = { z0: -1.35, z1: .95, y0: .98, y1: 2.08 };
const DOOR = { z0: .425, z1: 1.575, y0: 0, y1: 2.08 };
const PI = Math.PI, EPSILON = .012, NORMAL_OFFSET = .14;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smooth = (lo, hi, value) => { const t = clamp((value - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const vector = (v) => Array.isArray(v) ? v : v && typeof v === 'object' ? [v.x, v.y, v.z] : [];
const finiteVector = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const normalized = (v) => { const length = Math.hypot(...v); return length > 0 ? v.map(x => x / length) : [0, 1, 0]; };
const colour = (hex) => new THREE.Color(hex).toArray();

// Coarse surfaces follow habitat-furniture.js, not the walking collision volumes.
// Thin worktops, separate cases and empty shelf bays matter to bounced visibility;
// legs, grips and fasteners stay in the direct-shadow/GTAO geometry only.
const defaultBlocks = () => {
  const metal = [.45, .45, .43];
  const volume = (id, x, bottom, z, width, height, depth, albedo = metal) => ({ id,
    min: [x - width / 2, bottom, z - depth / 2], max: [x + width / 2, bottom + height, z + depth / 2], albedo });
  return [
    { id: 'desk-slab', min: [-3.55, .762, -2.97], max: [3.55, .780, -2.02], albedo: [.45, .44, .41] },
    { id: 'desk-front-apron', min: [-3.55, .690, -2.071], max: [3.55, .780, -2.02], albedo: metal },
    { id: 'desk-rear-lip', min: [-3.55, .762, -2.97], max: [3.55, .837, -2.956], albedo: metal },
    ...[[-1.85, .82], [1.85, .82], [2.95, .9]].map(([x, width]) => ({ id: 'desk-cabinet',
      min: [x - width / 2, .084, -2.865], max: [x + width / 2, .744, -2.160], albedo: [.65, .64, .60] })),
    volume('left-transit-case-lower', -2.95, .020, -2.50, .92, .30, .60),
    volume('left-transit-case-upper', -2.95, .325, -2.50, .92, .30, .60),
    // Open rack: four thin trays and the actual rotated cases, not one solid wall.
    ...[.25, .84, 1.43, 2.02].map(y => volume('west-rack-shelf', -4.165, y - .009, -1.55, .55, .018, 1.66)),
    ...[[.25, -.405, .64, .30], [.25, .385, .62, .25], [.84, -.405, .64, .28], [.84, .385, .62, .32],
      [1.43, -.31, .79, .27], [1.43, .49, .40, .21]].map(([y, z, width, height]) =>
      volume('west-rack-case', -4.165, y + .011, -1.55 + z, .42, height, width)),
    volume('west-rack-top-case', -4.165, 2.031, -1.98, .41, .23, .55),
    volume('west-rack-fabric-bag', -4.165, 2.030, -1.25, .37, .21, .53, [.18, .19, .17]),
    volume('rear-worktop', -.15, .820, 2.70, 2.9, .018, .54),
    { id: 'rear-worktop-apron', min: [-1.6, .743, 2.430], max: [1.3, .838, 2.465], albedo: metal },
    volume('rear-lower-shelf', -.15, .131, 2.70, 2.76, .018, .43),
    volume('rear-case-left', -1.05, .151, 2.70, .72, .31, .38),
    volume('rear-case-right', .42, .151, 2.70, .86, .25, .38),
    volume('southeast-bench-deck', 2.9, .479, 2.70, 1.96, .022, .50),
    volume('southeast-bench-apron', 2.9, .427, 2.458, 1.96, .054, .016),
    volume('southeast-case-below', 2.5, .025, 2.70, .72, .30, .40),
    volume('southeast-case-above', 3.35, .503, 2.70, .61, .25, .39),
    { id: 'chair-back', min: [-.223, .568, -1.425], max: [.223, 1.0108, -1.321], albedo: [.09, .10, .09] },
    { id: 'chair-seat', min: [-.25, .440, -1.865], max: [.25, .5375, -1.405], albedo: [.09, .10, .09] },
  ];
};

function defaultEmitters(room, window) {
  const warm = colour(0xfff1df);
  return [
    ...[-1.75, 1.75].flatMap(x => [
      { type: 'area', position: [x, room.h - .17, -1.85], normal: [0, -1, 0], size: [1.5, .44], radiance: warm.map(c => c * 5.8) },
      { type: 'spot', position: [x, room.h - .18, -1.85], direction: [x * -.1, .25 - (room.h - .18), -.43], intensity: warm.map(c => c * 26), angle: 1.18, penumbra: 1, decay: 1.8, distance: 10 },
    ]),
    { type: 'point', position: [-2.6, room.h - .3, 1.6], intensity: warm.map(c => c * 3.5), decay: 1.8, distance: 9 },
    { type: 'point', position: [2.4, 2.1, 1.9], intensity: warm.map(c => c * 2.2), decay: 1.8, distance: 8 },
    // Broad exterior sky illumination reflected by interior surfaces, not a sun beam.
    ...(window ? [{ type: 'area', position: [room.x1 - .006, (window.y0 + window.y1) / 2, (window.z0 + window.z1) / 2], normal: [-1, 0, 0], size: [window.z1 - window.z0, window.y1 - window.y0], radiance: [.62, .60, .55] }] : []),
  ];
}

function makeGeometry(room, window, door, blocks, patchSize) {
  const surfaces = [], patches = [];
  function surface(axis, plane, u0, u1, v0, v1, sign, albedo, holes = []) {
    const axes = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    const n = [0, 0, 0]; n[axis] = sign;
    const nu = Math.max(1, Math.ceil((u1 - u0) / patchSize)), nv = Math.max(1, Math.ceil((v1 - v0) / patchSize));
    surfaces.push({ axis, plane, u: axes[0], v: axes[1], u0, u1, v0, v1, n, albedo, holes, nu, nv,
      du: (u1 - u0) / nu, dv: (v1 - v0) / nv, ids: new Int32Array(nu * nv).fill(-1) });
  }
  const hole = (o) => ({ u0: o.z0, u1: o.z1, v0: o.y0, v1: o.y1 });
  surface(1, 0, room.x0, room.x1, room.z0, room.z1, 1, [.36, .35, .32]);
  surface(1, room.h, room.x0, room.x1, room.z0, room.z1, -1, [.76, .75, .71]);
  surface(0, room.x0, room.z0, room.z1, 0, room.h, 1, [.75, .74, .70], door ? [hole(door)] : []);
  surface(0, room.x1, room.z0, room.z1, 0, room.h, -1, [.75, .74, .70], window ? [hole(window)] : []);
  surface(2, room.z0, room.x0, room.x1, 0, room.h, 1, [.53, .53, .50]);
  surface(2, room.z1, room.x0, room.x1, 0, room.h, -1, [.75, .74, .70]);
  for (const box of blocks) for (let axis = 0; axis < 3; axis++) {
    const [u, v] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    for (const sign of [-1, 1]) surface(axis, sign < 0 ? box.min[axis] : box.max[axis], box.min[u], box.max[u], box.min[v], box.max[v], sign, box.albedo);
  }
  const insideBlock = (p) => blocks.some(b => p.every((value, axis) => value > b.min[axis] + .001 && value < b.max[axis] - .001));
  const inHole = (s, u, v) => s.holes.some(h => u > h.u0 && u < h.u1 && v > h.v0 && v < h.v1);
  for (const s of surfaces) for (let v = 0; v < s.nv; v++) for (let u = 0; u < s.nu; u++) {
    const p = [0, 0, 0]; p[s.axis] = s.plane; p[s.u] = s.u0 + (u + .5) * s.du; p[s.v] = s.v0 + (v + .5) * s.dv;
    if (inHole(s, p[s.u], p[s.v])) continue;
    const origin = p.map((x, axis) => x + s.n[axis] * EPSILON);
    if (insideBlock(origin)) continue;
    s.ids[v * s.nu + u] = patches.length;
    patches.push({ p, origin, n: s.n, albedo: s.albedo });
  }
  function trace(origin, direction, maxDistance = Infinity) {
    let best = maxDistance, hit = null;
    for (const s of surfaces) {
      if (direction[s.axis] * s.n[s.axis] >= -1e-7) continue;
      const distance = (s.plane - origin[s.axis]) / direction[s.axis];
      if (distance <= .0001 || distance >= best) continue;
      const u = origin[s.u] + direction[s.u] * distance, v = origin[s.v] + direction[s.v] * distance;
      if (u < s.u0 || u > s.u1 || v < s.v0 || v > s.v1 || inHole(s, u, v)) continue;
      best = distance; hit = { surface: s, distance, u, v };
    }
    return hit;
  }
  function radianceAt(hit, radiance) {
    if (!hit) return [0, 0, 0];
    const s = hit.surface, u = clamp((hit.u - s.u0) / s.du - .5, 0, s.nu - 1), v = clamp((hit.v - s.v0) / s.dv - .5, 0, s.nv - 1);
    const u0 = Math.floor(u), v0 = Math.floor(v), result = [0, 0, 0]; let total = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const id = s.ids[Math.min(v0 + j, s.nv - 1) * s.nu + Math.min(u0 + i, s.nu - 1)];
      const weight = (i ? u - u0 : 1 - (u - u0)) * (j ? v - v0 : 1 - (v - v0));
      if (id < 0 || weight === 0) continue;
      for (let c = 0; c < 3; c++) result[c] += radiance[id * 3 + c] * weight;
      total += weight;
    }
    return total > 0 ? result.map(c => c / total) : result;
  }
  return { patches, trace, radianceAt, insideBlock };
}

function prepareEmitters(emitters, lightScale) {
  const prepared = [];
  for (const emitter of emitters) {
    if (!finiteVector(emitter.position) || !['area', 'point', 'spot'].includes(emitter.type)) throw new RangeError('Invalid habitat emitter position/type.');
    const power = emitter.type === 'area' ? emitter.radiance : emitter.intensity;
    if (!finiteVector(power) || power.some(c => c < 0)) throw new RangeError('Habitat emitter RGB values must be finite and nonnegative.');
    if (emitter.type === 'area') {
      if (!finiteVector(emitter.normal) || Math.hypot(...emitter.normal) === 0 || !emitter.size?.every(v => Number.isFinite(v) && v > 0) || emitter.size.length !== 2) throw new RangeError('Invalid habitat area emitter.');
      const normal = normalized(emitter.normal), axis = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
      if (Math.abs(normal[axis]) < .99999) throw new RangeError('Coarse habitat area emitters must be axis-aligned.');
      const [u, v] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
      for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
        const p = [...emitter.position]; p[u] += ((i + .5) / 3 - .5) * emitter.size[0]; p[v] += ((j + .5) / 2 - .5) * emitter.size[1];
        prepared.push({ p, normal, power: power.map(c => c * lightScale * emitter.size[0] * emitter.size[1] / 6), area: true });
      }
    } else {
      if (emitter.type === 'spot' && (!finiteVector(emitter.direction) || Math.hypot(...emitter.direction) === 0)) throw new RangeError('Habitat spot emitters need a finite nonzero direction.');
      prepared.push({ p: emitter.position, power: power.map(c => c * lightScale), direction: emitter.type === 'spot' ? normalized(emitter.direction) : null,
        cone: Math.cos(emitter.angle ?? PI), penumbra: Math.cos((emitter.angle ?? PI) * (1 - (emitter.penumbra ?? 0))), decay: emitter.decay ?? 2, distance: emitter.distance ?? 0 });
    }
  }
  return prepared;
}

function illuminatePatches(geometry, emitters, bounceSamples) {
  const { patches, trace, radianceAt } = geometry, first = new Float32Array(patches.length * 3);
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    for (const light of emitters) {
      const delta = light.p.map((x, axis) => x - patch.origin[axis]), distance = Math.hypot(...delta), direction = delta.map(x => x / distance);
      const cosine = Math.max(0, dot(patch.n, direction));
      if (distance < .015 || cosine === 0) continue;
      let factor = cosine / Math.max(.01, distance ** (light.area ? 2 : light.decay));
      if (light.area) factor *= Math.max(0, -dot(light.normal, direction));
      if (light.direction) factor *= smooth(light.cone, light.penumbra + 1e-6, -dot(light.direction, direction));
      if (light.distance) factor *= Math.max(0, 1 - (distance / light.distance) ** 4) ** 2;
      if (factor <= 0 || trace(patch.origin, direction, distance - .01)) continue;
      for (let c = 0; c < 3; c++) first[i * 3 + c] += patch.albedo[c] * light.power[c] * factor / PI;
    }
  }
  // Cosine-weighted deterministic hemisphere quadrature: rho/pi * integral(L cos)
  // becomes rho * mean(L). Only one further bounce is added, so energy cannot grow.
  const result = first.slice(), golden = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i], axis = p.n.findIndex(n => n !== 0), u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (let sample = 0; sample < bounceSamples; sample++) {
      const radius = Math.sqrt((sample + .5) / bounceSamples), angle = sample * golden, direction = [0, 0, 0];
      direction[axis] = p.n[axis] * Math.sqrt(1 - radius * radius); direction[u] = radius * Math.cos(angle); direction[v] = radius * Math.sin(angle);
      const received = radianceAt(trace(p.origin, direction), first);
      for (let c = 0; c < 3; c++) result[i * 3 + c] += p.albedo[c] * received[c] / bounceSamples;
    }
  }
  return result;
}

/** Pure numerical bake, also available for regression tests and offline inspection. */
export function bakeHabitatIrradiance({ room: roomInput = ROOM, window: windowInput = WINDOW, door: doorInput = DOOR,
  blocks = defaultBlocks(), emitters, lightScale = 1, spacing = .6, patchSize = .7, directionSamples = 96, bounceSamples = 32 } = {}) {
  const start = performance.now(), room = { ...ROOM, ...roomInput };
  const window = windowInput === false ? null : { ...WINDOW, ...windowInput }, door = doorInput === false ? null : { ...DOOR, ...doorInput };
  if (![room.x0, room.x1, room.z0, room.z1, room.h].every(Number.isFinite) || room.x1 <= room.x0 || room.z1 <= room.z0 || room.h <= .4) throw new RangeError('Invalid habitat room bounds.');
  if (![spacing, patchSize].every(v => Number.isFinite(v) && v >= .25) || !Number.isFinite(lightScale) || lightScale < 0) throw new RangeError('Invalid habitat bake scale/resolution.');
  if (![directionSamples, bounceSamples].every(v => Number.isInteger(v) && v >= 8 && v <= 512)) throw new RangeError('Habitat samples must be integers from 8 to 512.');
  for (const b of blocks) if (!finiteVector(b.min) || !finiteVector(b.max) || b.min.some((v, axis) => v >= b.max[axis]) || !finiteVector(b.albedo) || b.albedo.some(c => c < 0 || c >= 1)) throw new RangeError('Invalid habitat furniture bounds/albedo.');
  const geometry = makeGeometry(room, window, door, blocks, patchSize);
  const radiance = illuminatePatches(geometry, prepareEmitters(emitters ?? defaultEmitters(room, window), lightScale), bounceSamples);
  const min = [room.x0 + .10, .10, room.z0 + .10], max = [room.x1 - .10, room.h - .10, room.z1 - .10];
  const dims = min.map((v, axis) => Math.ceil((max[axis] - v) / spacing) + 1), count = dims[0] * dims[1] * dims[2];
  // RGB stores E0, Ex, Ey, Ez. E(n) = E0 + Ex*nx + Ey*ny + Ez*nz.
  // Tex0 alpha is a valid-probe weight; Tex1 alpha is coarse local visibility.
  const fields = Array.from({ length: 4 }, () => new Float32Array(count * 4)), golden = PI * (3 - Math.sqrt(5));
  const directions = Array.from({ length: directionSamples }, (_, i) => {
    const y = 1 - 2 * (i + .5) / directionSamples, radius = Math.sqrt(1 - y * y), a = golden * i;
    return [Math.cos(a) * radius, y, Math.sin(a) * radius];
  });
  let validProbes = 0;
  for (let z = 0; z < dims[2]; z++) for (let y = 0; y < dims[1]; y++) for (let x = 0; x < dims[0]; x++) {
    const p = [x, y, z].map((v, axis) => min[axis] + v / (dims[axis] - 1) * (max[axis] - min[axis]));
    const index = ((z * dims[1] + y) * dims[0] + x) * 4;
    if (geometry.insideBlock(p)) continue;
    fields[0][index + 3] = 1; validProbes++;
    for (const direction of directions) {
      const hit = geometry.trace(p, direction), rgb = geometry.radianceAt(hit, radiance);
      const visibility = hit ? smooth(.04, .85, hit.distance) : 1;
      fields[1][index + 3] += visibility / directionSamples;
      for (let c = 0; c < 3; c++) {
        fields[0][index + c] += PI * rgb[c] / directionSamples;
        for (let axis = 0; axis < 3; axis++) fields[axis + 1][index + c] += 2 * PI * rgb[c] * direction[axis] / directionSamples;
      }
    }
  }
  return { room, min, max, dims, fields, stats: { method: 'coarse static diffuse radiosity / first-order SH volume', patches: geometry.patches.length,
    probes: count, validProbes, directionSamples, bounceSamples, textureBytes: count * 4 * 4 * 2, bakeMs: performance.now() - start } };
}

function interpolate(field, grid, p) {
  const q = p.map((v, axis) => clamp((v - grid.min[axis]) / (grid.max[axis] - grid.min[axis]) * (grid.dims[axis] - 1), 0, grid.dims[axis] - 1));
  const lower = q.map(Math.floor), output = [0, 0, 0, 0];
  for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const xyz = [x, y, z], at = xyz.map((v, axis) => Math.min(lower[axis] + v, grid.dims[axis] - 1));
    const w = xyz.reduce((value, v, axis) => value * (v ? q[axis] - lower[axis] : 1 - (q[axis] - lower[axis])), 1);
    const index = ((at[2] * grid.dims[1] + at[1]) * grid.dims[0] + at[0]) * 4;
    for (let c = 0; c < 4; c++) output[c] += field[index + c] * w;
  }
  return output;
}

const SHADER = /* glsl */`
varying vec3 vHabitatIrradianceWorld;
uniform highp sampler3D habitatIrradiance0;
uniform highp sampler3D habitatIrradianceX;
uniform highp sampler3D habitatIrradianceY;
uniform highp sampler3D habitatIrradianceZ;
uniform vec3 habitatProbeMin;
uniform vec3 habitatProbeMax;
uniform vec3 habitatProbeSize;
uniform vec3 habitatRoomMin;
uniform vec3 habitatRoomMax;
uniform float habitatFloorY;
uniform float habitatBounceIntensity;
uniform float habitatEnvironmentDiffuse;

vec3 habitatBounce(vec3 worldPosition, vec3 worldNormal, out float influence, out float visibility) {
  vec3 p = worldPosition - vec3(0.0, habitatFloorY, 0.0) + worldNormal * 0.14;
  vec3 edge = min(p - habitatRoomMin, habitatRoomMax - p);
  influence = smoothstep(-0.02, 0.12, min(edge.x, min(edge.y, edge.z)));
  if (influence <= 0.0) { visibility = 1.0; return vec3(0.0); }
  // Map node positions to texel centres, so GPU interpolation matches the CPU sampler.
  vec3 q = clamp((p - habitatProbeMin) / (habitatProbeMax - habitatProbeMin), 0.0, 1.0);
  vec3 uvw = (q * (habitatProbeSize - 1.0) + 0.5) / habitatProbeSize;
  vec4 e0 = texture(habitatIrradiance0, uvw);
  vec4 ex = texture(habitatIrradianceX, uvw);
  vec3 ey = texture(habitatIrradianceY, uvw).rgb;
  vec3 ez = texture(habitatIrradianceZ, uvw).rgb;
  float valid = max(e0.a, 0.0001);
  influence *= smoothstep(0.05, 0.6, e0.a);
  visibility = clamp(ex.a / valid, 0.0, 1.0);
  return max(vec3(0.0), (e0.rgb + ex.rgb * worldNormal.x + ey * worldNormal.y + ez * worldNormal.z) / valid);
}
`;

/** World units are metres; floorY is the existing base.placeOnTerrain() translation. */
export function createHabitatIrradiance({ floorY = 0, intensity = 1, environmentDiffuseWeight = .16, ...options } = {}) {
  if (!Number.isFinite(floorY) || !Number.isFinite(intensity) || intensity < 0 || !Number.isFinite(environmentDiffuseWeight) || environmentDiffuseWeight < 0 || environmentDiffuseWeight > 1) throw new RangeError('Invalid habitat irradiance intensity/translation.');
  const grid = bakeHabitatIrradiance(options), { room } = grid;
  const textures = grid.fields.map(field => {
    const data = new Uint16Array(field.length); for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(field[i]);
    const texture = new THREE.Data3DTexture(data, ...grid.dims); texture.format = THREE.RGBAFormat; texture.type = THREE.HalfFloatType;
    texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.unpackAlignment = 1; texture.generateMipmaps = false; texture.needsUpdate = true;
    return texture;
  });
  const uniforms = {
    habitatIrradiance0: { value: textures[0] }, habitatIrradianceX: { value: textures[1] }, habitatIrradianceY: { value: textures[2] }, habitatIrradianceZ: { value: textures[3] },
    habitatProbeMin: { value: new THREE.Vector3(...grid.min) }, habitatProbeMax: { value: new THREE.Vector3(...grid.max) }, habitatProbeSize: { value: new THREE.Vector3(...grid.dims) },
    habitatRoomMin: { value: new THREE.Vector3(room.x0, 0, room.z0) }, habitatRoomMax: { value: new THREE.Vector3(room.x1, room.h, room.z1) },
    habitatFloorY: { value: floorY }, habitatBounceIntensity: { value: intensity }, habitatEnvironmentDiffuse: { value: environmentDiffuseWeight },
  };
  const installed = new Map(); let disposed = false;
  function applyToMaterials(materials) {
    if (disposed) throw new Error('Habitat irradiance has been disposed.');
    for (const material of new Set(materials)) {
      if (!material?.isMeshStandardMaterial || material.transparent || installed.has(material)) continue;
      const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
      const fallbackKey = previousKey === THREE.Material.prototype.customProgramCacheKey ? previous.toString() : null;
      const hook = function (shader, renderer) {
        previous.call(this, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'varying vec3 vHabitatIrradianceWorld;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 habitatWorld = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            habitatWorld = batchingMatrix * habitatWorld;
          #endif
          #ifdef USE_INSTANCING
            habitatWorld = instanceMatrix * habitatWorld;
          #endif
          vHabitatIrradianceWorld = (modelMatrix * habitatWorld).xyz;`);
        shader.fragmentShader = SHADER + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
          #if defined(RE_IndirectDiffuse)
            vec3 habitatNormal = inverseTransformDirection(geometryNormal, viewMatrix);
            float habitatInfluence, habitatVisibility;
            vec3 habitatIrradiance = habitatBounce(vHabitatIrradianceWorld, habitatNormal, habitatInfluence, habitatVisibility);
            iblIrradiance *= mix(1.0, habitatEnvironmentDiffuse * habitatVisibility, habitatInfluence);
            irradiance += habitatIrradiance * habitatBounceIntensity * habitatInfluence;
          #endif`);
      };
      const cacheKey = () => (fallbackKey ?? previousKey.call(material)) + '|habitat-static-irradiance-v1';
      installed.set(material, { previous, previousKey, hook, cacheKey }); material.onBeforeCompile = hook; material.customProgramCacheKey = cacheKey; material.needsUpdate = true;
    }
    return installed.size;
  }
  function sample(position, normal) {
    const world = vector(position), inputNormal = vector(normal);
    if (!finiteVector(world) || !finiteVector(inputNormal) || Math.hypot(...inputNormal) === 0) throw new RangeError('Habitat sample position/normal must be finite, with a nonzero normal.');
    const n = normalized(inputNormal);
    const p = world.map((v, axis) => v - (axis === 1 ? floorY : 0) + n[axis] * NORMAL_OFFSET);
    const edge = Math.min(p[0] - room.x0, room.x1 - p[0], p[1], room.h - p[1], p[2] - room.z0, room.z1 - p[2]);
    const [e0, ex, ey, ez] = grid.fields.map(f => interpolate(f, grid, p)), valid = Math.max(.0001, e0[3]);
    const influence = smooth(-.02, .12, edge) * smooth(.05, .6, e0[3]), visibility = clamp(ex[3] / valid, 0, 1);
    return { irradiance: [0, 1, 2].map(c => Math.max(0, (e0[c] + ex[c] * n[0] + ey[c] * n[1] + ez[c] * n[2]) / valid) * uniforms.habitatBounceIntensity.value * influence),
      visibility, influence, environmentDiffuseWeight: 1 + (uniforms.habitatEnvironmentDiffuse.value * visibility - 1) * influence };
  }
  return {
    applyToMaterials, sample, stats: { ...grid.stats, dimensions: [...grid.dims] },
    setIntensity(value) { if (!Number.isFinite(value) || value < 0) throw new RangeError('Habitat intensity must be nonnegative.'); uniforms.habitatBounceIntensity.value = value; },
    setEnvironmentDiffuseWeight(value) { if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Environment diffuse weight must be in [0,1].'); uniforms.habitatEnvironmentDiffuse.value = value; },
    dispose() {
      if (disposed) return; disposed = true;
      for (const [material, { previous, previousKey, hook, cacheKey }] of installed) {
        if (material.onBeforeCompile === hook) material.onBeforeCompile = previous;
        if (material.customProgramCacheKey === cacheKey) material.customProgramCacheKey = previousKey;
        material.needsUpdate = true;
      }
      installed.clear(); textures.forEach(t => t.dispose());
    },
  };
}
