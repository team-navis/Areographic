import * as THREE from 'three';
import { assetUrl } from '../util/asset-url.js';

/**
 * One measured terrain patch beside the route (rendering review step 5): Mars 2020 Navcam ops mesh
 * NLG_1176_0771346345M727RAS_N0530130SCAM06176_0A01LLJ01 (NAVCAM_LEFT, sol 1176, rover at site 53 / drive 130;
 * NASA/JPL-Caltech, PDS Imaging Node), decimated by tools/terrain/build_route_mesh.py.
 *
 * Placement: vertices are metres in SITE_FRAME 53 (+X north, +Y east, +Z down) whose origin is the M20 waypoint
 * site 53 / drive 0, so the patch is placed from that waypoint (horizontal agreement checked to about 1-2 m).
 * Height: a constant shift puts it on the 1 m DTM and the rim (0.8 m from the mesh boundary) is bent to the DTM
 * and faded out. That part is presentation, not measurement. The image is single-band; the tint is 연출.
 * Lazy: only the 1 kB metadata loads at boot; the 1.1 MB mesh + 0.2 MB image load when the crew is within 60 m.
 */
export const ROUTE_MESH = { dir: assetUrl('/data/workspace/'), base: 'navcam_1176_s53', label: '실측 지형 메시 · Navcam · sol 1176 · site 53/130 · 단일 시점' };
export async function loadRouteMesh(terrain, mission) {
  const meta = await (await fetch(ROUTE_MESH.dir + ROUTE_MESH.base + '.json')).json(), o = mission.worldOf(meta.site_origin_key), group = new THREE.Group(); group.name = 'route-mesh'; group.position.set(o.x, 0, o.z);
  const cx = o.x + meta.centre_ne_m[1], cz = o.z - meta.centre_ne_m[0]; let loading = null;
  const api = { group, meta, loaded: false, centre: { x: cx, z: cz }, mesh: null, sign: null, placement: null,
    distanceTo: (x, z) => Math.hypot(x - cx, z - cz),
    ensure() { return loading || (loading = (async () => {
      const buf = await (await fetch(ROUTE_MESH.dir + ROUTE_MESH.base + '.bin')).arrayBuffer(), n = meta.vertices, ned = new Float32Array(buf, 0, n * 3), uv = new Float32Array(buf, n * 12, n * 2), rim = new Float32Array(buf, n * 20, n), index = new Uint32Array(buf, n * 24, meta.triangles * 3);
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('route mesh texture failed')); im.src = ROUTE_MESH.dir + meta.texture.file; });
      const pos = new Float32Array(n * 3), rgba = new Float32Array(n * 4).fill(1), dy = []; for (let i = 0; i < n; i += 5) dy.push(terrain.groundY(o.x + ned[i * 3 + 1], o.z - ned[i * 3]) + ned[i * 3 + 2]); dy.sort((a, b) => a - b);
      const lift = dy[Math.floor(dy.length * 0.9)] + 0.01; // 90th percentile: most of the patch sits just above the DTM surface
      for (let i = 0; i < n; i++) { const x = ned[i * 3 + 1], z = -ned[i * 3], y = -ned[i * 3 + 2] + lift, k = 1 - rim[i], kk = k * k * (3 - 2 * k); pos[i * 3] = x; pos[i * 3 + 2] = z; pos[i * 3 + 1] = y + (terrain.groundY(o.x + x, o.z + z) + 0.004 - y) * kk; rgba[i * 4 + 3] = Math.min(1, rim[i] * 1.6); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4)); geo.setIndex(new THREE.BufferAttribute(index, 1)); geo.computeVertexNormals();
      const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true;
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, side: THREE.DoubleSide, vertexColors: true, alphaHash: true, color: new THREE.Color(1.12, 0.93, 0.77) })); mesh.receiveShadow = true; mesh.name = 'route-mesh-surface'; group.add(mesh); // grey image -> soil tint (연출)
      const c = document.createElement('canvas'); c.width = 760; c.height = 100; const g = c.getContext('2d'); g.fillStyle = 'rgba(3,9,5,.9)'; g.fillRect(0, 0, 760, 100); g.textBaseline = 'middle'; g.font = '600 28px system-ui, "Apple SD Gothic Neo", sans-serif'; g.fillStyle = '#e4ffe9'; g.fillText(ROUTE_MESH.label, 16, 30); g.font = '22px system-ui, "Apple SD Gothic Neo", sans-serif'; g.fillStyle = '#8cff9e'; g.fillText('NASA/JPL-Caltech · 단색 영상(착색은 연출) · 가장자리는 지형에 맞춤', 16, 72);
      const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace; const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, toneMapped: false, depthTest: false, transparent: true, sizeAttenuation: false })); sign.scale.set(0.36, 0.36 * 100 / 760, 1); sign.position.set(meta.centre_ne_m[1], terrain.groundY(cx, cz) + 1.1, -meta.centre_ne_m[0]); sign.renderOrder = 8; sign.visible = false; group.add(sign);
      api.mesh = mesh; api.sign = sign; api.placement = { liftM: lift, dtmSpreadM: dy[Math.floor(dy.length * 0.95)] - dy[Math.floor(dy.length * 0.05)] }; api.loaded = true; return true; })()); },
    /** Per frame in the HUD: load when near, show the source label only when close and looking at the patch. */
    update(camera, hudOn) { const d = api.distanceTo(camera.position.x, camera.position.z); if (!api.loaded) { if (d < 60) api.ensure(); return; } if (!api.sign) return; const v = new THREE.Vector3(cx - camera.position.x, 0, cz - camera.position.z).normalize(), f = camera.getWorldDirection(new THREE.Vector3()); api.sign.visible = !!hudOn && d < 14 && f.dot(v) > 0.8; },
  };
  return api;
}
