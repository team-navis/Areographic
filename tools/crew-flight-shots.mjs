// Screenshot sequence for: landing crew marker, flight to the outside crew and back, ⑤ 관제 button, re-entry through the airlock.
// Usage: MW_URL=http://127.0.0.1:5174/ node tools/crew-flight-shots.mjs [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const URL = process.env.MW_URL || 'http://127.0.0.1:5174/', OUT = process.argv[2] || 'docs/captures/crew-flight'; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.jpg`, quality: 85 }), mode = (m, t = 40000) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout: t }), ev = (f, a) => page.evaluate(f, a), log = (k, v) => console.log(k, JSON.stringify(v));
const boot = async (q = '') => { await page.goto(URL + q); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 }); await page.waitForTimeout(1200); };
const markerXY = () => ev(() => { const r = document.getElementById('lbl-astronaut').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 + 150, text: document.getElementById('lbl-astronaut').textContent, hidden: document.getElementById('lbl-astronaut').classList.contains('hidden') }; });

// A: before departure the astronaut stands inside
await boot(); log('A before departure', { marker: await ev(() => window.__mw.crewMarker), label: (await markerXY()).text }); await shot('01-landing-crew-inside');
// A: crew outside (120 m along the route; the simulated crew is held so shots are stable)
await boot('?s=120'); await ev(() => { window.__mw.mission.st.holdAuto = true; window.__mw.mission.setControl('idle'); });
let m = await markerXY(); log('A departed', { marker: await ev(() => window.__mw.crewMarker), label: m.text, astroInRoom: await ev(() => Math.abs(window.__mw.astro.group.position.x) < 8) });
await page.mouse.move(m.x, m.y); await page.waitForTimeout(300); log('A hover', await ev(() => ({ hover: document.body.classList.contains('person-hover'), hot: document.getElementById('lbl-astronaut').classList.contains('hot') }))); await shot('02-landing-crew-outside-marker-hover');
// B: click the marker -> continuous flight
await page.mouse.click(m.x, m.y); const t0 = Date.now(); log('B started', await ev(() => window.__mw.mode));
for (const [n, at] of [['03-flight-0.9s-toward-door', 900], ['04-flight-1.6s-door-veil', 1600], ['05-flight-2.3s-outside', 2300], ['06-flight-2.9s-shoulder', 2900]]) { await page.waitForTimeout(Math.max(0, at - (Date.now() - t0))); await shot(n); }
await mode('hud'); log('B arrived', await ev(() => { const w = window.__mw, st = w.mission.st, p = w.mission.currentPose(); return { ms: 0, control: st.control, s: +st.s.toFixed(1), camToCrewM: +Math.hypot(w.camera.position.x - p.x, w.camera.position.z - p.z).toFixed(2), sheen: document.getElementById('sheen').style.opacity }; })); console.log('B flight ms', Date.now() - t0); await page.waitForTimeout(500); await shot('07-arrived-hud');
// B reverse
await ev(() => document.getElementById('btn-switch').click()); const t1 = Date.now();
for (const [n, at] of [['08-reverse-0.6s-pull-back', 600], ['09-reverse-1.7s-to-airlock', 1700], ['10-reverse-2.4s-door-veil', 2400]]) { await page.waitForTimeout(Math.max(0, at - (Date.now() - t1))); await shot(n); }
await mode('landing'); console.log('B reverse ms', Date.now() - t1); await page.waitForTimeout(600); await shot('11-back-on-landing');
// C: ⑤ 관제 button and map dot
await ev(() => window.__mw.enterRole('pad')); await mode('pad'); await page.keyboard.press('Digit2'); await page.waitForFunction(() => window.__mw.activeMonitor === 'planner' && !!document.querySelector('#terminal-overlay .terminal-active'), null, { timeout: 15000 });
await ev(() => window.__mw.pad.show('ctl')); await page.waitForTimeout(700); await shot('12-control-page-button'); log('C button', await ev(() => { const b = document.querySelector('#pc-view'); return b ? b.textContent : null; }));
const dot = await ev(() => { const w = window.__mw, cv = document.querySelector('#pc-map'), r = cv.getBoundingClientRect(), p = w.mission.currentPose(), [mx, my] = w.pad.toMap(p.x, p.z); return { x: r.x + mx * r.width / cv.width, y: r.y + my * r.height / cv.height }; });
await page.mouse.click(dot.x, dot.y); await page.waitForTimeout(1500); await shot('13-flight-from-control-map-dot'); await mode('hud'); log('C map dot -> hud', await ev(() => window.__mw.mission.st.control));
// reduced motion: veil cut instead of a flight
await ev(() => document.getElementById('btn-switch').click()); await mode('landing'); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(200); const t2 = Date.now(); await ev(() => window.__mw.enterRole('hud')); await mode('hud'); console.log('reduced-motion switch ms', Date.now() - t2); await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(200);
// D: return leg -> 기지 도착 at the ramp -> W through the airlock -> inside
await ev(() => { const w = window.__mw, st = w.mission.st; st.phase = 'returning'; st.s = st.route.stats.indoorM + 4; w.look.pitch = 0; });
await page.keyboard.down('KeyW'); await page.waitForFunction(() => window.__mw.mission.st.phase === 'atBase', null, { timeout: 20000 }); await page.keyboard.up('KeyW'); await page.waitForTimeout(400);
await ev(() => { window.__mw.look.yaw = window.__mw.mission.currentPose().yaw; }); await page.waitForTimeout(300); log('D at ramp', await ev(() => ({ phase: window.__mw.mission.st.phase, hint: document.getElementById('phase').textContent }))); await shot('14-base-arrival-ramp');
await page.keyboard.down('KeyW'); const seen = []; let last = '';
for (let i = 0; i < 300; i++) { const s = await ev(() => { const w = window.__mw, st = w.mission.st, d = w.base.doorState, p = w.mission.currentPose(); w.look.yaw = p.yaw; return { mode: w.mode, phase: st.phase, x: +p.x.toFixed(2), inner: +d.inner.toFixed(2), outer: +d.outer.toFixed(2) }; });
  const key = `${s.phase}/${s.inner > 0 ? 'I' : '-'}${s.outer > 0 ? 'O' : '-'}`; if (key !== last) { last = key; seen.push({ ...s }); if (s.outer > .9 && !seen.shotO) { seen.shotO = 1; } }
  if (s.inner > 0 && s.outer > 0) console.log('INTERLOCK FAULT', s);
  if (s.x > -6.2 && s.x < -5.6 && !seen.a) { seen.a = 1; await shot('15-inside-airlock'); }
  if (s.inner > .9 && !seen.b) { seen.b = 1; await shot('16-inner-door-open'); }
  if (s.mode === 'habitat') break; await page.waitForTimeout(100); }
await page.keyboard.up('KeyW'); log('D door/phase sequence', seen); await page.waitForTimeout(600);
log('D handed over', await ev(() => { const w = window.__mw, st = w.mission.st; return { mode: w.mode, phase: st.phase, control: st.control, habitatPose: !!st.habitatPose, s: st.s }; })); await shot('17-inside-indoor-walk');
await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD'); log('D WASD moves', await ev(() => window.__mw.walk.state.z.toFixed(2)));
await ev(() => document.getElementById('btn-switch').click()); await mode('landing'); await page.waitForTimeout(900); log('D landing', { marker: await ev(() => window.__mw.crewMarker), label: (await markerXY()).text }); await shot('18-landing-crew-back-inside');
console.log('errors', JSON.stringify(errs.slice(0, 5)), JSON.stringify(await ev(() => window.__mw.errors)));
await browser.close();
