import * as THREE from 'three';
import { drawHabitatSurfaces } from './habitat-surface-canvases.js';

// Paint, fine brushing and felt fibres remain attached to their actual 3D geometry. The drawing itself lives in habitat-surface-canvases.js.
// Perf (2026-11-15): the ten generated textures are drawn in a worker while the rest of the habitat is built; where a worker or OffscreenCanvas
// is not available (or fails) the same code runs on the page, one texture per task. The pixels are the same either way.
const pageCanvas = (size) => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
function inWorker() {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') { reject(new Error('no worker canvas')); return; }
    const w = new Worker(new URL('./habitat-surface-worker.js', import.meta.url), { type: 'module' }), t = setTimeout(() => { w.terminate(); reject(new Error('surface worker timeout')); }, 20000);
    w.onmessage = (ev) => { clearTimeout(t); w.terminate(); if (!ev.data.ok) { reject(new Error(ev.data.error)); return; }
      const back = (d) => { const c = pageCanvas(d.bitmap.width); c.getContext('2d').drawImage(d.bitmap, 0, 0); d.bitmap.close(); return { canvas: c, color: d.color, repeat: d.repeat }; }, out = {};
      for (const [k, v] of Object.entries(ev.data.surfaces)) out[k] = Array.isArray(v) ? v.map(back) : back(v); resolve(out); };
    w.onerror = (e) => { clearTimeout(t); w.terminate(); reject(new Error(e.message || 'surface worker error')); };
    w.postMessage(0);
  });
}
/** Start drawing now (worker when possible); the result is awaited by createHabitatSurfaces. */
export function startHabitatSurfaces(pause = async () => {}) { return inWorker().catch(() => drawHabitatSurfaces(pageCanvas, pause)); }
export async function createHabitatSurfaces(pause = async () => {}, started = null) {
  const drawn = await (started || startHabitatSurfaces(pause)), owned = [];
  const wrap = (d) => { const texture = new THREE.CanvasTexture(d.canvas); if (d.repeat) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8; } if (d.color) texture.colorSpace = THREE.SRGBColorSpace; owned.push(texture); return texture; };
  const out = {}; for (const [k, v] of Object.entries(drawn)) out[k] = Array.isArray(v) ? v.map(wrap) : wrap(v);
  out.dispose = () => owned.forEach((texture) => texture.dispose()); return out;
}
