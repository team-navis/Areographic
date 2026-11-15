import * as THREE from 'three';
import { assetUrl } from './asset-url.js';

const loader = new THREE.TextureLoader();
const pending = [];
let maxAniso = 8;
export function setMaxAnisotropy(n) { maxAniso = n; }

/**
 * Load a tiling texture from /textures/polyhaven (CC0, see LICENSES.json).
 * `defer: [r, g, b]` (sRGB bytes): outdoor-only maps. The texture starts as a 1 px stand-in of that colour (the map's mean, or a flat
 * normal), does not hold the loading screen, and the real image is swapped in by runDeferred() right after the landing view is shown.
 */
export function ph(name, { repeat = 1, srgb = false, defer = null } = {}) {
  const url = assetUrl(`/textures/polyhaven/${name}_1k.jpg`); let t;
  if (defer) {
    const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = `rgb(${defer.join(',')})`; g.fillRect(0, 0, 1, 1);
    t = new THREE.Texture(c); t.needsUpdate = true;
    deferTask(name, async () => { const im = await loadImage(url); t.dispose(); /* storage size changes: drop the 1 px GL texture first */ t.image = im; t.needsUpdate = true; });
  } else {
    t = loader.load(url, undefined, undefined, (e) => console.error('texture failed', name, e));
    pending.push(new Promise((res) => { const iv = setInterval(() => { if (t.image) { clearInterval(iv); res(); } }, 50); }));
  }
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (Array.isArray(repeat)) t.repeat.set(repeat[0], repeat[1]); else t.repeat.set(repeat, repeat);
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Outdoor-only assets that load after the landing view is on screen (see ph({ defer }) and terrain.js). */
const deferredTasks = []; export const deferred = { total: 0, done: 0, failed: [], ready: false, promise: null };
export function deferTask(name, fn) { deferredTasks.push({ name, fn }); deferred.total++; }
export function runDeferred() {
  return deferred.promise || (deferred.promise = Promise.all(deferredTasks.map((t) => t.fn().then(() => { deferred.done++; }, (e) => { deferred.failed.push(t.name); console.error('deferred asset failed', t.name, e); }))).then(() => { deferred.ready = true; return deferred; }));
}
export function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image failed ' + url)); im.src = url; });
}
export function texturesReady() { return Promise.all(pending); }

/** Deterministic PRNG so procedural dressing is identical on every load. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Procedural smudge/wear map used as roughness + bump variation (presentation detail, not data). */
export function smudgeTexture(seed = 1, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const r = rng(seed);
  g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = r() * size, y = r() * size, w = 8 + r() * 90, h = 2 + r() * 22, v = 100 + Math.floor(r() * 110);
    g.globalAlpha = 0.05 + r() * 0.08; g.fillStyle = `rgb(${v},${v},${v})`;
    g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.6); g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, 6.283); g.fill(); g.restore();
  }
  for (let i = 0; i < 5000; i++) { const v = Math.floor(60 + r() * 170); g.globalAlpha = 0.12; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t;
}
