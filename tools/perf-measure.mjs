// Frame-time / draw-call measurement for the scenes that matter to the demo. Real Chrome via playwright-core.
// Usage: MW_URL=http://127.0.0.1:5176/ node tools/perf-measure.mjs [label]   (MW_HEADED=1 for a real window, MW_DPR=2 for retina)
// Output: docs/captures/perf/metrics-<label>.json and a table on stdout. Headless numbers are not real-window numbers.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterHabitat, walkOutThroughAirlock } from '../tests/lib/enter.mjs';

const URL = process.env.MW_URL || 'http://127.0.0.1:5176/', label = process.argv[2] || 'run', OUT = 'docs/captures/perf';
const SHOTS = !!process.env.MW_SHOTS; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.MW_HEADED, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: Number(process.env.MW_DPR || 1) });
const rows = [];
const install = (page) => page.evaluate(() => {
  const P = (window.__perf = { on: false, f: [], tag: '' }); let last = performance.now();
  const loop = (t) => { const m = window.__mw; if (P.on) P.f.push({ dt: t - last, tag: P.tag || m.phase || m.mode, calls: m.renderer.info.render.calls, tris: m.renderer.info.render.triangles }); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
const start = (page, tag = '') => page.evaluate((t) => { const P = window.__perf; P.f = []; P.tag = t; P.on = true; }, tag);
const stop = async (page, name, split = false) => {
  const f = await page.evaluate(() => { const P = window.__perf; P.on = false; const m = window.__mw.renderer.info; return { f: P.f.slice(1), tex: m.memory.textures, geo: m.memory.geometries, prog: m.programs.length }; });
  const groups = new Map(); for (const x of f.f) { const k = split ? `${name}:${x.tag}` : name; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  for (const [k, a] of groups) { if (!a.length) continue; const d = a.map((x) => x.dt).sort((p, q) => p - q), q = (p) => d[Math.min(d.length - 1, Math.floor(p * d.length))], sum = d.reduce((s, v) => s + v, 0);
    const r = { scene: k, frames: d.length, fps: +(1000 * d.length / sum).toFixed(1), p50: +q(.5).toFixed(1), p95: +q(.95).toFixed(1), max: +d.at(-1).toFixed(1), over50: d.filter((v) => v > 50).length, calls: Math.max(...a.map((x) => x.calls)), tris: Math.max(...a.map((x) => x.tris)), callsP50: a.map((x) => x.calls).sort((p, q) => p - q)[a.length >> 1], trisP50: a.map((x) => x.tris).sort((p, q) => p - q)[a.length >> 1], textures: f.tex, geometries: f.geo, programs: f.prog };
    rows.push(r); console.log(JSON.stringify(r)); }
};
const boot = async (url) => { const page = await ctx.newPage(); const t0 = Date.now(); await page.goto(url); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 }); const ms = Date.now() - t0; await install(page); return { page, ms }; };
const mode = (page, m) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout: 60000 });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${OUT}/${label}-${name}.png` }); };

// A: landing -> seat -> indoor walk -> airlock exit -> outdoor HUD
{ const { page, ms } = await boot(URL); console.log('boot ms', ms); rows.push({ scene: 'boot', ms, gl: await page.evaluate(() => window.__mw.glInfo) });
  await start(page); await page.waitForTimeout(2500); await stop(page, 'landing'); await shot(page, '01-landing');
  await page.click('#btn-pad'); await mode(page, 'pad'); await start(page); await page.waitForTimeout(2500); await stop(page, 'seat'); await shot(page, '02-seat');
  await page.click('#btn-switch'); await mode(page, 'landing'); await start(page, 'enter'); await enterHabitat(page); await stop(page, 'to-habitat');
  await page.evaluate(() => { window.__mw.look.yaw = Math.PI / 2; window.__mw.look.pitch = 0; });
  await start(page); const x0 = await page.evaluate(() => window.__mw.walk.state.x); await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW'); const x1 = await page.evaluate(() => window.__mw.walk.state.x);
  for (let i = 0; i < 20; i++) { await page.evaluate(() => { window.__mw.look.yaw += Math.PI / 10; }); await page.waitForTimeout(100); } await stop(page, 'indoor-walk'); rows.at(-1).walked = +(x0 - x1).toFixed(2);
  await page.evaluate(() => { window.__mw.look.yaw = Math.PI / 2; }); await page.waitForTimeout(200); await shot(page, '03-indoor-west');
  await page.evaluate(() => { window.__mw.look.yaw = 0; }); await page.waitForTimeout(200); await shot(page, '04-indoor-north');
  await page.evaluate(() => { window.__mw.look.yaw = -2.2; }); await page.waitForTimeout(200); await shot(page, '05-indoor-southeast');
  await start(page, 'exit'); await walkOutThroughAirlock(page); await stop(page, 'airlock-exit'); await shot(page, '06-airlock-exit-hud');
  await start(page); const s0 = await page.evaluate(() => window.__mw.mission.st.s); await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW'); const s1 = await page.evaluate(() => window.__mw.mission.st.s);
  await stop(page, 'outdoor-hud-walk'); rows.at(-1).walked = +(s1 - s0).toFixed(2); await shot(page, '07-outdoor-hud');
  await page.close(); }

// B: the helmet transition (approach -> shoulder -> visor -> inside) from a cold page, crew already outside
{ const { page } = await boot(URL + '?s=12'); await page.waitForTimeout(800);
  await start(page); await page.click('#btn-hud');
  if (SHOTS) for (const ph of ['APPROACH', 'SHOULDER', 'VISOR', 'INSIDE']) { await page.waitForFunction((x) => window.__mw.phase === x, ph, { timeout: 30000 }); await page.waitForTimeout(ph === 'INSIDE' ? 1100 : 800); await page.screenshot({ path: `${OUT}/${label}-1${['APPROACH', 'SHOULDER', 'VISOR', 'INSIDE'].indexOf(ph)}-helmet-${ph.toLowerCase()}.png` }); }
  await mode(page, 'hud'); await page.waitForTimeout(1000); await stop(page, 'helmet', true);
  await shot(page, '14-helmet-hud'); await page.close(); }

writeFileSync(`${OUT}/metrics-${label}.json`, JSON.stringify({ url: URL, at: new Date().toISOString(), headless: !process.env.MW_HEADED, dpr: Number(process.env.MW_DPR || 1), rows }, null, 1));
await browser.close();
