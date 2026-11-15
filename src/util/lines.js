/**
 * Deterministic line extraction for the "POV match package" (planning photo -> line drawing sent to the HUD).
 * Canny-like pipeline, no randomness, no ML: luminance -> Gaussian blur -> Sobel -> non-maximum suppression ->
 * percentile hysteresis -> raster-order chain tracing -> Douglas-Peucker simplification -> longest N polylines.
 * It traces brightness edges of a public image. It does not recognise rocks, minerals or anything biological.
 * Input: { data (RGBA Uint8ClampedArray), width, height }. Output coordinates are normalised (u right, v down, 0..1).
 */
export const DETAIL = { // the three presets offered on the PAD (all values are presentation choices)
  1: { sigma: 2.6, hiPct: 0.9, minLen: 44, maxLines: 110, label: 'Coarse (fewer lines)' },
  2: { sigma: 1.9, hiPct: 0.85, minLen: 28, maxLines: 220, label: 'Medium' },
  3: { sigma: 1.3, hiPct: 0.78, minLen: 16, maxLines: 420, label: 'Fine (more lines)' },
};

export function extractLines(img, { detail = 2, epsilon = 1.3 } = {}) {
  const P = DETAIL[detail] || DETAIL[2], w = img.width, h = img.height, n = w * h, d = img.data;
  const gray = new Float32Array(n); for (let i = 0; i < n; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  // separable Gaussian
  const r = Math.ceil(P.sigma * 3), k = new Float32Array(2 * r + 1); let ks = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * P.sigma * P.sigma)); ks += k[i + r]; } for (let i = 0; i < k.length; i++) k[i] /= ks;
  const tmp = new Float32Array(n), blur = new Float32Array(n), cl = (v, m) => (v < 0 ? 0 : v > m ? m : v);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += gray[y * w + cl(x + i, w - 1)] * k[i + r]; tmp[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += tmp[cl(y + i, h - 1) * w + x] * k[i + r]; blur[y * w + x] = s; }
  // Sobel + non-maximum suppression (4 quantised directions); a 3 px border is ignored (image frame)
  const mag = new Float32Array(n), dir = new Uint8Array(n), B = 3;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, gx = blur[i - w + 1] + 2 * blur[i + 1] + blur[i + w + 1] - blur[i - w - 1] - 2 * blur[i - 1] - blur[i + w - 1], gy = blur[i + w - 1] + 2 * blur[i + w] + blur[i + w + 1] - blur[i - w - 1] - 2 * blur[i - w] - blur[i - w + 1];
    mag[i] = Math.hypot(gx, gy); const a = ((Math.atan2(gy, gx) * 180 / Math.PI) + 180) % 180; dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
  }
  const nms = new Float32Array(n), OFF = [[1, 0], [1, 1], [0, 1], [-1, 1]];
  for (let y = B; y < h - B; y++) for (let x = B; x < w - B; x++) { const i = y * w + x, m = mag[i]; if (m <= 0) continue; const [ox, oy] = OFF[dir[i]]; if (m >= mag[i + oy * w + ox] && m > mag[i - oy * w - ox]) nms[i] = m; }
  // thresholds from the magnitude histogram of surviving pixels (deterministic percentile)
  let mx = 0, cnt = 0; for (let i = 0; i < n; i++) if (nms[i] > 0) { cnt++; if (nms[i] > mx) mx = nms[i]; }
  const BINS = 2048, hist = new Uint32Array(BINS); for (let i = 0; i < n; i++) if (nms[i] > 0) hist[Math.min(BINS - 1, Math.floor((nms[i] / mx) * BINS))]++;
  let acc = 0, hiBin = BINS - 1; for (let b = 0; b < BINS; b++) { acc += hist[b]; if (acc >= cnt * P.hiPct) { hiBin = b; break; } }
  const hi = (hiBin / BINS) * mx, lo = hi * 0.4;
  const edge = new Uint8Array(n), stack = []; // 0 none, 1 weak, 2 edge
  for (let i = 0; i < n; i++) if (nms[i] >= hi) { edge[i] = 2; stack.push(i); } else if (nms[i] >= lo) edge[i] = 1;
  const N8 = [1, -1, w, -w, w + 1, w - 1, -w + 1, -w - 1]; // 4-neighbours first: fixed visiting order keeps the trace deterministic
  while (stack.length) { const i = stack.pop(); for (const o of N8) { const j = i + o; if (edge[j] === 1) { edge[j] = 2; stack.push(j); } } }
  // chain tracing in raster order
  const seen = new Uint8Array(n), chains = [];
  const walk = (start) => { const out = []; let c = start; for (;;) { let nx = -1; for (const o of N8) { const j = c + o; if (edge[j] === 2 && !seen[j]) { nx = j; break; } } if (nx < 0) break; seen[nx] = 1; out.push(nx); c = nx; } return out; };
  for (let i = 0; i < n; i++) { if (edge[i] !== 2 || seen[i]) continue; seen[i] = 1; const f = walk(i), b = walk(i); const chain = b.reverse().concat([i], f); if (chain.length >= P.minLen) chains.push(chain); }
  chains.sort((a, b) => b.length - a.length || a[0] - b[0]); const kept = chains.slice(0, P.maxLines);
  // Douglas-Peucker
  const simplify = (pts) => { const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
    while (st.length) { const [a, b] = st.pop(); let best = -1, bd = epsilon; const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, l = Math.hypot(dx, dy) || 1e-9;
      for (let i = a + 1; i < b; i++) { const dd = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / l; if (dd > bd) { bd = dd; best = i; } }
      if (best > 0) { keep[best] = 1; st.push([a, best], [best, b]); } }
    return pts.filter((_, i) => keep[i]); };
  const q = (v) => Math.round(v * 10000) / 10000; let points = 0;
  const polylines = kept.map((c) => { const s = simplify(c.map((i) => [i % w, Math.floor(i / w)])), flat = []; for (const [x, y] of s) flat.push(q(x / (w - 1)), q(y / (h - 1))); points += s.length; return flat; });
  let hsh = 0x811c9dc5; const str = polylines.map((p) => p.join(',')).join(';'); for (let i = 0; i < str.length; i++) { hsh ^= str.charCodeAt(i); hsh = Math.imul(hsh, 0x01000193); }
  return { polylines, hash: (hsh >>> 0).toString(16).padStart(8, '0'), count: polylines.length, points, width: w, height: h, detail, params: { ...P, epsilon, lowRatio: 0.4 } };
}
