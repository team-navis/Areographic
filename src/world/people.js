import * as THREE from 'three';
import { assetUrl } from '../util/asset-url.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { loadAreographicAstronaut } from './areographic-suit.js';
import { ph } from '../util/tex.js';

/** Elliptical loft along a smooth centre line. Used for the provisional procedural operator figure. */
function loft(sections, right, mat, seg = 18, sub = 5) {
  const curve = new THREE.CatmullRomCurve3(sections.map((s) => s.p), false, 'centripetal'), n = (sections.length - 1) * sub;
  const pos = [], idx = [], R = right.clone().normalize();
  for (let i = 0; i <= n; i++) {
    const t = i / n, f = t * (sections.length - 1), k = Math.min(sections.length - 2, Math.floor(f)), u0 = f - k, e = u0 * u0 * (3 - 2 * u0);
    const a = sections[k].a + (sections[k + 1].a - sections[k].a) * e, b = sections[k].b + (sections[k + 1].b - sections[k].b) * e;
    const c = curve.getPoint(t), tan = curve.getTangent(t).normalize(), u = R.clone().sub(tan.clone().multiplyScalar(R.dot(tan))).normalize(), v = new THREE.Vector3().crossVectors(tan, u);
    for (let j = 0; j < seg; j++) { const ph_ = (j / seg) * Math.PI * 2; pos.push(c.x + u.x * a * Math.cos(ph_) + v.x * b * Math.sin(ph_), c.y + u.y * a * Math.cos(ph_) + v.y * b * Math.sin(ph_), c.z + u.z * a * Math.cos(ph_) + v.z * b * Math.sin(ph_)); }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) { const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = a + seg, d = b + seg; idx.push(a, b, c, b, d, c); }
  const first = sections[0].p, last = sections[sections.length - 1].p, ci = pos.length / 3; pos.push(first.x, first.y, first.z, last.x, last.y, last.z);
  for (let j = 0; j < seg; j++) { idx.push(ci, (j + 1) % seg, j); idx.push(ci + 1, n * seg + j, n * seg + ((j + 1) % seg)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const uv = new Float32Array((pos.length / 3) * 2); for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] * 3 + pos[i * 3 + 2] * 3; uv[i * 2 + 1] = pos[i * 3 + 1] * 3; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Seated base operator. PROVISIONAL procedural figure (lofted limbs, articulated fingers) - no licensed
 * rigged human model has been obtained yet; this is not the target character quality.
 */
export function buildOperator(interiorMaterials) {
  const g = new THREE.Group(); g.name = 'operator-provisional';
  const std = (o) => { const m = new THREE.MeshStandardMaterial(o); interiorMaterials.push(m); return m; };
  const suit = std({ normalMap: ph('denim_fabric_nor', { repeat: 2 }), color: new THREE.Color(0.075, 0.08, 0.088), roughness: 0.92 }); // dark plain work clothes, no insignia (design guide)
  const skin = std({ color: 0xb98a6a, roughness: 0.62 }), hair = std({ color: 0x17120f, roughness: 0.75 }), dark = std({ color: 0x141416, roughness: 0.5, metalness: 0.2 }), shoe = std({ color: 0x22201e, roughness: 0.7 });
  const X = V(1, 0, 0);
  // torso (leaning slightly toward the desk), collar, belt
  g.add(loft([{ p: V(0, 0.56, 0.06), a: 0.165, b: 0.125 }, { p: V(0, 0.68, 0.05), a: 0.172, b: 0.128 }, { p: V(0, 0.84, 0.03), a: 0.15, b: 0.105 }, { p: V(0, 1.0, -0.01), a: 0.172, b: 0.115 }, { p: V(0, 1.13, -0.05), a: 0.185, b: 0.1 }, { p: V(0, 1.19, -0.065), a: 0.1, b: 0.075 }, { p: V(0, 1.215, -0.07), a: 0.058, b: 0.055 }], X, suit, 24, 6));
  const belt = loft([{ p: V(0, 0.735, 0.045), a: 0.166, b: 0.122 }, { p: V(0, 0.775, 0.04), a: 0.16, b: 0.117 }], X, dark, 24, 1); g.add(belt);
  g.add(loft([{ p: V(0, 1.2, -0.07), a: 0.05, b: 0.052 }, { p: V(0, 1.27, -0.085), a: 0.046, b: 0.05 }], X, skin, 14, 2)); // neck
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.016, 8, 20), suit); collar.rotation.x = Math.PI / 2 - 0.2; collar.position.set(0, 1.215, -0.072); collar.castShadow = true; g.add(collar);
  // head + hair + headset (head group is hidden while the camera sits at the operator's eyes)
  const head = new THREE.Group(); head.position.set(0, 1.345, -0.1); head.rotation.x = -0.08; g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), skin); skull.scale.set(0.086, 0.112, 0.1); skull.castShadow = true; head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin); jaw.scale.set(0.07, 0.07, 0.075); jaw.position.set(0, -0.055, -0.025); head.add(jaw);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.58), hair); hairM.scale.set(0.091, 0.117, 0.106); hairM.rotation.x = 0.5; hairM.position.set(0, 0.006, 0.008); hairM.castShadow = true; head.add(hairM);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin); ear.scale.set(0.012, 0.026, 0.018); ear.position.set(s * 0.086, -0.01, 0.005); head.add(ear);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.043, 0.032, 18), dark); cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.098, -0.008, 0.004); cup.castShadow = true; head.add(cup); }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.103, 0.008, 8, 28, Math.PI), dark); band.position.set(0, -0.004, 0.004); head.add(band);
  const boom = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.1, -0.02, 0), V(-0.1, -0.07, -0.05), V(-0.06, -0.085, -0.1)]), 10, 0.004, 6), dark); head.add(boom);
  // legs: hip -> knee -> ankle, feet under the desk
  for (const s of [-1, 1]) {
    g.add(loft([{ p: V(s * 0.095, 0.6, 0.07), a: 0.085, b: 0.08 }, { p: V(s * 0.105, 0.605, -0.15), a: 0.078, b: 0.072 }, { p: V(s * 0.12, 0.6, -0.4), a: 0.062, b: 0.06 }, { p: V(s * 0.122, 0.56, -0.47), a: 0.056, b: 0.058 }], V(1, 0, 0), suit, 16, 5));
    g.add(loft([{ p: V(s * 0.122, 0.6, -0.45), a: 0.057, b: 0.06 }, { p: V(s * 0.124, 0.36, -0.47), a: 0.052, b: 0.056 }, { p: V(s * 0.125, 0.12, -0.5), a: 0.042, b: 0.046 }], V(1, 0, 0), suit, 16, 5));
    const sh = new THREE.Mesh(new RoundedBoxGeometry(0.095, 0.085, 0.26, 3, 0.038), shoe); sh.position.set(s * 0.126, 0.045, -0.56); sh.rotation.y = s * -0.08; sh.castShadow = true; g.add(sh);
    // arms: shoulder -> elbow -> wrist resting at the keyboard / mouse
    const wr = s < 0 ? V(-0.13, 0.835, -0.5) : V(0.33, 0.835, -0.5), el = V(s * 0.275, 0.9, -0.19);
    g.add(loft([{ p: V(s * 0.19, 1.13, -0.05), a: 0.062, b: 0.062 }, { p: V(s * 0.225, 1.06, -0.07), a: 0.058, b: 0.058 }, { p: el.clone().add(V(0, 0.03, 0.03)), a: 0.05, b: 0.05 }, { p: el, a: 0.048, b: 0.048 }], V(0, 0, 1), suit, 14, 5));
    g.add(loft([{ p: el.clone().add(V(0, 0, 0.01)), a: 0.048, b: 0.048 }, { p: el.clone().lerp(wr, 0.5), a: 0.043, b: 0.04 }, { p: wr.clone().add(V(0, 0, 0.03)), a: 0.033, b: 0.03 }], V(0, 1, 0), suit, 14, 5));
    // hand: palm + four two-segment fingers + thumb
    const hand = new THREE.Group(); hand.position.copy(wr); hand.rotation.y = s < 0 ? -0.35 : 0.1; g.add(hand);
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.082, 0.026, 0.09, 3, 0.012), skin); palm.position.set(0, -0.008, -0.045); palm.castShadow = true; hand.add(palm);
    for (let f = 0; f < 4; f++) {
      const fx = -0.03 + f * 0.02, len = [0.036, 0.042, 0.04, 0.03][f];
      const p1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, len, 4, 8), skin); p1.rotation.x = -Math.PI / 2 + 0.3; p1.position.set(fx, -0.012, -0.09 - len / 2 - 0.006); p1.castShadow = true; hand.add(p1);
      const p2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0078, len * 0.7, 4, 8), skin); p2.rotation.x = -Math.PI / 2 + 0.75; p2.position.set(fx, -0.028, -0.09 - len - 0.022); p2.castShadow = true; hand.add(p2);
    }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.04, 4, 8), skin); th.rotation.set(-Math.PI / 2 + 0.2, 0, s * 0.7); th.position.set(-s * 0.05, -0.012, -0.055); th.castShadow = true; hand.add(th);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.008, 8, 16), suit); cuff.position.set(0, 0, 0.012); hand.add(cuff);
  }
  // click target
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.45, 0.95), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 0.75, -0.1); hit.name = 'hit-operator'; g.add(hit);
  return { group: g, head, hit, eye: V(0, 1.335, -0.16) };
}

/**
 * Seated base operator. Default: the "central base worker (seated)" mesh supplied by the team
 * (public/models/operator/base-operator-seated.glb, optimized with @gltf-transform/cli weld+simplify+draco).
 * One static mesh with a baked colour texture that includes its own office chair, so the caller hides
 * the habitat's procedural chair while this figure is shown (`ownChair`). The head cannot be hidden
 * separately: `head` is an empty group kept for the callers that toggle it; in the seat view the camera
 * sits just in front of the face, looking away from it. `?operator=procedural` (or a failed load)
 * falls back to the procedural figure.
 */
const OPERATOR_MESH = { url: assetUrl('/models/operator/base-operator-seated.glb'), height: 1.47, yaw: Math.PI, back: 0.05 }; // source faces +z; scaled so the hands reach the keyboard and the eyes sit near the 1.335 m seat-view camera
export async function loadOperator(interiorMaterials) {
  const choice = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('operator') : null;
  // The EVOVA operator mesh was removed from the repo; the procedural figure is the default.
  // `?operator=mesh` tries a local mesh if one is present and falls back to the procedural figure.
  if (choice !== 'mesh') return buildOperator(interiorMaterials);
  try {
    const draco = new DRACOLoader().setDecoderPath(assetUrl('/draco/'));
    const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(OPERATOR_MESH.url); draco.dispose();
    const g = new THREE.Group(); g.name = 'operator-mesh';
    let tris = 0;
    gltf.scene.traverse((o) => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.side = THREE.FrontSide; if (m.map) m.map.anisotropy = 8; if (!interiorMaterials.includes(m)) interiorMaterials.push(m); } });
    const model = new THREE.Group(); model.add(gltf.scene); model.rotation.y = OPERATOR_MESH.yaw;
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()), s = OPERATOR_MESH.height / size.y; model.scale.setScalar(s);
    model.position.set(0, -new THREE.Box3().setFromObject(model).min.y, OPERATOR_MESH.back); // keep the source origin (chair column) on the seat point
    g.add(model);
    const head = new THREE.Group(); head.position.set(0, 1.32, -0.03); g.add(head);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.45, 0.95), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 0.75, -0.1); hit.name = 'hit-operator'; g.add(hit);
    return { group: g, head, hit, model, ownChair: true, eye: V(0, 1.335, -0.16), info: { source: OPERATOR_MESH.url, scale: s, triangles: Math.round(tris) } };
  } catch (err) {
    console.warn('operator mesh failed to load; using the procedural figure', err);
    return buildOperator(interiorMaterials);
  }
}

/**
 * Team Areographic suit by default; NASA Mark III remains the fallback and
 * explicit comparison at ?suit=mark3. The removed EVOVA mesh stays local-only.
 */
export async function loadAstronaut(options) {
  const choice = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('suit') : null;
  if (choice === 'surface') return loadSurfaceSuitAstronaut().catch((err) => { console.warn('surface suit mesh unavailable; using the NASA Mark III model', err); return loadMark3Astronaut(); });
  if (choice === 'mark3') return loadMark3Astronaut();
  return loadAreographicAstronaut(options).catch((err) => {
    console.warn('Areographic suit unavailable; using the NASA Mark III model', err);
    return loadMark3Astronaut();
  });
}

/**
 * Default crew model: "Mars Surface EVA Spacesuit" studio-render mesh supplied by the team
 * (public/models/eva/mars-surface-eva-suit.glb). One static mesh with a single baked colour
 * texture: no rig, no walk cycle, and the visor is part of the bake (it does not reflect the scene).
 */
const SURFACE_SUIT = { url: assetUrl('/models/eva/mars-surface-eva-suit.glb'), height: 1.9, yaw: Math.PI + 0.5, eyeForward: 0, headX: 0.037 }; // headX puts the helmet (not the arm-skewed bbox centre) on the axis; // the source mesh faces +z turned ~29 deg to its side (measured from a top-down render); the demo convention is forward = -z
export async function loadSurfaceSuitAstronaut() {
  const draco = new DRACOLoader().setDecoderPath(assetUrl('/draco/')); // optimized copy is Draco-compressed (tools: @gltf-transform/cli weld+simplify+draco)
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(SURFACE_SUIT.url); draco.dispose();
  const model = gltf.scene, g = new THREE.Group(); g.name = 'astronaut-surface-eva';
  const mats = new Set(); let tris = 0;
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)); tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  for (const m of mats) { m.userData.materialRole = 'baked-suit'; m.side = THREE.FrontSide; if (m.map) m.map.anisotropy = 8; }
  const pivot = new THREE.Group(); pivot.add(model); pivot.rotation.y = SURFACE_SUIT.yaw;
  const box = new THREE.Box3().setFromObject(pivot), size = box.getSize(new THREE.Vector3());
  const s = SURFACE_SUIT.height / size.y; pivot.scale.setScalar(s);
  const b2 = new THREE.Box3().setFromObject(pivot), c = b2.getCenter(new THREE.Vector3()); pivot.position.set(-c.x + SURFACE_SUIT.headX, -b2.min.y, -c.z + SURFACE_SUIT.eyeForward);
  // The baked visor is torn (holes and ragged shards). A smooth dark glass bubble sits in the helmet opening,
  // just in front of the shards and under the gold sunshade; everything outside the opening stays inside the shell.
  const glass = new THREE.MeshStandardMaterial({ color: 0x0c0f13, metalness: 0.92, roughness: 0.1 }); glass.name = 'visor-glass'; glass.userData.materialRole = 'visor'; glass.userData.visor = true; mats.add(glass);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), glass); visor.name = 'visor-fill'; visor.scale.set(0.128, 0.092, 0.114); visor.position.set(0, 1.68, -0.075); visor.castShadow = true;
  const body = new THREE.Group(); body.add(pivot, visor); g.add(body);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.95, 0.75), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 0.98, 0); hit.name = 'hit-astronaut'; g.add(hit);
  return { group: g, model: body, hit, materials: [...mats], info: { source: 'Mars Surface EVA Spacesuit studio-render mesh (public/models/eva/mars-surface-eva-suit.glb)', rawSize: size.toArray(), scale: s, triangles: Math.round(tris), skinnedMeshes: 0, animations: gltf.animations.length,
    pose: 'static source pose; no walk, seated or finger animation',
    materials: [...mats].map((m) => ({ name: m.name || 'baked-suit', role: m.userData.materialRole, color: m.color?.getHexString(), metalness: m.metalness, roughness: m.roughness, opacity: m.opacity, transparent: m.transparent, map: !!m.map, normalMap: !!m.normalMap, transmission: m.transmission, type: m.type })) } };
}

/**
 * Previous crew model: NASA "Mark III Spacesuit" (NASA 3D Resources, credit NASA / Michael D. Carbajal).
 * Static, unrigged mesh: no walk cycle or seated pose is available. Not an actual Mars surface suit.
 */
export async function loadMark3Astronaut() {
  const draco = new DRACOLoader().setDecoderPath(assetUrl('/draco/')); // decoder files copied from the pinned three package (Apache-2.0)
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(assetUrl('/models/nasa/mark-iii-spacesuit.glb')); draco.dispose();
  const model = gltf.scene, g = new THREE.Group(); g.name = 'astronaut-mark3';
  const mats = new Set(); let tris = 0, skinnedMeshes = 0;
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)); tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; if (o.isSkinnedMesh) skinnedMeshes++; } });
  // Material roles are presentation corrections, not measured Mark III values.
  // The source GLB exports transmission=1 on most opaque parts, defaults to
  // metallic=1 / roughness=1, and disables specular on its Lambert materials.
  // Keep the original shapes and logo UVs; give fabric, shell and seals distinct
  // responses instead of putting the same cloth normal on every white surface.
  const cloth = ph('fabric_pattern_07_nor', { repeat: 20 });
  for (const m of mats) {
    const n = m.name.toLowerCase();
    if ('transmission' in m) { m.transmission = 0; m.thickness = 0; m.ior = 1.46; m.specularIntensity = 1; m.specularColor.set(0xffffff); m.clearcoat = 0; }
    m.transparent = false; m.opacity = 1; m.depthWrite = true; m.side = THREE.DoubleSide;
    m.normalMap = null;
    if (n.includes('blinn1')) {
      // The source has a bubble but no interior face. A restrained smoky visor
      // retains its silhouette and reflects the environment without a gold mirror.
      m.userData.materialRole = 'visor'; m.userData.visor = true;
      m.color.set(0x5b6259); m.metalness = 0; m.roughness = .075;
      m.transparent = true; m.opacity = .42; m.depthWrite = false;
      m.clearcoat = 1; m.clearcoatRoughness = .055; m.ior = 1.49;
    } else if (n.includes('bluesteel')) {
      m.userData.materialRole = 'anodized-hardware'; m.metalness = .82; m.roughness = .34;
      m.color.multiply(new THREE.Color(.88, .94, 1));
    } else if (n.includes('steel') || n.includes('bodyrings')) {
      m.userData.materialRole = 'joint-hardware'; m.metalness = .9; m.roughness = n.includes('holes') ? .48 : .31;
      m.color.multiplyScalar(.92);
    } else if (n.includes('suitcolormappedlegs') || n.includes('hand_lambert')) {
      m.userData.materialRole = n.includes('hand_') ? 'glove-fabric' : 'pressure-garment';
      m.metalness = 0; m.roughness = .93; m.color.multiply(new THREE.Color(.98, .97, .92));
      m.normalMap = cloth; m.normalScale = new THREE.Vector2(.16, .16);
      if ('sheen' in m) { m.sheen = .12; m.sheenColor.set(0xd7d8c9); m.sheenRoughness = .92; }
    } else if (n.includes('lambert3') || n.includes('lambert4') || n.includes('blinn2')) {
      m.userData.materialRole = 'boot-or-joint-seal'; m.metalness = 0; m.roughness = .82;
      if ('specularIntensity' in m) m.specularIntensity = .45;
    } else if (m.map) {
      m.userData.materialRole = 'original-logo'; m.metalness = 0; m.roughness = .74;
    } else {
      m.userData.materialRole = 'rigid-shell'; m.metalness = 0; m.roughness = .47;
      m.color.multiply(new THREE.Color(.98, .98, .94));
      if ('clearcoat' in m) { m.clearcoat = .16; m.clearcoatRoughness = .38; }
    }
    m.needsUpdate = true;
  }
  // model already faces -z after glTF import (verified by debug capture); demo convention is forward = -z
  const pivot = new THREE.Group(); pivot.add(model);
  const box = new THREE.Box3().setFromObject(pivot), size = box.getSize(new THREE.Vector3());
  const H = 1.92, s = H / size.y; pivot.scale.setScalar(s);
  const b2 = new THREE.Box3().setFromObject(pivot), c = b2.getCenter(new THREE.Vector3()); pivot.position.set(-c.x + 0.08, -b2.min.y, -c.z - 0.15); // centre on the helmet/boot axis (bbox centre is skewed by the forward arms)
  g.add(pivot);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.95, 0.75), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 0.98, 0); hit.name = 'hit-astronaut'; g.add(hit);
  return { group: g, model: pivot, hit, materials: [...mats], info: { rawSize: size.toArray(), scale: s, triangles: tris,
    skinnedMeshes, animations: gltf.animations.length, pose: 'static source pose; no walk, seated or finger animation',
    materials: [...mats].map((m) => ({ name: m.name, role: m.userData.materialRole, color: m.color?.getHexString(), metalness: m.metalness, roughness: m.roughness, opacity: m.opacity, transparent: m.transparent, map: !!m.map, normalMap: !!m.normalMap, transmission: m.transmission, type: m.type })) } };
}
