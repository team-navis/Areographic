import * as THREE from 'three';

const ease = (t) => t * t * (3 - 2 * t);
const tmpM = new THREE.Matrix4();
export function lookQuat(pos, target) { tmpM.lookAt(pos, target, new THREE.Vector3(0, 1, 0)); return new THREE.Quaternion().setFromRotationMatrix(tmpM); }

/**
 * Plays a camera move through named keyframes (smooth spline position, slerped orientation, lerped FOV).
 * `hold` (test/debug only) pauses on every keyframe until release() so each phase can be captured.
 */
export class Director {
  constructor(camera) { this.camera = camera; this.active = null; this.hold = false; this.waiting = false; this.phase = null; }
  play(keys, { onPhase, onDone } = {}) {
    const cam = this.camera; keys = [{ name: 'from', pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, dur: 0 }, ...keys];
    this.active = { keys, curve: new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, 'centripetal', 0.5), seg: 1, t: 0, onPhase, onDone }; this.waiting = false; this.phase = 'from';
  }
  release() { this.waiting = false; }
  get busy() { return !!this.active; }
  update(dt) {
    const a = this.active; if (!a || this.waiting) return;
    const k0 = a.keys[a.seg - 1], k1 = a.keys[a.seg]; a.t = Math.min(1, a.t + dt / k1.dur);
    const e = ease(a.t), n = a.keys.length - 1, cam = this.camera;
    cam.position.copy(a.curve.getPoint((a.seg - 1 + e) / n)); // uniform-in-parameter per segment
    cam.quaternion.slerpQuaternions(k0.quat, k1.quat, e); cam.fov = k0.fov + (k1.fov - k0.fov) * e; cam.updateProjectionMatrix();
    if (k1.onProgress) k1.onProgress(e);
    if (a.t >= 1) {
      cam.position.copy(k1.pos); this.phase = k1.name; if (a.onPhase) a.onPhase(k1.name);
      if (a.seg >= n) { this.active = null; if (a.onDone) a.onDone(); return; }
      a.seg++; a.t = 0; if (this.hold) this.waiting = true;
    }
  }
}
