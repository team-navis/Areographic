import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Merge static meshes under `root` into one mesh per material (cuts draw calls and shadow passes). */
export function mergeStatic(root, skip = () => false) {
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || !o.material.isMeshStandardMaterial && !o.material.isMeshBasicMaterial) return;
    for (let p = o; p && p !== root; p = p.parent) if (skip(p)) return;
    if (o.material.visible === false || o.material.transparent || !o.geometry.attributes.uv || !o.geometry.attributes.normal) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid + (o.castShadow ? 'c' : 'n'); if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] }); buckets.get(key).geos.push(g); remove.push(o);
  });
  remove.forEach((o) => o.parent.remove(o));
  for (const b of buckets.values()) { const m = new THREE.Mesh(mergeGeometries(b.geos, false), b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv; m.name = 'merged'; root.add(m); b.geos.forEach((g) => g.dispose()); }
  return buckets.size;
}
