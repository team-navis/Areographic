// Fixed-position frame-time measurement with one-at-a-time toggles (A/B) for the outdoor scene.
// Usage: MW_URL=http://127.0.0.1:5174/ node tools/perf-fixed.mjs <label> [toggles]   (MW_DPR=2 for retina; toggles = 'all' | 'none')
// Positions: landing, seat, outdoor route mid-point (standing, walking, riding), workspace (on site, looking at the rock).
// Headless Chrome on this machine; numbers are comparable to each other, not to a real window.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const URL = process.env.MW_URL || 'http://127.0.0.1:5173/', label = process.argv[2] || 'run', TOG = process.argv[3] || 'none', OUT = 'docs/captures/perf'; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.MW_HEADED, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.MW_DPR || 1) }); const rows = [];
const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
const t0 = Date.now(); await page.goto(URL); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 180000 }); const bootMs = Date.now() - t0;
const res = await page.evaluate(() => { const e = performance.getEntriesByType('resource'); return { n: e.length, bytes: e.reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0), big: e.map((r) => [r.name.split('/').pop().slice(0, 40), r.encodedBodySize || r.transferSize || 0]).sort((a, b) => b[1] - a[1]).slice(0, 6) }; });
rows.push({ scene: 'boot', ms: bootMs, resources: res.n, MiB: +(res.bytes / 1048576).toFixed(1), biggest: res.big });
console.log(JSON.stringify(rows[0]));
await page.evaluate(() => { const P = (window.__perf = { on: false, f: [] }); let last = performance.now(); const loop = (t) => { const m = window.__mw; if (P.on) P.f.push([t - last, m.renderer.info.render.calls, m.renderer.info.render.triangles, m.sunShadowUpdates || 0]); last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  // count sun shadow-map redraws
  const m = window.__mw; let sun = null; m.scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) sun = o; }); window.__sun = sun; if (sun) { let v = sun.shadow.needsUpdate; m.sunShadowUpdates = 0; Object.defineProperty(sun.shadow, 'needsUpdate', { get: () => v, set: (x) => { if (x && !v) m.sunShadowUpdates++; v = x; } }); } });
const measure = async (scene, ms = 2500, extra = {}) => { await page.evaluate(() => { const P = window.__perf; P.f = []; P.on = true; }); await page.waitForTimeout(ms); const f = await page.evaluate(() => { const P = window.__perf; P.on = false; return P.f.slice(2); });
  // uncapped cost of one frame: render synchronously and wait for the GPU (gl.finish), median of 24 — vsync hides differences above 60 fps
  const bench = await page.evaluate(() => { const m = window.__mw, gl = m.renderer.getContext(), inside = m.mode === 'landing' || m.mode === 'pad', t = []; for (let i = 0; i < 24; i++) { const a = performance.now(); m.habitatRenderer.render(inside, 0); gl.finish(); t.push(performance.now() - a); } t.sort((x, y) => x - y); return +t[12].toFixed(2); });
  const d = f.map((x) => x[0]).sort((a, b) => a - b), sum = d.reduce((a, b) => a + b, 0), r = { scene, fps: +(1000 * d.length / sum).toFixed(1), p95: +d[Math.floor(d.length * .95)].toFixed(1), calls: Math.max(...f.map((x) => x[1])), tris: Math.max(...f.map((x) => x[2])), shadowUpdates: f.at(-1)[3] - f[0][3], frameMs: bench, ...extra }; rows.push(r); console.log(JSON.stringify(r)); return r; };
const mw = (fn, a) => page.evaluate(fn, a), wait = (ms) => page.waitForTimeout(ms), mode = (m) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout: 60000 });
await wait(1500); await measure('landing');
await mw(() => window.__mw.enterRole('pad')); await mode('pad'); await wait(800); await measure('seat');
await page.click('#btn-switch'); await mode('landing');
await mw(() => { const m = window.__mw.mission; m.debugSetS(m.st.route.length / 2); }); await mw(() => window.__mw.enterRole('hud')); await mode('hud'); await wait(1200);
const ahead = () => mw(() => { const m = window.__mw; m.look.yaw = m.mission.poseAt(m.mission.st.s).yaw; m.look.pitch = -0.08; });
const TOGGLES = { // each returns an undo function name; applied one at a time at the two outdoor positions
  'workspace mesh opaque': () => { const f = window.__mw.field.face.material; f.transparent = false; f.needsUpdate = true; return () => { f.transparent = true; f.needsUpdate = true; }; },
  'workspace mesh hidden': () => { const g = window.__mw.field.group, v = g.visible; g.visible = false; return () => { g.visible = v; }; },
  'rocks hidden': () => { const r = []; window.__mw.scene.traverse((o) => { if (o.name === 'rocks-procedural') r.push(o); }); r.forEach((o) => { o.visible = false; }); return () => r.forEach((o) => { o.visible = true; }); },
  'soil normal map off': () => { const m = window.__mw.terrain.mats[0], n = m.normalMap; m.normalMap = null; m.needsUpdate = true; return () => { m.normalMap = n; m.needsUpdate = true; }; },
  'sun shadows off': () => { const s = window.__sun; s.castShadow = false; return () => { s.castShadow = true; s.shadow.needsUpdate = true; }; },
  'helmet interior hidden': () => { let h = null; window.__mw.scene.traverse((o) => { if (/helmet/i.test(o.name)) h = h || o; }); if (!h) return () => {}; const v = h.visible; h.visible = false; window.__noHelmet = true; return () => { h.visible = v; window.__noHelmet = false; }; },
  'HUD DOM hidden': () => { const e = document.getElementById('hud'), d = e.style.display; e.style.display = 'none'; return () => { e.style.display = d; }; },
  'fog off': () => { const s = window.__mw.scene, f = s.fog; s.fog = null; return () => { s.fog = f; }; },
  'sky hidden': () => { const k = window.__mw.scene.getObjectByName('sky'); k.visible = false; return () => { k.visible = true; }; },
  'pixel ratio 1.0': () => { const r = window.__mw.renderer, p = r.getPixelRatio(); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); return () => { r.setPixelRatio(p); r.setSize(innerWidth, innerHeight); }; },
};
const sweep = async (pos) => { if (TOG !== 'all') return; for (const [name, fn] of Object.entries(TOGGLES)) { await page.evaluate(([n, src]) => { window.__undo = (0, eval)('(' + src + ')')(); }, [name, fn.toString()]); await wait(500); await measure(`${pos} | ${name}`, 1800); await page.evaluate(() => { window.__undo && window.__undo(); }); await wait(300); } };
await ahead(); await wait(500); await measure('outdoor mid, standing'); await sweep('outdoor mid, standing');
await page.keyboard.down('KeyW'); await wait(400); await measure('outdoor mid, walking (W)', 2500); await page.keyboard.up('KeyW');
await mw(() => { const m = window.__mw.mission, s = m.st; s.transport = 'rover'; s.roverS = s.s; }); await ahead(); await page.keyboard.down('KeyW'); await wait(400); await measure('outdoor mid, riding (W)', 2500); await page.keyboard.up('KeyW'); await mw(() => { window.__mw.mission.st.transport = 'foot'; });
await mw(() => { const m = window.__mw.mission; m.debugSetS(m.st.route.length); }); await wait(500); await page.keyboard.press('Digit1'); await wait(500);
await mw(() => { const m = window.__mw, c = m.field.centreWorld(), d = c.clone().sub(m.camera.position); m.look.yaw = Math.atan2(-d.x, -d.z); m.look.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }); await wait(800);
await measure('workspace, looking at the rock'); await sweep('workspace');
writeFileSync(`${OUT}/fixed-${label}.json`, JSON.stringify({ url: URL, at: new Date().toISOString(), viewport: '1440x900', dpr: Number(process.env.MW_DPR || 1), headless: !process.env.MW_HEADED, rows }, null, 1)); await browser.close();
