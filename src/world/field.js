import * as THREE from 'three';
import { assetUrl } from '../util/asset-url.js';

/**
 * Sampling workspace at the destination, from MEASURED data (feature definition v0.2, HUD #1 POV match).
 *
 * Geometry + texture: Mars 2020 front Hazcam workspace mesh of sol 1215 (the coring day), product
 * FLF_1215_0774815107M492RAS_N0560000FHAZ02008_0A0095J01 (NASA/JPL-Caltech, PDS Imaging Node), cropped to 1.5 m around
 * the rock and decimated by tools/terrain/build_workspace_mesh.py. Vertices are metres in SITE_FRAME 56 (+X north,
 * +Y east, +Z down) whose origin is the rover position at site 56 / drive 0 — the same M20 waypoint this demo uses as
 * the destination. So the mesh is placed by that waypoint, with north/east/down mapped to the scene axes.
 *
 * Honest limits: single-view stereo (surfaces the camera could not see are missing), decimated, and a constant vertical
 * shift + an edge blend are applied so it sits on the 1 m DTM (the two data sets do not agree to the centimetre).
 * The two sampling points are ESTIMATES computed from raw WATSON camera metadata, not official target coordinates.
 *
 * The line drawing from the PAD is traced from this mesh's own texture image, and the overlay mesh reuses the same
 * geometry and texture coordinates, so the lines register on the real surface by construction (no tracking is claimed).
 */
export const TOL = { gazeDeg: 4, obliqDeg: 75, distM: 6 }; // alignment tolerances (assumptions)
export const WORKSPACE = { dir: assetUrl('/data/workspace/'), base: 'fhaz_1215_workspace', id: 'FLF_1215_0774815107M492RAS_N0560000FHAZ02008_0A0095J01', label: 'Measured terrain mesh · Perseverance front Hazcam · sol 1215', credit: 'NASA/JPL-Caltech' };
const GREEN = new THREE.Color(0x8cff9e), BLEND0 = 1.0, BLEND1 = 1.5, FADE0 = 1.08, FADE1 = 1.46, TINT = [1.02, 0.9, 0.8]; // tint chosen by eye to sit in the surrounding ground colour (assumption)

/**
 * Lazy wrapper (rendering review: first-load size). Only the 2 kB metadata is fetched at boot; the 1.5 MB mesh and its 0.5 MB texture
 * load when `ensure()` is called (plan confirmed, package sent, or the crew within ~150 m of the destination). Until then the low-res
 * DTM terrain alone is shown and every query answers "not loaded".
 */
export async function loadFieldSite(terrain) {
  const meta = await (await fetch(WORKSPACE.dir + WORKSPACE.base + '.json')).json();
  const group = new THREE.Group(); group.name = 'field-site'; group.visible = false; const pins = new THREE.Group(); pins.name = 'interest-pins';
  const pt = (k) => { const m = meta.points[k], sn = m.texture_snap || null, u = sn ? sn.uv : m.uv; return { key: k, name: m.name, uv: u, u: u[0], vImg: 1 - u[1], snapped: !!sn, meta: m }; };
  let impl = null, loading = null, placed = null, pkg = null; const far = { gazeErrDeg: 180, obliqDeg: 90, dist: 1e3, aligned: false };
  const shell = {
    group, pins, TOL, meta, points: { A: pt('A'), B: pt('B') }, rockRegion: meta.rock_region_image || null, measured: true, usesPhotoTexture: false, loaded: false, loadMs: null,
    ensure() { return loading || (loading = (async () => { const t0 = performance.now(); impl = await buildFieldSite(terrain, meta); group.add(impl.group); impl.group.visible = true; if (placed) impl.place(placed.stop, placed.groundY); impl.setPackage(pkg); shell.points = impl.points; shell.loaded = true; shell.loadMs = performance.now() - t0; return shell; })()); },
    place(stop, groundY) { placed = { stop: { x: stop.x, z: stop.z }, groundY }; if (impl) impl.place(stop, groundY); },
    setPackage(p) { pkg = p; if (impl) impl.setPackage(p); }, setState(a, dt) { if (impl) impl.setState(a, dt); },
    centreWorld(out = new THREE.Vector3()) { if (impl) return impl.centreWorld(out); const b = meta.points.B.snapped_vertex_ned_m, x = (placed ? placed.stop.x : 0) + b[1], z = (placed ? placed.stop.z : 0) - b[0]; return out.set(x, placed ? placed.groundY(x, z) : 0, z); },
    normalWorld: (out = new THREE.Vector3()) => (impl ? impl.normalWorld(out) : out.set(0, 1, 0)), targetWorld: (i, out) => (impl ? impl.targetWorld(i, out) : null), pointWorld: (k, out) => (impl ? impl.pointWorld(k, out) : null), surfaceAt: (u, v) => (impl ? impl.surfaceAt(u, v) : null),
    hudLines: (camera, W, H) => (impl && group.visible ? impl.hudLines(camera, W, H) : null),
    metrics(camera) { if (!impl) return { ...far }; const m = impl.metrics(camera); m.aligned = m.aligned && group.visible; return m; },
    clearPins() { while (pins.children.length) pins.remove(pins.children[0]); }, // next EVA: the previous EVA's interest pins stay in its archive, not in the scene
    addPin(x, y, z) { const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 6), m); pole.position.y = 0.35; const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false })); head.position.y = 0.76; g.add(pole, head); g.position.set(x, y, z); pins.add(g); return g; },
  };
  for (const k of ['face', 'overlay', 'rings', 'markers', 'sign', 'placement', 'droppedTriangles']) Object.defineProperty(shell, k, { get: () => (impl ? impl[k] : null) });
  return shell;
}
async function buildFieldSite(terrain, meta) {
  const buf = await (await fetch(WORKSPACE.dir + WORKSPACE.base + '.bin')).arrayBuffer();
  const n = meta.vertices, ned = new Float32Array(buf, 0, n * 3), uv = new Float32Array(buf, n * 12, n * 2), index0 = new Uint32Array(buf, n * 20, meta.triangles * 3);
  // presentation only: drop the long "curtain" triangles that stereo meshing stretches across occlusion gaps (edge > 9 cm; cells are <= 2 cm)
  const keep = []; { const e = (i, j) => Math.hypot(ned[i * 3] - ned[j * 3], ned[i * 3 + 1] - ned[j * 3 + 1], ned[i * 3 + 2] - ned[j * 3 + 2]); for (let t = 0; t < index0.length; t += 3) { const a = index0[t], b = index0[t + 1], c = index0[t + 2]; if (Math.max(e(a, b), e(b, c), e(c, a)) <= 0.09) keep.push(a, b, c); } }
  const index = new Uint32Array(keep), droppedTriangles = (index0.length - index.length) / 3;
  const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('workspace texture failed')); im.src = WORKSPACE.dir + meta.texture.file; });
  const group = new THREE.Group(); group.name = 'field-site-mesh';
  // SITE_FRAME (north, east, down) -> scene (x east, y up, z = -north), relative to the rover stop
  const pos = new Float32Array(n * 3), raw = new Float32Array(n * 3); for (let i = 0; i < n; i++) { raw[i * 3] = pos[i * 3] = ned[i * 3 + 1]; raw[i * 3 + 1] = pos[i * 3 + 1] = -ned[i * 3 + 2]; raw[i * 3 + 2] = pos[i * 3 + 2] = -ned[i * 3]; }
  const rgba = new Float32Array(n * 4).fill(1); const geo = new THREE.BufferGeometry(); geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4)); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(index, 1));
  const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true;
  const face = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, side: THREE.DoubleSide, vertexColors: true, alphaHash: true, color: new THREE.Color(TINT[0], TINT[1], TINT[2]) })); /* perf: opaque pass with a dithered (alpha-hashed) rim instead of blended transparency: no sorting, depth is written */ /* tint + rim fade are presentation blending toward the orbital-image ground; geometry and texture stay the measured product */ face.name = 'field-rock'; face.castShadow = true; face.receiveShadow = true; group.add(face);
  // ---- AR overlay: same geometry and texture coordinates, drawn just in front of the surface ----
  const oc = document.createElement('canvas'); oc.width = meta.texture.px[0]; oc.height = meta.texture.px[1]; const otex = new THREE.CanvasTexture(oc); otex.colorSpace = THREE.SRGBColorSpace; otex.anisotropy = 8;
  const overlay = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: otex, color: GREEN, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })); overlay.renderOrder = 6; overlay.visible = false; overlay.name = 'field-overlay'; group.add(overlay);
  const rings = new THREE.Group(); rings.visible = false; group.add(rings);
  const markers = new THREE.Group(); markers.visible = false; markers.name = 'sampling-markers'; group.add(markers);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
  const label = (lines, w = 0.5) => { const c = document.createElement('canvas'); c.width = 640; c.height = 44 * lines.length + 12; const g = c.getContext('2d'); g.fillStyle = 'rgba(3,9,5,.9)'; g.fillRect(0, 0, c.width, c.height); lines.forEach((t, i) => { g.font = (i ? '' : '600 ') + (i ? 24 : 30) + 'px system-ui, "Apple SD Gothic Neo", sans-serif'; g.fillStyle = i ? '#8cff9e' : '#e4ffe9'; g.textBaseline = 'middle'; g.fillText(t, 16, 28 + i * 44); }); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, toneMapped: false, depthTest: false, transparent: true, sizeAttenuation: false })); s.scale.set(w, w * c.height / c.width, 1); /* constant on-screen size (billboard) */ s.renderOrder = 8; return s; };
  const sign = label([WORKSPACE.label, 'single-view stereo · reduced mesh · ' + WORKSPACE.credit], 0.34); sign.visible = false; group.add(sign);
  const pins = new THREE.Group(); pins.name = 'interest-pins';
  const P = (i, out = new THREE.Vector3()) => out.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  /** Surface point for a texture coordinate (u right, v UP): the triangle that contains it in uv space. */
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  function surfaceAt(u, v) {
    for (let t = 0; t < index.length; t += 3) { const i = index[t], j = index[t + 1], k = index[t + 2], u0 = uv[i * 2], v0 = uv[i * 2 + 1], u1 = uv[j * 2], v1 = uv[j * 2 + 1], u2 = uv[k * 2], v2 = uv[k * 2 + 1];
      if (u < Math.min(u0, u1, u2) || u > Math.max(u0, u1, u2) || v < Math.min(v0, v1, v2) || v > Math.max(v0, v1, v2)) continue;
      const d = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2); if (Math.abs(d) < 1e-12) continue; const w0 = ((v1 - v2) * (u - u2) + (u2 - u1) * (v - v2)) / d, w1 = ((v2 - v0) * (u - u2) + (u0 - u2) * (v - v2)) / d, w2 = 1 - w0 - w1; if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      P(i, a); P(j, b); P(k, c); const p = new THREE.Vector3().addScaledVector(a, w0).addScaledVector(b, w1).addScaledVector(c, w2), nrm = b.clone().sub(a).cross(c.clone().sub(a)).normalize(); if (nrm.y < 0) nrm.negate(); return { p, n: nrm }; }
    return null;
  }
  // estimated sampling points (see header): A abrasion patch (snapped to the bright patch in the texture when found), B core area
  const pt = (k) => { const m = meta.points[k], s = m.texture_snap || null, u = s ? s.uv : m.uv; return { key: k, name: m.name, uv: u, u: u[0], vImg: 1 - u[1], snapped: !!s, meta: m }; };
  const points = { A: pt('A'), B: pt('B') };
  const region = (() => { let u0 = 1, u1 = 0, v0 = 1, v1 = 0; const cN = meta.crop.centre_ne_m[0], cE = meta.crop.centre_ne_m[1]; for (let i = 0; i < n; i++) { if (Math.hypot(ned[i * 3] - cN, ned[i * 3 + 1] - cE) > 0.62) continue; const u = uv[i * 2], v = 1 - uv[i * 2 + 1]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); } return { u0, u1, v0, v1 }; })(); // image box (v down) of the rock: 0.62 m around the workspace centre
  const centre = new THREE.Vector3(), normal = new THREE.Vector3(0, 1, 0);
  let pkgRev = -1, targets = [], pulse = 0, lineLocal = []; const view = { dist: 99, gazeErrDeg: 99 };
  const ideal = new THREE.PerspectiveCamera(), tmpL = new THREE.Vector3(), tmpW = new THREE.Vector3();
  function ringAt(u, vImg, r0, r1) { const s = surfaceAt(u, 1 - vImg); if (!s) return null; const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40), ringMat); m.position.copy(s.p).addScaledVector(s.n, 0.004); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.n); m.renderOrder = 7; m.userData.world = s; return m; }
  function drawPackage(pkg) {
    const g = oc.getContext('2d'), W = oc.width, H = oc.height; g.clearRect(0, 0, W, H); targets = []; rings.clear(); pkgRev = pkg ? pkg.rev : -1;
    if (!pkg) lineLocal = [];
    if (pkg) { g.strokeStyle = '#fff'; g.lineWidth = 4.6; g.lineJoin = g.lineCap = 'round';
      for (const l of pkg.lines) { g.beginPath(); for (let i = 0; i < l.length; i += 2) { const x = l[i] * W, y = l[i + 1] * H; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
      // HUD line projection (joint demo feedback 2026-11-15): the same planned lines as 3D points on the measured surface, so the HUD can draw
      // them as seen from the crew's eye when looking straight at the rock. Up to ~260 points per package, computed once.
      lineLocal = []; for (const l of pkg.lines) { const n2 = l.length / 2, step = Math.max(1, Math.ceil(n2 / Math.max(8, 260 / pkg.lines.length))); let cur = []; for (let i = 0; i < n2; i += step) { const s = surfaceAt(l[i * 2], 1 - l[i * 2 + 1]); if (s) cur.push(s.p.clone()); else if (cur.length) { if (cur.length > 1) lineLocal.push(cur); cur = []; } } if (cur.length > 1) lineLocal.push(cur); }
      for (const t of pkg.targets) { const r = ringAt(t.u, t.v, 0.036, 0.05); if (r) { rings.add(r); const r2 = ringAt(t.u, t.v, 0.074, 0.08); if (r2) rings.add(r2); targets.push({ ...t, world: r.userData.world.p.clone() }); } } }
    otex.needsUpdate = true;
  }
  function rebuildMarkers() { markers.clear();
    { // boundary of the measured surface: outside r = BLEND0 the heights are bent toward the DTM for the join (not the original measurement)
      const cN = meta.crop.centre_ne_m[0], cE = meta.crop.centre_ne_m[1], pts = [], N = 96, cellY = new Map(); for (let i = 0; i < n; i++) { const r = Math.hypot(raw[i * 3] - cE, -raw[i * 3 + 2] - cN); if (Math.abs(r - BLEND0) > 0.04) continue; const k = Math.round(Math.atan2(-raw[i * 3 + 2] - cN, raw[i * 3] - cE) / (2 * Math.PI) * N); cellY.set(k, Math.max(cellY.get(k) ?? -1e9, pos[i * 3 + 1])); }
      for (let k = -N / 2; k < N / 2; k++) { if (!cellY.has(k)) continue; const a2 = k / N * 2 * Math.PI; pts.push(new THREE.Vector3(cE + Math.cos(a2) * BLEND0, cellY.get(k) + 0.012, -(cN + Math.sin(a2) * BLEND0))); }
      if (pts.length > 8) { const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x63e6ff, dashSize: 0.05, gapSize: 0.05, transparent: true, opacity: 0.7, depthTest: false, toneMapped: false, fog: false })); ring.computeLineDistances(); ring.renderOrder = 7; markers.add(ring);
        const l1 = label(['Outer band (outside dashes) · blend edit', `radius ${BLEND0.toFixed(1)}–${BLEND1.toFixed(1)} m reshaped to the terrain · not measured`], 0.3); l1.position.copy(pts[Math.floor(pts.length * 0.12)]).add(new THREE.Vector3(0, 0.16, 0)); markers.add(l1);
        const far = new THREE.Vector3(cE, 0, -cN).normalize(), l2 = label(['Back side · not observed', 'single-view stereo: no data where hidden from the camera'], 0.3); l2.position.set(cE + far.x * 0.72, pts[0].y + 0.5, -cN + far.z * 0.72); markers.add(l2); } } for (const k of ['A', 'B']) { const q = points[k], r = ringAt(q.u, q.vImg, k === 'A' ? 0.025 : 0.018, k === 'A' ? 0.029 : 0.022); if (!r) continue; q.world = r.userData.world.p.clone(); markers.add(r);
    const l = label(k === 'A' ? ['A · abrasion patch Apollo Temple', q.snapped ? 'estimated from raw metadata → snapped to bright patch' : 'estimated from raw metadata'] : ['B · core sample area (Sapphire Canyon)', 'estimated from raw metadata · not official coordinates'], 0.3); l.position.copy(q.world).add(new THREE.Vector3(0, k === 'A' ? 0.42 : 0.2, k === 'A' ? -0.5 : 0.5)); l.userData.label = true; markers.add(l); } }
  const tmpC = new THREE.Vector3(), tmpN = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpF = new THREE.Vector3();
  const api = {
    group, face, overlay, rings, markers, pins, sign, TOL, meta, points, droppedTriangles, rockRegion: region, usesPhotoTexture: false, measured: true, placement: null,
    /** `stop` = route end = M20 waypoint 56_0 (site frame origin). Shifts the mesh onto the DTM and blends its rim into it. */
    place(stop, groundY) {
      group.position.set(stop.x, 0, stop.z); const dy = []; for (let i = 0; i < n; i += 7) dy.push(groundY(stop.x + raw[i * 3], stop.z + raw[i * 3 + 2]) - raw[i * 3 + 1]); dy.sort((x, y) => x - y);
      const lift = dy[Math.floor(dy.length * 0.97)] + 0.01, cN = meta.crop.centre_ne_m[0], cE = meta.crop.centre_ne_m[1]; // 97th percentile: almost every vertex ends up above the 1 m DTM surface
      for (let i = 0; i < n; i++) { const x = raw[i * 3], z = raw[i * 3 + 2], r = Math.hypot(x - cE, -z - cN), t = Math.min(1, Math.max(0, (r - BLEND0) / (BLEND1 - BLEND0))), k = t * t * (3 - 2 * t), y = raw[i * 3 + 1] + lift; pos[i * 3 + 1] = y + (groundY(stop.x + x, stop.z + z) + 0.004 - y) * k; const fa = Math.min(1, Math.max(0, (r - FADE0) / (FADE1 - FADE0))); rgba[i * 4 + 3] = 1 - fa * fa * (3 - 2 * fa); }
      geo.attributes.color.needsUpdate = true;
      geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere(); group.updateMatrixWorld(true); rebuildMarkers(); if (pkgRev > 0) pkgRev = -2;
      const B = points.B.world || new THREE.Vector3(cE, lift, -cN); centre.copy(B); normal.set(0, 0, 0); for (let i = 0; i < n; i += 3) { if (Math.hypot(pos[i * 3] - B.x, pos[i * 3 + 2] - B.z) < 0.25) normal.add(tmpN.fromBufferAttribute(geo.attributes.normal, i)); } normal.normalize(); if (normal.y < 0) normal.negate();
      sign.position.set(cE - 1.25, lift + 0.3, -cN + 0.9); /* above the far side as seen from the rover stop */ api.placement = { liftM: lift, dtmSpreadM: dy[Math.floor(dy.length * 0.97)] - dy[Math.floor(dy.length * 0.03)], stop: { x: stop.x, z: stop.z } };
    },
    setPackage(pkg) { if ((pkg ? pkg.rev : -1) !== pkgRev) drawPackage(pkg); },
    /** show: draw the overlay; aligned: gaze inside tolerance; matched: the crew confirmed, so the planned target is highlighted. */
    setState({ show, aligned, matched, hudOn }, dt) {
      const showing = !!show && pkgRev > 0; overlay.visible = false; /* lines are drawn on the HUD now (hudLines), not on the rock */ const facing = view.dist < 7 && view.gazeErrDeg < 32; markers.visible = showing && facing; sign.visible = showing && facing; void hudOn; void aligned; /* labels only while the crew is near and looking at the workspace */ rings.visible = showing && !!matched; /* after the crew confirms the match, the planned target is highlighted on the rock */
      if (rings.visible) { pulse += dt * 3.2; const k = 1 + 0.16 * Math.sin(pulse); rings.children.forEach((r) => r.scale.setScalar(k)); }
    },
    centreWorld: (out = new THREE.Vector3()) => group.localToWorld(out.copy(centre)),
    normalWorld: (out = new THREE.Vector3()) => out.copy(normal),
    targetWorld: (i = 0, out = new THREE.Vector3()) => (targets[i] ? group.localToWorld(out.copy(targets[i].world)) : null),
    pointWorld: (k, out = new THREE.Vector3()) => (points[k].world ? group.localToWorld(out.copy(points[k].world)) : null),
    surfaceAt,
    /**
     * The planned lines in SCREEN pixels as seen from the crew's eye when looking straight at the core-area point (same rule as the
     * "aligned" metric). The HUD draws them fixed on the visor; when the crew turns the head onto the rock, rock and lines coincide.
     */
    hudLines(camera, W, H) {
      if (!lineLocal.length) return null; api.centreWorld(tmpC); ideal.position.copy(camera.position); ideal.fov = camera.fov; ideal.aspect = camera.aspect; ideal.near = camera.near; ideal.far = camera.far; ideal.updateProjectionMatrix(); ideal.up.set(0, 1, 0); ideal.lookAt(tmpC); ideal.updateMatrixWorld();
      const px = (v) => { tmpW.copy(v); group.localToWorld(tmpW); tmpW.project(ideal); return [(tmpW.x + 1) / 2 * W, (1 - tmpW.y) / 2 * H]; };
      return { lines: lineLocal.map((l) => l.map((v) => px(v))), targets: targets.map((q) => px(q.world)) };
    },
    /** Real geometry of the current view: angle between the gaze and the core-area point, viewing obliquity, distance. */
    metrics(camera) {
      api.centreWorld(tmpC); tmpD.copy(tmpC).sub(camera.position); const dist = tmpD.length(); tmpD.normalize(); camera.getWorldDirection(tmpF);
      const gazeErrDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(tmpF.dot(tmpD), -1, 1))), obliqDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(-tmpD.dot(normal), -1, 1)));
      view.dist = dist; view.gazeErrDeg = gazeErrDeg;
      return { gazeErrDeg, obliqDeg, dist, aligned: group.visible && gazeErrDeg <= TOL.gazeDeg && obliqDeg <= TOL.obliqDeg && dist <= TOL.distM };
    },
    clearPins() { while (pins.children.length) pins.remove(pins.children[0]); }, // next EVA: the previous EVA's interest pins stay in its archive, not in the scene
    addPin(x, y, z) { const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 6), m); pole.position.y = 0.35; const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false })); head.position.y = 0.76; g.add(pole, head); g.position.set(x, y, z); pins.add(g); return g; },
  };
  return api;
}
