// Quick smoke after a merge: landing loads -> controller confirms the plan -> ⑤ 관제 with the simulated crew (pad-auto)
// -> landing shows the door marker while the crew is outside -> flight to the crew ends in the HUD (hud-manual).
// Usage: MW_URL=http://127.0.0.1:4180/ node tools/merge-smoke.mjs [shotDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const URL = process.env.MW_URL || 'http://127.0.0.1:4180/', OUT = process.argv[2] || 'docs/captures/merge-smoke'; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); const errs = []; page.on('pageerror', (e) => errs.push(String(e.stack).slice(0, 300))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms), shot = (n) => page.screenshot({ path: `${OUT}/${n}.jpg`, quality: 85 }), mode = (m) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout: 40000 });
let fails = 0; const check = (name, ok, info = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' · ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const t0 = Date.now(); await page.goto(URL); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 });
check('landing-loads', await ev(() => window.__mw.ready && window.__mw.mode === 'landing' && window.__mw.crewMarker !== 'outside'), { ms: Date.now() - t0, appErrors: await ev(() => window.__mw.errors) }); await wait(1200); await shot('01-landing');
const def = await ev(async () => { const d = window.__mw.deferred, t = performance.now(); while (!d.ready && performance.now() - t < 90000) await new Promise((r) => setTimeout(r, 100)); return { total: d.total, done: d.done, failed: d.failed, rover: window.__mw.rover.info.source }; }); check('deferred-assets-arrive', def.done === def.total && !def.failed.length && /crew-rover/.test(def.rover), def);
await ev(() => window.__mw.enterRole('pad')); await mode('pad'); await page.keyboard.press('Digit2'); await page.waitForFunction(() => window.__mw.activeMonitor === 'planner' && !!document.querySelector('#terminal-overlay .terminal-active'), null, { timeout: 15000 });
await ev(() => window.__mw.pad.show('go')); await wait(500); check('final-review-transport', await ev(() => /이동 가정: 도보 1\.4 m\/s \(모의\)/.test(document.querySelector('#pp-movesum')?.textContent || '')), await ev(() => document.querySelector('#pp-movesum')?.textContent)); await shot('02-final-review');
await page.click('#pp-start'); await wait(2500);
check('control-page-pad-auto', await ev(() => { const s = window.__mw.mission.st; return window.__mw.pad.ui.page === 'ctl' && s.control === 'pad-auto' && s.departed && !s.habitatPose; }), await ev(() => ({ page: window.__mw.pad.ui.page, control: window.__mw.mission.st.control, owner: document.querySelector('#pc-owner')?.textContent }))); await shot('03-control');
check('no-crew-shortcut-in-controller-room', await ev(() => { const vis = (e) => !!e && !e.hidden && e.getClientRects().length > 0; return !vis(document.querySelector('#pc-view')) && !vis(document.getElementById('btn-eva')); }));
await ev(() => document.getElementById('btn-switch').click()); await mode('landing'); await wait(900);
const m = await ev(() => { const r = document.getElementById('lbl-astronaut').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 + 150, text: document.getElementById('lbl-astronaut').textContent, marker: window.__mw.crewMarker }; });
check('landing-door-marker-while-outside', m.marker === 'outside' && /바깥 탐사 중/.test(m.text), m); await page.mouse.move(m.x, m.y); await wait(300); await shot('04-landing-door-marker');
await page.mouse.click(m.x, m.y); await wait(1700); await shot('05-flight'); await mode('hud'); await wait(600);
check('flight-lands-in-hud', await ev(() => { const w = window.__mw, s = w.mission.st, p = w.mission.currentPose(); return s.control === 'hud-manual' && Math.hypot(w.camera.position.x - p.x, w.camera.position.z - p.z) < 0.3; }), await ev(() => ({ control: window.__mw.mission.st.control, s: +window.__mw.mission.st.s.toFixed(1), transport: window.__mw.mission.st.transport }))); await shot('06-hud');
await ev(() => document.getElementById('btn-switch').click()); await mode('landing'); await wait(600); check('back-to-landing', true); await shot('07-back-on-landing');
console.log('errors', JSON.stringify(errs.slice(0, 5)), 'FAILS', fails); await browser.close(); process.exit(fails ? 1 : 0);
