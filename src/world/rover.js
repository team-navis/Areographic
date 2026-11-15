import * as THREE from 'three';
import { assetUrl } from '../util/asset-url.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ph, smudgeTexture, deferTask } from '../util/tex.js';
import { mergeStatic } from '../util/merge.js';

/**
 * Fictional open crew rover for the demo (procedural). It is NOT Perseverance and not a real vehicle design.
 * The crew ride standing against a padded perch bar (the suit model is an unrigged standing mesh).
 * Local frame: forward = -z, right = +x, origin on the ground plane under the chassis centre.
 */
export const ROVER = { wheelR: 0.4, halfTrack: 0.92, halfBase: 1.15, deckY: 0.6, crew: new THREE.Vector3(-0.36, 0.62, 0.02) };

/**
 * Default rover look: the team-supplied "two-seat unpressurised Mars rover" mesh
 * (public/models/rover/crew-rover.glb). One static mesh with a baked colour texture: the wheels are
 * part of it and do not spin or travel individually. It replaces the procedural body once loaded;
 * `?rover=procedural` keeps the procedural rover. Values below were measured from the mesh
 * (source front faces +z, ground at y = -0.018 m).
 */
const ROVER_MESH = { url: assetUrl('/models/rover/crew-rover.glb'), yaw: Math.PI, lift: 0.018, wheelR: 0.43, halfTrack: 0.95, halfBase: 1.07,
  crew: new THREE.Vector3(-0.28, 0.6, -0.38) }; // driver's footwell: left seat side, between the seat and the handlebar

/**
 * Team names stamped on the gas bottles behind the seats (in the mesh's own frame: front = +z).
 * The four bottles lie along x in a 2 x 2 stack. Seen from behind the rover, LEEJUNHEE is the top
 * and largest name, across the upper rear bottle; the other two share the bottle below it in two
 * smaller lines. Each label is a thin curved patch that hugs its bottle.
 */
const TANK_NAMES = [
  { text: 'LEEJUNHEE', cy: 0.955, cz: -0.64, phi: 47, spanDeg: 66, L: 0.44 },  // top rear bottle, upper rear face: largest
  { text: 'SEUNGHWAN', cy: 0.84, cz: -0.64, phi: 21, spanDeg: 27, L: 0.25 },   // bottom rear bottle, upper line
  { text: 'CURRENJIN', cy: 0.84, cz: -0.64, phi: -8, spanDeg: 27, L: 0.25 },   // bottom rear bottle, lower line
];
export function tankNameLabels() {
  const g = new THREE.Group(); g.name = 'rover-tank-names';
  const R = 0.064, xc = -0.12, segU = 24, segV = 12;
  for (const { text, cy, cz, phi, spanDeg, L } of TANK_NAMES) {
    const span = THREE.MathUtils.degToRad(spanDeg), H = Math.round(1024 * R * span / L), F = Math.round(Math.min(H * 0.7, 1024 / text.length / 0.82));
    const c = document.createElement('canvas'); c.width = 1024; c.height = H; const k = c.getContext('2d');
    k.font = `800 ${F}px "Arial Narrow", "Segoe UI", Arial, sans-serif`; k.textAlign = 'center'; k.textBaseline = 'middle';
    try { k.letterSpacing = Math.round(F * 0.12) + 'px'; } catch { /* older canvas: default spacing */ }
    k.fillStyle = 'rgba(255, 236, 180, 0.55)'; k.fillText(text, 512 + 2, H * 0.54 + 3); // lit lower edge of the stamp
    k.fillStyle = 'rgba(38, 24, 8, 0.92)'; k.fillText(text, 512, H * 0.54);
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const pos = [], nor = [], uv = [], idx = [], p0 = THREE.MathUtils.degToRad(phi);
    for (let i = 0; i <= segV; i++) for (let j = 0; j <= segU; j++) { // u runs toward -x so the text reads from behind; v climbs around the bottle
      const u = j / segU, v = i / segV, a = p0 + (v - 0.5) * span, ny = Math.sin(a), nz = -Math.cos(a);
      pos.push(xc + L / 2 - u * L, cy + R * ny, cz + R * nz); nor.push(0, ny, nz); uv.push(u, v);
    }
    for (let i = 0; i < segV; i++) for (let j = 0; j < segU; j++) { const a = i * (segU + 1) + j, b = a + 1, d = a + segU + 1, e = d + 1; idx.push(a, b, d, b, e, d); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.6, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.name = 'tank-name-' + text; m.renderOrder = 2; g.add(m);
  }
  return g;
}

export function buildRover() {
  const g = new THREE.Group(); g.name = 'rover-fictional';
  const body = new THREE.Group(); g.add(body);
  const sm = smudgeTexture(53); const mats = [];
  const std = (o) => { const m = new THREE.MeshStandardMaterial(o); mats.push(m); return m; };
  const M = {
    paint: std({ color: 0xcfc8ba, roughness: 0.62, metalness: 0.25, roughnessMap: sm }),
    frame: std({ color: 0x8f9194, roughness: 0.45, metalness: 0.85, roughnessMap: sm }),
    dark: std({ color: 0x1c1c1e, roughness: 0.6, metalness: 0.3 }),
    rubber: std({ color: 0x18171a, roughness: 0.95 }),
    pad: std({ color: 0x2f2b27, roughness: 1, normalMap: ph('fabric_pattern_07_nor', { repeat: 3 }) }),
    gold: std({ color: 0xa8843a, roughness: 0.5, metalness: 0.8 }),
    amber: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.85, 0.15) }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.4) }),
  };
  const sh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const box = (w, h, d, mat, x, y, z, parent = body, r = 0.012) => { const m = sh(new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); parent.add(m); return m; };
  const tube = (pts, r, mat, parent = body) => { const m = sh(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.05), Math.max(12, pts.length * 10), r, 8), mat)); parent.add(m); return m; };
  const cyl = (rt, rb, h, mat, x, y, z, parent = body, seg = 16) => { const m = sh(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)); m.position.set(x, y, z); parent.add(m); return m; };
  const { wheelR: R, halfTrack: HT, halfBase: HB, deckY: DY } = ROVER;

  // ladder frame + deck
  for (const s of [-0.48, 0.48]) box(0.09, 0.09, 2.9, M.frame, s, 0.5, 0);
  for (const z of [-1.3, -0.6, 0.2, 0.9, 1.4]) box(1.05, 0.07, 0.07, M.frame, 0, 0.5, z);
  box(1.5, 0.035, 1.25, M.dark, 0, DY - 0.02, 0.1, body, 0.008);
  for (let i = 0; i < 9; i++) box(1.44, 0.012, 0.03, M.frame, 0, DY + 0.004, -0.42 + i * 0.13, body, 0);
  // front equipment bay (battery / avionics), bumper, lamps
  box(1.25, 0.34, 0.6, M.paint, 0, 0.74, -1.1, body, 0.04); box(1.1, 0.03, 0.5, M.dark, 0, 0.925, -1.1, body, 0.01);
  for (let i = 0; i < 7; i++) box(0.02, 0.22, 0.5, M.frame, -0.48 + i * 0.16, 0.74, -1.1, body, 0);
  tube([[-0.7, 0.48, -1.45], [-0.5, 0.42, -1.62], [0.5, 0.42, -1.62], [0.7, 0.48, -1.45]], 0.03, M.frame);
  for (const s of [-0.45, 0.45]) { cyl(0.07, 0.085, 0.06, M.dark, s, 0.78, -1.42).rotation.x = Math.PI / 2; cyl(0.06, 0.06, 0.012, M.lamp, s, 0.78, -1.455).rotation.x = Math.PI / 2; }
  // rear cargo rack with transit cases and gas bottles
  box(1.3, 0.04, 0.55, M.frame, 0, 0.66, 1.12, body, 0.01); box(0.62, 0.3, 0.42, M.paint, -0.3, 0.83, 1.12, body, 0.03); box(0.5, 0.22, 0.4, M.frame, 0.34, 0.79, 1.12, body, 0.03);
  for (const s of [-0.5, -0.1]) { box(0.05, 0.06, 0.012, M.dark, s, 0.88, 1.335, body, 0.004); }
  for (const s of [0.2, 0.42]) { const c = cyl(0.075, 0.075, 0.5, M.gold, s, 1.0, 1.3); c.rotation.z = Math.PI / 2; c.position.set(0.34, 0.99 + (s - 0.2) * 0.75, 1.02 + (s - 0.2) * 0.4); }
  tube([[-0.66, 0.68, 0.88], [-0.66, 1.0, 0.9], [-0.66, 1.0, 1.36], [-0.66, 0.68, 1.38]], 0.018, M.frame); tube([[0.66, 0.68, 0.88], [0.66, 1.0, 0.9], [0.66, 1.0, 1.36], [0.66, 0.68, 1.38]], 0.018, M.frame);
  // two standing stations: control post + handlebar (driver, left), grab bar (right), padded perch bars behind
  for (const s of [-1, 1]) {
    const x = s * 0.36;
    tube([[x, DY, -0.52], [x, DY + 0.9, -0.58], [x, DY + 1.22, -0.52]], 0.028, M.frame);
    tube([[x - 0.24, DY + 1.23, -0.47], [x - 0.2, DY + 1.25, -0.5], [x + 0.2, DY + 1.25, -0.5], [x + 0.24, DY + 1.23, -0.47]], 0.017, M.dark);
    for (const e of [-0.2, 0.2]) { const grip = cyl(0.022, 0.022, 0.11, M.rubber, x + e, DY + 1.25, -0.5, body, 10); grip.rotation.z = Math.PI / 2; }
    if (s < 0) { tube([[x, DY + 1.2, -0.54], [x, DY + 1.24, -0.8], [x, DY + 1.27, -0.93]], 0.016, M.frame); const d = box(0.17, 0.11, 0.025, M.dark, x, DY + 1.3, -0.96, body, 0.008); d.rotation.x = -0.6; for (let i = 0; i < 3; i++) { const bar = box(0.12 - i * 0.03, 0.008, 0.003, M.amber, x - i * 0.015, DY + 1.325 - i * 0.02, -0.945 - i * 0.014, body, 0); bar.rotation.x = -0.6; } } // small status display (no readable content modelled) // tall display so it reads from a suited standing eye height
    // perch bar (hip rest) and its posts
    box(0.46, 0.2, 0.09, M.pad, x, DY + 0.98, 0.33, body, 0.04);
    tube([[x - 0.17, DY, 0.5], [x - 0.17, DY + 0.7, 0.44], [x - 0.17, DY + 0.95, 0.37]], 0.022, M.frame); tube([[x + 0.17, DY, 0.5], [x + 0.17, DY + 0.7, 0.44], [x + 0.17, DY + 0.95, 0.37]], 0.022, M.frame);
    // boot restraints on the deck
    for (const e of [-0.11, 0.11]) box(0.13, 0.04, 0.3, M.frame, x + e, DY + 0.02, 0.03, body, 0.012);
  }
  // side rails / roll hoop
  for (const s of [-1, 1]) tube([[s * 0.74, DY, -0.5], [s * 0.76, DY + 0.9, -0.48], [s * 0.76, DY + 1.0, -0.2], [s * 0.76, DY + 1.0, 0.5], [s * 0.74, DY + 0.5, 0.72], [s * 0.74, DY, 0.72]], 0.022, M.frame);
  tube([[-0.76, DY + 1.0, 0.5], [-0.4, DY + 1.5, 0.62], [0.4, DY + 1.5, 0.62], [0.76, DY + 1.0, 0.5]], 0.024, M.frame);
  // mast: camera head + dish (comm), rear right
  cyl(0.025, 0.03, 1.5, M.frame, 0.6, DY + 1.25, 0.66); box(0.2, 0.1, 0.12, M.dark, 0.6, DY + 2.03, 0.62, body, 0.02);
  { const dish = sh(new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 10, 0, Math.PI * 2, 0, 0.75), M.paint)); dish.material.side = THREE.DoubleSide; dish.rotation.x = Math.PI + 0.9; dish.position.set(0.6, DY + 2.5, 0.75); body.add(dish); cyl(0.012, 0.012, 0.3, M.frame, 0.6, DY + 2.25, 0.68); }
  // fenders + suspension arms
  const wheelPos = [[-HT, -HB], [HT, -HB], [-HT, HB], [HT, HB]];
  for (const [wx, wz] of wheelPos) {
    const f = sh(new THREE.Mesh(new THREE.CylinderGeometry(R + 0.1, R + 0.1, 0.36, 20, 1, true, Math.PI / 2 - 1.1, 2.2), M.paint)); f.material.side = THREE.DoubleSide; f.rotation.z = Math.PI / 2; f.position.set(wx, R + 0.02, wz); body.add(f); // arc over the tyre, axis along the axle
    const s = Math.sign(wx); tube([[s * 0.48, 0.5, wz * 0.92], [s * 0.66, 0.46, wz], [wx - s * 0.16, R, wz]], 0.03, M.frame); tube([[s * 0.48, 0.52, wz * 0.75], [s * 0.6, 0.6, wz * 0.9], [wx - s * 0.16, R + 0.12, wz]], 0.02, M.dark);
  }
  mergeStatic(body);
  // wheels (separate: they spin and ride the terrain individually)
  const wheels = wheelPos.map(([wx, wz]) => {
    const w = new THREE.Group(), spin = new THREE.Group(); w.add(spin); w.position.set(wx, R, wz); g.add(w);
    const tire = sh(new THREE.Mesh(new THREE.TorusGeometry(R - 0.1, 0.1, 12, 36), M.rubber)); tire.rotation.y = Math.PI / 2; tire.scale.set(1, 1, 1.25); spin.add(tire);
    for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2, t = box(0.23, 0.02, 0.04, M.rubber, 0, Math.cos(a) * (R - 0.012), Math.sin(a) * (R - 0.012), spin, 0); t.rotation.x = a; t.rotation.z = (i % 2 ? 0.3 : -0.3); }
    const hub = cyl(0.17, 0.17, 0.2, M.frame, 0, 0, 0, spin, 18); hub.rotation.z = Math.PI / 2; const cap = cyl(0.07, 0.09, 0.24, M.gold, 0, 0, 0, spin, 12); cap.rotation.z = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, sp = box(0.03, 0.16, 0.035, M.frame, 0, Math.cos(a) * 0.23, Math.sin(a) * 0.23, spin, 0); sp.rotation.x = a; }
    return { w, spin, wx, wz };
  });
  const hit = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.2, 3.4), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1.1; hit.name = 'hit-rover'; g.add(hit);

  // The EVOVA crew-rover mesh was removed from the repo; the procedural rover is the default.
  // `?rover=mesh` swaps in a local mesh if one is present and keeps the procedural rover if it fails.
  const fit = { R, HT, HB, crew: ROVER.crew, pts: wheelPos }; let meshMats = null;
  const info = { source: 'procedural rover (src/world/rover.js)', triangles: null };
  const ready = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('rover') === 'mesh')
    ? new Promise((done) => deferTask('crew-rover-mesh', () => loadMesh().then(done))) // load order: the outdoor-only mesh is requested after the landing view is on screen (src/util/tex.js runDeferred); the procedural rover stands in until then
    : Promise.resolve(info);
  function loadMesh() { return new GLTFLoader().loadAsync(ROVER_MESH.url).then((gltf) => {
      const model = gltf.scene; model.rotation.y = ROVER_MESH.yaw; model.position.y = ROVER_MESH.lift; meshMats = []; let tris = 0;
      model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; meshMats.push(o.material); if (o.material.map) o.material.map.anisotropy = 8; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
      model.add(tankNameLabels());
      body.visible = false; wheels.forEach((wh) => { wh.w.visible = false; }); g.add(model); g.name = 'rover-mesh';
      Object.assign(fit, { R: ROVER_MESH.wheelR, HT: ROVER_MESH.halfTrack, HB: ROVER_MESH.halfBase, crew: ROVER_MESH.crew,
        pts: [[-ROVER_MESH.halfTrack, -ROVER_MESH.halfBase], [ROVER_MESH.halfTrack, -ROVER_MESH.halfBase], [-ROVER_MESH.halfTrack, ROVER_MESH.halfBase], [ROVER_MESH.halfTrack, ROVER_MESH.halfBase]] });
      return Object.assign(info, { source: 'two-seat unpressurised rover mesh (public/models/rover/crew-rover.glb)', triangles: Math.round(tris) });
    }).catch((e) => { console.error('rover mesh failed, keeping the procedural rover', e); return info; }); }

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), mtx = new THREE.Matrix4(), tmp = new THREE.Vector3();
  /**
   * Seat the rover on the terrain: each wheel samples the DTM; the chassis plane takes the mean height and the
   * pitch/roll of the four contact points. Returns the crew standing point (world) on the deck.
   */
  function place(cx, cz, yaw, groundY, travelled) {
    const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) }, r = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const h = fit.pts.map(([wx, wz]) => groundY(cx + r.x * wx + f.x * -wz, cz + r.z * wx + f.z * -wz)); // local -z is forward
    const mean = (h[0] + h[1] + h[2] + h[3]) / 4, pitch = Math.atan2((h[0] + h[1]) / 2 - (h[2] + h[3]) / 2, 2 * fit.HB), roll = Math.atan2((h[1] + h[3]) / 2 - (h[0] + h[2]) / 2, 2 * fit.HT);
    fwd.set(f.x * Math.cos(pitch), Math.sin(pitch), f.z * Math.cos(pitch)); right.set(r.x * Math.cos(roll), Math.sin(roll), r.z * Math.cos(roll)); up.crossVectors(right, fwd).normalize(); right.crossVectors(fwd, up).normalize();
    mtx.makeBasis(right, up, fwd.clone().negate()); g.quaternion.setFromRotationMatrix(mtx); g.position.set(cx, mean, cz); g.updateMatrixWorld(true);
    if (meshMats) { // static mesh: wheels are part of it; share the outdoor environment light the procedural materials were given
      if (M.paint.envMap && meshMats[0].envMap !== M.paint.envMap) meshMats.forEach((m) => { m.envMap = M.paint.envMap; m.envMapIntensity = M.paint.envMapIntensity; m.needsUpdate = true; });
      return { crew: fit.crew.clone().applyMatrix4(g.matrixWorld), pitchDeg: THREE.MathUtils.radToDeg(pitch), rollDeg: THREE.MathUtils.radToDeg(roll), wheelGround: h, wheelY: fit.pts.map(([wx, wz]) => tmp.set(wx, 0, wz).applyMatrix4(g.matrixWorld).y) };
    }
    wheels.forEach((wh, i) => { // independent travel: put each tyre on its own ground sample (clamped suspension stroke)
      tmp.set(wh.wx, 0, wh.wz).applyMatrix4(g.matrixWorld); const err = THREE.MathUtils.clamp(h[i] - tmp.y, -0.14, 0.14);
      wh.w.position.y = R + err; wh.spin.rotation.x = -travelled / R; });
    return { crew: ROVER.crew.clone().applyMatrix4(g.matrixWorld), pitchDeg: THREE.MathUtils.radToDeg(pitch), rollDeg: THREE.MathUtils.radToDeg(roll), wheelGround: h, wheelY: wheels.map((wh) => tmp.set(wh.wx, wh.w.position.y - R, wh.wz).applyMatrix4(g.matrixWorld).y) };
  }
  return { group: g, place, hit, materials: mats, wheels, ready, info };
}
