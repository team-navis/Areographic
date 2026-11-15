import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { assetUrl } from '../util/asset-url.js';

// Static team suit: embedded cloth maps, empty helmet and an independent optical lens.
export async function loadAreographicAstronaut({ anisotropy = 8 } = {}) {
  const url = assetUrl('/models/areographic/integrated-suit.glb');
  const draco = new DRACOLoader().setDecoderPath(assetUrl('/draco/'));
  let gltf;
  try { gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(url); }
  finally { draco.dispose(); }

  const group = new THREE.Group(); group.name = 'astronaut-areographic';
  const model = new THREE.Group(); model.add(gltf.scene); model.rotation.y = Math.PI;
  const bounds = new THREE.Box3().setFromObject(model);
  const rawSize = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = 1.9 / rawSize.y;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  group.add(model);

  const materials = new Set(); let triangles = 0;
  model.traverse((object) => {
    if (!object.isMesh) return;
    const slots = Array.isArray(object.material) ? object.material : [object.material];
    // A transmissive lens must not cast an opaque silhouette into its own helmet.
    object.castShadow = !slots.every((m) => m.transmission > 0);
    object.receiveShadow = true;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    for (const material of slots) {
      materials.add(material);
      // Keep GLTFLoader's PBR factors, normal orientation and map color spaces.
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        if (material[key]) material[key].anisotropy = Math.min(8, anisotropy);
      }
    }
    // These materials belong only to this suit. Preserve their room-light shader
    // hooks when the landing-screen hover code adjusts the original color.
    if (!Array.isArray(object.material)) {
      object.userData.hoverOwn = true;
      object.userData.baseColor = object.material.color.clone();
    }
  });
  const hit = new THREE.Mesh(new THREE.BoxGeometry(.85, 1.95, .75), new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'hit-astronaut'; hit.position.y = .98; group.add(hit);
  return { group, model, hit, materials: [...materials], info: {
    kind: 'areographic', source: url, rawSize: rawSize.toArray(), scale, triangles,
    skinnedMeshes: 0, animations: gltf.animations.length,
    pose: 'static standing suit; no face, rig, walk cycle or seated animation',
  } };
}
