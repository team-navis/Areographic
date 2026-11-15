import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { ph, smudgeTexture, rng } from '../util/tex.js';
import { mergeStatic } from '../util/merge.js';
import { createHabitatSurfaces } from './habitat-materials.js';
import { buildArchitectureDetails } from './habitat-architecture.js';
import { buildHabitatFurniture } from './habitat-furniture.js';

/**
 * Fictional demo habitat ("fictional habitat"). Everything here is procedural modelling for the demo;
 * it is not a real facility and its site is only a demo placement on the real terrain.
 * Local frame == world frame axes (x east, z south), floor at y = 0 of the returned group.
 */
export const ROOM = { x0: -4.5, x1: 4.5, z0: -3, z1: 3, h: 2.7 };
export const AIRLOCK = { x0: -7.1, x1: -4.62, z0: -0.25, z1: 2.25, doorZ: 1.0, doorW: 1.15, doorH: 2.08 };
export const MONITOR = { w: 2.24, h: 1.26, y: 1.56, z: -2.84, xs: [0] }; // one large 16:9 control screen (team decision 2026-11-15: the controller works on a single screen; was three 1.72 x 0.82 m monitors). 16:9 matches the 1280x720 PAD and fits the seated 74 deg view
export const SEAT = { x: 0, z: -1.62 };
// Furniture footprints in the habitat's local x/z frame, shared with free walking.
export const HABITAT_OBSTACLES = [
  { id: 'main-bench', x0: -3.55, x1: 3.55, z0: -2.97, z1: -2.02 },
  { id: 'operator-chair', x0: -.35, x1: .35, z0: -1.97, z1: -1.27 },
  { id: 'west-storage', x0: -4.45, x1: -3.88, z0: -2.4, z1: -.7 },
  { id: 'southeast-bench', x0: 1.9, x1: 3.9, z0: 2.43, z1: 2.97 },
  { id: 'airlock-bench', x0: -6.68, x1: -5.08, z0: -.19, z1: .17 },
  { id: 'rear-worktop', x0: -1.6, x1: 1.3, z0: 2.43, z1: 2.97 },
];

export function buildBase() {
  RectAreaLightUniformsLib.init();
  const g = new THREE.Group(); g.name = 'base-fictional';
  const interior = []; // materials that take the interior environment map
  const surfaces = createHabitatSurfaces();
  const smA = smudgeTexture(11), smB = smudgeTexture(29); smA.repeat.set(2, 2);
  const std = (o) => { const m = new THREE.MeshStandardMaterial(o); interior.push(m); return m; };
  const enamel = (options) => {
    const material = std(options);
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.55);');
    };
    material.customProgramCacheKey = () => 'habitat-enamel-roughness-floor-055';
    return material;
  };
  const physical = (o) => { const m = new THREE.MeshPhysicalMaterial(o); interior.push(m); return m; };
  // The scan supplies only surface response; warm enamel remains our own albedo.
  const paintNormal = ph('blue_metal_plate_nor', { repeat: [.42, 1.05] }); paintNormal.offset.set(.33, .07);
  const paintRough = ph('blue_metal_plate_rough', { repeat: [.42, 1.05] }); paintRough.offset.copy(paintNormal.offset);
  const paintFinish = { roughness: .82, metalness: .015, normalMap: paintNormal, normalScale: new THREE.Vector2(.16, .16), roughnessMap: paintRough };
  const M = {
    wall: enamel({ color: 0xf0ebe1, map: surfaces.panels[0], ...paintFinish }),
    wallDark: std({ color: 0x4a473e, roughness: 0.8, metalness: 0.2 }),
    trim: std({ color: 0xb8b3a9, map: surfaces.metal, roughness: 0.52, metalness: 0.55, roughnessMap: surfaces.metalRough }),
    steel: physical({ color: 0xe4e2d9, map: surfaces.metal, roughness: .78, metalness: 1, roughnessMap: surfaces.metalRough, bumpMap: surfaces.metalRough, bumpScale: .0003, anisotropy: .32 }),
    alu: std({ color: 0xd1d0c7, map: surfaces.metal, roughness: .91, metalness: .95, roughnessMap: surfaces.metalRough }),
    worktop: physical({ color: 0xe4e3df, map: surfaces.worktop, metalness: .96, roughness: .64, roughnessMap: surfaces.worktopRough, bumpMap: surfaces.worktopRough, bumpScale: .00009, anisotropy: .45 }),
    caseMetal: std({ color: 0xcac8c2, map: surfaces.worktop, metalness: .86, roughness: .82, roughnessMap: surfaces.worktopRough }),
    fastener: std({ color: 0x8c8d87, metalness: .92, roughness: .42 }),
    anodized: std({ color: 0x30332f, metalness: .58, roughness: .57 }),
    edgeWear: std({ color: 0xbdb7a8, map: surfaces.metal, roughness: .65, metalness: .75 }),
    cabinet: enamel({ color: 0xddd9d0, map: surfaces.panels[2], ...paintFinish }),
    dark: std({ color: 0x1b1b1d, roughness: 0.55, metalness: 0.3 }),
    bezel: std({ color: 0x0b0b0c, roughness: 0.32, metalness: 0.4 }),
    rubber: std({ color: 0x151515, roughness: 0.9, metalness: 0 }),
    cableRed: std({ color: 0x8a1d12, roughness: 0.6 }),
    red: std({ color: 0xb3261a, roughness: 0.4, metalness: 0.1 }),
    wood: std({ color: 0x9a6a3c, roughness: 0.55 }),
    paper: std({ color: 0xf5efdf, roughness: 0.95 }),
    document: std({ map: surfaces.paper, roughness: 0.95 }),
    fabric: std({ map: surfaces.acoustic, roughness: 1, roughnessMap: ph('fabric_pattern_07_rough', { repeat: [4.3, .75] }), bumpMap: surfaces.acousticBump, bumpScale: .001, normalMap: ph('fabric_pattern_07_nor', { repeat: [4.3, .75] }), normalScale: new THREE.Vector2(.45, .45) }),
    floor: std({ map: ph('rubber_tiles_diff', { repeat: [3, 2], srgb: true }), normalMap: ph('rubber_tiles_nor', { repeat: [3, 2] }), normalScale: new THREE.Vector2(.34, .34), roughnessMap: ph('rubber_tiles_rough', { repeat: [3, 2] }), color: 0xa8a59d, roughness: .97, metalness: 0 }),
    leather: std({ map: ph('fabric_leather_02_diff', { repeat: 1.5, srgb: true }), normalMap: ph('fabric_leather_02_nor', { repeat: 1.5 }), color: 0x3b3b40, roughness: 0.6 }),
    hull: new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.7, metalness: 0.2, roughnessMap: smA }),
    hullDark: new THREE.MeshStandardMaterial({ color: 0x5c5850, roughness: 0.7, metalness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xd8e6e2, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
    lamp: std({ color: 0xe9e7e1, map: surfaces.diffuser, roughness: .62, emissive: 0xfff4df, emissiveMap: surfaces.diffuser, emissiveIntensity: 2.4 }),
    led: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, .95, 0.55) }),
    ledAmber: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.3, 0.2) }),
    taskLamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.03, 0.54) }),
  };
  const panelMaterials = surfaces.panels.map((map, i) => enamel({ map, color: [0xf0ebe1, 0xe9e5dc, 0xf1eee6, 0xece8df][i], ...paintFinish }));
  interior.push(M.glass);
  const metreMapped = new Set([M.steel, M.alu, M.trim, M.worktop, M.caseMetal, M.edgeWear]);
  const projectMetalUV = (geometry) => {
    const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
      else if (ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
      else uv.setXY(i, p.getX(i), p.getY(i));
    }
  };
  const shadow = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };
  const box = (w, h, d, mat, x, y, z, parent = g, r = 0) => {
    const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d);
    if (metreMapped.has(mat)) projectMetalUV(geo);
    const m = shadow(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); parent.add(m); return m;
  };
  const cyl = (rt, rb, h, mat, x, y, z, parent = g, seg = 20) => { const m = shadow(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)); m.position.set(x, y, z); parent.add(m); return m; };
  const tube = (pts, r, mat, parent = g) => { const m = shadow(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), Math.max(8, pts.length * 8), r, 8), mat)); parent.add(m); return m; };
  // Local soft contact shadows supplement GTAO beneath the real furniture.
  const contactCanvas = document.createElement('canvas'); contactCanvas.width = contactCanvas.height = 128;
  const contactContext = contactCanvas.getContext('2d'); contactContext.filter = 'blur(11px)'; contactContext.fillStyle = '#000'; contactContext.fillRect(17, 17, 94, 94);
  const contactMap = new THREE.CanvasTexture(contactCanvas);
  const contactShadow = (w, d, x, z, opacity = .28) => {
    const mat = new THREE.MeshBasicMaterial({ map: contactMap, transparent: true, opacity, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .004, z); mesh.name = 'furniture-contact-shadow'; mesh.userData.contactShadow = true; g.add(mesh);
  };

  const rivets = []; // {x,y,z, axis}
  const { x0, x1, z0, z1, h } = ROOM, T = 0.16; // wall thickness
  const architecture = buildArchitectureDetails({ group: g, materials: M, panelMaterials, box, cyl, tube, rivets, room: ROOM, airlock: AIRLOCK });
  const { panels } = architecture; interior.push(...architecture.materials);

  // ---------------- floor / ceiling ----------------
  shadow(box(x1 - x0, 0.12, z1 - z0, M.floor, 0, -0.06, 0), false, true);
  box(AIRLOCK.x1 - AIRLOCK.x0 + 0.2, 0.12, AIRLOCK.z1 - AIRLOCK.z0, M.floor, (AIRLOCK.x0 + AIRLOCK.x1) / 2 - 0.05, -0.06, (AIRLOCK.z0 + AIRLOCK.z1) / 2);
  box(x1 - x0, 0.1, z1 - z0, M.wallDark, 0, h + 0.07, 0);
  architecture.ceiling();
  const lights = [];
  for (const lx of [-1.75, 1.75]) { // wide practical diffusers, with real metal retaining clips
    box(1.72, 0.105, 0.61, M.cabinet, lx, h - 0.065, -1.85, g, 0.025);
    box(1.66, 0.08, 0.56, M.alu, lx, h - 0.095, -1.85, g, 0.02);
    box(1.53, 0.025, 0.44, M.lamp, lx, h - 0.145, -1.85, g, 0.012);
    for (const s of [-1, 1]) {
      box(0.045, 0.09, 0.61, M.trim, lx + s * .79, h - 0.12, -1.85, g, .008);
      for (const z of [-2.09, -1.61]) rivets.push([lx + s * .79, h - .167, z, 'y']);
    }
    const area = new THREE.RectAreaLight(0xfff1df, 5.8, 1.5, .44); area.position.set(lx, h - .17, -1.85); area.lookAt(lx, 0, -1.85); g.add(area);
    const sp = new THREE.SpotLight(0xfff1df, 26, 10, 1.18, 1, 1.8); sp.position.set(lx, h - 0.18, -1.85); sp.target.position.set(lx * 0.9, .25, -2.28);
    sp.castShadow = true; sp.shadow.mapSize.set(2048, 2048); sp.shadow.bias = -0.00015; sp.shadow.normalBias = .004; sp.shadow.radius = 2.5; sp.shadow.camera.near = 0.2; sp.shadow.camera.far = 8; g.add(sp, sp.target); lights.push(sp);
  }
  box(0.9, 0.07, 0.36, M.trim, -3.2, h - 0.05, 1.7, g, 0.02); box(0.8, 0.02, 0.28, M.lamp, -3.2, h - 0.095, 1.7, g, 0.008);
  const fill = new THREE.PointLight(0xfff1df, 3.5, 9, 1.8); fill.position.set(-2.6, h - 0.3, 1.6); g.add(fill);
  const fill2 = new THREE.PointLight(0xfff1df, 2.2, 8, 1.8); fill2.position.set(2.4, 2.1, 1.9); g.add(fill2);
  architecture.structure();

  const backing = (w, hh, d, x, y, z) => box(w, hh, d, M.wallDark, x, y, z);

  // north wall (monitors)
  backing(x1 - x0 + 2 * T, h + 0.2, T, 0, h / 2, z0 - T / 2); panels('x', x0, x1, z0, 0, h, 1);
  // south wall
  backing(x1 - x0 + 2 * T, h + 0.2, T, 0, h / 2, z1 + T / 2); panels('x', x0, x1, z1, 0, h, -1);
  // east wall with window
  const WIN = { z0: -1.35, z1: 0.95, y0: 0.98, y1: 2.08 };
  backing(T, h + 0.2, WIN.z0 - z0, x1 + T / 2, h / 2, (z0 + WIN.z0) / 2); backing(T, h + 0.2, z1 - WIN.z1, x1 + T / 2, h / 2, (z1 + WIN.z1) / 2);
  backing(T, WIN.y0, WIN.z1 - WIN.z0, x1 + T / 2, WIN.y0 / 2, (WIN.z0 + WIN.z1) / 2); backing(T, h + 0.1 - WIN.y1, WIN.z1 - WIN.z0, x1 + T / 2, (h + 0.1 + WIN.y1) / 2, (WIN.z0 + WIN.z1) / 2);
  panels('z', z0, WIN.z0 - 0.08, x1, 0, h, -1); panels('z', WIN.z1 + 0.08, z1, x1, 0, h, -1);
  panels('z', WIN.z0 - 0.08, WIN.z1 + 0.08, x1, 0, WIN.y0 - 0.08, -1, 1.3); panels('z', WIN.z0 - 0.08, WIN.z1 + 0.08, x1, WIN.y1 + 0.08, h, -1, 1.3);
  { // deep rounded window frame + glass
    const sh = new THREE.Shape(); const rr = (s, a, b, c, d, r) => { s.moveTo(a + r, b); s.lineTo(c - r, b); s.quadraticCurveTo(c, b, c, b + r); s.lineTo(c, d - r); s.quadraticCurveTo(c, d, c - r, d); s.lineTo(a + r, d); s.quadraticCurveTo(a, d, a, d - r); s.lineTo(a, b + r); s.quadraticCurveTo(a, b, a + r, b); };
    rr(sh, WIN.z0 - 0.09, WIN.y0 - 0.09, WIN.z1 + 0.09, WIN.y1 + 0.09, 0.3); const hole = new THREE.Path(); rr(hole, WIN.z0 + 0.06, WIN.y0 + 0.06, WIN.z1 - 0.06, WIN.y1 - 0.06, 0.22); sh.holes.push(hole);
    const fr = shadow(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: T + 0.1, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 10 }), M.trim));
    fr.rotation.y = -Math.PI / 2; fr.position.set(x1 + T + 0.03, 0, 0); g.add(fr);
    const seal = new THREE.Shape(); rr(seal, WIN.z0 + .035, WIN.y0 + .035, WIN.z1 - .035, WIN.y1 - .035, .235);
    const sealHole = new THREE.Path(); rr(sealHole, WIN.z0 + .075, WIN.y0 + .075, WIN.z1 - .075, WIN.y1 - .075, .21); seal.holes.push(sealHole);
    const gasket = new THREE.Mesh(new THREE.ExtrudeGeometry(seal, { depth: .018, bevelEnabled: false, curveSegments: 12 }), M.rubber);
    gasket.rotation.y = -Math.PI / 2; gasket.position.set(x1 - .045, 0, 0); g.add(gasket);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(WIN.z1 - WIN.z0, WIN.y1 - WIN.y0), M.glass); gl.rotation.y = -Math.PI / 2; gl.position.set(x1 + T * 0.6, (WIN.y0 + WIN.y1) / 2, (WIN.z0 + WIN.z1) / 2); g.add(gl);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283; rivets.push([x1 - 0.085, (WIN.y0 + WIN.y1) / 2 + Math.sin(a) * 0.6, (WIN.z0 + WIN.z1) / 2 + Math.cos(a) * 1.2, 'x']); }
    // handrail + padded panel under the window (as in the reference set dressing)
    const rail = cyl(0.022, 0.022, 1.5, M.wood, x1 - 0.12, 0.86, -0.2); rail.rotation.x = Math.PI / 2;
    for (const s of [-0.65, 0.65]) box(0.1, 0.04, 0.04, M.steel, x1 - 0.07, 0.86, -0.2 + s);
    box(0.05, 0.62, 1.7, M.fabric, x1 - 0.045, 0.45, -0.2, g, 0.02);
  }
  // west wall with airlock doorway
  const D = AIRLOCK, dz0 = D.doorZ - D.doorW / 2, dz1 = D.doorZ + D.doorW / 2;
  backing(T, h + 0.2, dz0 - z0, x0 - T / 2, h / 2, (z0 + dz0) / 2); backing(T, h + 0.2, z1 - dz1, x0 - T / 2, h / 2, (z1 + dz1) / 2); backing(T, h + 0.1 - D.doorH, D.doorW, x0 - T / 2, (h + 0.1 + D.doorH) / 2, D.doorZ);
  panels('z', z0, dz0 - 0.1, x0, 0, h, 1); panels('z', dz1 + 0.1, z1, x0, 0, h, 1); panels('z', dz0 - 0.1, dz1 + 0.1, x0, D.doorH + 0.1, h, 1, 1.4);
  for (const s of [dz0 - 0.05, dz1 + 0.05]) box(0.24, D.doorH + 0.05, 0.1, M.trim, x0 - 0.06, (D.doorH + 0.05) / 2, s, g, 0.02); // door jambs
  box(0.24, 0.1, D.doorW + 0.2, M.trim, x0 - 0.06, D.doorH + 0.05, D.doorZ, g, 0.02);
  box(0.26, 0.012, D.doorW, M.steel, x0 - 0.06, 0.006, D.doorZ);
  const doorPanel = (name) => {
    const d = new THREE.Group(); d.name = name;
    const outline = (width, height, y, radius, Path = THREE.Shape) => {
      const s = new Path(), x0 = -width / 2, x1 = width / 2, y0 = y - height / 2, y1 = y + height / 2;
      s.moveTo(x0 + radius, y0); s.lineTo(x1 - radius, y0); s.quadraticCurveTo(x1, y0, x1, y0 + radius);
      s.lineTo(x1, y1 - radius); s.quadraticCurveTo(x1, y1, x1 - radius, y1); s.lineTo(x0 + radius, y1);
      s.quadraticCurveTo(x0, y1, x0, y1 - radius); s.lineTo(x0, y0 + radius); s.quadraticCurveTo(x0, y0, x0 + radius, y0); return s;
    };
    const leaf = outline(D.doorW + .06, D.doorH - .02, D.doorH / 2, .075);
    leaf.holes.push(outline(.36, .39, 1.5, .085, THREE.Path));
    const leafGeometry = new THREE.ExtrudeGeometry(leaf, { depth: .045, bevelEnabled: true, bevelSize: .004, bevelThickness: .004, bevelSegments: 2, curveSegments: 12 });
    // One enamel sheet per door, without tiled panel-edge dirt across its centre.
    const leafPosition = leafGeometry.attributes.position, leafUV = leafGeometry.attributes.uv;
    for (let i = 0; i < leafPosition.count; i++) leafUV.setXY(i, leafPosition.getX(i) / (D.doorW + .06) + .5, leafPosition.getY(i) / D.doorH);
    const metalLeaf = shadow(new THREE.Mesh(leafGeometry, M.cabinet));
    metalLeaf.rotation.y = Math.PI / 2; metalLeaf.position.x = -.0225; d.add(metalLeaf);
    for (const sx of [-1, 1]) {
      const surround = outline(.47, .50, 1.5, .11); surround.holes.push(outline(.36, .39, 1.5, .085, THREE.Path));
      const bezel = shadow(new THREE.Mesh(new THREE.ExtrudeGeometry(surround, { depth: .012, bevelEnabled: true, bevelSize: .002, bevelThickness: .002, bevelSegments: 2, curveSegments: 12 }), M.alu));
      bezel.rotation.y = Math.PI / 2; bezel.position.x = sx < 0 ? -.04 : .028; d.add(bezel);
      const seal = outline(.379, .409, 1.5, .094); seal.holes.push(outline(.351, .381, 1.5, .081, THREE.Path));
      const gasket = new THREE.Mesh(new THREE.ShapeGeometry(seal, 12), M.rubber); gasket.rotation.y = sx * Math.PI / 2; gasket.position.x = sx * .043; d.add(gasket);
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const bolt = cyl(.007, .007, .005, M.fastener, sx * .046, 1.5 + sy * .208, sz * .18, d, 10); bolt.rotation.z = Math.PI / 2;
      }
      for (const y of [.86, 1.15]) box(.045, .042, .065, M.anodized, sx * .052, y, .36, d, .006);
      tube([[sx * .055, .86, .36], [sx * .086, .91, .36], [sx * .086, 1.10, .36], [sx * .055, 1.15, .36]], .012, M.alu, d);
      box(.003, 1.79, .013, M.rubber, sx * .028, .97, -.54, d, .002);
    }
    const pane = new THREE.Mesh(new THREE.ShapeGeometry(outline(.36, .39, 1.5, .085), 12), M.glass); pane.rotation.y = Math.PI / 2; d.add(pane);
    g.add(d); return d;
  };
  const innerDoor = doorPanel('airlock-inner-door'); innerDoor.position.set(x0 - 0.08, 0, D.doorZ);
  const outerDoor = doorPanel('airlock-outer-door'); outerDoor.position.set(D.x0 - 0.08, 0, D.doorZ);

  // ---------------- airlock vestibule ----------------
  {
    const ax0 = D.x0, ax1 = x0 - T, az0 = D.z0, az1 = D.z1, ah = 2.45;
    backing(ax1 - ax0 + T, ah + 0.2, T, (ax0 + ax1) / 2 - T / 2, ah / 2, az0 - T / 2); backing(ax1 - ax0 + T, ah + 0.2, T, (ax0 + ax1) / 2 - T / 2, ah / 2, az1 + T / 2);
    panels('x', ax0, ax1, az0, 0, ah, 1, 0.8); panels('x', ax0, ax1, az1, 0, ah, -1, 0.8);
    box(ax1 - ax0 + T, 0.1, az1 - az0 + 2 * T, M.wallDark, (ax0 + ax1) / 2 - T / 2, ah + 0.05, (az0 + az1) / 2);
    backing(T, ah + 0.2, dz0 - az0, ax0 - T / 2, ah / 2, (az0 + dz0) / 2); backing(T, ah + 0.2, az1 - dz1, ax0 - T / 2, ah / 2, (az1 + dz1) / 2); backing(T, ah - D.doorH + 0.2, D.doorW, ax0 - T / 2, (ah + 0.2 + D.doorH) / 2, D.doorZ);
    panels('z', az0, dz0 - 0.02, ax0, 0, ah, 1, 0.6); panels('z', dz1 + 0.02, az1, ax0, 0, ah, 1, 0.6);
    box(0.5, 0.05, 0.24, M.lamp, (ax0 + ax1) / 2, ah - 0.03, D.doorZ, g, 0.01);
    const al = new THREE.PointLight(0xffe0b8, 9, 5, 1.6); al.position.set((ax0 + ax1) / 2, ah - 0.25, D.doorZ); g.add(al);
    box(1.6, 0.05, 0.36, M.steel, (ax0 + ax1) / 2, 0.46, az0 + 0.24, g, 0.01); for (const s of [-0.7, 0.7]) box(0.04, 0.46, 0.3, M.alu, (ax0 + ax1) / 2 + s, 0.23, az0 + 0.24);
    for (let i = 0; i < 3; i++) { const c = cyl(0.085, 0.085, 0.62, i === 1 ? M.red : M.alu, ax0 + 0.55 + i * 0.26, 1.35, az0 + 0.13); cyl(0.03, 0.05, 0.08, M.steel, c.position.x, 1.7, az0 + 0.13); box(0.24, 0.03, 0.02, M.rubber, c.position.x, 1.45, az0 + 0.215); }
    tube([[ax0 + 0.3, 2.2, az0 + 0.05], [ax0 + 1, 2.25, az0 + 0.06], [ax1 - 0.2, 2.2, az0 + 0.05]], 0.02, M.steel);
    for (let i = 0; i < 4; i++) box(0.06, 0.03, 0.12, M.steel, ax0 + 0.5 + i * 0.5, 1.75, az1 - 0.07, g, 0.008);
  }

  // ---------------- north wall: graphite acoustic panels, display mounting hardware ----------------
  const screens = [];
  for (let i = 0; i < MONITOR.xs.length; i++) {
    const mx = MONITOR.xs[i], top = MONITOR.y + MONITOR.h / 2; // acoustic panel sits just above the (now taller) screen
    box(MONITOR.w + .06, .2, .028, M.wallDark, mx, top + .2, z0 + .045, g, .016);
    box(MONITOR.w, .15, .045, M.fabric, mx, top + .2, z0 + .077, g, .025);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rivets.push([mx + sx * (MONITOR.w / 2 + .01), top + .2 + sy * .085, z0 + .067, 'z']);
    // Black powder-coated chassis with folded side returns, recessed mounting rails.
    box(MONITOR.w + .09, MONITOR.h + .10, .065, M.anodized, mx, MONITOR.y, MONITOR.z - .048, g, .012);
    box(MONITOR.w + .045, MONITOR.h + .045, .029, M.bezel, mx, MONITOR.y, MONITOR.z - .013, g, .008);
    for (const side of [-1, 1]) {
      box(.009, MONITOR.h + .065, .046, M.alu, mx + side * (MONITOR.w / 2 + .039), MONITOR.y, MONITOR.z - .047, g, .002);
      for (const sy of [-1, 1]) rivets.push([mx + side * (MONITOR.w / 2 + .031), MONITOR.y + sy * (MONITOR.h / 2 + .029), MONITOR.z - .013, 'z']);
    }
    for (let vent = 0; vent < 24; vent++) box(.037, .004, .018, M.rubber, mx - .74 + vent * .064, MONITOR.y - MONITOR.h / 2 - .043, MONITOR.z - .048, g, .001);
    box(.64, .38, .08, M.dark, mx, MONITOR.y, z0 + .064); // VESA mount
    for (const side of [-1, 1]) {
      const rx = mx + side * (MONITOR.w / 2 - .2);
      box(.048, 1.36, .045, M.alu, rx, 1.61, z0 + .065, g, .005);
      for (const ry of [1.04, 1.16, 2.09, 2.19]) box(.019, .047, .004, M.dark, rx, ry, z0 + .091, g, .006);
      for (const ry of [1.13, 2.07]) rivets.push([rx, ry, z0 + .095, 'z']);
      box(.065, .028, .025, M.trim, mx + side * (MONITOR.w / 2 + .025), MONITOR.y - .31, MONITOR.z - .002, g, .005);
    }
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(MONITOR.w, MONITOR.h), new THREE.MeshBasicMaterial({ color: 0x05070a })); scr.position.set(mx, MONITOR.y, MONITOR.z + .004); scr.name = 'screen-' + i; g.add(scr); screens.push(scr);
    box(0.012, 0.012, 0.006, M.led, mx + MONITOR.w / 2 - 0.03, MONITOR.y - MONITOR.h / 2 - 0.016, MONITOR.z + 0.002);
    // drooping cables from each monitor to the tray
    { const cy = MONITOR.y - MONITOR.h / 2 - .02; // below the (now larger) screen, behind its lower edge: the cables never cross the picture
      tube([[mx - .24, cy, z0 + .07], [mx - .22, cy - .08, z0 + .12], [mx - .1, cy - .13, z0 + .12], [mx + .15, cy - .15, z0 + .08]], .013, M.rubber);
      tube([[mx + .35, cy, z0 + .07], [mx + .43, cy - .09, z0 + .1], [mx + .5, cy - .15, z0 + .08]], .009, i === 0 ? M.cableRed : M.rubber); }
  }
  box(x1 - x0 - 1.4, 0.03, 0.07, M.steel, 0.2, 0.93, z0 + 0.06, g, 0.008); // cable tray rail
  tube([[-3.6, 0.975, z0 + 0.075], [-1.5, 0.965, z0 + 0.08], [0.5, 0.975, z0 + 0.075], [2.4, 0.965, z0 + 0.08], [3.9, 0.975, z0 + 0.075]], 0.016, M.rubber);
  tube([[-3.4, 0.99, z0 + 0.1], [-0.8, 0.985, z0 + 0.105], [1.6, 0.99, z0 + 0.1], [3.7, 0.985, z0 + 0.1]], 0.011, M.rubber);
  for (let i = 0; i < 9; i++) box(0.03, 0.075, 0.05, M.dark, -3.4 + i * 0.86, 0.965, z0 + 0.085, g, 0.006); // clamps

  // Fabricated furniture stays within the existing collision footprints.
  const { chair } = buildHabitatFurniture({ group: g, materials: M, box, cyl, tube, contactShadow, seat: SEAT });
  mergeStatic(chair);
  architecture.services();

  // ---------------- mechanical fasteners (instanced) ----------------
  // Flat screw heads, recessed slots and a soft dirt halo replace shiny round beads.
  {
    const heads = new THREE.InstancedMesh(new THREE.CylinderGeometry(.0075, .0085, .0035, 12), M.steel, rivets.length);
    const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(.008, .0013, .001), M.dark, rivets.length);
    const grimeMaterial = new THREE.MeshBasicMaterial({ map: surfaces.fastenerGrime, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    const grime = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), grimeMaterial, rivets.length);
    const d = new THREE.Object3D(), normal = new THREE.Vector3();
    rivets.forEach((r, i) => {
      normal.set(r[3] === 'x' ? (r[0] < 0 ? 1 : -1) : 0, r[3] === 'y' ? -1 : 0, r[3] === 'z' ? (r[2] < 0 ? 1 : -1) : 0);
      d.position.set(r[0], r[1], r[2]); d.scale.set(1, 1, 1); d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal); d.updateMatrix(); heads.setMatrixAt(i, d.matrix);
      d.position.addScaledVector(normal, .002); d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal); d.rotateZ((i % 7) * .37); d.updateMatrix(); slots.setMatrixAt(i, d.matrix);
      d.position.set(r[0], r[1], r[2]).addScaledVector(normal, -.001); const size = .029 + (i % 5) * .003;
      d.scale.set(size, size, size); d.updateMatrix(); grime.setMatrixAt(i, d.matrix);
    });
    heads.name = 'panel-screw-heads'; slots.name = 'panel-screw-slots'; grime.name = 'fastener-grime'; grime.userData.contactShadow = true;
    heads.receiveShadow = true; g.add(heads, slots, grime);
  }

  // ---------------- exterior hull, legs, ramp (visible through windows / from outside) ----------------
  const ext = new THREE.Group(); ext.name = 'hull-exterior'; g.add(ext);
  const E = 0.34;
  const hullWall = (w, hh, d, x, y, z) => shadow(box(w, hh, d, M.hull, x, y, z, ext));
  hullWall(x1 - x0 + 2 * E, h + 0.75, 0.12, 0, (h + 0.35) / 2 - 0.2, z0 - E + 0.05); hullWall(x1 - x0 + 2 * E, h + 0.75, 0.12, 0, (h + 0.35) / 2 - 0.2, z1 + E - 0.05);
  hullWall(0.12, h + 0.75, WIN.z0 - 0.12 - z0 + E, x1 + E - 0.05, (h + 0.35) / 2 - 0.2, (z0 - E + WIN.z0 - 0.12) / 2); hullWall(0.12, h + 0.75, z1 + E - WIN.z1 - 0.12, x1 + E - 0.05, (h + 0.35) / 2 - 0.2, (z1 + E + WIN.z1 + 0.12) / 2);
  hullWall(0.12, WIN.y0 + 0.3, WIN.z1 - WIN.z0 + 0.24, x1 + E - 0.05, (WIN.y0 - 0.5) / 2, (WIN.z0 + WIN.z1) / 2); hullWall(0.12, h + 0.25 - WIN.y1, WIN.z1 - WIN.z0 + 0.24, x1 + E - 0.05, (h + 0.35 + WIN.y1) / 2, (WIN.z0 + WIN.z1) / 2);
  hullWall(0.12, h + 0.75, D.z0 - T - z0 + E, x0 - E + 0.05, (h + 0.35) / 2 - 0.2, (z0 - E + D.z0 - T) / 2); hullWall(0.12, h + 0.75, z1 + E - D.z1 - T, x0 - E + 0.05, (h + 0.35) / 2 - 0.2, (z1 + E + D.z1 + T) / 2);
  hullWall(x1 - x0 + 2 * E, 0.14, z1 - z0 + 2 * E, 0, h + 0.28, 0); hullWall(x1 - x0 + 2 * E, 0.2, z1 - z0 + 2 * E, 0, -0.34, 0);
  hullWall(D.x1 - D.x0 + 0.3, 0.2, D.z1 - D.z0 + 0.6, (D.x0 + x0) / 2 - 0.1, -0.34, (D.z0 + D.z1) / 2); hullWall(D.x1 - D.x0 + 0.3, 0.12, D.z1 - D.z0 + 0.6, (D.x0 + x0) / 2 - 0.1, 2.66, (D.z0 + D.z1) / 2);
  hullWall(D.x1 - D.x0 + 0.3, 3.1, 0.1, (D.x0 + x0) / 2 - 0.1, 1.2, D.z0 - T - 0.08); hullWall(D.x1 - D.x0 + 0.3, 3.1, 0.1, (D.x0 + x0) / 2 - 0.1, 1.2, D.z1 + T + 0.08);
  hullWall(0.08, 3.1, dz0 - D.z0 + T, D.x0 - T - 0.05, 1.2, (D.z0 - T + dz0) / 2); hullWall(0.08, 3.1, D.z1 + T - dz1, D.x0 - T - 0.05, 1.2, (D.z1 + T + dz1) / 2); hullWall(0.08, 0.7, D.doorW, D.x0 - T - 0.05, 2.4, D.doorZ);
  for (let i = 0; i < 9; i++) box(0.05, h + 0.6, 0.06, M.hullDark, x0 - E + 0.3 + i * ((x1 - x0 + 2 * E - 0.6) / 8), h / 2, z1 + E, ext); // exterior ribs
  box(1.6, 0.5, 1.1, M.hullDark, 2.2, h + 0.6, 0.8, ext, 0.05); cyl(0.05, 0.05, 1.6, M.hullDark, -2.5, h + 1.1, -1.2, ext); cyl(0.5, 0.06, 0.18, M.hull, -2.5, h + 1.95, -1.2, ext, 24);
  const legs = []; for (const lx of [x0 - 0.1, -1.5, 1.5, x1 + 0.1]) for (const lz of [z0 - 0.1, z1 + 0.1]) legs.push([lx, lz]);
  for (const lz of [D.z0 + 0.12, D.z1 - 0.12]) legs.push([D.x0 + 0.2, lz]); // (realism review) airlock supports sit under the airlock floor, not at the room's wider z extents where they stood free
  // ramp from the outer door down to the ground; its far end height is set by placeOnTerrain()
  const ramp = new THREE.Group(); ramp.position.set(D.x0 - T - 0.1, 0, D.doorZ); ext.add(ramp);
  const RAMP_LEN = 4.6;
  const rampDeck = box(RAMP_LEN, 0.06, 1.5, M.hullDark, -RAMP_LEN / 2, -0.03, 0, ramp); void rampDeck;
  for (let i = 0; i < 12; i++) box(0.04, 0.02, 1.4, M.steel, -0.25 - i * 0.37, 0.01, 0, ramp);
  for (const s of [-0.74, 0.74]) { box(RAMP_LEN, 0.04, 0.04, M.steel, -RAMP_LEN / 2, 0.95, s, ramp); for (let i = 0; i < 4; i++) box(0.035, 0.95, 0.035, M.steel, -0.3 - i * 1.35, 0.475, s, ramp); }

  // Batch within moving assemblies without baking their animated parent transform.
  mergeStatic(innerDoor); mergeStatic(outerDoor); mergeStatic(ramp);
  const mergedBuckets = mergeStatic(g, (o) => o === innerDoor || o === outerDoor || o === ramp || o === chair || screens.includes(o)); void mergedBuckets;

  /** Seat the habitat on the real DTM: level floor above the highest ground under the footprint, legs down to ground. */
  function placeOnTerrain(groundY) {
    let top = -1e9; for (let x = D.x0 - 0.5; x <= x1 + 0.5; x += 0.5) for (let z = z0 - 0.5; z <= z1 + 0.5; z += 0.5) top = Math.max(top, groundY(x, z));
    const floorY = top + 0.62; g.position.set(0, floorY, 0);
    for (const [lx, lz] of legs) { const gy = groundY(lx, lz) - floorY, len = -0.3 - gy; cyl(0.07, 0.07, len, M.hullDark, lx, -0.3 - len / 2, lz, ext, 10); cyl(0.22, 0.26, 0.06, M.hullDark, lx, gy + 0.03, lz, ext, 14); }
    const drop = floorY - groundY(ramp.position.x - RAMP_LEN, D.doorZ) + 0.02, th = Math.asin(Math.min(0.6, Math.max(0, drop / RAMP_LEN)));
    ramp.rotation.z = th;
    const rampEnd = new THREE.Vector3(ramp.position.x - Math.cos(th) * RAMP_LEN, floorY - Math.sin(th) * RAMP_LEN, D.doorZ);
    return { floorY, rampTop: new THREE.Vector3(ramp.position.x, floorY, D.doorZ), rampEnd, rampSlopeDeg: THREE.MathUtils.radToDeg(th) };
  }

  /** Door animation driven by where the walker is (simplified airlock cycle: never both open). */
  const doorState = { inner: 0, outer: 0, step: 'closed' }; // step: 'closed' | 'inner' | 'cycling' | 'outer' (pressure is not modelled)
  function updateDoors(dt, walkerX) {
    const mid = (D.x0 + D.x1) / 2 - 0.2;
    const wantInner = walkerX !== null && walkerX < x0 + 1.5 && walkerX > mid + 0.75 ? 1 : 0, wantOuter = walkerX !== null && walkerX <= mid + 0.75 && walkerX > D.x0 - 3.2 ? 1 : 0;
    // (realism review) interlock as a sequence: a door may only START opening once the other one is fully closed
    const goInner = doorState.outer > 0 ? 0 : wantInner, goOuter = doorState.inner > 0 ? 0 : wantOuter;
    doorState.inner += Math.sign(goInner - doorState.inner) * Math.min(Math.abs(goInner - doorState.inner), dt * 2.0);
    doorState.outer += Math.sign(goOuter - doorState.outer) * Math.min(Math.abs(goOuter - doorState.outer), dt * 2.0);
    doorState.step = doorState.inner > 0 && doorState.outer > 0 ? 'fault' : doorState.inner > 0 ? (wantOuter ? 'cycling' : 'inner') : doorState.outer > 0 ? (wantInner ? 'cycling' : 'outer') : 'closed';
    const e = (t) => t * t * (3 - 2 * t);
    innerDoor.position.z = D.doorZ + e(doorState.inner) * (D.doorW + 0.08); outerDoor.position.z = D.doorZ + e(doorState.outer) * (D.doorW + 0.08);
  }
  return { group: g, screens, interiorMaterials: interior, placeOnTerrain, updateDoors, doorState, chair, lights, M, obstacles: HABITAT_OBSTACLES };
}
