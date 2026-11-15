import * as THREE from 'three';

/**
 * Sample collection motion (2026-11-15 user request): a gloved hand brings a scoop into view, the view tips down to the dig spot, the scoop
 * digs (dust), lifts the soil, tips it into a sample tube and the tube is stowed. A small pit and spoil heap stay on the ground.
 * Procedural stand-ins for the demo only: not a model of real Mars 2020 / EVA sampling tools or procedure.
 */
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const seg = (t, a, b) => ease((t - a) / (b - a));
const DUR = 3.6;

export function createSampleScoop(scene, terrain) {
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ced2, metalness: .85, roughness: .32, side: THREE.DoubleSide });
  const glove = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: .85 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: .7 });
  const soilM = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 1 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, metalness: .1, roughness: .15, transparent: true, opacity: .55 });
  const cap = new THREE.MeshStandardMaterial({ color: 0xe36a1e, roughness: .5 });

  // hand + scoop (local: +z toward the scoop head, the handle along z)
  const tool = new THREE.Group(); tool.visible = false; scene.add(tool);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, .26, 14), glove); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = -.22; tool.add(sleeve);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(.055, 14, 10), glove); hand.scale.set(1, .8, 1.25); hand.position.z = -.06; tool.add(hand);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(.06, .012, 8, 18), grip); cuff.position.z = -.12; tool.add(cuff);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, .26, 10), metal); handle.rotation.x = Math.PI / 2; handle.position.z = .1; tool.add(handle);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.05, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal); head.rotation.x = Math.PI; head.scale.set(1, .55, 1.35); head.position.z = .26; tool.add(head);
  const soil = new THREE.Mesh(new THREE.SphereGeometry(.04, 12, 8), soilM); soil.scale.set(1, .35, 1.2); soil.position.set(0, -.008, .26); soil.visible = false; tool.add(soil);

  // sample tube (other hand)
  const tube = new THREE.Group(); tube.visible = false; scene.add(tube);
  const tubeBody = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .13, 14, 1, true), glass); tube.add(tubeBody);
  const tubeBottom = new THREE.Mesh(new THREE.SphereGeometry(.022, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glass); tubeBottom.position.y = -.065; tube.add(tubeBottom);
  const tubeSoil = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .05, 12), soilM); tubeSoil.position.y = -.045; tubeSoil.visible = false; tube.add(tubeSoil);
  const tubeCap = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .025, 14), cap); tubeCap.position.y = .078; tube.add(tubeCap);
  const hand2 = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), glove); hand2.scale.set(1.1, .9, 1); hand2.position.set(0, -.02, -.03); tube.add(hand2);

  // dust burst
  const N = 70, dustGeo = new THREE.BufferGeometry(), dpos = new Float32Array(N * 3), dvel = new Float32Array(N * 3);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xb7744a, size: .018, transparent: true, opacity: .9, depthWrite: false })); dust.visible = false; dust.frustumCulled = false; scene.add(dust);

  // pits left behind
  const pits = new THREE.Group(); scene.add(pits);
  const pitM = new THREE.MeshStandardMaterial({ color: 0x3a1f12, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  function addPit(p) {
    const g = new THREE.Group(); g.position.copy(p);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(.075, 18), pitM); hole.rotation.x = -Math.PI / 2; hole.position.y = .006; g.add(hole);
    const heap = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), soilM); heap.scale.set(1, .32, .8); heap.position.set(.13, .005, .03); g.add(heap);
    pits.add(g);
  }

  let run = null; const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), dig = new THREE.Vector3();
  const local = (cam, x, y, z, out) => out.set(x, y, z).applyQuaternion(cam.quaternion).add(cam.position);

  return {
    get busy() { return !!run; },
    clear() { while (pits.children.length) pits.remove(pits.children[0]); },
    /** Start the motion. `target` = optional world point to dig at (used when it is close); `look` = {yaw, pitch} driven during the motion. */
    start(camera, look, target, onDone, onCancel) {
      if (run) return false;
      const fwd = new THREE.Vector3(-Math.sin(look.yaw), 0, -Math.cos(look.yaw));
      if (target && Math.hypot(target.x - camera.position.x, target.z - camera.position.z) < 3.2) dig.copy(target);
      else dig.copy(camera.position).addScaledVector(fwd, 1.05);
      dig.y = terrain.groundY(dig.x, dig.z);
      const dx = dig.x - camera.position.x, dz = dig.z - camera.position.z, h = Math.hypot(dx, dz);
      run = { t: 0, onDone, pitch0: look.pitch, yaw0: look.yaw, pitchDig: Math.max(-1.1, -Math.atan2(camera.position.y - dig.y, Math.max(h, .3)) + .12), yawDig: Math.atan2(-dx, -dz), dug: false, filled: false, onCancel };
      tool.visible = true; tube.visible = false; soil.visible = false; tubeSoil.visible = false; return true;
    },
    update(dt, camera, look) {
      if (!run) return; const r = run; r.t += dt; const t = r.t;
      // view: tip down to the dig spot, come back up at the end
      const down = seg(t, .1, .9) * (1 - seg(t, 2.9, 3.5)), dy = ((r.yawDig - r.yaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      look.pitch = r.pitch0 + (r.pitchDig - r.pitch0) * down; look.yaw = r.yaw0 + dy * down * .9;
      camera.quaternion.setFromEuler(e.set(look.pitch, look.yaw, 0)); camera.updateMatrixWorld();
      // tool pose: held (camera space, lower right) <-> at the dig spot (world)
      const held = local(camera, .2, -.2 + (1 - seg(t, 0, .5)) * -.25, -.42, new THREE.Vector3());
      const atDig = tmp.copy(dig).add(new THREE.Vector3(0, .06, 0)).addScaledVector(new THREE.Vector3(camera.position.x - dig.x, 0, camera.position.z - dig.z).normalize(), .26);
      const reach = seg(t, .55, 1.15) * (1 - seg(t, 1.95, 2.45));
      tool.position.copy(held).lerp(atDig, reach);
      q.copy(camera.quaternion); tool.quaternion.copy(q);
      const wig = t > 1.15 && t < 1.95 ? Math.sin((t - 1.15) * 22) * .18 : 0;
      tool.rotateX(-.35 - reach * .55 + wig); tool.rotateY(-.25 * (1 - reach));
      // dig: dust + pit, soil in the scoop
      if (!r.dug && t > 1.2) { r.dug = true; addPit(dig); soil.visible = true; dust.visible = true; for (let i = 0; i < N; i++) { dpos[i * 3] = dig.x; dpos[i * 3 + 1] = dig.y + .02; dpos[i * 3 + 2] = dig.z; const a = Math.random() * Math.PI * 2, s = .15 + Math.random() * .45; dvel[i * 3] = Math.cos(a) * s; dvel[i * 3 + 1] = .4 + Math.random() * .7; dvel[i * 3 + 2] = Math.sin(a) * s; } }
      if (dust.visible) { for (let i = 0; i < N; i++) { dvel[i * 3 + 1] -= 1.6 * dt; for (let k = 0; k < 3; k++) dpos[i * 3 + k] += dvel[i * 3 + k] * dt; } dustGeo.attributes.position.needsUpdate = true; dust.material.opacity = Math.max(0, .9 - (t - 1.2) * .7); if (t > 2.6) dust.visible = false; }
      // tube: comes up on the left, the scoop tips into it, the tube is capped and stowed
      if (t > 2.2) { tube.visible = true; const up = seg(t, 2.2, 2.55), stow = seg(t, 3.05, 3.55);
        local(camera, -.12 + up * .06 - stow * .12, -.32 + up * .17 - stow * .3, -.42, tube.position); tube.quaternion.copy(camera.quaternion); tube.rotateZ(-.25 + stow * .6); }
      if (t > 2.45) { const tip = seg(t, 2.45, 2.85) * (1 - seg(t, 2.95, 3.2)); local(camera, .2 - tip * .18, -.2 + tip * .06, -.42, held); tool.position.copy(held); tool.quaternion.copy(camera.quaternion); tool.rotateX(-.35); tool.rotateZ(tip * 1.2); if (!r.filled && t > 2.8) { r.filled = true; soil.visible = false; tubeSoil.visible = true; } }
      if (t > 3.05) { const out = seg(t, 3.05, 3.5); local(camera, .2 + out * .1, -.2 - out * .35, -.42, held); tool.position.copy(held); }
      if (t >= DUR) { tool.visible = false; tube.visible = false; dust.visible = false; run = null; look.pitch = r.pitch0; if (r.onDone) r.onDone(); }
    },
    cancel() { if (!run) return; const c = run.onCancel; if (c) c(); tool.visible = tube.visible = dust.visible = false; run = null; },
  };
}
