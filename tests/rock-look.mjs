// Quick look at the 현장 대조 rock stand-in: HUD view with the AR lines aligned, and an outside view. MW_URL / MW_OUT as in the capture scripts.
import { chromium } from 'playwright-core';
import { enterHud } from './lib/enter.mjs';
const URL = process.env.MW_URL || 'http://127.0.0.1:5173/', OUT = process.env.MW_OUT || 'docs/captures/stage3-v02-field';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300))); page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
await page.goto(URL); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 120000 });
const mw = (fn, a) => page.evaluate(fn, a), wait = (ms) => page.waitForTimeout(ms);
await mw(async () => { const m = window.__mw; await m.fieldPad.ready; const d = m.fieldPad.extract(2); m.mission.sendPackage({ lines: d.polylines, hash: d.hash, detail: 2, targets: m.fieldPad.ui.targets }); });
await enterHud(page); await wait(500);
await page.keyboard.press('Digit1'); await wait(300); // acknowledge the package
await mw(async () => { await window.__mw.field.ensure(); }); // the measured mesh is lazy-loaded (plan/package sent or within 150 m)
await mw(() => { const m = window.__mw.mission; m.debugSetS(m.st.route.length); }); await wait(400); await page.keyboard.press('Digit1'); await wait(400);
const look = (dy = 0) => mw((dy) => { const m = window.__mw, c = m.field.centreWorld(), d = c.clone().sub(m.camera.position); m.look.yaw = Math.atan2(-d.x, -d.z) + dy; m.look.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }, dy);
await look(0.01); await wait(400); await page.screenshot({ path: `${OUT}/21-rock-hud-no-overlay.png` });
await mw(() => window.__mw.fx.command('대조')); await wait(500); await page.screenshot({ path: `${OUT}/22-rock-hud-lines-aligned.png` });
console.log('match', JSON.stringify(await mw(() => window.__mw.fx.command('일치')))); await wait(4500); await page.screenshot({ path: `${OUT}/23-rock-hud-target.png` });
console.log(JSON.stringify(await mw(() => { const f = window.__mw.field; return { measured: f.measured, verts: f.meta.vertices, tris: f.meta.triangles, placement: f.placement, A: f.points.A.meta, ...f.metrics(window.__mw.camera) }; })));
await mw(() => { const m = window.__mw, c = m.field.centreWorld(); m.debugCamWorld(c.x + 2.6, c.y + 1.7, c.z + 2.2, c.x, c.y - 0.05, c.z, 45); m.field.overlay.visible = false; m.field.rings.visible = false; m.field.markers.visible = true; }); await wait(500); await page.screenshot({ path: `${OUT}/24-rock-outside-view.png` });
await browser.close();
