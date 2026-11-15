// Rover (board / ride / dismount) browser verification + captures. Real Chrome via playwright-core.
// Usage: dev server running, then `npm run capture:rover` (MW_URL / MW_OUT override the target and output dir).
// Expected values come from the spec (walk 1.4 m/s, rover 3.5 m/s simulated, board range 3 m), not from product output.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterHud, enterPad } from './lib/enter.mjs'; // integration: first HUD entry = indoor free walk + airlock exit; PAD = seat + centre monitor (key 2)
const URL = process.env.MW_URL || 'http://127.0.0.1:5173/', OUT = process.env.MW_OUT || 'docs/captures/stage1-rover';
mkdirSync(OUT, { recursive: true });
const WALK = 1.4, ROVER = 3.5, RANGE = 3;
const results = { url: URL, startedAt: new Date().toISOString(), checks: [], captures: [], console: [], failedRequests: [], perf: [] };
const check = (id, pass, detail) => { results.checks.push({ id, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.MW_HEADED, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') results.console.push({ type: m.type(), text: m.text().slice(0, 300) }); });
page.on('pageerror', (e) => results.console.push({ type: 'pageerror', text: String(e).slice(0, 400) }));
page.on('requestfailed', (r) => results.failedRequests.push(r.url())); page.on('response', (r) => { if (r.status() >= 400) results.failedRequests.push(`${r.status()} ${r.url()}`); });
const mw = (fn, arg) => page.evaluate(fn, arg);
const st = () => mw(() => { const s = window.__mw.mission.st; return { s: s.s, roverS: s.roverS, transport: s.transport, moving: s.moving, arrived: s.arrived, o2: s.o2, sim: s.simSeconds, len: s.route.length }; });
const mode = (m, timeout = 40000) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout });
const shot = async (name, note) => { await page.screenshot({ path: `${OUT}/${name}.png` }); results.captures.push({ file: `${OUT}/${name}.png`, note }); };
const load = async () => { await page.goto(URL); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 }); await page.waitForTimeout(600); };
const hold = async (key, ms) => { const a = await st(); const t = Date.now(); await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); const dt = (Date.now() - t) / 1000; await page.waitForTimeout(150); const b = await st(); return { ds: b.s - a.s, dt, a, b }; };
const unlock = () => mw(() => document.exitPointerLock && document.exitPointerLock());
const lookAtRover = () => mw(() => { const m = window.__mw, c = m.camera.position, p = m.rover.group.position; m.look.yaw = Math.atan2(-(p.x - c.x), -(p.z - c.z)); m.look.pitch = -0.22; });
const lookAhead = () => mw(() => { const m = window.__mw; m.look.yaw = m.mission.poseAt(m.mission.st.s).yaw; m.look.pitch = -0.1; });

await load(); await enterHud(page);
const s0 = await st(), rampS = await mw(() => window.__mw.mission.st.route.pts.find((p) => p.kind === 'ramp').s); // [changed] the HUD now starts at the airlock exit (top of the ramp), not at s = 0 inside the base
check('initial-on-foot', s0.transport === 'foot' && Math.abs(s0.s - rampS) < 0.5 && s0.roverS - s0.s > RANGE, { transport: s0.transport, roverS: +s0.roverS.toFixed(2) });
await page.keyboard.press('KeyE'); await page.waitForTimeout(200);
check('E-far-from-rover-does-nothing', (await st()).transport === 'foot' && (await st()).s === s0.s, `rover is ${(s0.roverS - s0.s).toFixed(1)} m ahead on the route; board range ${RANGE} m`);
const walk = await hold('KeyW', 2000);
check('walk-speed', Math.abs(walk.ds / walk.dt - WALK) < 0.2, `on foot: ${walk.ds.toFixed(2)} m in ${walk.dt.toFixed(2)} s = ${(walk.ds / walk.dt).toFixed(2)} m/s`);
// walk (W only) until the rover is within board range
await mw(() => { window.__mw.look.yaw = Math.PI / 2; window.__mw.look.pitch = -0.08; });
await page.keyboard.down('KeyW'); await page.waitForFunction((r) => { const s = window.__mw.mission.st; return s.roverS - s.s <= r - 0.6; }, RANGE, { timeout: 40000 }); await page.keyboard.up('KeyW'); await page.waitForTimeout(300);
await lookAtRover(); await page.waitForTimeout(500);
const near = await st();
check('walked-to-rover', near.transport === 'foot' && near.roverS - near.s <= RANGE && near.roverS - near.s > 0, `on foot at s=${near.s.toFixed(2)}, rover at ${near.roverS.toFixed(2)}`);
check('board-prompt-visible', (await page.isVisible('#hud-act')) && (await page.textContent('#hud-act')).includes('탑승'), await page.textContent('#hud-act'));
await shot('02-on-foot-at-rover-board-prompt', 'on foot beside the parked rover, HUD shows the board prompt');

// ---------- board ----------
await page.keyboard.press('KeyE'); await page.waitForTimeout(1200);
const on = await st();
check('board-with-E', on.transport === 'rover' && Math.abs(on.s - on.roverS) < 1e-9, { transport: on.transport, s: +on.s.toFixed(2) });
const seat = await mw(() => { const m = window.__mw, f = m.roverFit(), c = m.camera.position; return { d: Math.hypot(c.x - f.crew.x, c.z - f.crew.z), dy: c.y - f.crew.y, hudMode: document.querySelector('#hud-mode').textContent }; });
check('camera-on-rover-deck', seat.d < 0.05 && Math.abs(seat.dy - 1.68) < 0.02, `camera ${seat.d.toFixed(3)} m (horizontal) from the crew station, eye ${seat.dy.toFixed(2)} m above the deck`);
check('hud-shows-riding', seat.hudMode.includes('로버 탑승') && seat.hudMode.includes('모의'), seat.hudMode);
await lookAhead(); await mw(() => { window.__mw.look.pitch = -0.38; }); await page.waitForTimeout(400);
await shot('03-boarded-pov', 'just boarded: in-helmet first person from the rover station (handlebar, deck), HUD in riding mode');

// ---------- ride: W only, fixed route ----------
const before = await st();
for (const k of ['KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowLeft', 'ArrowRight']) { await page.keyboard.down(k); await page.waitForTimeout(350); await page.keyboard.up(k); }
check('ride-ASD-no-effect', (await st()).s === before.s, 'A/S/D/Space/arrows do not move or steer the rover');
await lookAhead(); const ride = await hold('KeyW', 3000);
check('ride-speed-faster-than-walk', Math.abs(ride.ds / ride.dt - ROVER) < 0.4 && ride.ds / ride.dt > 2 * (walk.ds / walk.dt), `rover: ${ride.ds.toFixed(2)} m in ${ride.dt.toFixed(2)} s = ${(ride.ds / ride.dt).toFixed(2)} m/s vs walk ${(walk.ds / walk.dt).toFixed(2)} m/s`);
const stop1 = await st(); await page.waitForTimeout(700);
check('ride-release-stops', (await st()).s === stop1.s, `stays at s=${stop1.s.toFixed(2)}`);
check('rover-moves-with-crew', Math.abs(stop1.roverS - stop1.s) < 1e-9, 'roverS == s while riding');
const fit = await mw(() => { const m = window.__mw, f = m.roverFit(), rw = m.mission.roverWorld(), p = m.rover.group.position; return { contact: Math.max(...f.wheelGround.map((g, i) => Math.abs(g - f.wheelY[i]))), track: Math.hypot(p.x - rw.x, p.z - rw.z), pitch: f.pitchDeg, roll: f.rollDeg, src: m.terrain.ground(p.x, p.z).source }; });
check('wheels-on-dtm', fit.contact < 0.02 && fit.src === 'HiRISE 1 m', `max |tyre bottom - DTM| = ${(fit.contact * 100).toFixed(2)} cm, chassis pitch ${fit.pitch.toFixed(1)} deg roll ${fit.roll.toFixed(1)} deg, ground source ${fit.src}`);
check('rover-on-fixed-track', fit.track < 1e-6, 'rover centre is exactly on the 2.2 m offset of the route point (no steering input exists)');
// diagnostic only: frame pacing and input-clearing events during this hold (the mission integrates at most 50 ms per frame, so a long frame loses distance)
await mw(() => { const d = (window.__diag = { frames: 0, maxGap: 0, ev: [], last: performance.now(), on: true }); const f = () => { if (!d.on) return; const n = performance.now(); d.frames++; d.maxGap = Math.max(d.maxGap, n - d.last); d.last = n; requestAnimationFrame(f); }; requestAnimationFrame(f); for (const t of ['blur', 'keyup']) addEventListener(t, (e) => d.on && d.ev.push(t + (e.code ? ':' + e.code : ''))); for (const t of ['pointerlockchange', 'visibilitychange']) document.addEventListener(t, () => d.on && d.ev.push(t)); });
await mw(() => { window.__mw.look.yaw += 2.2; }); const side = await hold('KeyW', 1200); const diag = await mw(() => { const d = window.__diag; d.on = false; return { frames: d.frames, maxGapMs: Math.round(d.maxGap), events: d.ev }; }); results.rideGazeDiag = diag; const onTrack = await mw(() => { const m = window.__mw, f = m.roverFit(), c = m.camera.position; return Math.hypot(c.x - f.crew.x, c.z - f.crew.z); });
check('ride-gaze-does-not-steer', side.ds > 3 && onTrack < 0.05, `looking back while riding: +${side.ds.toFixed(2)} m, camera stays on the station (${onTrack.toFixed(3)} m); diag ${JSON.stringify(diag)}`);
await lookAhead(); await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await shot('04-riding-pov-hud', 'riding with W held: first person with HUD (moving)'); results.perf.push(await mw(() => window.__mw.stats()));
await page.keyboard.press('KeyE'); await page.waitForTimeout(200); const midE = await st(); await page.keyboard.up('KeyW');
check('no-dismount-while-driving', midE.transport === 'rover', 'E is ignored while W is held');

// ---------- role switch keeps position and transport ----------
await page.waitForTimeout(300); const pre = await st(); await unlock(); await page.waitForTimeout(200);
await page.click('#btn-switch'); await mode('landing'); await enterPad(page); await page.waitForTimeout(300);
const padTxt = { transport: await page.textContent('#home-transport'), ctl: await page.textContent('#home-ctl'), s: await page.textContent('#home-s') }; const inPad = await st();
check('pad-shows-rover-mode', padTxt.transport.includes('로버 탑승') && padTxt.ctl.includes('[로버]') && padTxt.s.startsWith(pre.s.toFixed(1)) && inPad.s === pre.s, padTxt);
await page.click('.pad-navbtn[data-page="site"]'); await page.waitForTimeout(700); await shot('05-pad-shows-rover', 'PAD map: crew dot + rover marker at the same shared position');
await page.click('.pad-navbtn[data-page="home"]'); await page.waitForTimeout(600); await shot('06-pad-home-transport', 'PAD home: 이동 수단 = 로버 탑승 중');
await page.click('#btn-switch'); await mode('landing'); await page.evaluate(() => window.__mw.enterRole('hud')); await mode('hud'); const back = await st();
check('role-switch-keeps-transport-and-position', back.transport === 'rover' && back.s === pre.s && back.roverS === pre.roverS, { transport: back.transport, s: +back.s.toFixed(2) });

// ---------- dismount mid-route, continue on foot, re-board ----------
await page.keyboard.press('KeyE'); await page.waitForTimeout(1100); const off = await st();
check('dismount-with-E', off.transport === 'foot' && off.s === pre.s && off.roverS === pre.s, { transport: off.transport, s: +off.s.toFixed(2), roverS: +off.roverS.toFixed(2) });
const eyeOff = await mw(() => { const m = window.__mw, p = m.mission.poseAt(m.mission.st.s); return { d: Math.hypot(m.camera.position.x - p.x, m.camera.position.z - p.z), dy: m.camera.position.y - m.terrain.groundY(p.x, p.z), mode: document.querySelector('#hud-mode').textContent }; });
check('dismounted-on-ground-on-route', eyeOff.d < 0.05 && Math.abs(eyeOff.dy - 1.68) < 0.05 && eyeOff.mode.includes('도보'), `eye ${eyeOff.dy.toFixed(2)} m above the DTM on the route line; HUD: ${eyeOff.mode}`);
await lookAtRover(); await page.waitForTimeout(500); await shot('07-dismounted-beside-rover', 'dismounted mid-route, standing on the terrain beside the rover');
const foot2 = await hold('KeyW', 1500); const after = await st();
check('continue-on-foot', Math.abs(foot2.ds / foot2.dt - WALK) < 0.25 && after.roverS === off.roverS, `walked ${foot2.ds.toFixed(2)} m at ${(foot2.ds / foot2.dt).toFixed(2)} m/s; rover stays at ${after.roverS.toFixed(2)}`);
await page.keyboard.press('KeyE'); await page.waitForTimeout(1100); const re = await st();
check('re-board-within-range', re.transport === 'rover' && re.s === off.roverS, `re-boarded from ${(after.s - after.roverS).toFixed(2)} m away`);

// ---------- ride to the destination, dismount there ----------
await lookAhead(); const tRide = Date.now(), sRide = re.s; await page.keyboard.down('KeyW');
await page.waitForFunction(() => window.__mw.mission.st.arrived, null, { timeout: 150000 }); await page.keyboard.up('KeyW'); const rideSec = (Date.now() - tRide) / 1000, end = await st();
check('ride-to-destination', end.arrived && Math.abs(end.s - end.len) < 1e-6 && Math.abs((end.s - sRide) / rideSec - ROVER) < 0.3, `rode ${(end.s - sRide).toFixed(0)} m in ${rideSec.toFixed(0)} s (walking the same distance at ${WALK} m/s would take ${((end.s - sRide) / WALK).toFixed(0)} s)`);
check('sim-time-and-oxygen-advance', end.sim > pre.sim && end.o2 < pre.o2 && end.o2 > 95, `sim ${end.sim.toFixed(0)} s, oxygen ${end.o2.toFixed(2)} % (simulated)`);
await lookAhead(); await page.waitForTimeout(400); await shot('08-arrived-on-rover', 'arrived at the Cheyava Falls stop on the rover');
await page.keyboard.press('KeyE'); await page.waitForTimeout(1100); const endOff = await st();
check('dismount-at-destination', endOff.transport === 'foot' && endOff.arrived && endOff.roverS === endOff.len, { transport: endOff.transport, arrived: endOff.arrived });
await lookAtRover(); await page.waitForTimeout(500); await shot('09-dismounted-at-destination', 'on foot at the destination, rover parked beside the route');
await unlock();

// ---------- outside views (debug camera; state set by test hooks, labelled as such) ----------
await load(); await enterHud(page);
const ext = async (name, off, note, fov = 42) => { await mw(([o, f]) => { const m = window.__mw, p = m.rover.group.position; m.debugCamWorld(p.x + o[0], p.y + o[1], p.z + o[2], p.x, p.y + 1.0, p.z, f); }, [off, fov]); await page.waitForTimeout(800); await shot(name, note); };
await ext('01-rover-parked-outside', [-4.6, 1.5, -3.0], 'DEBUG camera: fictional open rover parked near the base ramp, wheels on the HiRISE 1 m DTM');
await load(); await enterHud(page);
await mw(() => { const m = window.__mw.mission; m.debugSetS(m.st.roverS); m.board(); m.debugSetS(150); }); await page.waitForTimeout(500);
await ext('10-rider-on-rover-outside', [4.2, 1.7, -3.6], 'DEBUG camera + test-hook position (s = 150 m): unrigged suit standing at the rover station', 40);
await ext('11-rover-side-terrain-fit', [5.5, 0.9, 0.2], 'DEBUG camera: side view, chassis pitch/roll and tyre contact on the DTM', 36);

results.finishedAt = new Date().toISOString(); results.summary = { pass: results.checks.filter((c) => c.pass).length, fail: results.checks.filter((c) => !c.pass).length };
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
console.log('\nsummary', JSON.stringify(results.summary), '| console issues', results.console.length, '| failed requests', results.failedRequests.length, '| perf', JSON.stringify(results.perf));
await browser.close(); process.exit(results.summary.fail ? 1 : 0);
