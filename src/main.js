import * as THREE from 'three';
import { assetUrl } from './util/asset-url.js';
import { loadTerrain } from './world/terrain.js';
import { buildBase, ROOM, AIRLOCK, MONITOR, SEAT } from './world/base.js';
import { loadOperator, loadAstronaut } from './world/people.js';
import { buildHelmetInterior } from './world/helmet.js';
import { createSampleScoop } from './world/sample-scoop.js';
import { buildRover } from './world/rover.js';
import { drawMonitorPreview } from './pad/monitor-previews.js';
import { createHabitatWalk } from './state/habitat-walk.js';
import './habitat-shell.css';
import { createMission, EYE_HEIGHT } from './state/mission.js';
import { createPad } from './pad/pad.js';
import { createStations } from './pad/stations.js';
import { createHud } from './hud/hud.js';
import './hud/hud-kit.js'; // team HUD design kit: swaps a few ICON entries before createHud runs + kit styles
import { Director, lookQuat } from './camera/director.js';
import { mergeStatic } from './util/merge.js';
import { texturesReady, setMaxAnisotropy, loadImage, runDeferred, deferred } from './util/tex.js';
// v0.2 field features (new modules; see docs/stage3-v02-field.md)
import { installFieldOps, REFERENCE } from './state/field-ops.js';
import { loadFieldSite } from './world/field.js';
import { loadRouteMesh } from './world/route-mesh.js';
import { installFieldHud } from './hud/field-hud.js';
import { installFieldPad } from './pad/field-pad.js';
import { installPlanPad } from './pad/plan-pad.js';
import { createHabitatRenderer } from './render/habitat-renderer.js';
import { diag as voiceDiag } from './hud/voice-diag.js';
import { createHabitatIrradiance } from './world/habitat-irradiance.js';
import './pad/console-theme.css'; // controller console look, matched to the visor HUD (loaded last so it sits on top of the PAD/station styles)

const $ = (id) => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const params = new URLSearchParams(location.search);
const api = (window.__mw = { ready: false, mode: 'loading', errors: [] });

/**
 * Intro (2026-11-15): shown from the first moment (logo, one service line, "Press Enter to start") while the world loads behind it.
 * A loading bar fills while the world loads (stage milestones of boot(), eased between them); Enter / Space / a click starts only once
 * the bar is full and the start button is enabled (2026-11-15 user request). Nothing reaches the scene behind the intro. ?nosplash = the old plain loading screen.
 */
const intro = (() => {
  const el = $('loading'), on = !params.has('nosplash'); let active = on, started = false, isReady = false, apiRef = null;
  const hide = () => { active = false; if (apiRef) apiRef.splash = false; el.classList.add('leaving'); setTimeout(() => el.classList.add('hidden'), 450); };
  let shown = 0, goal = 0, full = false; const bar = $('load-bar'), pct = $('load-pct'), btn = $('start-btn');
  const tick = () => { if (!active) return; const cap = isReady ? 1 : Math.min(goal + 0.06, 0.97); shown += Math.max((cap - shown) * (isReady ? 0.2 : 0.035), isReady ? 0.01 : 0); shown = Math.min(shown, cap);
    bar.style.setProperty('--p', shown.toFixed(4)); bar.setAttribute('aria-valuenow', Math.round(shown * 100)); pct.textContent = Math.round(shown * 100) + '%';
    if (isReady && shown >= 1 && !full) { full = true; el.classList.add('loaded'); $('load-label').textContent = 'Ready'; btn.disabled = false; btn.focus({ preventScroll: true }); } if (!full) requestAnimationFrame(tick); };
  const start = () => { if (!active || started) return; if (!full) return; started = true; hide(); };
  if (on) { el.classList.add('intro'); const go = $('start-btn'); el.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); start(); }); requestAnimationFrame(tick); // the starting click never reaches the scene (it would pick a role)
    const isStart = (ev) => ev.key === 'Enter' || ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.key === ' ' || ev.code === 'Space';
    const onKey = (ev) => { if (!active) return; if (isStart(ev)) { ev.preventDefault(); ev.stopImmediatePropagation(); start(); } else if (ev.key !== 'Tab') ev.stopImmediatePropagation(); };
    addEventListener('keydown', onKey, true); document.addEventListener('keydown', onKey, true);
    for (const t of ['click', 'pointerdown', 'pointermove', 'wheel']) addEventListener(t, (ev) => { if (active && !ev.target.closest?.('#loading')) ev.stopImmediatePropagation(); }, { capture: true, passive: t !== 'click' });
  } else el.classList.add('waiting');
  return {
    get active() { return active; }, start, progress(p) { goal = Math.max(goal, p); }, fail() { el.classList.add('waiting', 'error'); },
    ready(api) { apiRef = api; isReady = true; api.splash = active; api.dismissSplash = () => { if (active) { started = true; hide(); } };
      const enter0 = api.enterRole; api.enterRole = (r) => { api.dismissSplash(); return enter0(r); }; // a programmatic role entry (checks) passes the intro
      if (!on) hide(); },
  };
})();
boot().catch((e) => { console.error(e); api.errors.push(String(e)); intro.fail(); $('loading-msg').textContent = 'Loading failed: ' + e.message; });

async function boot() {
  // ---------- renderers ----------
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2'))) { intro.fail(); $('loading-msg').textContent = 'This browser does not support WebGL2, so the 3D demo cannot run.'; api.mode = 'unsupported'; return; }
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); /* perf: the room composer already ran at 1.5; 2 cost ~1.8x the outdoor/visor fill */ renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; renderer.setClearColor(0x000000, 1);
  $('gl').appendChild(renderer.domElement); setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.03, 60000);
  const aoOutdoor = [], habitatRenderer = createHabitatRenderer(renderer, scene, camera, { outdoor: aoOutdoor });
  const glInfo = (() => { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })();

  // ---------- world ----------
  // Load order: everything the landing view needs is requested at once (terrain grids + near ortho, suit model, route); outdoor-only maps follow after the first frame (runDeferred below).
  const astroLoading = loadAstronaut(), routeLoading = fetch(assetUrl('/data/jezero/route.json')).then((r) => r.json()); astroLoading.catch(() => {}); routeLoading.catch(() => {});
  intro.progress(0.1); const terrain = await loadTerrain(); intro.progress(0.35); scene.add(terrain.group); scene.fog = terrain.fog;
  const base = buildBase(); const site = base.placeOnTerrain(terrain.groundY); scene.add(base.group);
  const FY = site.floorY;
  const operator = await loadOperator(base.interiorMaterials); operator.group.position.set(SEAT.x, 0, SEAT.z); base.group.add(operator.group); // shown only on the role-selection view (the seat view itself stays first-person)
  mergeStatic(operator.group, (o) => o === operator.head || o === operator.model);
  intro.progress(0.45); const astro = await astroLoading; intro.progress(0.55); scene.add(astro.group);
  const helmet = buildHelmetInterior(); scene.add(helmet.group);

  // fixed indoor leg of the route: standing spot -> inner door -> airlock -> outer door -> ramp
  const START = { x: -2.35, z: 0.95 };
  const indoor = []; const leg = (a, b, kind, step = 0.25) => { const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.max(1, Math.round(d / step)); for (let i = indoor.length ? 1 : 0; i <= n; i++) indoor.push({ x: a.x + (b.x - a.x) * (i / n), y: a.y + (b.y - a.y) * (i / n), z: a.z + (b.z - a.z) * (i / n), kind }); };
  const P = [{ x: START.x, y: FY, z: START.z }, { x: -3.6, y: FY, z: AIRLOCK.doorZ }, { x: ROOM.x0 - 0.1, y: FY, z: AIRLOCK.doorZ }, { x: AIRLOCK.x0 - 0.1, y: FY, z: AIRLOCK.doorZ }, { x: site.rampTop.x, y: FY, z: AIRLOCK.doorZ }];
  for (let i = 0; i < P.length - 1; i++) leg(P[i], P[i + 1], 'indoor'); leg(P[P.length - 1], site.rampEnd, 'ramp');
  const routeData = await routeLoading; intro.progress(0.62); // Perseverance's published drive polyline
  const mission = createMission(terrain, indoor, routeData); const st = mission.st; installFieldOps(mission);

  // presentation rocks along the longest route, kept off the path and away from the habitat
  const longest = mission.routes['56_0'].pts.filter((p) => p.kind === 'terrain');
  const rockCount = terrain.addRocks(longest, (x, z) => { if (x > -13 && x < 6.5 && Math.abs(z) < 5.5) return true; for (let i = 0; i < longest.length; i += 2) if (Math.hypot(longest[i].x - x, longest[i].z - z) < 3.4) return true; return false; }); // clear lane for walkers and the rover track
  const rover = buildRover(); scene.add(rover.group); let roverFit = null; aoOutdoor.push(terrain.group, rover.group);
  const placeRover = () => { const rw = mission.roverWorld(); roverFit = rover.place(rw.x, rw.z, rw.yaw, terrain.groundY, st.roverS); return roverFit; }; placeRover();

  // planned-route ground ribbon (HUD guidance cue; drawn only in the HUD role)
  // Visor theme: one quad per 1 m segment with its own RGBA so the HUD legend holds — planned = cyan dashed, travelled = white solid,
  // return leg = orange dashed. Colour only; the route itself is unchanged.
  const ribbon = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, toneMapped: false }));
  ribbon.visible = false; ribbon.renderOrder = 5; scene.add(ribbon);
  let ribbonQuads = [], ribbonKey = ''; // { s, chev } per quad (4 vertices each)
  function rebuildRibbon() {
    const pts = st.route.pts.filter((p) => p.kind !== 'indoor'), pos = [], idx = [], w = 0.13;
    const dir = (i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    const quad = (v, s, chev) => { const k = pos.length / 3; v.forEach((p) => pos.push(p[0], p[1], p[2])); idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); ribbonQuads.push({ s, chev }); };
    ribbonQuads = [];
    for (let i = 1; i < pts.length; i++) { // route band, 1 m per quad (dashes come from colour, not geometry)
      const p = pts[i - 1], q = pts[i], [fa, ga] = dir(i - 1), [fb, gb] = dir(i);
      const yp = p.y + 0.04, yq = q.y + 0.04;
      quad([[p.x - ga * w, yp, p.z + fa * w], [p.x + ga * w, yp, p.z - fa * w], [q.x - gb * w, yq, q.z + fb * w], [q.x + gb * w, yq, q.z - fb * w]], (p.s + q.s) / 2, false);
    }
    for (let i = 14; i < pts.length - 4; i += 14) { // double chevrons pointing along the outbound direction
      const [f, g] = dir(i), n = [-g, f], c = pts[i];
      for (const back of [0, 0.45]) {
        const o = [c.x - f * back, c.z - g * back], apex = [o[0] + f * 0.3, o[1] + g * 0.3], t = 0.11, y = c.y + 0.07;
        for (const sg of [1, -1]) { const tip = [o[0] + n[0] * 0.34 * sg, o[1] + n[1] * 0.34 * sg]; quad([[apex[0], y, apex[1]], [apex[0] - f * t, y, apex[1] - g * t], [tip[0], y, tip[1]], [tip[0] - f * t, y, tip[1] - g * t]], c.s, true); }
      }
    }
    ribbon.geometry.dispose(); ribbon.geometry = new THREE.BufferGeometry(); ribbon.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ribbon.geometry.setIndex(idx);
    ribbon.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(ribbonQuads.length * 16), 4)); ribbonKey = ''; paintRibbon();
  }
  function paintRibbon() {
    const back = st.phase === 'returning', done = st.phase === 'atBase' || st.phase === 'ended', key = `${st.phase}/${Math.round(st.s * 2)}`;
    if (key === ribbonKey) return; ribbonKey = key; const c = ribbon.geometry.getAttribute('color'), a = c.array, NONE = [0, 0, 0, 0];
    let seg = 0;
    ribbonQuads.forEach((q, i) => {
      const travelled = done || (back ? q.s > st.s : q.s < st.s);
      let col;
      if (q.chev) col = travelled || back ? NONE : [0.16, 0.88, 1, 0.95]; // chevrons point outbound, so they are drawn only ahead on the way out
      else { const gap = seg++ % 4 === 3; col = travelled ? [1, 1, 1, 0.5] : gap ? NONE : back ? [1, 0.68, 0.24, 0.95] : [0.16, 0.88, 1, 0.95]; }
      for (let v = 0; v < 4; v++) a.set(col, (i * 4 + v) * 4);
    });
    c.needsUpdate = true;
  }
  rebuildRibbon();
  // destination marker post (procedural cue; the real rock is NOT modelled)
  const marker = new THREE.Group(); { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.0, 0.25) }); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 8), m); pole.position.y = 0.8; const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.0, 0.25), side: THREE.DoubleSide })); flag.position.set(0.18, 1.48, 0); marker.add(pole, flag); } scene.add(marker);
  const placeMarker = () => { const e = mission.poseAt(st.route.length), lx = e.x - Math.cos(e.yaw) * 1.3, lz = e.z + Math.sin(e.yaw) * 1.3; marker.position.set(lx, terrain.groundY(lx, lz), lz); }; // left of the route; the rover track is on the right
  placeMarker();
  // v0.2 POV match: measured workspace mesh at the destination + pins for added interest points
  const field = await loadFieldSite(terrain); intro.progress(0.72); scene.add(field.group, field.pins); // measured sol 1215 Hazcam workspace mesh, placed by the M20 waypoint 56_0 (site frame origin)
  const routeMesh = await loadRouteMesh(terrain, mission); scene.add(routeMesh.group); // one measured Navcam terrain patch beside the route (lazy)
  const placeField = () => { field.group.visible = st.destKey === REFERENCE.key; marker.visible = !field.group.visible; /* the destination flag would stand inside the measured workspace */ field.place(mission.poseAt(st.route.length), terrain.groundY); }; placeField();
  mission.on((type) => { if (type === 'plan') placeField(); if (type === 'record') { const r = st.records[st.records.length - 1]; if (r && r.type === 'interest') field.addPin(r.x, terrain.groundY(r.x, r.z), r.z); } });

  // ---------- lights ----------
  const sun = new THREE.DirectionalLight(0xffe6cc, 5.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 400 }); scene.add(sun, sun.target);

  // ---------- environment maps: sky IBL for outdoor surfaces, captured room IBL for interior ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene(); { const s2 = terrain.group.getObjectByName('sky').clone(); skyScene.add(s2); const gnd = new THREE.Mesh(new THREE.SphereGeometry(20000, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7a5238, side: THREE.BackSide })); skyScene.add(gnd); }
  const skyEnv = pmrem.fromScene(skyScene, 0, 1, 50000).texture;
  const outdoorMats = [...terrain.mats, base.M.hull, base.M.hullDark, ...rover.materials]; terrain.group.traverse((o) => { if (o.isInstancedMesh) outdoorMats.push(o.material); });
  outdoorMats.forEach((m) => { m.envMap = skyEnv; m.envMapIntensity = 0.85; });
  const indoorMats = [...base.interiorMaterials, ...helmet.materials];

  // Live textures belong to the real 3D room. The same DOM is used for detailed input.
  const pad = createPad(mission, terrain); pad.ui.onCrewView = () => goCrew(); /* ⑤ Marswalk status: 'switch to astronaut view' button and the crew dot on the map */ const fieldPad = installFieldPad(pad, mission, terrain, { defaultTarget: { u: field.points.B.u, v: field.points.B.vImg }, points: field.points, region: field.rockRegion }); const planPad = installPlanPad(pad, mission, fieldPad);
  const science = createStations(mission, terrain), systems = createStations(mission, terrain);
  science.select('science'); systems.select('systems');
  // Planning Display (team decision 2026-11-15): the controller's screen is the team's control pad (pad/pad.html, a standalone dashboard),
  // shown in the 3D monitor as a 1280x720 page. It replaces the earlier PAD UI on screen; that PAD is still built (not mounted)
  // because the crew side uses its plan/package preparation and the next-EVA reset. The iframe stays alive between visits.
  const controlPad = (() => { const root = document.createElement('div'); root.className = 'pad-frame'; root.id = 'control-pad'; root.style.display = 'none';
    const f = document.createElement('iframe'); f.src = assetUrl('/pad/pad.html'); f.title = 'Areographic Planning Display'; f.setAttribute('loading', 'eager'); root.appendChild(f);
    const back = document.createElement('button'); back.type = 'button'; back.className = 'pad-back'; back.innerHTML = '← Back to seat'; back.addEventListener('click', () => returnFromMonitor()); root.appendChild(back); // full-window pad: the way back
    f.addEventListener('load', () => { try { f.contentWindow.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); goLanding(); } }); } catch { /* cross-origin: Esc from the parent still works */ } });
    $('terminal-overlay').appendChild(root); return { root, frame: f, persistent: true }; })();
  // One large control screen (team decision 2026-11-15): the PAD is the controller's only screen. The science/systems stations are still
  // built (their live values feed nothing else) but no longer have a monitor of their own.
  const previewCv = document.createElement('canvas'); previewCv.width = 1024; previewCv.height = 480; // the preview art is drawn at its own 1024x480 size, then letterboxed onto the 16:9 screen
  // the closed control screen shows the control pad's first screen (captured picture: tools/assets/capture_pad_preview.mjs), so the seated
  // controller's monitor already looks like the page it opens; the earlier canvas preview stays as the fallback until the picture loads
  const padShot = new Image(); padShot.decoding = 'async'; padShot.src = assetUrl('/assets/control/pad-preview.webp'); padShot.onload = () => paintMonitors();
  const drawPreview = (canvas, id) => { if (id === 'planner' && padShot.complete && padShot.naturalWidth) { canvas.getContext('2d').drawImage(padShot, 0, 0, canvas.width, canvas.height); return; } drawMonitorPreview(previewCv, id, { mission, terrain }); const g = canvas.getContext('2d'); g.fillStyle = '#0c191d'; g.fillRect(0, 0, canvas.width, canvas.height); const h = canvas.width * 480 / 1024; g.drawImage(previewCv, 0, (canvas.height - h) / 2, canvas.width, h); };
  const monitors = [
    { id: 'planner', title: 'Planning Display', ui: controlPad },
  ].map((s, i) => {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    drawPreview(canvas, s.id);
    s.ui.root.style.pointerEvents = 'none'; s.ui.root.inert = true;
    base.screens[i].material.dispose();
    base.screens[i].material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    base.screens[i].userData.station = s.id;
    return { ...s, canvas, texture, center: V(MONITOR.xs[i], FY + MONITOR.y, MONITOR.z + .004), mesh: base.screens[i] };
  });
  const screenGlow = new THREE.PointLight(0xd6e2dd, .12, 2, 2); screenGlow.position.set(0, FY + 1.45, -2.3); scene.add(screenGlow);
  mission.on((type) => { if (type === 'plan') { rebuildRibbon(); placeMarker(); science.update(); systems.update(); } });

  const hud = createHud(mission, terrain); $('overlay').appendChild(hud.el);
  // v0.2 HUD extension: capture = a still of this demo's 3D view (not a camera frame); gazeGround = where the look direction meets the DTM
  const capCv = document.createElement('canvas'); capCv.width = 480; capCv.height = 270; const gz = V(0, 0, 0);
  const scoop = createSampleScoop(scene, terrain);
  let voiceAt = -1e9; // last voice memo start: a pointer-lock loss right after it comes from the mic prompt, not from Esc
  const fx = installFieldHud(hud, mission, {
    voiceStart: () => { voiceAt = performance.now(); },
    sampleMotion: (done, cancel) => mode === 'hud' && scoop.start(camera, look, field.group.visible ? field.pointWorld('B', V(0, 0, 0)) : null, done, cancel), // sample collection motion
    toggleRover: () => { const t = st.transport; toggleRover(); return st.transport !== t; },
    capture: () => { const c = camera.position, inside = c.x > AIRLOCK.x0 - .3 && c.x < ROOM.x1 + .2 && Math.abs(c.z) < ROOM.z1 + .2 && c.y < FY + 3; habitatRenderer.render(inside && !helmet.group.visible, 0); /* same path as the frame loop: room composer indoors, direct render in the visor/outdoors */ capCv.getContext('2d').drawImage(renderer.domElement, 0, 0, capCv.width, capCv.height); return capCv.toDataURL('image/jpeg', 0.72); },
    gazeGround: () => { camera.getWorldDirection(gz); if (gz.y > -0.05) return null; for (let d = 0.5; d <= 40; d += 0.25) { const x = camera.position.x + gz.x * d, y = camera.position.y + gz.y * d, z = camera.position.z + gz.z * d; if (y <= terrain.groundY(x, z)) return { x, z }; } return null; },
  });
  // field mission card arrow: screen position of the mission target (the measured rock, its estimated sampling point B, or the destination flag elsewhere)
  const mtv = V(0, 0, 0), missionProj = (kind) => {
    if (field.group.visible) { if (!(kind === 'sample' && field.pointWorld('B', mtv))) field.centreWorld(mtv); } else if (marker.visible) mtv.copy(marker.position); else return null;
    const dist = Math.hypot(camera.position.x - mtv.x, camera.position.z - mtv.z); mtv.y += 0.2; const v = mtv.project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, on: Math.abs(v.z) < 1, behind: v.z > 1, dist };
  };
  intro.progress(0.8); await texturesReady(); intro.progress(0.92);

  // Capture direct-lit room reflections before installing the diffuse bounce field.
  { const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }), cc = new THREE.CubeCamera(0.05, 200, rt); cc.position.set(0.4, FY + 1.5, 0.6);
    operator.group.visible = false; astro.group.visible = false; sun.target.position.set(0, FY, 0); sun.position.copy(sun.target.position).addScaledVector(terrain.sunDir, 200); sun.target.updateMatrixWorld();
    let envTarget = null;
    for (let pass = 0; pass < 2; pass++) {
      cc.update(renderer, scene); const nextEnv = pmrem.fromCubemap(rt.texture);
      indoorMats.forEach((m) => { m.envMap = nextEnv.texture; m.envMapIntensity = helmet.materials.includes(m) ? 0.18 : 0.85; });
      envTarget?.dispose(); envTarget = nextEnv;
    }
    api.interiorEnv = envTarget.texture; rt.dispose(); operator.group.visible = false; astro.group.visible = true; }
  const irradiance = createHabitatIrradiance({ floorY: FY, room: ROOM, intensity: 1.25, environmentDiffuseWeight: .20 });
  irradiance.applyToMaterials(base.interiorMaterials);
  const setAstroEnv = (outdoor) => astro.materials.forEach((m) => { m.envMap = outdoor ? skyEnv : api.interiorEnv; m.envMapIntensity = (outdoor ? 0.85 : 0.6) * (m.userData.visor ? 3 : 1); });

  // ---------- one room, one camera, two ways to explore it ----------
  const director = new Director(camera);
  const walk = createHabitatWalk({ floorY: FY, room: ROOM, airlock: AIRLOCK, obstacles: base.obstacles, spawn: { x: START.x, z: START.z, yaw: 0 } }); // first person starts where the suited astronaut stands on the role-selection view
  mission.setHabitatPose(walk.state);
  // Controller's seat view = the seated figure's own eyes (first person). The three-monitor wall is 5.4 m wide and only ~1.1 m away,
  // so it cannot fit a natural field of view: the centre monitor is framed with the inner parts of the side ones, and the pointer
  // gives a limited head turn (yaw +-35 deg, pitch +-15 deg) to read the sides.
  const SEAT_FOV = 74, SEAT_PITCH = 0.06, SEAT_YAW_MAX = THREE.MathUtils.degToRad(35), SEAT_PITCH_MAX = THREE.MathUtils.degToRad(15), SEAT_PITCH_DOWN = THREE.MathUtils.degToRad(24); // looking down a little further brings the hands on the keyboard into view
  const SEATVIEW = { pos: V(SEAT.x, FY + 1.335, SEAT.z - 0.1), look: V(0, FY + 1.34, MONITOR.z) };
  const seatQuat = (yaw = 0, pitch = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(SEAT_PITCH + pitch, yaw, 0, 'YXZ'));
  const LAND = { pos: V(2.15, FY + 1.62, 2.55), look: V(-0.75, FY + 1.12, -1.2), fov: 58 }; // stage 1 role-selection view: seated controller and standing astronaut in one frame
  const overviewFov = () => SEAT_FOV;
  /**
   * Framing of the opened screen: the 16:9 screen (and the PAD drawn over it) fills the free band between the room header
   * (title, switcher, buttons) and the footer, as large as the viewport allows. The camera keeps looking straight at the wall
   * and is only raised/lowered so the screen centre lands in the middle of that band (no tilt, no distortion).
   */
  const FOCUS_D = 1.35;
  function focusFrame() {
    const W = innerWidth, H = innerHeight, bottomOf = (sel) => { const e = document.querySelector(sel); if (!e || e.offsetParent === null) return 0; return e.getBoundingClientRect().bottom; };
    const top = Math.max(64, bottomOf('.room-context'), bottomOf('.room-tools'), bottomOf('#topbar')) + 10, foot = document.querySelector('.room-footer'), bottom = Math.max(44, foot && foot.offsetParent !== null ? H - foot.getBoundingClientRect().top : 0) + 6;
    const bandH = Math.max(200, H - top - bottom), scale = Math.min(bandH / 720, (W - 24) / 1280), screenPx = (scale * 720) / .97; // PAD height = 97 % of the screen glass
    const ppm = screenPx / MONITOR.h, fov = THREE.MathUtils.radToDeg(2 * Math.atan(H / 2 / (ppm * FOCUS_D)));
    const dy = ((top + (H - bottom)) / 2 - H / 2) / ppm; // >0: band centre below the viewport centre -> raise the camera
    return { fov, dy, scale, top, bottom };
  }
  const focusFov = () => focusFrame().fov;
  const focusPose = (s) => { const f = focusFrame(), pos = s.center.clone().add(V(0, f.dy, FOCUS_D)); return { pos, quat: lookQuat(pos, s.center.clone().add(V(0, f.dy, 0))), fov: f.fov }; };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)'); let motionEnabled = !reducedMotion.matches;
  const look = { yaw: 0, pitch: 0 }, roomPointer = new THREE.Vector2(), roomLook = new THREE.Vector2(), held = new Set();
  let helmetYaw = 0, mode = 'loading', activeMonitor = null, hoverMonitor = null, focusReturn = null, roomDolly = 0;
  const atOverview = () => (mode === 'landing' || mode === 'pad') && !activeMonitor;
  let suitFly = null; // one continuous camera flight into the suit (role selection -> first person)
  const cameraBusy = () => director.busy || !!suitFly;
  const clearMovement = () => { held.clear(); mission.setW(false); mission.setS(false); mission.setShift(false); walk.state.moving = false; };
  let unlockExpected = false; // pointer-lock exits we start ourselves (role switch etc.) are not an Esc
  const releasePointer = () => { if (document.pointerLockElement) { unlockExpected = true; document.exitPointerLock(); } };
  const syncMotion = () => { $('btn-motion').setAttribute('aria-pressed', String(motionEnabled)); $('btn-motion').textContent = 'View motion ' + (motionEnabled ? 'on' : 'off'); if (!motionEnabled) { roomPointer.set(0, 0); roomLook.set(0, 0); } };
  syncMotion();
  camera.position.copy(LAND.pos); camera.quaternion.copy(lookQuat(LAND.pos, LAND.look)); camera.fov = LAND.fov; camera.updateProjectionMatrix();

  function paintMonitors() {
    for (const s of monitors) {
      if (s.ui.root.classList.contains('terminal-active')) { const ctx = s.canvas.getContext('2d'); ctx.fillStyle = '#0c191d'; ctx.fillRect(0, 0, s.canvas.width, s.canvas.height); }
      else drawPreview(s.canvas, s.id);
      s.texture.needsUpdate = true;
    }
  }
  const astroPose = () => {
    const p = mission.currentPose();
    if (st.transport === 'rover' && roverFit) { const c = roverFit.crew; return { p: { x: c.x, y: c.y, z: c.z, kind: 'terrain', yaw: p.yaw }, yaw: p.yaw }; }
    return { p, yaw: p.yaw };
  };
  let blend = 0; const blendFrom = V(0, 0, 0);
  const toggleRover = () => { if (mode !== 'hud') return; const before = camera.position.clone(); if (mission.board() || mission.dismount()) { blendFrom.copy(before); blend = 1; } };
  // Integration: no click handler on #hud-act. The HUD takes no pointer input; rover boarding is the E key only (hint shown on the HUD).
  function setMode(m) {
    mode = api.mode = m; document.body.dataset.mode = m;
    $('landing').classList.toggle('hidden', m !== 'landing');
    $('topbar').classList.toggle('hidden', !['pad', 'habitat', 'hud'].includes(m));
    $('btn-focus').classList.toggle('hidden', m !== 'pad');
    $('room-ui').classList.toggle('hidden', m !== 'pad');
    $('walk-ui').classList.toggle('hidden', m !== 'habitat');
    $('btn-hud').querySelector('span').textContent = st.habitatPose ? 'Walk inside the habitat · WASD' : 'Continue surface exploration · HUD';
    hud.show(m === 'hud');
    if (m !== 'landing') placeWho?.();
    operator.group.visible = ['landing', 'toLanding', 'pad', 'toPad'].includes(m); if (m === 'landing') operator.head.visible = true; else if (m === 'pad') operator.head.visible = false; // seat view is first person: head off, forearms and hands stay on the keyboard
    astro.model.visible = m === 'landing' || m === 'toLanding' || (!st.habitatPose && !['hud', 'toHud'].includes(m)); // the model stands wherever the crew is: inside before departure / after re-entry, outside otherwise (then the landing shows the door marker instead)
    helmet.group.visible = false; // visor theme: the helmet rim ("fishbowl" frame) is shown only during the entry transition, never over the HUD view
    ribbon.visible = m === 'hud' || m === 'toHud';
    document.body.style.cursor = 'default'; syncMonitors();
    if (m === 'hud' && document.activeElement && document.activeElement.blur) document.activeElement.blur(); // no focused app button can swallow Enter/1
  }
  function syncMonitors() {
    api.activeMonitor = activeMonitor;
    $('room-ui').setAttribute('aria-busy', String(cameraBusy()));
    for (const s of monitors) { const enabled = mode === 'pad' && !cameraBusy() && s.id === activeMonitor; s.ui.root.style.pointerEvents = enabled ? 'auto' : 'none'; s.ui.root.inert = !enabled; }
    document.querySelectorAll('[data-monitor]').forEach(b => { b.classList.toggle('active', b.dataset.monitor === activeMonitor); b.setAttribute('aria-pressed', String(b.dataset.monitor === activeMonitor)); });
    const chosen = monitors.find(s => s.id === activeMonitor), walking = focusReturn?.mode === 'habitat';
    $('room-title').textContent = chosen?.title ?? 'Areographic';
    $('room-breadcrumb').textContent = chosen ? 'Habitat planning room / ' + chosen.title + ' / Detail' : 'Habitat planning room / Planner seat';
    $('room-help').textContent = chosen ? 'Choose a tab on the screen for details · Esc start screen' : 'Mouse to look around · click a display · wheel to move closer';
    $('btn-room').classList.toggle('hidden', !activeMonitor);
    $('btn-room').innerHTML = walking ? '← Back to where I stood' : '← Back to seat';
    $('btn-focus').textContent = activeMonitor ? 'Back (F)' : 'Zoom display (F)';
    $('btn-eva').textContent = st.habitatPose ? 'Astronaut view · walk habitat →' : 'Astronaut view · continue Marswalk →';
    $('room-ui').classList.toggle('is-focused', !!activeMonitor);
    { const i = monitors.findIndex(s => s.id === activeMonitor); // top switcher: which monitor, and ‹ › to the neighbours
      $('ms-num').textContent = i >= 0 ? `${String(i + 1).padStart(2, '0')} / ${String(monitors.length).padStart(2, '0')}` : 'Planner seat';
      $('ms-title').textContent = i >= 0 ? monitors[i].title : monitors.length === 1 ? 'Planning Display · opening' : 'Use ‹ › to choose a display'; if (monitors.length === 1) $('ms-num').textContent = 'Planner seat'; }
  }
  /** Step to the previous/next monitor (wraps). From the seat view, › opens the first and ‹ the last. */
  function cycleMonitor(step) {
    if (cameraBusy()) return; const i = monitors.findIndex(s => s.id === activeMonitor);
    const next = i < 0 ? (step > 0 ? 0 : monitors.length - 1) : (i + step + monitors.length) % monitors.length;
    focusMonitor(monitors[next].id);
  }
  function dockTerminal() {
    document.body.classList.remove('pad-full');
    for (const s of monitors) { s.ui.root.classList.remove('terminal-active', 'full'); if (s.ui.persistent) s.ui.root.style.display = 'none'; else s.ui.root.remove(); } // the pad iframe is hidden, not removed (removing would reload it)
    paintMonitors();
  }
  function resizeTerminal() {
    const s = monitors.find(m => m.id === activeMonitor); if (!s) return;
    camera.updateMatrixWorld(); const a = s.center.clone().add(V(-MONITOR.w / 2, MONITOR.h / 2, 0)).project(camera), b = s.center.clone().add(V(MONITOR.w / 2, -MONITOR.h / 2, 0)).project(camera);
    const w = (b.x - a.x) * innerWidth / 2, h = (a.y - b.y) * innerHeight / 2, f = focusFrame(), o = $('terminal-overlay').style;
    o.setProperty('--terminal-scale', Math.max(0, Math.min(w * .98 / 1280, h * .97 / 720, (innerHeight - f.top - f.bottom) / 720, (innerWidth - 24) / 1280)));
    o.setProperty('--terminal-x', ((a.x + b.x) / 2 + 1) / 2 * innerWidth + 'px'); o.setProperty('--terminal-y', (1 - (a.y + b.y) / 2) / 2 * innerHeight + 'px'); // centred on the projected screen, which sits in the free band
  }
  function focusMonitor(id, opts = {}) { // opts.direct: no zoom flight (the controller's entry goes from the seated front view straight to the full-window pad)
    if (!['landing', 'pad', 'habitat'].includes(mode) || cameraBusy() || activeMonitor === id) return;
    const s = monitors.find(m => m.id === id); if (!s) return;
    if (!activeMonitor) focusReturn = { mode: mode === 'habitat' ? 'habitat' : 'pad', pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
    clearMovement(); releasePointer(); mission.setControl(mission.autoControl());
    dockTerminal(); activeMonitor = id; hoverMonitor = null;
    document.querySelectorAll('[data-monitor]').forEach(b => b.classList.remove('hovered'));
    setMode('pad');
    const fp = focusPose(s);
    director.play([{ name: id, pos: fp.pos, quat: fp.quat, fov: fp.fov, dur: opts.direct || !motionEnabled ? .01 : .8 }], { onDone: () => {
      const f2 = focusPose(s); camera.position.copy(f2.pos); camera.quaternion.copy(f2.quat); camera.fov = f2.fov; camera.updateProjectionMatrix();
      if (s.ui.persistent) s.ui.root.style.display = ''; else $('terminal-overlay').append(s.ui.root); s.ui.root.classList.add('terminal-active'); if (s.ui.frame) { s.ui.root.classList.add('full'); document.body.classList.add('pad-full'); } /* Planning Display: after the camera reaches the screen, the pad fills the whole window */ resizeTerminal(); paintMonitors(); syncMonitors();
      if (s.ui.frame) s.ui.frame.focus(); else s.ui.root.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    } });
    syncMonitors();
  }
  function returnFromMonitor() {
    if (mode !== 'pad' || cameraBusy() || !activeMonitor) return;
    const previous = activeMonitor, back = focusReturn;
    dockTerminal(); activeMonitor = null; hoverMonitor = null; focusReturn = null;
    setMode('returning');
    director.play([{ name: 'return', pos: back.pos, quat: back.quat, fov: back.mode === 'habitat' ? 62 : overviewFov(), dur: motionEnabled ? .7 : .01 }], { onDone: () => {
      camera.fov = back.mode === 'habitat' ? 62 : overviewFov(); camera.updateProjectionMatrix(); setMode(back.mode);
      if (back.mode === 'pad') document.querySelector('[data-monitor="' + previous + '"]')?.focus({ preventScroll: true });
      else $('btn-switch').focus({ preventScroll: true });
    } });
  }
  /**
   * Role selection -> first person as ONE eased camera path (Catmull-Rom through: where the camera is -> behind the suit ->
   * over the shoulder -> the eyes), with the look target and the field of view blended along the same parameter. No cuts.
   * The suit body is hidden only once the camera is inside the helmet volume; a short visor-tint crossfade covers that swap.
   */
  const insideHull = (c) => c.x > AIRLOCK.x0 - .3 && c.x < ROOM.x1 + .2 && Math.abs(c.z) < ROOM.z1 + .2 && c.y < FY + 3;
  function flyIntoSuit({ A, yaw, endPos, endQuat, withHelmet, onDone, seated = false, endFov = 62, onInside = null, via = [] }) {
    const f = V(-Math.sin(yaw), 0, -Math.cos(yaw)), r = V(Math.cos(yaw), 0, -Math.sin(yaw)), at = (df, dr, du) => A.clone().addScaledVector(f, df).addScaledVector(r, dr).add(V(0, du, 0));
    const side = camera.position.clone().sub(A).dot(r) >= 0 ? 1 : -1; // come round on the side the camera is already on
    const eyeH = endPos.y - A.y, path = new THREE.CatmullRomCurve3(seated ? [camera.position.clone(), at(-.7, 0, eyeH + .14), endPos.clone()] : [camera.position.clone(), ...via, at(-1.15, 0, EYE_HEIGHT + .14), at(-.5, 0, EYE_HEIGHT + .05), endPos.clone()], false, 'centripetal'); /* 2026-11-15: no sweep round the side of the face; straight in from behind the head into the first-person view */ void side;
    const fwd = V(0, 0, -1).applyQuaternion(endQuat), look0 = camera.position.clone().add(V(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(4));
    const looks = new THREE.CatmullRomCurve3([look0, ...(via.length ? [via[via.length - 1].clone().add(V(-3, -.2, 0))] : []), at(0, 0, seated ? eyeH - .1 : 1.25), at(.6, 0, eyeH - .05), endPos.clone().addScaledVector(fwd, 4)], false, 'centripetal');
    const dur = motionEnabled && !matchMedia('(prefers-reduced-motion: reduce)').matches ? (seated ? 1.7 : via.length ? 2.9 : 2.1) : .5; // shorter now that the side sweep is gone
    // where (in time) the path leaves the habitat hull: the indoor composer hands over to the direct outdoor render there, so a short veil is centred on that moment
    let crossT = -1; if (via.length) { const was = insideHull(camera.position); for (let i = 1; i <= 240; i++) { const t = i / 240, e = t * t * t * (t * (t * 6 - 15) + 10); if (insideHull(path.getPoint(e)) !== was) { crossT = t; break; } } }
    suitFly = { t: 0, dur, path, looks, fov0: camera.fov, endPos, endQuat, withHelmet, onDone, swapped: false, seated, endFov, onInside, crossT };
    if (!seated) { astro.model.visible = true; if (withHelmet) helmet.group.visible = false; }
  }
  /** Reverse of the suit fly-in: backs out through the back of the helmet, then arcs round to the role-selection view. */
  function flyOutOfSuit({ A, yaw, endPos, endLook, endFov, onDone }) {
    const f = V(-Math.sin(yaw), 0, -Math.cos(yaw)), r = V(Math.cos(yaw), 0, -Math.sin(yaw)), at = (df, dr, du) => A.clone().addScaledVector(f, df).addScaledVector(r, dr).add(V(0, du, 0));
    const side = endPos.clone().sub(A).dot(r) >= 0 ? 1 : -1, start = camera.position.clone(), fwd = V(0, 0, -1).applyQuaternion(camera.quaternion);
    const path = new THREE.CatmullRomCurve3([start, at(-.55, 0, EYE_HEIGHT + .05), at(-1.25, .35 * side, EYE_HEIGHT + .16), at(-1.6, 1.3 * side, 1.75), endPos.clone()], false, 'centripetal');
    const looks = new THREE.CatmullRomCurve3([start.clone().addScaledVector(fwd, 4), start.clone().addScaledVector(fwd, 2.5), at(0, 0, 1.45), endLook.clone()], false, 'centripetal');
    const dur = motionEnabled && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 3.1 : .5;
    astro.model.visible = false; // still inside the helmet: the body appears once the camera is clear of it
    suitFly = { t: 0, dur, path, looks, fov0: camera.fov, startPos: start, endPos, endQuat: lookQuat(endPos, endLook), onDone, swapped: false, seated: false, out: true, endFov, onInside: () => { astro.model.visible = true; } };
  }
  function stepSuitFly(dt) {
    const a = suitFly; a.t = Math.min(1, a.t + dt / a.dur); const e = a.t * a.t * a.t * (a.t * (a.t * 6 - 15) + 10); // smootherstep: zero velocity and acceleration at both ends
    camera.position.copy(a.path.getPoint(e)); const q = lookQuat(camera.position, a.looks.getPoint(e)), k = Math.max(0, (e - .78) / .22); camera.quaternion.copy(q).slerp(a.endQuat, k * k * (3 - 2 * k)); // the last stretch settles exactly on the first-person orientation
    camera.fov = a.fov0 + (a.endFov - a.fov0) * e - 9 * Math.sin(Math.PI * e) * (1 - e * .4); camera.updateProjectionMatrix();
    const d = camera.position.distanceTo(a.out ? a.startPos : a.endPos), tint = Math.max(0, 1 - Math.abs(d - .3) / .3), veil = a.crossT >= 0 ? Math.max(0, 1 - Math.abs(a.t - a.crossT) * a.dur / .28) : 0; $('sheen').style.opacity = String(Math.max(a.seated ? 0 : tint * .55, veil * .9)); // visor tint peaks while passing through the helmet shell (suit only)
    if (!a.swapped && (a.out ? d > .3 : d < (a.seated ? .42 : .3))) { /* coming straight in from behind, the head is hidden before the camera reaches it */ a.swapped = true; if (a.onInside) a.onInside(); else { astro.model.visible = false; if (a.withHelmet) helmet.group.visible = true; } } // inside the head / helmet volume: head or body off
    if (a.t >= 1) { suitFly = null; camera.position.copy(a.endPos); camera.quaternion.copy(a.endQuat); camera.fov = a.endFov; camera.updateProjectionMatrix(); $('sheen').style.opacity = '0'; if (!a.seated && !a.out) astro.model.visible = false; a.onDone(); }
  }
  function goPad() { if (mode !== 'landing' || cameraBusy()) return; clearMovement(); mission.setControl(mission.autoControl()); setMode('toPad');
    operator.group.visible = true; operator.head.visible = true; roomPointer.set(0, 0); roomLook.set(0, 0);
    flyIntoSuit({ A: V(SEAT.x, FY, SEAT.z), yaw: 0, endPos: SEATVIEW.pos, endQuat: seatQuat(), seated: true, endFov: SEAT_FOV, onInside: () => { operator.head.visible = false; }, onDone: () => { operator.head.visible = false; setMode('pad'); setTimeout(() => focusMonitor('planner', { direct: true }), motionEnabled ? 280 : 0); /* seated front view with the whole screen, then straight to the full-window pad (no zoom step) */ } }); }
  function goCrew() {
    if (!['landing', 'pad'].includes(mode) || cameraBusy()) return;
    clearMovement(); releasePointer(); dockTerminal(); activeMonitor = null; focusReturn = null;
    if (!st.habitatPose) { goHud(); return; }
    if (st.phase === 'ended') planPad.nextEva(); // astronaut goes out again: the finished EVA is archived, the next one starts from the same tasks
    planPad.ensureDemoPlan(); // astronaut starts directly: no-op when the controller already sent a plan for this version
    const fromLanding = mode === 'landing'; mission.setControl(mission.autoControl()); setMode('toHabitat');
    const pos = V(walk.state.x, FY + EYE_HEIGHT, walk.state.z), quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'));
    // from the role selection: stage 1 transition around the standing astronaut (approach -> shoulder -> visor -> inside), then the indoor walk
    const f = V(-Math.sin(look.yaw), 0, -Math.cos(look.yaw)), r = V(Math.cos(look.yaw), 0, -Math.sin(look.yaw)), A = V(walk.state.x, FY, walk.state.z), at = (df, dr, du) => A.clone().addScaledVector(f, df).addScaledVector(r, dr).add(V(0, du, 0));
    if (fromLanding) { operator.group.visible = true; flyIntoSuit({ A, yaw: look.yaw, endPos: pos, endQuat: quat, withHelmet: false, onDone: () => { operator.group.visible = false; setMode('habitat'); } }); return; }
    director.play([{ name: 'habitat', pos, quat, fov: 62, dur: motionEnabled ? .8 : .01 }], { onDone: () => { camera.fov = 62; camera.updateProjectionMatrix(); setMode('habitat'); } });
  }
  function goHud(fromAirlock = false) {
    if (cameraBusy()) return;
    clearMovement(); releasePointer(); setMode('toHud'); mission.setControl(mission.autoControl());
    const { p, yaw } = astroPose(), A = V(p.x, p.y, p.z), f = V(-Math.sin(yaw), 0, -Math.cos(yaw)), r = V(Math.cos(yaw), 0, -Math.sin(yaw));
    const at = (df, dr, du) => A.clone().addScaledVector(f, df).addScaledVector(r, dr).add(V(0, du, 0));
    const eye = at(.02, 0, EYE_HEIGHT); look.yaw = yaw; look.pitch = 0; helmetYaw = yaw;
    const fwdQ = lookQuat(eye, eye.clone().add(f));
    const keys = fromAirlock ? [{ name: 'AIRLOCK EXIT', pos: eye, quat: fwdQ, fov: 62, dur: .65 }] : [
      { name: 'APPROACH', pos: at(-1.95, .7, 1.52), quat: lookQuat(at(-1.95, .7, 1.52), at(.2, 0, 1.2)), fov: 50, dur: 1.7 },
      { name: 'SHOULDER', pos: at(-.6, .5, EYE_HEIGHT + .12), quat: lookQuat(at(-.6, .5, EYE_HEIGHT + .12), at(2.4, -.35, EYE_HEIGHT - .35)), fov: 46, dur: 1.6 },
      { name: 'VISOR', pos: at(.2, .62, EYE_HEIGHT + .03), quat: lookQuat(at(.2, .62, EYE_HEIGHT + .03), at(.02, 0, EYE_HEIGHT - .02)), fov: 40, dur: 1.7 },
      { name: 'INSIDE', pos: eye, quat: fwdQ, fov: 62, dur: 1.5, onProgress: t => { const k = Math.max(0, 1 - Math.abs(t - .5) / .22); $('sheen').style.opacity = String(k * .5); astro.model.visible = t <= .5; helmet.group.visible = t > .5; } },
    ];
    if (!fromAirlock) {
      // Flight to the crew outside: one continuous path from the room, out through the inner door and the airlock, to behind the suit (on foot or on the rover seat) and into the helmet.
      const fromRoom = insideHull(camera.position) && !insideHull(eye), via = fromRoom ? [V(ROOM.x0 + .7, FY + 1.55, AIRLOCK.doorZ), V(AIRLOCK.x0 - 1.1, FY + 1.62, AIRLOCK.doorZ)] : [];
      const arrive = () => { mission.setControl('hud-manual'); setMode('hud'); }; // the person takes over at exactly this route position; the simulated crew script stops (one owner per frame)
      if (fromRoom && (!motionEnabled || reducedMotion.matches)) { // reduced motion: no flight, a plain veil cut
        suitFly = { cut: true }; $('sheen').style.opacity = '.9'; setTimeout(() => { suitFly = null; camera.position.copy(eye); camera.quaternion.copy(fwdQ); camera.fov = 62; camera.updateProjectionMatrix(); astro.model.visible = false; $('sheen').style.opacity = '0'; arrive(); }, 320); return; }
      flyIntoSuit({ A, yaw, endPos: eye, endQuat: fwdQ, withHelmet: true, via, onDone: arrive }); return; }
    astro.model.visible = !fromAirlock;
    director.play(keys, { onPhase: n => { $('phase').textContent = n; api.phase = n; }, onDone: () => { $('sheen').style.opacity = '0'; $('phase').textContent = ''; mission.setControl('hud-manual'); setMode('hud'); } });
  }
  // ---------- re-entry (docs/stage3-v02-field.md §10) ----------
  // Arrived at habitat = reaching the ramp (phase 'atBase', unchanged). End Marswalk = HUD button 1 at the ramp (unchanged) OR passing the inner airlock door on the way in.
  // W after arriving at the habitat follows the fixed indoor leg in reverse; each door must be open before the crew passes it and the doors keep their interlock (base.updateDoors).
  { const pts = st.route.pts, innerPt = pts.find((q) => q.kind === 'indoor' && q.x <= ROOM.x0 - .05) || pts[0];
    mission.entry = { innerS: innerPt.s - .35, canPass: (a, b) => {
      if (a.x < AIRLOCK.x0 && b.x >= AIRLOCK.x0 - .45) return base.doorState.outer > .92; // outer door plane
      if (a.x < ROOM.x0 && b.x >= ROOM.x0 - .55) return base.doorState.inner > .92; // inner door plane (opens only after the outer door has closed)
      return true; } }; }
  function crewInside() { // the crew stands in the room again (after walking in, or once a closed mission is left behind)
    const p0 = mission.poseAt(0); st.transport = 'foot'; st.s = 0; walk.setPose({ x: p0.x, z: p0.z, yaw: look.yaw }); mission.setHabitatPose({ x: walk.state.x, y: walk.state.y, z: walk.state.z, yaw: look.yaw }); }
  mission.on((type) => {
    if (type === 'inside' && mode === 'hud') { // walked in through the airlock: helmet view hands over to the indoor walk (WASD)
      clearMovement(); crewInside(); mission.setControl('idle'); $('sheen').style.opacity = '.7'; setTimeout(() => { $('sheen').style.opacity = '0'; }, 260); camera.fov = 62; camera.updateProjectionMatrix(); setMode('habitat'); }
    if (type === 'phase' && st.phase === 'ended' && st.control === 'pad-auto') crewInside(); // simulated crew closed the mission: back inside, so the landing shows the astronaut in the room again
    if (type === 'nextEva') { scoop.clear(); if (!st.habitatPose) { crewInside(); if (mode === 'hud') { clearMovement(); mission.setControl('idle'); camera.fov = 62; camera.updateProjectionMatrix(); setMode('habitat'); } } placeRover(); field.clearPins?.(); } // next EVA: the crew starts inside the base again
  });
  function goLanding() {
    if (!['pad', 'habitat', 'hud'].includes(mode) || cameraBusy()) return;
    const wasHud = mode === 'hud'; clearMovement(); releasePointer(); dockTerminal(); activeMonitor = null; focusReturn = null;
    if (st.phase === 'ended' && !st.habitatPose) crewInside(); // mission closed at the ramp and the person left the HUD: the crew is taken to be back inside
    const fromSuit = mode !== 'pad';
    mission.setControl(mission.autoControl()); roomDolly = 0; roomPointer.set(0, 0); roomLook.set(0, 0); setMode('toLanding');
    const finish = () => { camera.position.copy(LAND.pos); camera.quaternion.copy(lookQuat(LAND.pos, LAND.look)); camera.fov = LAND.fov; camera.updateProjectionMatrix(); $('sheen').style.opacity = '0'; setMode('landing'); };
    if (wasHud && motionEnabled && !reducedMotion.matches && !st.habitatPose && !insideHull(camera.position)) {
      // Reverse of the flight to the crew: pull back out of the helmet, travel to the airlock, pass the doors under a short veil and settle on the role-selection view.
      const { p, yaw } = astroPose(), A = V(p.x, p.y, p.z), f = V(-Math.sin(yaw), 0, -Math.cos(yaw)), r = V(Math.cos(yaw), 0, -Math.sin(yaw)), at = (df, dr, du) => A.clone().addScaledVector(f, df).addScaledVector(r, dr).add(V(0, du, 0));
      const back = at(-1.7, .9, 1.62), door = V(AIRLOCK.x0 - 1.1, FY + 1.62, AIRLOCK.doorZ), room = V(ROOM.x0 + .7, FY + 1.55, AIRLOCK.doorZ), veil = (t) => { $('sheen').style.opacity = String(Math.sin(Math.PI * t) * .9); };
      director.play([
        { name: 'PULL BACK', pos: back, quat: lookQuat(back, at(.2, 0, 1.3)), fov: 50, dur: .9 },
        { name: 'TO AIRLOCK', pos: door, quat: lookQuat(door, room), fov: 56, dur: 1.2 },
        { name: 'THROUGH', pos: room, quat: lookQuat(room, LAND.pos), fov: 58, dur: .55, onProgress: veil },
        { name: 'overview', pos: LAND.pos, quat: lookQuat(LAND.pos, LAND.look), fov: LAND.fov, dur: .9 },
      ], { onDone: finish });
    } else if (camera.position.distanceTo(LAND.pos) > 8) { $('sheen').style.opacity = '.85'; setTimeout(finish, motionEnabled ? 300 : 0); }
    else if (fromSuit && motionEnabled && Math.hypot(camera.position.x - astro.group.position.x, camera.position.z - astro.group.position.z) < .5) flyOutOfSuit({ A: astro.group.position.clone(), yaw: astro.group.rotation.y, endPos: LAND.pos, endLook: LAND.look, endFov: LAND.fov, onDone: finish }); // first person inside the suit: out through the back of the helmet
    else director.play([{ name: 'overview', pos: LAND.pos, quat: lookQuat(LAND.pos, LAND.look), fov: LAND.fov, dur: motionEnabled ? 1.4 : .01, onProgress: (t) => { if (t > .22) operator.head.visible = true; } }], { onDone: finish });
  }

  // ---------- input: walk on the floor, inspect the actual screen meshes ----------
  const ndc = new THREE.Vector2(), ray = new THREE.Raycaster();
  let pointerDragged = false, pointerStart = null;
  const interactive = ev => ev.target.closest?.('button,a,input,select,textarea,[contenteditable="true"],#hud-detail');
  const pickMonitor = ev => {
    ndc.set(document.pointerLockElement ? 0 : ev.clientX / innerWidth * 2 - 1, document.pointerLockElement ? 0 : 1 - ev.clientY / innerHeight * 2);
    camera.updateMatrixWorld(); base.group.updateMatrixWorld(true); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(base.screens, false)[0];
    if (!hit || (mode === 'habitat' && hit.distance > 5.5)) return null;
    // Solid room geometry occludes monitors when walking on the other side of a wall.
    const first = ray.intersectObject(base.group, true).find(h => h.object.material?.visible !== false && !h.object.userData.contactShadow);
    return first && first.distance < hit.distance - .025 ? null : hit.object.userData.station;
  };
  addEventListener('pointerdown', ev => { pointerDragged = false; pointerStart = { x: ev.clientX, y: ev.clientY }; });
  addEventListener('pointermove', ev => {
    if (pointerStart && (ev.buttons & 1) && Math.hypot(ev.clientX - pointerStart.x, ev.clientY - pointerStart.y) > (mode === 'landing' ? 16 : 5)) pointerDragged = true; // a slightly shaky click on a person still counts
    if (mode === 'landing' && !cameraBusy()) setHover(interactive(ev) ? null : pickPerson(ev)); else if (hoverPerson) setHover(null);
    if (atOverview() && !cameraBusy()) {
      roomPointer.set(ev.clientX / innerWidth * 2 - 1, 1 - ev.clientY / innerHeight * 2);
      hoverMonitor = interactive(ev) ? null : pickMonitor(ev); document.body.style.cursor = hoverMonitor ? 'pointer' : 'default';
      document.querySelectorAll('[data-monitor]').forEach(b => b.classList.toggle('hovered', b.dataset.monitor === hoverMonitor));
    } else if (['habitat', 'hud'].includes(mode) && !interactive(ev) && (document.pointerLockElement || (ev.buttons & 1))) { // mouse = head direction only
      look.yaw -= ev.movementX * .0023; look.pitch = THREE.MathUtils.clamp(look.pitch - ev.movementY * .0023, -1.25, 1.25);
    }
  });
  document.addEventListener('pointerleave', () => { roomPointer.set(0, 0); hoverMonitor = null; });
  addEventListener('click', ev => {
    const wasDragged = pointerDragged; pointerDragged = false; pointerStart = null;
    if (wasDragged) return;
    if (interactive(ev) || cameraBusy() || activeMonitor) return;
    if (mode === 'landing') { const who = pickPerson(ev); if (who === 'pad') { goPad(); return; } if (who === 'hud') { goCrew(); return; } } // role selection: click the seated controller or the standing astronaut
    if (['pad', 'habitat'].includes(mode)) { const id = pickMonitor(ev); if (id) { focusMonitor(id); return; } }
    if (['habitat', 'hud'].includes(mode) && !document.pointerLockElement) { try { document.body.requestPointerLock()?.catch(() => {}); } catch { /* drag-look stays available */ } }
  });
  addEventListener('wheel', ev => {
    if (!atOverview() || cameraBusy() || interactive(ev)) return;
    ev.preventDefault(); roomDolly = THREE.MathUtils.clamp(roomDolly + ev.deltaY * .00045, -.3, .15);
    const id = pickMonitor(ev); if (ev.deltaY < -20 && id) focusMonitor(id);
  }, { passive: false });
  const personRay = new THREE.Raycaster(), personNdc = new THREE.Vector2();
  // generous invisible hit volumes: the suit GLB is one large mesh and the controller is small behind the chair
  operator.hit.scale.set(1.5, 1.25, 1.5); astro.hit.scale.set(1.35, 1.1, 1.6);
  const who2lbl = { pad: null, hud: null }; for (const [k, t] of [['pad', 'Habitat Planner · habitat display'], ['hud', 'Surface Astronaut · helmet view']]) { const d = document.createElement('div'); d.className = 'who-label hidden'; d.id = k === 'pad' ? 'lbl-operator' : 'lbl-astronaut'; d.textContent = t; $('overlay').appendChild(d); who2lbl[k] = d; }
  const floorRing = (color) => { const m = new THREE.Mesh(new THREE.RingGeometry(.42, .5, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .35, toneMapped: false, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return m; };
  const rings = { pad: floorRing(0xffb84a), hud: floorRing(0xffb84a) }; let hoverPerson = null;
  // hover highlight that does not depend on the person's materials (the suit is one baked mesh, the controller shares room materials): an additive amber halo around the hit volume + a brightness lift on the person's own meshes
  const halo = (r, len) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffb84a, transparent: true, opacity: .26, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.BackSide })); m.visible = false; m.renderOrder = 9; scene.add(m); return m; };
  const halos = { pad: halo(.5, .62), hud: halo(.5, 1.25) };
  const lift = (root, on) => root.traverse((o) => { if (!o.isMesh || !o.material || !o.material.color) return; if (!o.userData.hoverOwn) { o.material = o.material.clone(); o.userData.hoverOwn = true; o.userData.baseColor = o.material.color.clone(); } o.material.color.copy(o.userData.baseColor).multiplyScalar(on ? 1.55 : 1); });
  const setHover = (w) => { if (w === hoverPerson) return; hoverPerson = w; document.body.classList.toggle('person-hover', !!w); for (const k of ['pad', 'hud']) { who2lbl[k].classList.toggle('hot', k === w); rings[k].material.opacity = k === w ? .95 : .35; rings[k].scale.setScalar(k === w ? 1.12 : 1); halos[k].visible = k === w; } lift(astro.model, w === 'hud'); lift(operator.group, w === 'pad'); };
  const whoV = V(0, 0, 0);
  // Landing reflects mission state: once the crew has left (walked out, or the simulated crew is out), nobody stands in the room.
  // The 'hud' label, floor ring, halo and click volume move to the inner airlock door instead ("Surface Astronaut · on the Marswalk").
  const OUT_SPOT = V(ROOM.x0 + .55, FY, AIRLOCK.doorZ), outHit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 1.5), new THREE.MeshBasicMaterial({ visible: false })); outHit.position.set(ROOM.x0 + .35, FY + 1.1, AIRLOCK.doorZ); outHit.name = 'hit-crew-outside'; scene.add(outHit);
  function placeWho() { // floating labels above the heads + floor rings, only on the role-selection view
    const on = mode === 'landing'; for (const k of ['pad', 'hud']) { who2lbl[k].classList.toggle('hidden', !on); rings[k].visible = on; if (!on) halos[k].visible = false; } if (!on) { if (hoverPerson) setHover(null); return; }
    const put = (k, obj, h) => { obj.getWorldPosition(whoV); rings[k].position.set(whoV.x, FY + .012, whoV.z); whoV.y = FY + h; whoV.project(camera); who2lbl[k].style.left = ((whoV.x + 1) / 2) * innerWidth + 'px'; who2lbl[k].style.top = ((1 - whoV.y) / 2) * innerHeight + 'px'; };
    const out = !st.habitatPose; who2lbl.hud.textContent = out ? 'Surface Astronaut · on the Marswalk' : 'Surface Astronaut · helmet view'; who2lbl.hud.dataset.where = out ? 'outside' : 'inside'; api.crewMarker = out ? 'outside' : 'inside';
    put('pad', operator.group, 1.62); put('hud', out ? { getWorldPosition: (v) => v.copy(OUT_SPOT) } : astro.group, out ? 2.3 : 2.12);
    halos.pad.position.set(rings.pad.position.x, FY + .82, rings.pad.position.z); halos.hud.position.set(rings.hud.position.x, FY + 1.02, rings.hud.position.z);
  }
  addEventListener('keydown', (ev) => { if (mode !== 'landing' || ev.repeat || cameraBusy()) return; if (ev.code === 'Digit1') goPad(); else if (ev.code === 'Digit2') goCrew(); }); // role selection keyboard fallback
  // controller view: hold Shift = fast-forward the simulated mission (not while typing in a PAD field; never steers the crew)
  const typingNow = () => { const a = document.activeElement; return !!a && (a.tagName === 'TEXTAREA' || a.isContentEditable || (a.tagName === 'INPUT' && !['checkbox', 'range', 'button'].includes(a.type))); };
  addEventListener('keydown', (ev) => { if ((ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') && mode !== 'hud' && !typingNow()) mission.setPadShift(true); });
  addEventListener('keyup', (ev) => { if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') mission.setPadShift(false); }); addEventListener('blur', () => mission.setPadShift(false));
  function pickPerson(ev) { personNdc.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1); personRay.setFromCamera(personNdc, camera); outHit.updateMatrixWorld(); const h = personRay.intersectObjects([operator.hit, st.habitatPose ? astro.hit : outHit], false)[0]; return h ? (h.object === operator.hit ? 'pad' : 'hud') : null; }
  $('btn-pad').addEventListener('click', goPad); $('btn-hud').addEventListener('click', goCrew); $('btn-switch').addEventListener('click', goLanding);
  $('btn-eva').hidden = true; /* roles are separate: no crew shortcut from the controller room (user decision) */ $('walk-monitor').addEventListener('click', () => { if (hoverMonitor) focusMonitor(hoverMonitor); });
  document.querySelectorAll('[data-monitor]').forEach(b => b.addEventListener('click', () => focusMonitor(b.dataset.monitor)));
  $('mon-prev').addEventListener('click', () => cycleMonitor(-1)); $('mon-next').addEventListener('click', () => cycleMonitor(1));
  $('btn-room').addEventListener('click', returnFromMonitor);
  $('btn-motion').addEventListener('click', () => { motionEnabled = !motionEnabled; syncMotion(); });
  reducedMotion.addEventListener('change', e => { motionEnabled = !e.matches; syncMotion(); });
  const toggleFocus = () => activeMonitor ? returnFromMonitor() : focusMonitor(hoverMonitor || 'planner');
  $('btn-focus').addEventListener('click', toggleFocus);
  const typing = () => { const a = document.activeElement; return !!a && (['INPUT', 'SELECT', 'TEXTAREA'].includes(a.tagName) || a.isContentEditable); };
  // Keys are routed strictly by mode so the seat shortcuts (1/2/3 = monitors) and the suit hand controller (1/2 = HUD buttons) never cross:
  //   pad (controller seat)  : 1/2/3 monitor, F focus, Esc back            (teammate's control room)
  //   habitat (inside base)  : WASD free walk, arrows look, F open monitor  (teammate's indoor walk, only before the airlock exit)
  //   hud (outside)          : W along the fixed route, E rover, Shift warp, M / arrow up-down / wheel dial, 1 (Enter) / 2 buttons, V voice (docs/hud-design-basis.md)
  addEventListener('keydown', ev => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.code === 'Escape' && ['pad', 'habitat', 'hud'].includes(mode) && !typingNow()) { ev.preventDefault(); goLanding(); return; } // Esc = back to the role selection (intro) from every view (2026-11-15)
    if (mode === 'pad' && (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight') && !ev.repeat && !typingNow()) { ev.preventDefault(); cycleMonitor(ev.code === 'ArrowRight' ? 1 : -1); return; } // ← → switch monitors, even with a slider or checkbox focused (text fields keep their arrows)
    if (typing()) return;
    if (mode === 'hud') {
      let used = true;
      if (ev.code === 'KeyW') mission.setW(true);
      else if (ev.code === 'KeyS') mission.setS(true); // back up along the same route
      else if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') mission.setShift(true); // demo time compression while driving
      else if (ev.repeat) used = false;
      else if (ev.code === 'KeyE') toggleRover();
      else if (ev.code === 'KeyM') mission.toggleMinimap(); // dial press
      else if (ev.code === 'ArrowDown') hud.dial(1); else if (ev.code === 'ArrowUp') hud.dial(-1); // dial turn: down = next item, up = previous (the wheel also works)
      else if (ev.code === 'Digit1' || ev.code === 'Numpad1' || ev.code === 'Enter') hud.button(1); // button 1: confirm / run highlighted item
      else if (ev.code === 'Digit2' || ev.code === 'Numpad2') hud.button(2); // button 2: fold card / suit and mission status layer / declutter
      else if (ev.code === 'Digit3' || ev.code === 'Numpad3') fx.button3(); else if (ev.code === 'KeyC') fx.photoButton(); // suit camera button: photo · photo mark (was a menu item)
      else if (ev.code === 'KeyV') fx.memoButton(true); // V = voice memo: hold to dictate, release to save (2026-11-15: voice commands are no longer on V)
      else if (ev.code === 'Backquote' && fx.reviewCommands) fx.reviewCommands(); // ?review only: typed command field for checking (not crew input)
      else used = false;
      if (used) ev.preventDefault();
    } else if (mode === 'habitat') {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.code)) { held.add(ev.code); ev.preventDefault(); } // keyboard look is also available without pointer lock
      else if (ev.code === 'KeyF' && !ev.repeat) { const id = pickMonitor({ clientX: innerWidth / 2, clientY: innerHeight / 2 }); if (id) focusMonitor(id); }
    } else if (mode === 'pad' && !ev.repeat) {
      if (ev.code === 'KeyF') toggleFocus();
      else if (['Digit1', 'Digit2', 'Digit3'].includes(ev.code)) focusMonitor(monitors[Math.min(monitors.length, Number(ev.code.at(-1))) - 1].id); // one screen: any of 1/2/3 opens it
      else if ((ev.code === 'ArrowLeft' || ev.code === 'ArrowRight') && !document.activeElement?.closest?.('select,textarea,input:not([type=range]):not([type=checkbox])')) { ev.preventDefault(); cycleMonitor(ev.code === 'ArrowRight' ? 1 : -1); } // ‹ › monitor switch
    }
  });
  let wheelAcc = 0; addEventListener('wheel', (ev) => { if (mode !== 'hud') return; wheelAcc += ev.deltaY; if (Math.abs(wheelAcc) >= 60) { hud.dial(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; } }, { passive: true }); // suit dial: one detent per ~60 px of wheel travel
  addEventListener('keyup', ev => { held.delete(ev.code); if (ev.code === 'KeyW') mission.setW(false); else if (ev.code === 'KeyS') mission.setS(false); else if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') mission.setShift(false); else if (ev.code === 'KeyV') fx.memoButton(false); else if (mode === 'hud' && /^(Digit|Numpad)[123]$/.test(ev.code)) fx.release(+ev.code.at(-1)); });
  addEventListener('blur', clearMovement); document.addEventListener('visibilitychange', clearMovement);
  // With the mouse locked, the browser spends the first Esc on unlocking and the page never sees the key. An unlock we did not ask for while the
  // window still has focus is that Esc: go to the role selection. (Switching windows also unlocks, but then the window has lost focus.)
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) return; clearMovement(); const mine = unlockExpected; unlockExpected = false;
    if (!mine && performance.now() - voiceAt > 6000 && ['habitat', 'hud'].includes(mode)) setTimeout(() => { if (document.hasFocus() && !document.hidden && ['habitat', 'hud'].includes(mode)) goLanding(); }, 150); });
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); habitatRenderer.resize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; if (!cameraBusy()) { if (activeMonitor) { const fp = focusPose(monitors.find((m) => m.id === activeMonitor)); camera.position.copy(fp.pos); camera.quaternion.copy(fp.quat); camera.fov = fp.fov; } else camera.fov = atOverview() ? overviewFov() : 62; } camera.updateProjectionMatrix(); resizeTerminal(); });

  // ---------- exit guidance (crew, first person inside the base): "exit this way" ----------
  // Amber floor chevrons follow the fixed indoor leg (standing spot -> inner door -> airlock -> outer door) and a label marks the
  // airlock. Shown only while walking inside before departure. Presentation cue only; the doors keep their interlock.
  const exitGuide = new THREE.Group(); exitGuide.name = 'exit-guide'; exitGuide.visible = false; scene.add(exitGuide);
  { const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.85, 0.2), transparent: true, opacity: .85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const shape = new THREE.Shape(); shape.moveTo(-.16, -.08); shape.lineTo(0, .08); shape.lineTo(.16, -.08); shape.lineTo(.16, -.0); shape.lineTo(0, .16); shape.lineTo(-.16, 0); shape.closePath();
    const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); // points toward -z before the yaw below
    const pts = indoor.filter((q) => q.kind === 'indoor'); let acc = .6;
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.z - a.z); acc += d; if (acc < .7) continue; acc = 0;
      const m = new THREE.Mesh(geo, mat); m.position.set(b.x, FY + .012, b.z); m.rotation.y = Math.atan2(-(b.x - a.x), -(b.z - a.z)); m.renderOrder = 6; exitGuide.add(m); }
    exitGuide.userData.mat = mat; }
  const exitLabel = document.createElement('div'); exitLabel.className = 'exit-label hidden'; exitLabel.id = 'exit-label'; exitLabel.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40 L8 22 H18 V8 H30 V22 H40 Z"/></svg>'; exitLabel.setAttribute('aria-label', 'Direction to the airlock exit'); $('overlay').appendChild(exitLabel); // an arrow only (joint demo feedback): points down at the airlock door, or sideways when the door is off screen
  const exitAt = V(AIRLOCK.x0 + .25, FY + 1.9, AIRLOCK.doorZ), exitV = V(0, 0, 0); let guideT = 0;
  function updateExitGuide(dt) {
    const on = mode === 'habitat' && !!st.habitatPose && st.phase !== 'returning'; exitGuide.visible = on; exitLabel.classList.toggle('hidden', !on); if (!on) return;
    guideT += dt; exitGuide.userData.mat.opacity = .55 + .35 * (.5 + .5 * Math.sin(guideT * 3.2));
    exitV.copy(exitAt).project(camera); const front = exitV.z < 1, inView = front && Math.abs(exitV.x) < .92 && Math.abs(exitV.y) < .9;
    let x = (exitV.x + 1) / 2 * innerWidth, y = (1 - exitV.y) / 2 * innerHeight, dir = '';
    if (!inView) { const dx = front ? exitV.x : -exitV.x; dir = dx < 0 ? 'left' : 'right'; x = dx < 0 ? 70 : innerWidth - 70; y = innerHeight / 2; } // off screen: pinned to the side it lies on
    exitLabel.style.left = x + 'px'; exitLabel.style.top = y + 'px'; exitLabel.dataset.dir = dir;
  }

  // ---------- frame loop ----------
  let entryHint = '';
  const clock = new THREE.Clock(); let bob = 0, outdoorK = 0, frames = 0, acc = 0, instrumentTime = 0, pickTime = 0;
  const eul = new THREE.Euler(0, 0, 0, 'YXZ'), walkInput = { forward: 0, strafe: 0 }; let shadowSig = '', indoorShadowSig = '', shadowClock = 1;
  function frame() {
    const elapsed = clock.getDelta(), dt = Math.min(.05, elapsed); frames++; acc += elapsed; if (acc > 1) { api.fps = frames / acc; frames = 0; acc = 0; }
    // Perf: movement follows real time. Camera moves keep the 50 ms clamp, but walking/driving integrate the real frame
    // time (up to 0.25 s) in <= 50 ms sub-steps, so a slow frame no longer slows the crew down.
    const moveTime = Math.min(.25, elapsed), subSteps = Math.max(1, Math.ceil(moveTime / .05 - 1e-6)), subDt = moveTime / subSteps;
    for (let i = 0; i < subSteps; i++) mission.tick(subDt);
    director.update(dt); if (suitFly && !suitFly.cut) stepSuitFly(dt);
    if (!field.loaded && field.group.visible && (st.planTx || st.pkg)) field.ensure();
    if (atOverview() && !cameraBusy()) {
      const ease = 1 - Math.exp(-dt * 5); roomLook.lerp(motionEnabled ? roomPointer : new THREE.Vector2(), ease);
      if (mode === 'landing') { const desired = LAND.pos.clone().add(V(roomLook.x * .06, roomLook.y * .025, 0)); camera.position.lerp(desired, ease); camera.quaternion.slerp(lookQuat(camera.position, LAND.look.clone().add(V(roomLook.x * .16, roomLook.y * .06, 0))), ease); }
      else { camera.position.lerp(SEATVIEW.pos.clone().add(V(0, 0, roomDolly * .4)), ease); camera.quaternion.slerp(seatQuat(-roomLook.x * SEAT_YAW_MAX, roomLook.y * (roomLook.y >= 0 ? SEAT_PITCH_MAX : SEAT_PITCH_DOWN)), ease); if (Math.abs(camera.fov - SEAT_FOV) > .01) { camera.fov = SEAT_FOV; camera.updateProjectionMatrix(); } }
      if (mode === 'landing' && Math.abs(camera.fov - LAND.fov) > .01) { camera.fov = LAND.fov; camera.updateProjectionMatrix(); }
      placeWho();
    }
    updateExitGuide(dt);
    if (mode === 'habitat') {
      look.yaw += ((held.has('ArrowLeft') ? 1 : 0) - (held.has('ArrowRight') ? 1 : 0)) * dt * 1.1;
      look.pitch = THREE.MathUtils.clamp(look.pitch + ((held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0)) * dt * .8, -1.25, 1.25);
      walkInput.forward = Number(held.has('KeyW')) - Number(held.has('KeyS')); walkInput.strafe = Number(held.has('KeyD')) - Number(held.has('KeyA'));
      let p = walk.state, walked = false; for (let i = 0; i < subSteps; i++) { p = walk.step(subDt, walkInput, look.yaw); walked ||= p.moving; } p.moving = walked;
      mission.setHabitatPose(p);
      if (p.moving && motionEnabled) bob += dt * 7;
      camera.position.set(p.x, p.y + EYE_HEIGHT + (p.moving && motionEnabled ? Math.sin(bob) * .009 : 0), p.z);
      camera.quaternion.setFromEuler(eul.set(look.pitch, look.yaw, 0));
      pickTime += dt;
      if (pickTime >= .12) { pickTime = 0; hoverMonitor = pickMonitor({ clientX: innerWidth / 2, clientY: innerHeight / 2 }); }
      $('walk-monitor').classList.toggle('hidden', !hoverMonitor); $('walk-monitor').textContent = 'F · Open ' + (monitors.find(s => s.id === hoverMonitor)?.title ?? '');
      $('walk-location').textContent = p.x < ROOM.x0 ? `AIRLOCK · inner door ${base.doorState.inner > 0 ? 'open' : 'closed'} · outer door ${base.doorState.outer > 0 ? 'open' : 'closed'} · pressure not connected` : 'Habitat interior (fictional)';
      if (p.exited) { // walking out again after a closed EVA starts the next one (same tasks, fresh clock, consumables, alerts, plan and package; the old records stay archived)
        if (st.phase === 'ended') planPad.nextEva();
        planPad.ensureDemoPlan(); if (mission.departHabitat()) { clearMovement(); goHud(true); } }
    }
    { const hint = mode !== 'hud' ? '' : (st.phase === 'atBase' || st.phase === 'ended') && st.s > 0 ? (st.transport === 'rover' ? 'E to get off, then W · enter the airlock' : `W · through the airlock into the habitat${st.phase === 'atBase' ? ' (passing the inner door ends the Marswalk)' : ''} · inner door ${base.doorState.inner > 0 ? 'open' : 'closed'} · outer door ${base.doorState.outer > 0 ? 'open' : 'closed'}`) : ''; if (hint !== entryHint) { entryHint = hint; $('phase').textContent = hint; } }
    placeRover(); const { p, yaw } = astroPose();
    astro.group.position.set(p.x, p.y, p.z); astro.group.rotation.y = yaw;
    base.updateDoors(dt, p.kind === 'indoor' || p.x > AIRLOCK.x0 - 3.4 ? p.x : null);
    if (mode === 'hud') {
      if (st.moving) bob += dt * 7.2; const b = st.moving ? Math.sin(bob) * .022 : 0;
      camera.position.set(p.x, p.y + EYE_HEIGHT + (st.transport === 'rover' ? 0 : b), p.z).addScaledVector(V(-Math.sin(yaw), 0, -Math.cos(yaw)), .02);
      if (blend > 0) { blend = Math.max(0, blend - dt / .8); camera.position.lerp(blendFrom, blend * blend * (3 - 2 * blend)); }
      camera.quaternion.setFromEuler(eul.set(look.pitch, look.yaw, 0)); if (camera.fov !== 62) { camera.fov = 62; camera.updateProjectionMatrix(); }
      scoop.update(dt, camera, look); // sample collection motion (drives the view down to the dig spot while it runs)
      if (st.lateralDebug) camera.position.addScaledVector(V(Math.cos(p.yaw), 0, -Math.sin(p.yaw)), st.lateralDebug); // test hook only: no product input leaves the route
      if (!field.loaded && field.group.visible && (st.planTx || st.pkg || st.route.length - st.s < 150)) field.ensure(); // lazy: the measured workspace mesh loads when the plan is confirmed or the crew is within 150 m
      routeMesh.update(camera, true);
      camera.updateMatrixWorld(); const fm = field.group.visible ? field.metrics(camera) : null; fx.pre({ field: fm, proj: missionProj, lines: (fx.ui.view === 'compare' || fx.wantsLines()) && st.pkg && st.pkg.ackAt !== null && st.compare.result !== 'match' ? field.hudLines(camera, innerWidth, innerHeight) : null }); // v0.2: real view geometry toward the rock; HUD line projection (planned lines as seen when looking straight at the rock)
      paintRibbon();
      const wp = (() => { const n = mission.nextNode(), q = mission.poseAt(n.s), v = V(q.x, q.y + 0.9, q.z).project(camera); return { on: v.z < 1 && Math.abs(v.x) < 0.8 && Math.abs(v.y) < 0.8, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; })(); // next waypoint label anchor (visor theme)
      hud.update({ lookYaw: look.yaw, routeYaw: p.yaw, locked: !!document.pointerLockElement, dt, wp }); fx.post(dt, look.yaw);
      field.setPackage(st.pkg && st.pkg.ackAt !== null ? st.pkg : null); field.setState({ show: fx.ui.view === 'compare' || fx.wantsLines() || st.compare.result === 'match', aligned: !!(fm && fm.aligned), matched: st.compare.result === 'match', hudOn: true }, dt);
    } else { field.setState({ show: false }, dt); if (scoop.busy) scoop.cancel(); }
    if (helmet.group.visible) {
      camera.rotation.reorder('YXZ'); const cy = camera.rotation.y, cp = camera.rotation.x; let d = cy - helmetYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); helmetYaw += d * Math.min(1, dt * 9);
      helmet.group.position.copy(camera.position); helmet.group.quaternion.setFromEuler(eul.set(cp * .8, helmetYaw, 0));
      helmet.update?.(camera);
    }
    const c = camera.position, inside = c.x > AIRLOCK.x0 - .3 && c.x < ROOM.x1 + .2 && Math.abs(c.z) < ROOM.z1 + .2 && c.y < FY + 3;
    outdoorK += ((inside ? 0 : 1) - outdoorK) * Math.min(1, dt * 2.5); renderer.toneMappingExposure = 1 - .36 * outdoorK;
    sun.target.position.set(Math.round(c.x / 4) * 4, p.y, Math.round(c.z / 4) * 4); sun.position.copy(sun.target.position).addScaledVector(terrain.sunDir, 200);
    setAstroEnv(p.kind !== 'indoor');
    // Perf: the three 2048² shadow maps (sun + two bench spots) were redrawn every frame (~1.5M triangles). They only change
    // when a caster moves: doors, the visible crew model, the rover, or the sun's snapped target. Redraw them only then.
    // Perf (review 8451d4c): while riding or while the simulated crew is visible, the old single signature changed every frame, so all three
    // 2048² shadow maps were redrawn every frame. Now: the sun map follows the rover/crew on a 1 m grid and at most 5 times a second;
    // the two indoor bench lights redraw only when a door moves or the crew moves indoors.
    shadowClock += dt; const q1 = (v) => Math.round(v);
    const sunSig = `${sun.target.position.x},${sun.target.position.z},${q1(st.roverS)},${astro.model.visible ? `${q1(p.x)},${q1(p.z)}` : ''},${base.doorState.inner > 0},${base.doorState.outer > 0}`;
    if (sunSig !== shadowSig && shadowClock >= .2) { shadowSig = sunSig; shadowClock = 0; sun.shadow.needsUpdate = true; }
    const inSig = `${base.doorState.inner},${base.doorState.outer},${astro.model.visible && p.kind === 'indoor' ? `${p.x.toFixed(1)},${p.z.toFixed(1)}` : ''},${operator.group.visible},${operator.head.visible}`;
    if (inSig !== indoorShadowSig) { indoorShadowSig = inSig; base.lights.forEach((l) => { l.shadow.needsUpdate = true; }); }
    instrumentTime += dt;
    if (instrumentTime > .5) { instrumentTime = 0; science.update(); systems.update(); paintMonitors(); $('room-telemetry').textContent = st.habitatPose ? 'Habitat interior · before EVA departure' : 'O₂ ' + st.o2.toFixed(1) + '% · ' + (st.transport === 'rover' ? 'ROVER' : 'EVA') + ' · ' + st.s.toFixed(0) + ' / ' + st.route.length.toFixed(0) + ' m'; }
    base.chair.visible = !(operator.ownChair && operator.group.visible); // the operator mesh brings its own chair
    habitatRenderer.render(inside && !helmet.group.visible, dt); requestAnimationFrame(frame);
  }

  // Debug inspection remains separate from the actual controls.
  Object.assign(api, { voiceDiag, planPad, routeMesh, enterRole: (r) => (r === 'pad' ? goPad() : goCrew()), pickPerson, base, field, fx, pad, fieldPad, marker, habitatRenderer, rover, roverFit: () => roverFit, walk, hud, monitors: monitors.map((m) => m.id), mission, director, camera, terrain, glInfo, look, site, rockCount, astroInfo: astro.info, astro, operator, renderer, scene,
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, fps: api.fps, glInfo }),
    debugCamWorld: (px, py, pz, tx, ty, tz, fov = 50) => { setMode('debug'); camera.position.set(px, py, pz); camera.quaternion.copy(lookQuat(camera.position, V(tx, ty, tz))); camera.fov = fov; camera.updateProjectionMatrix(); },
  });
  if (params.has('s')) { st.habitatPose = null; mission.debugSetS(parseFloat(params.get('s'))); }
  api.debugCam = (px, py, pz, tx, ty, tz, fov = 50) => api.debugCamWorld(px, FY + py, pz, tx, FY + ty, tz, fov);
  // Perf: compile every shader variant and upload every texture behind the loading screen. The first helmet transition
  // used to stall 330-450 ms when the suit model, visor interior and route ribbon were first drawn (68 -> 111 programs).
  { const show = [astro.model, helmet.group, ribbon].map((o) => [o, o.visible]), culled = []; show.forEach(([o]) => { o.visible = true; });
    scene.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    for (const outdoor of [false, true]) { setAstroEnv(outdoor); habitatRenderer.render(!outdoor, 0); }
    show.forEach(([o, v]) => { o.visible = v; }); culled.forEach((o) => { o.frustumCulled = true; }); renderer.clear(); }
  const shadowLights = [sun, ...base.lights]; shadowLights.forEach((l) => { l.shadow.autoUpdate = false; l.shadow.needsUpdate = true; });
  intro.ready(api); // the intro shown since page open: straight to the role selection if Enter was already pressed, otherwise it waits for Enter
  setMode('landing'); api.ready = true; requestAnimationFrame(frame);
  // Outdoor-only maps (soil grain, rock, far-field ortho) load once the landing view has been drawn; until then they are mean-colour stand-ins, so the ground is never black.
  api.deferred = deferred; requestAnimationFrame(() => requestAnimationFrame(() => { runDeferred(); }));
}
