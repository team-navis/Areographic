// Draws the habitat's generated textures off the main thread (perf 2026-11-15) and sends them back as ImageBitmaps.
import { drawHabitatSurfaces } from './habitat-surface-canvases.js';
self.onmessage = async () => {
  try {
    const out = await drawHabitatSurfaces((size) => new OffscreenCanvas(size, size)), flat = [], take = (d) => { const b = d.canvas.transferToImageBitmap(); flat.push(b); return { bitmap: b, color: d.color, repeat: d.repeat }; };
    const msg = {}; for (const [k, v] of Object.entries(out)) msg[k] = Array.isArray(v) ? v.map(take) : take(v);
    self.postMessage({ ok: true, surfaces: msg }, flat);
  } catch (e) { self.postMessage({ ok: false, error: String(e) }); }
};
