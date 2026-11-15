import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// Room-scale contact occlusion. The outdoor terrain and visor keep the direct
// renderer; their kilometre-scale depth and transparent optics need no room AO.
class HabitatAO extends GTAOPass {
  renderOverride(renderer, ...args) {
    // The colour pass already updated the lights' maps. The depth/normal pass
    // must neither regenerate those shadows nor record its visibility exclusions.
    const { autoUpdate, needsUpdate } = renderer.shadowMap;
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
    try { super.renderOverride(renderer, ...args); }
    finally { renderer.shadowMap.autoUpdate = autoUpdate; renderer.shadowMap.needsUpdate = needsUpdate; }
  }
  overrideVisibility() {
    super.overrideVisibility();
    this.scene.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (object.userData.contactShadow || materials.every((m) => !m.visible || m.transparent || m.transmission > 0)) object.visible = false;
    });
    // Perf: the room AO needs depth/normals of the room only. Outdoor groups (1.4M terrain triangles, rocks, rover)
    // were re-rendered every frame for an effect that cannot reach them; hide them for this pass (restoreVisibility puts them back).
    for (const object of this.outdoor ?? []) object.visible = false;
  }
  setSize(width, height) {
    // Denoised AO needs fewer pixels than the colour pass; keep text and edges sharp.
    // Perf: half resolution (was .75) — AO is low-frequency and is denoised and bilinearly upsampled anyway.
    super.setSize(Math.max(1, Math.round(width * .5)), Math.max(1, Math.round(height * .5)));
  }
}

export function createHabitatRenderer(renderer, scene, camera, { outdoor = [] } = {}) {
  renderer.info.autoReset = false;
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new HabitatAO(scene, camera, 1, 1, undefined,
    { radius: .35, thickness: .7, distanceFallOff: 1, samples: 8, scale: 1, screenSpaceRadius: false }, // perf: 8 samples (was 16)
    { radius: 5, depthPhi: 3, normalPhi: 5, lumaPhi: 8, samples: 12 }); // perf: 12 denoise taps (was 16)
  ao.blendIntensity = .55; ao.outdoor = outdoor;
  composer.addPass(ao);
  const output = new OutputPass(); composer.addPass(output);
  // MSAA resolves geometry; this last pass also softens subpixel metal highlights
  // and AO edges. Detailed monitor input remains a sharp native DOM overlay.
  const antialias = new ShaderPass(FXAAShader); composer.addPass(antialias);
  const resize = (width, height) => {
    const ratio = Math.min(renderer.getPixelRatio(), 1.25); // perf: was 1.5; the room is fill-bound on retina (MSAA x4 + area lights + AO). One-line knob.
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    antialias.uniforms.resolution.value.set(1 / (width * ratio), 1 / (height * ratio));
  };
  resize(innerWidth, innerHeight);
  return {
    ao, composer, antialias,
    resize,
    render(interior, dt) {
      renderer.info.reset();
      if (interior) composer.render(dt);
      else renderer.render(scene, camera);
    },
    dispose() {
      ao.dispose(); ao.gtaoMaterial.dispose(); ao.blendMaterial.dispose();
      output.dispose(); antialias.dispose(); composer.dispose();
    },
  };
}
