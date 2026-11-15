import * as THREE from 'three';
import { assetUrl } from '../util/asset-url.js';
import { ph, loadImage, rng, deferTask } from '../util/tex.js';

/**
 * Real observed terrain (see public/data/jezero/terrain.json and docs/stage1-data-assets.md):
 *  - near field: HiRISE 1 m DTM + 25 cm orthomosaic window (640 m x 640 m)
 *  - far field : CTX 20 m DTM + 6 m orthomosaic window (8 km x 8 km)
 * Presentation-only detail (NOT observations): colour tint of the panchromatic orthos, tiled ground
 * detail texture, scattered rocks, sky dome and haze.
 * World frame: x = local east (m), z = -local north (m), y = elevation - origin elevation (m).
 */
export async function loadTerrain({ lod = 1 } = {}) { // lod > 1 (lite mode, no GPU acceleration): the same height grid drawn with every lod-th vertex
  const meta = await (await fetch(assetUrl('/data/jezero/terrain.json'))).json();
  const [nb, fb, nearImg] = await Promise.all([
    fetch(assetUrl('/data/jezero/' + meta.near.dtm.file)).then((r) => r.arrayBuffer()),
    fetch(assetUrl('/data/jezero/' + meta.far.dtm.file)).then((r) => r.arrayBuffer()),
    loadImage(assetUrl('/data/jezero/hirise_ortho_25cm_2560.jpg')), // the 6 m CTX ortho (outdoor far field only) is deferred, see farMat below
  ]);
  // Height grids ship as 16-bit integers (elevation_m = offset_m + q * scale_m, little-endian; tools/terrain/quantize_dtm.py). Step 1.3 mm (1 m grid) / 12 mm (20 m grid).
  const heights = (buf, d, n) => { if (buf.byteLength !== n * n * 2) throw new Error(`height grid ${d.file}: ${buf.byteLength} bytes, expected ${n * n * 2}`); const v = new DataView(buf), z = new Float32Array(n * n); for (let i = 0; i < z.length; i++) z[i] = d.offset_m + v.getUint16(i * 2, true) * d.scale_m; return z; };
  const near = { z: heights(nb, meta.near.dtm, meta.near.n), n: meta.near.n, gsd: meta.near.gsd_m, x0: meta.near.x_min, y1: meta.near.y_max };
  const far = { z: heights(fb, meta.far.dtm, meta.far.n), n: meta.far.n, gsd: meta.far.gsd_m, x0: meta.far.x_min, y1: meta.far.y_max };
  const L = meta.local_frame, k = L.cos_lat0, h0 = L.origin_elev_hirise_dtm;

  // ---- coordinate transforms (single source of truth, shared by 3D world and PAD map) ----
  const toWorld = (xEqc, yEqc) => ({ x: (xEqc - L.origin_x_eqc) * k, z: -(yEqc - L.origin_y_eqc) });
  const toEqc = (x, z) => ({ X: x / k + L.origin_x_eqc, Y: -z + L.origin_y_eqc });
  function sample(grid, X, Y) { // bilinear; pixel-is-area => centre of pixel (c, r) at x0 + (c + .5) * gsd
    const fc = (X - grid.x0) / grid.gsd - 0.5, fr = (grid.y1 - Y) / grid.gsd - 0.5;
    const c = Math.floor(fc), r = Math.floor(fr);
    if (c < 0 || r < 0 || c >= grid.n - 1 || r >= grid.n - 1) return null;
    const u = fc - c, v = fr - r, n = grid.n, z = grid.z;
    return z[r * n + c] * (1 - u) * (1 - v) + z[r * n + c + 1] * u * (1 - v) + z[(r + 1) * n + c] * (1 - u) * v + z[(r + 1) * n + c + 1] * u * v;
  }
  /** Ground height in world metres. Returns {y, source} so callers can tell 1 m from 20 m data. */
  function ground(x, z) {
    const { X, Y } = toEqc(x, z);
    let h = sample(near, X, Y); if (h !== null) return { y: h - h0, source: 'HiRISE 1 m' };
    h = sample(far, X, Y); if (h !== null) return { y: h - h0, source: 'CTX 20 m' };
    return { y: 0, source: 'none' };
  }
  const groundY = (x, z) => ground(x, z).y;

  const group = new THREE.Group(); group.name = 'terrain';
  const tint = (img, lo, hi, gamma) => { // panchromatic ortho -> tinted albedo (presentation tint, not a colour observation)
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    // perf: the input is one byte per pixel, so the ramp is a 256-entry table (same values as computing pow() for each of the 6.5 M pixels)
    const R = new Uint8ClampedArray(256), G = new Uint8ClampedArray(256), B = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) { const t = Math.pow(v / 255, gamma); R[v] = lo[0] + (hi[0] - lo[0]) * t; G[v] = lo[1] + (hi[1] - lo[1]) * t; B[v] = lo[2] + (hi[2] - lo[2]) * t; }
    for (let i = 0; i < p.length; i += 4) { const v = p[i]; p[i] = R[v]; p[i + 1] = G[v]; p[i + 2] = B[v]; }
    g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return { tex: t, canvas: c };
  };
  // Colour policy (docs/stage3-v02-field.md 2-2): approximate natural colour, not an observation. The orthos are panchromatic; this ramp only sets a tan-brown
  // soil tone whose relation to rock and sky was eyeballed against the same-site Mastcam-Z view PIA26401 (its caption does not state the colour processing).
  const LO = [60, 45, 36], HI = [208, 174, 142];
  const nearTint = tint(nearImg, LO, HI, 0.95);

  function grid(g, hole) {
    const n = g.n, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c, w = toWorld(g.x0 + (c + 0.5) * g.gsd, g.y1 - (r + 0.5) * g.gsd);
      let y = g.z[i] - h0;
      if (hole && w.x > hole.x0 && w.x < hole.x1 && w.z > hole.z0 && w.z < hole.z1) y -= 6; // far mesh sinks under the 1 m window
      pos[i * 3] = w.x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = w.z; uv[i * 2] = (c + 0.5) / n; uv[i * 2 + 1] = 1 - (r + 0.5) / n;
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6); let j = 0;
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const a = r * n + c, b = a + 1, d = a + n, e = d + 1; idx[j++] = a; idx[j++] = d; idx[j++] = b; idx[j++] = b; idx[j++] = d; idx[j++] = e; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    if (lod > 1) { const q = []; for (let r = 0; r < n - 1; r += lod) for (let c = 0; c < n - 1; c += lod) { const r2 = Math.min(r + lod, n - 1), c2 = Math.min(c + lod, n - 1), a = r * n + c, b = r * n + c2, d = r2 * n + c, e = r2 * n + c2; q.push(a, d, b, b, d, e); } geo.setIndex(q); } // normals keep the full-resolution shading
    return geo;
  }
  const nw = toWorld(near.x0, near.y1), se = toWorld(near.x0 + near.n * near.gsd, near.y1 - near.n * near.gsd);
  const bounds = { x0: nw.x, x1: se.x, z0: nw.z, z1: se.z };
  const m = 24; // margin so the sunk area stays hidden behind the 1 m mesh edge

  // Load order: outdoor-only maps start as 1 px stand-ins (mean colour / flat normal) and are swapped in right after the landing view appears.
  const FLAT_NORMAL = [128, 128, 255];
  const detailDiff = ph('red_laterite_soil_stones_diff', { srgb: true, defer: [102, 63, 47] }), detailNor = ph('red_laterite_soil_stones_nor', { defer: FLAT_NORMAL });
  const nearMat = new THREE.MeshStandardMaterial({ map: nearTint.tex, roughness: 0.96, metalness: 0, normalMap: detailNor, normalScale: new THREE.Vector2(0.4, 0.4) }); // Earth soil normal (Poly Haven red_laterite): kept only as subtle near-field grain, not as geology
  nearMat.onBeforeCompile = (sh) => { // tiled micro detail fades out with distance; purely presentational
    sh.uniforms.detailMap = { value: detailDiff };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nvarying vec3 vWp;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dd = distance(vWp, cameraPosition); float df = 1.0 - smoothstep(6.0, 70.0, dd);
        vec3 det = texture2D(detailMap, vWp.xz * 0.45).rgb; float dl = dot(det, vec3(0.333)) / 0.22;
        vec3 det2 = texture2D(detailMap, vWp.xz * 0.061).rgb; float dl2 = dot(det2, vec3(0.333)) / 0.22;
        diffuseColor.rgb *= mix(1.0, clamp(dl, 0.55, 1.5), df * 0.85) * mix(1.0, clamp(dl2, 0.7, 1.3), 0.5);`)
      .replace('#include <normal_fragment_maps>', `vec2 dUv = vWp.xz * 0.45; vec3 mapN = texture2D(normalMap, dUv).xyz * 2.0 - 1.0; mapN.xy *= normalScale * (1.0 - smoothstep(6.0, 60.0, distance(vWp, cameraPosition)));
        vec3 dnT = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz); dnT = normalize(dnT - normal * dot(normal, dnT)); vec3 dnB = cross(normal, dnT); normal = normalize(dnT * mapN.x + dnB * mapN.y + normal * mapN.z);`);
  };
  // Perf: one 817k-triangle mesh can never be frustum-culled. Split each grid into tiles that share the vertex buffers
  // (normals are computed on the whole grid first, so there are no seams) and let three.js cull tiles outside the view.
  function tiled(geo, n, per, mat, name, receive) {
    const holder = new THREE.Group(); holder.name = name; const pos = geo.attributes.position, box = new THREE.Box3(), v = new THREE.Vector3();
    for (let r0 = 0; r0 < n - 1; r0 += per) for (let c0 = 0; c0 < n - 1; c0 += per) {
      const r1 = Math.min(n - 1, r0 + per), c1 = Math.min(n - 1, c0 + per), idx = new Uint32Array((r1 - r0) * (c1 - c0) * 6); let j = 0;
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) { const a = r * n + c, b = a + 1, d = a + n, e = d + 1; idx[j++] = a; idx[j++] = d; idx[j++] = b; idx[j++] = b; idx[j++] = d; idx[j++] = e; }
      box.makeEmpty(); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) box.expandByPoint(v.fromBufferAttribute(pos, r * n + c));
      const g = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, geo.attributes[k]); g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.boundingBox = box.clone(); g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = receive; mesh.name = name + '-tile'; holder.add(mesh);
    }
    geo.setIndex(null); return holder;
  }
  const nearMesh = tiled(grid(near), near.n, 64, nearMat, 'terrain-hirise-1m', true);
  // Far field: until the CTX ortho arrives the 20 m mesh shows the mean of its tinted image (158, 134, 113), never black.
  const farHold = document.createElement('canvas'); farHold.width = farHold.height = 1; { const g = farHold.getContext('2d'); g.fillStyle = 'rgb(158,134,113)'; g.fillRect(0, 0, 1, 1); }
  const farHoldTex = new THREE.CanvasTexture(farHold); farHoldTex.colorSpace = THREE.SRGBColorSpace;
  const farMat = new THREE.MeshStandardMaterial({ map: farHoldTex, roughness: 1, metalness: 0 });
  deferTask('ctx_ortho_6m', async () => { const img = await loadImage(assetUrl('/data/jezero/ctx_ortho_6m.jpg')); farMat.map = tint(img, [72, 56, 47], [214, 184, 156], 0.95).tex; farHoldTex.dispose(); }); // distant terrain slightly paler / less saturated than the near soil
  const farMesh = tiled(grid(far, { x0: bounds.x0 + m, x1: bounds.x1 - m, z0: bounds.z0 + m, z1: bounds.z1 - m }), far.n, 80, farMat, 'terrain-ctx-20m', false);
  group.add(nearMesh, farMesh);

  // ---- sky dome + haze (procedural; no observed sky data) ----
  const sunDir = new THREE.Vector3(-0.78, 0.5, 0.36).normalize(); // afternoon sun from the west, matching the shading baked in the orthos
  const horizon = new THREE.Color(0xd6c0a6), zenith = new THREE.Color(0x998878); // paler, less orange than the soil so sky and ground separate (setting, not observed sky data)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sunDir: { value: sunDir }, horizon: { value: horizon }, zenith: { value: zenith } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 sunDir, horizon, zenith;
      void main(){ vec3 d = normalize(vD); float h = clamp(d.y, -0.2, 1.0);
        vec3 c = mix(horizon, zenith, pow(smoothstep(0.0, 0.85, h), 0.55)); c = mix(c, horizon * 0.82, smoothstep(0.0, -0.15, h));
        float s = max(dot(d, sunDir), 0.0); c += vec3(0.75, 0.85, 1.0) * (pow(s, 600.0) * 6.0 + pow(s, 24.0) * 0.22) + horizon * pow(s, 4.0) * 0.18;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.name = 'sky'; sky.renderOrder = -10; sky.frustumCulled = false; group.add(sky);
  const fog = new THREE.FogExp2(horizon.clone().multiplyScalar(0.95), 0.00011);

  // ---- scattered rocks (presentation only; positions are procedural, not mapped rocks) ----
  function addRocks(route, exclude) {
    const r = rng(20261114), diff = ph('rock_face_diff', { srgb: true, defer: [98, 70, 50] }), nor = ph('rock_face_nor', { defer: FLAT_NORMAL });
    const mat = new THREE.MeshStandardMaterial({ map: diff, normalMap: nor, roughness: 0.95, color: new THREE.Color(1.5, 1.24, 1.06) }); // greyer and a little lighter than the soil (presentation rocks; relation eyeballed against PIA26401)
    const shape = (v, detail) => {
      const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, rv = rng(77 + v * 13), ph_ = [rv() * 6, rv() * 6, rv() * 6];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        let d = 1 + 0.22 * Math.sin(3.1 * x + ph_[0]) * Math.sin(2.7 * y + ph_[1]) + 0.16 * Math.sin(5.3 * z + ph_[2]) * Math.cos(4.1 * x) + 0.07 * Math.sin(11 * y + 7 * x);
        const fy = y < -0.25 ? -0.25 + (y + 0.25) * 0.3 : y; // flattened base
        p.setXYZ(i, x * d * (1 + 0.25 * v % 2), fy * d * 0.62, z * d);
      }
      g.computeVertexNormals(); return g;
    };
    // Perf + honesty (rendering review §5): fewer rocks, clearly presentation. Small ones (the majority) use an 80-triangle shape and cast no shadow;
    // only rocks larger than 14 cm keep the 320-triangle shape and cast. Same fixed seed, so the layout is stable between loads.
    const variants = [0, 1, 2, 3].map((v) => shape(v, 2)), small = [0, 1, 2, 3].map((v) => shape(v, 1)), BIG = 0.14;
    const N = 1100, per = Math.ceil(N / variants.length), dummy = new THREE.Object3D();
    const mk = (g, cast) => { const im = new THREE.InstancedMesh(g, mat, per); im.castShadow = cast; im.receiveShadow = true; im.name = 'rocks-procedural'; group.add(im); return im; };
    const meshes = [...variants.map((g) => mk(g, true)), ...small.map((g) => mk(g, false))];
    const counts = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      const p = route[Math.floor(r() * route.length)], ang = r() * 6.283, dist = 1.6 + Math.pow(r(), 1.5) * 60;
      const x = p.x + Math.cos(ang) * dist, z = p.z + Math.sin(ang) * dist;
      if (exclude(x, z)) continue;
      const s = 0.035 + Math.pow(r(), 4.2) * 0.5, v = (i % variants.length) + (s >= BIG ? 0 : 4);
      dummy.position.set(x, groundY(x, z) - s * 0.08, z); dummy.rotation.set((r() - 0.5) * 0.3, r() * 6.283, (r() - 0.5) * 0.3); dummy.scale.set(s * (0.8 + r() * 0.6), s * (0.7 + r() * 0.5), s * (0.8 + r() * 0.6)); dummy.updateMatrix();
      meshes[v].setMatrixAt(counts[v]++, dummy.matrix);
    }
    meshes.forEach((im, v) => { im.count = counts[v]; im.instanceMatrix.needsUpdate = true; });
    return counts.reduce((a, b) => a + b, 0);
  }

  return { meta, group, ground, groundY, toWorld, toEqc, bounds, sunDir, fog, horizon, near, far, nearCanvas: nearTint.canvas, nearImg, h0, k, addRocks, mats: [nearMat, farMat] };
}
