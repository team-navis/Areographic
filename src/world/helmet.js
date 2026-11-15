import * as THREE from 'three';
import { ph, rng } from '../util/tex.js';

/** Fictional first-person helmet interior, not a reconstruction of the Mark III. */
export function buildHelmetInterior() {
  const g = new THREE.Group(); g.name = 'helmet-interior'; g.visible = false;
  const frame = new THREE.Group(); frame.name = 'helmet-aperture'; g.add(frame);
  const fabric = ph('fabric_pattern_07_nor', { repeat: [18, 3] });
  const pad = new THREE.MeshStandardMaterial({ color: 0x454942, roughness: .96, side: THREE.DoubleSide,
    normalMap: fabric, normalScale: new THREE.Vector2(.18, .18), emissive: 0x1b211c, emissiveIntensity: .12 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x202622, roughness: .82, side: THREE.DoubleSide,
    emissive: 0x111813, emissiveIntensity: .12 });
  const lip = new THREE.MeshStandardMaterial({ color: 0x8b918a, roughness: .38, metalness: .86, side: THREE.DoubleSide });
  const fastener = new THREE.MeshStandardMaterial({ color: 0x555e59, roughness: .31, metalness: .92 });
  const recess = new THREE.MeshBasicMaterial({ color: 0x0c100e });

  // Fine linear roughness breaks up the rim highlight without painted scratches.
  const brush = document.createElement('canvas'); brush.width = 256; brush.height = 64;
  const brushContext = brush.getContext('2d'), random = rng(217);
  brushContext.fillStyle = '#e7e7e7'; brushContext.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 160; i++) {
    const v = 184 + Math.floor(random() * 65); brushContext.fillStyle = `rgb(${v},${v},${v})`;
    brushContext.fillRect(random() * 256, random() * 64, 15 + random() * 120, .5);
  }
  const brushed = new THREE.CanvasTexture(brush); brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping; brushed.repeat.set(10, 1);
  lip.roughnessMap = brushed; fastener.roughnessMap = brushed;

  // Shape is described in screen-tangent space, then wrapped around the eye.
  // All geometry remains in front of the 3 cm camera near plane; no full torus
  // passes behind the eye. The opening stays clear as the viewport changes.
  const N = 160, XH = .98, YU = .555, YD = .515, exponent = 2 / 3.25;
  const point = (a, k, radius, padding = false) => {
    const cx = Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** exponent;
    const sy = Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** exponent;
    const depth = radius + (padding ? Math.sin(a * 8) ** 2 * .0018 : 0);
    return new THREE.Vector3(cx * XH * k, sy * (sy > 0 ? YU : YD) * k, -1).normalize().multiplyScalar(depth);
  };
  function band(name, rings, material, padding = false) {
    const positions = [], uvs = [], indices = [], count = rings.length;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j < count; j++) {
        const p = point(i / N * Math.PI * 2, rings[j][0], rings[j][1], padding);
        positions.push(p.x, p.y, p.z); uvs.push(i / N, j / (count - 1));
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < count - 1; j++) {
      const a = i * count + j, b = a + count; indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; frame.add(mesh); return mesh;
  }
  function piping(name, k, radius, thickness, material, start = 0, length = Math.PI * 2) {
    const closed = Math.abs(length - Math.PI * 2) < .001;
    const points = Array.from({ length: closed ? N : 81 }, (_, i) => point(start + i / (closed ? N : 80) * length, k, radius));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed), closed ? 240 : 120, thickness, 6, closed), material);
    mesh.name = name; frame.add(mesh); return mesh;
  }
  band('inner-rubber-seal', [[1, .257], [1.025, .255], [1.054, .249]], rubber);
  band('machined-visor-retainer', [[1.045, .252], [1.073, .250], [1.105, .244]], lip);
  band('segmented-comfort-padding', [[1.095, .242], [1.22, .238], [1.46, .226], [2.2, .212], [3.3, .205]], pad, true);
  piping('seal-bead', 1.015, .254, .0016, rubber);
  piping('retainer-inner-edge', 1.045, .250, .00065, lip);
  piping('padding-welt', 1.24, .235, .00125, rubber);

  // Individual stitch segments and pad joints read as construction, not stripes.
  const stitchPositions = [];
  for (let i = 0; i < 144; i++) {
    const a = i / 144 * Math.PI * 2;
    for (const offset of [0, .016]) { const p = point(a + offset, 1.25, .2335); stitchPositions.push(p.x, p.y, p.z); }
  }
  const stitchGeometry = new THREE.BufferGeometry(); stitchGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stitchPositions, 3));
  const stitches = new THREE.LineSegments(stitchGeometry, new THREE.LineBasicMaterial({ color: 0x8a8d7f, transparent: true, opacity: .75 }));
  stitches.name = 'padding-stitches'; frame.add(stitches);
  for (let i = 0; i < 12; i++) {
    const a = (i + .5) / 12 * Math.PI * 2, points = [point(a, 1.27, .233), point(a, 1.44, .223), point(a, 1.8, .216)];
    const seam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, .0006, 5), rubber);
    seam.name = 'padding-panel-seam'; frame.add(seam);
  }

  const screwCount = 18, screws = new THREE.InstancedMesh(new THREE.CylinderGeometry(.00165, .00165, .0009, 10), fastener, screwCount);
  const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(.002, .00035, .00015), recess, screwCount);
  const transform = new THREE.Object3D(), axisY = new THREE.Vector3(0, 1, 0), axisZ = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < screwCount; i++) {
    const a = (i + .5) / screwCount * Math.PI * 2, p = point(a, 1.077, .2475), towardEye = p.clone().negate().normalize();
    transform.position.copy(p); transform.quaternion.setFromUnitVectors(axisY, towardEye); transform.updateMatrix(); screws.setMatrixAt(i, transform.matrix);
    transform.position.copy(p).addScaledVector(towardEye, .00055); transform.quaternion.setFromUnitVectors(axisZ, towardEye); transform.updateMatrix(); slots.setMatrixAt(i, transform.matrix);
  }
  screws.name = 'retainer-fasteners'; slots.name = 'fastener-slots'; frame.add(screws, slots);
  // Only the forward lower collar is visible; its fasteners never cross the eye.
  piping('lower-collar-gasket', 1.16, .237, .0032, rubber, Math.PI + .18, Math.PI - .36);
  piping('lower-collar-lip', 1.19, .234, .0013, lip, Math.PI + .25, Math.PI - .5);

  // Clear visor: reflection is restricted to peripheral highlights. No dirt or
  // full-screen haze is painted over terrain and the HUD remains an independent UI.
  const reflectionCanvas = document.createElement('canvas'); reflectionCanvas.width = 512; reflectionCanvas.height = 256;
  const reflectionContext = reflectionCanvas.getContext('2d');
  for (const [x, y, radius] of [[30, 24, 110], [500, 65, 87]]) {
    const gradient = reflectionContext.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(207,229,216,.32)'); gradient.addColorStop(.45, 'rgba(207,229,216,.10)'); gradient.addColorStop(1, 'rgba(207,229,216,0)');
    reflectionContext.fillStyle = gradient; reflectionContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const reflectionMap = new THREE.CanvasTexture(reflectionCanvas); reflectionMap.colorSpace = THREE.SRGBColorSpace;
  const glassMaterial = new THREE.MeshBasicMaterial({ map: reflectionMap, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const glassPositions = [], glassUVs = [], glassIndices = [], cols = 32, rows = 20;
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) {
    const p = new THREE.Vector3((x / cols * 2 - 1) * 1.15, (y / rows * 2 - 1) * .69, -1).normalize().multiplyScalar(.265);
    glassPositions.push(p.x, p.y, p.z); glassUVs.push(x / cols, y / rows);
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const a = y * (cols + 1) + x, b = a + cols + 1; glassIndices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const glassGeometry = new THREE.BufferGeometry(); glassGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glassPositions, 3)); glassGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(glassUVs, 2)); glassGeometry.setIndex(glassIndices);
  const glass = new THREE.Mesh(glassGeometry, glassMaterial); glass.name = 'clear-visor-edge-reflection'; frame.add(glass);

  g.traverse((o) => { if (o.isMesh || o.isLineSegments) { o.renderOrder = o === glass ? 51 : 50; o.frustumCulled = false; o.userData.helmetInterior = true; } });
  const referenceTan = Math.tan(THREE.MathUtils.degToRad(62 / 2));
  function update(camera) {
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / referenceTan;
    frame.scale.set(tangent * Math.max(1, camera.aspect / (16 / 9)), tangent, 1);
  }
  return { group: g, materials: [pad, rubber, lip, fastener], update };
}
