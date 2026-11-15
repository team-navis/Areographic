// Stage 2 (HUD elements, minimap dial, Shift time compression, data-based route) verification + captures.
// Usage: dev server running, then `npm run capture:stage2` (MW_URL / MW_OUT override target and output dir).
// Expected values are taken from the spec/source data (walk 1.4, rover 3.5 m/s, warp x4, O2 0.35 %/min,
// M20 waypoint 56_0 = 77.30519089E 18.49748444N, sample 25 sealed sol 1215), not from product output.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterHud, enterPad } from './lib/enter.mjs'; // integration: first HUD entry = indoor free walk + airlock exit; PAD = seat + centre monitor (key 2)
const URL = process.env.MW_URL || 'http://127.0.0.1:5173/', OUT = process.env.MW_OUT || 'docs/captures/stage2-hud-route';
mkdirSync(OUT, { recursive: true });
const WALK = 1.4, ROVER = 3.5, WARP = 4, O2 = 0.35, R = 3396190;
const results = { url: URL, startedAt: new Date().toISOString(), checks: [], captures: [], console: [], failedRequests: [], info: {} };
const check = (id, pass, detail) => { results.checks.push({ id, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.MW_HEADED, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') results.console.push({ type: m.type(), text: m.text().slice(0, 300) }); });
page.on('pageerror', (e) => results.console.push({ type: 'pageerror', text: String(e).slice(0, 400) }));
page.on('requestfailed', (r) => results.failedRequests.push(r.url())); page.on('response', (r) => { if (r.status() >= 400) results.failedRequests.push(`${r.status()} ${r.url()}`); });
const mw = (fn, arg) => page.evaluate(fn, arg);
const st = () => mw(() => { const s = window.__mw.mission.st; return { s: s.s, sim: s.simSeconds, o2: s.o2, dose: s.doseUsv, transport: s.transport, warp: s.warp, phase: s.phase, arrived: s.arrived, minimap: s.minimap, len: s.route.length, padS: s.padView.s }; });
const mode = (m, timeout = 40000) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout });
const shot = async (name, note) => { await page.screenshot({ path: `${OUT}/${name}.png` }); results.captures.push({ file: `${OUT}/${name}.png`, note }); };
const txt = (sel) => page.textContent(sel);
const hold = async (keys, ms) => { const a = await st(); for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); const b = await st(); for (const k of [...keys].reverse()) await page.keyboard.up(k); await page.waitForTimeout(120); return { ds: b.s - a.s, dsim: b.sim - a.sim, do2: a.o2 - b.o2, a, b }; };
const lookAhead = (pitch = -0.1) => mw((p) => { const m = window.__mw; m.look.yaw = m.mission.poseAt(m.mission.st.s).yaw; m.look.pitch = p; }, pitch);
const unlock = () => mw(() => document.exitPointerLock && document.exitPointerLock());

await page.goto(URL); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 });

// ---------- destination and route come from data ----------
const data = await mw(async () => {
  const m = window.__mw, rj = await (await fetch('/data/jezero/route.json')).json(), route = m.mission.routes['56_0'], pts = route.pts, T = m.terrain;
  const verts = rj.segments.flatMap((s) => s.xy_eqc.map(([X, Y]) => T.toWorld(X, Y)));
  const dist = (v) => { let b = 1e9; for (const p of pts) b = Math.min(b, Math.hypot(p.x - v.x, p.z - v.z)); return b; };
  const TOL = 0.011, d = verts.map(dist), onRoute = d.filter((x) => x < TOL).length, firstOn = d.findIndex((x) => x < TOL); // 1 cm: duplicate vertices shared by consecutive drives are merged
  let planAfterJoin = 0, prev = null; verts.forEach((v, i) => { if (i >= firstOn) { if (prev) planAfterJoin += Math.hypot(v.x - prev.x, v.z - prev.z); prev = v; } });
  const end = pts[pts.length - 1], wp = T.meta.waypoints.find((w) => w.site === 56 && w.drive === 0), nextWp = T.meta.waypoints.find((w) => w.site === 56 && w.drive === 784), w = T.toWorld(wp.x_eqc, wp.y_eqc);
  const out = pts.filter((p) => p.kind === 'terrain'), srcs = [...new Set(out.map((p) => T.ground(p.x, p.z).source))];
  return { nVerts: verts.length, onRoute, skippedUnderBase: firstOn, maxOff: Math.max(...d.slice(firstOn)), planAfterJoin, stats: route.stats, py: rj.python_check, endGap: Math.hypot(end.x - w.x, end.z - w.z), wp: { lon: wp.lon, lat: wp.lat, sol: wp.sol, x: wp.x_eqc, y: wp.y_eqc }, nextSol: nextWp.sol, srcs, hazards: route.hazards.map((h) => ({ s0: +h.s0.toFixed(1), s1: +h.s1.toFixed(1), side: h.side, max: +h.max.toFixed(1) })), segs: rj.segments.map((s) => [s.key, s.sol, s.published_length_m, +s.computed_plan_length_m.toFixed(2)]) };
});
results.info.route = data;
check('route-vertices-are-traverse-vertices', data.maxOff < 0.011 && data.onRoute === data.nVerts - data.skippedUnderBase, `${data.onRoute} of ${data.nVerts} published drive vertices lie on the route (first ${data.skippedUnderBase} are under the fictional base and skipped); max offset ${data.maxOff.toExponential(1)} m`);
check('route-length-matches-independent-sum', Math.abs(data.stats.traversePlanM - data.planAfterJoin) < 0.05, `browser traverse plan length ${data.stats.traversePlanM.toFixed(2)} m vs sum over JSON vertices ${data.planAfterJoin.toFixed(2)} m`);
check('published-vs-computed-drive-lengths', data.segs.every((s) => Math.abs(s[2] - s[3]) < 0.1), data.segs);
check('route-mostly-real-drive-line', data.stats.traverseM / (data.stats.oneWayM - data.stats.indoorM) > 0.95 && data.stats.connectorM < 12, `outdoor ${(data.stats.oneWayM - data.stats.indoorM).toFixed(1)} m = traverse ${data.stats.traverseM.toFixed(1)} m + connectors ${data.stats.connectorM.toFixed(1)} m`);
check('route-slope-from-dtm', Math.abs(data.stats.maxSlopeDeg - data.py.max_slope_5m_deg) < 1.0 && data.srcs.length === 1 && data.srcs[0] === 'HiRISE 1 m', `max slope (5 m baseline): browser ${data.stats.maxSlopeDeg.toFixed(2)} deg, python ${data.py.max_slope_5m_deg.toFixed(2)} deg; every outdoor route point on ${data.srcs}`);
check('destination-is-sampling-stop', data.endGap < 1e-6 && Math.abs(data.wp.lon - 77.30519089) < 1e-7 && Math.abs(data.wp.lat - 18.49748444) < 1e-7 && Math.abs(data.wp.x - R * data.wp.lon * Math.PI / 180) < 0.01 && data.wp.sol <= 1215 && 1215 < data.nextSol,
  `route ends on M20 waypoint 56_0 (${data.wp.lon}E, ${data.wp.lat}N); rover stayed there sol ${data.wp.sol} until the sol ${data.nextSol} drive, which brackets sample 25 sealing (sol 1215)`);

// ---------- HUD H1 items ----------
await enterHud(page); await page.waitForTimeout(400);
const h1 = { life: await txt('.hud-bl .hud-k'), o2: await txt('#hud-o2'), turn: await txt('#hud-turn'), rad: await txt('#hud-rad'), radLabel: await page.$eval('#hud-rad', (e) => e.parentElement.textContent), next: await txt('#hud-next'), dest: await txt('#hud-rem'), base: await txt('#hud-base'), buddyLabel: await page.$eval('#hud-buddy', (e) => e.parentElement.textContent), buddy: await txt('#hud-buddy'), mode: await txt('#hud-mode'), off: await txt('#hud-off'), comm: await txt('#hud-comm'), clock: await txt('#hud-status'), notice: await txt('.hud-brand') };
results.info.h1 = h1;
check('H1-items-present', /%/.test(h1.o2) && /기한 T\+25:00/.test(h1.turn) && /mSv/.test(h1.rad) && /°/.test(h1.next) && / m/.test(h1.dest) && /°/.test(h1.base) && h1.off === '경로 위' && /교신 양호/.test(h1.comm), h1);
check('simulated-values-labelled', /모의/.test(h1.life) && /모의/.test(h1.buddyLabel) && /모의/.test(h1.mode) && /모의/.test(h1.clock) && /가정/.test(h1.radLabel) && /SIMULATION/.test(h1.notice), 'LIFE, buddy, speed, clock carry 모의; radiation says 가정; notice says SIMULATION');

// ---------- minimap dial (M) ----------
const vis = () => page.isVisible('#hud-map');
const m0 = await vis(), sM = (await st()).s; await page.keyboard.press('KeyM'); await page.waitForTimeout(400); const m1 = await vis(), s1 = (await st()).s;
const ink = await page.$eval('#hud-mapcv', (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 190 && d[i + 1] > 215 && d[i + 2] < 200) n++; return n; });
check('minimap-off-by-default', m0 === false, 'hidden until the dial is pressed');
check('minimap-M-toggles-on', m1 === true && ink > 20 && s1 === sM, `visible after M; ${ink} route-coloured pixels drawn; position unchanged`);
await lookAhead(); await page.waitForTimeout(300); await shot('01-hud-h1-minimap-on', 'H1 items in the base + minimap opened with M');
await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
check('minimap-M-toggles-off', (await vis()) === false, 'hidden after second M');

// ---------- on foot: Shift does not compress time ----------
await mw(() => { window.__mw.look.yaw = Math.PI / 2; window.__mw.look.pitch = -0.08; });
const foot = await hold(['ShiftLeft', 'KeyW'], 2000);
check('shift-on-foot-no-warp', Math.abs(foot.ds / foot.dsim - WALK) < 0.05 && Math.abs(foot.dsim - 2) < 0.3 && foot.b.warp === 1, `W+Shift on foot: ${foot.ds.toFixed(2)} m in ${foot.dsim.toFixed(2)} sim s (x1)`);
await page.keyboard.down('KeyW'); await page.waitForFunction(() => { const s = window.__mw.mission.st; return s.roverS - s.s <= 2.4; }, null, { timeout: 40000 }); await page.keyboard.up('KeyW'); await page.waitForTimeout(300);
await lookAhead(-0.12); await page.waitForTimeout(300); await shot('02-hud-h1-walking-outdoor', 'walking outdoors: H1 life/nav, no minimap by default');
await page.keyboard.press('KeyE'); await page.waitForTimeout(1100);
check('boarded', (await st()).transport === 'rover', 'E near the rover');

// ---------- rover: W = x1, W+Shift = x4 time compression ----------
await lookAhead();
for (const k of ['KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft']) { await page.keyboard.down(k); await page.waitForTimeout(300); await page.keyboard.up(k); }
const idle = await st(); await page.waitForTimeout(1000); const idle2 = await st();
check('W-only-still-enforced', idle2.s === idle.s && Math.abs((idle2.sim - idle.sim) - 1) < 0.25, 'A/S/D/Space/Shift alone do not move; clock runs x1 when not driving');
const n1 = await hold(['KeyW'], 3000);
const w4 = await hold(['KeyW', 'ShiftLeft'], 3000);
results.info.warp = { normal: n1, warp: w4 };
check('rover-normal-rate', Math.abs(n1.ds / n1.dsim - ROVER) < 0.05 && Math.abs(n1.dsim - 3) < 0.35, `W: ${n1.ds.toFixed(2)} m in ${n1.dsim.toFixed(2)} sim s`);
check('shift-multiplies-progress-and-clock-equally', Math.abs(w4.ds / n1.ds - WARP) < 0.5 && Math.abs(w4.dsim / n1.dsim - WARP) < 0.5 && Math.abs(w4.ds / w4.dsim - ROVER) < 0.05,
  `W+Shift: ${w4.ds.toFixed(2)} m in ${w4.dsim.toFixed(2)} sim s -> distance x${(w4.ds / n1.ds).toFixed(2)}, clock x${(w4.dsim / n1.dsim).toFixed(2)}, speed still ${(w4.ds / w4.dsim).toFixed(2)} m/s`);
check('oxygen-follows-sim-clock', Math.abs(w4.do2 - (w4.dsim / 60) * O2) < 1e-6 && Math.abs(n1.do2 - (n1.dsim / 60) * O2) < 1e-6, `O2 drop ${w4.do2.toFixed(4)} % over ${w4.dsim.toFixed(2)} sim s = ${O2} %/min`);
await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await page.waitForTimeout(500);
const badge = { vis: await page.isVisible('#hud-warp'), text: await txt('#hud-warp') }; await shot('03-rover-shift-warp-x4', 'driving with W+Shift: warp badge, clock/oxygen advance x4');
await page.keyboard.up('ShiftLeft'); await page.waitForTimeout(400); const badgeOff = await page.isVisible('#hud-warp'); await shot('04-rover-normal-drive', 'driving with W only'); await page.keyboard.up('KeyW');
check('warp-badge', badge.vis && /×4/.test(badge.text) && /체험 시간 단축/.test(badge.text) && !badgeOff, badge.text);

// ---------- off-route warning logic (test hook: the product has no input that leaves the route) ----------
await mw(() => { window.__mw.mission.st.lateralDebug = 6; }); await page.waitForTimeout(400);
const offOn = { off: await txt('#hud-off'), cue: await txt('#hud-cue'), alarm: await page.$eval('#hud-off', (e) => e.classList.contains('caution')), alerts: await txt('#hud-alerts') }; await shot('05-off-route-warning-test-hook', 'TEST HOOK: camera displaced 6 m sideways to show the off-route warning state');
await mw(() => { window.__mw.mission.st.lateralDebug = 0; }); await page.waitForTimeout(300);
check('off-route-warning-logic', /^6\.\d m$/.test(offOn.off) && /경로 이탈/.test(offOn.cue) && offOn.alarm && /주의 1/.test(offOn.alerts) && (await txt('#hud-off')) === '경로 위', { ...offOn, note: 'threshold 5 m (assumption); triggered only via test hook' });

// ---------- comm lost: base keeps last-received values (test hook) ----------
await mw(() => window.__mw.mission.setComm(false)); const c0 = await st(); await hold(['KeyW'], 1500); const c1 = await st();
const commTxt = await txt('#hud-comm'); await shot('06-comm-lost-test-hook', 'TEST HOOK: comm link down, HUD shows last-received time');
check('comm-lost-last-received', /교신 끊김/.test(commTxt) && c1.s > c0.s + 3 && c1.padS === c0.padS, `${commTxt}; crew moved ${c0.s.toFixed(1)} -> ${c1.s.toFixed(1)} m while the base still holds ${c1.padS.toFixed(1)} m`);
await mw(() => window.__mw.mission.setComm(true)); await page.waitForTimeout(300);
check('comm-restored-syncs', Math.abs((await st()).padS - (await st()).s) < 1e-9 && /교신 양호/.test(await txt('#hud-comm')), 'base view catches up after the link returns');

// ---------- avoidance cue from DTM slope beside the route ----------
results.info.hazards = data.hazards;
let cueSeen = null;
await lookAhead(); await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
if (data.hazards.length) {
  await page.waitForFunction(() => { const c = document.querySelector('#hud-cue'); return !c.classList.contains('hidden') && /회피 큐/.test(c.textContent); }, null, { timeout: 60000 });
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await page.waitForTimeout(400); await lookAhead();
  cueSeen = { cue: await txt('#hud-cue'), mapAuto: await vis(), cap: await txt('#hud-mapcap'), s: (await st()).s }; await shot('07-avoidance-cue-auto-minimap', 'avoidance cue near a steep-slope zone (DTM), minimap shown automatically');
  await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
}
check('avoidance-cue-from-dtm', data.hazards.length === 0 ? true : /회피 큐/.test(cueSeen.cue) && cueSeen.mapAuto && /자동/.test(cueSeen.cap), data.hazards.length ? cueSeen : 'no zone reaches the threshold on this route (nothing to show)');

// ---------- base remote instruction (PAD -> HUD): sent / received / acknowledged / executed are distinct ----------
await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await page.waitForTimeout(200);
const sw = async (to) => { await unlock(); await page.waitForTimeout(150); await page.click('#btn-switch'); await mode('landing'); if (to === 'pad') await enterPad(page); else { await page.evaluate(() => window.__mw.enterRole('hud')); await mode('hud'); } await page.waitForTimeout(700); };
const remote = () => mw(() => { const r = window.__mw.mission.st.remote; return r && { ...r }; });
await sw('pad'); await page.click('#home-remote'); await page.waitForTimeout(700); const r1 = await remote(), r1txt = await txt('#home-remote-state');
check('remote-sent-not-yet-received', r1 && r1.sentAt !== null && r1.receivedAt === null && /HUD 수신 —/.test(r1txt), r1txt);
await sw('hud'); await page.waitForTimeout(500); const r2 = await remote(), cardR = await txt('#hud-card'), ph2 = (await st()).phase;
check('remote-received-shows-card', r2.receivedAt !== null && r2.ackAt === null && /기지 지시/.test(cardR) && ph2 === 'outbound', cardR.slice(0, 90));
await lookAhead(); await page.waitForTimeout(300); await shot('07b-remote-instruction-card', 'base remote instruction received on the HUD; waits for button 1');
await page.keyboard.press('Digit1'); await page.waitForTimeout(400); const r3 = await remote(), ph3 = (await st()).phase;
check('remote-ack-does-not-start-return', r3.ackAt !== null && r3.executedAt === null && ph3 === 'outbound', 'button 1 acknowledges only; phase stays outbound');
await page.mouse.wheel(0, 120); await page.waitForTimeout(250); const selHold = await page.$eval('#hud-card .hud-item.sel', (e) => e.dataset.act);
await page.keyboard.press('Digit1'); await page.waitForTimeout(300); const r4 = await remote();
check('remote-declined-by-crew', selHold === 'hold' && r4.declined === true && r4.executedAt === null && (await st()).phase === 'outbound' && !(await page.isVisible('#hud-card')), 'dial (wheel) moved the highlight to "보류", button 1 ran it; mission continues');

// ---------- arrival: proposed, confirmed with button 1 (no mouse click on the HUD) ----------
await lookAhead(); await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
await page.waitForFunction(() => window.__mw.mission.st.arrived, null, { timeout: 120000 }); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await page.waitForTimeout(500);
const arr = await st(); await lookAhead(); await page.waitForTimeout(300);
check('arrival-proposed-not-auto-confirmed', arr.phase === 'arrived' && arr.warp === 1 && /도착 확인/.test(await txt('#hud-card')), 'arrival prompt shown; phase stays "arrived" until the crew confirms');
await shot('08-arrival-prompt', 'arrived at the sampling stop: prompt names the button to press');
const cardBox = await page.locator('#hud-card').boundingBox(); await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height * 0.6); await page.waitForTimeout(300);
check('mouse-click-on-hud-does-nothing', (await st()).phase === 'arrived', 'clicking the arrival card changes nothing (mouse is look-only)');
await page.keyboard.press('Digit2'); await page.waitForTimeout(250); const collapsed = await txt('#hud-card'); await page.keyboard.press('Digit2'); await page.waitForTimeout(250);
check('button2-collapses-card', /접힘/.test(collapsed) && /도착 확인/.test(await txt('#hud-card')) && (await st()).phase === 'arrived', 'button 2 folds/unfolds the card without confirming');
await page.keyboard.press('Digit1'); await page.waitForTimeout(700);
check('arrival-confirm-with-button1', (await st()).phase === 'onsite', 'key 1 (button 1) confirms arrival');

// ---------- H2 task card: every item completed with dial + button 1 only ----------
const ref = await page.$eval('#hud-ref', (i) => ({ w: i.naturalWidth, h: i.naturalHeight, ok: i.complete })); const stay0 = await txt('#hud-stay'), simA = (await st()).sim; await page.waitForTimeout(2100); const stay1 = await txt('#hud-stay'), simB = (await st()).sim;
const cardTxt = await txt('#hud-card'); const toSec = (t) => +t.split(':')[0] * 60 + +t.split(':')[1];
check('H2-task-card', ref.ok && ref.w === 824 && !(await page.isVisible('#hud-ref')) && /잔여 체류/.test(cardTxt) && /PIA26368/.test(cardTxt) && /NASA\/JPL-Caltech\/MSSS/.test(cardTxt) && /미확인/.test(cardTxt) && /버튼 1/.test(cardTxt), `card lists items, stay time and the control mapping; v0.2: the reference image ${ref.w}x${ref.h}, credit and evidence tags stay in the card DOM but are no longer drawn cropped here (the photo is shown whole in the 관찰 대조 board, see stage3)`);
check('stay-timer-runs-on-sim-clock', toSec(stay0) - toSec(stay1) >= 1 && toSec(stay0) - toSec(stay1) <= 3 && toSec(stay0) <= 1200 && Math.abs((simB - simA) - 2.1) < 0.4, `stay ${stay0} -> ${stay1} while the sim clock advanced ${(simB - simA).toFixed(1)} s`);
const bb = await mw(() => { const m = window.__mw, b = m.mission.base, w = m.terrain.meta.waypoints.find((x) => x.site === 56 && x.drive === 0), p = m.terrain.toWorld(w.x_eqc, w.y_eqc); return { expected: Math.hypot(b.x - p.x, b.z - p.z), shown: document.querySelector('#hud-base').textContent }; });
check('base-direction-distance', Math.abs(parseFloat(bb.shown.split('·')[1]) - bb.expected) < 1, `HUD "${bb.shown}" vs straight line from waypoint 56_0 to the base ramp ${bb.expected.toFixed(1)} m`);
const recs = () => mw(() => window.__mw.mission.st.records.map((r) => ({ ...r })));
const sel = () => page.$eval('#hud-card .hud-item.sel', (e) => e.dataset.act);
const items = () => page.$$eval('#hud-card .hud-item', (els) => els.map((e) => ({ id: e.dataset.act, done: e.classList.contains('done'), state: e.querySelector('em').textContent })));
await shot('09-h2-task-card-reference-photo', 'H2 card: items with state, remaining stay, real WATSON reference photo, control mapping');
const it0 = await items(), sel0 = await sel();
for (const b of await page.$$('#hud-card .hud-item')) { const bx = await b.boundingBox(); await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.waitForTimeout(120); }
check('clicking-task-items-does-nothing', (await recs()).length === 0 && (await st()).phase === 'onsite' && JSON.stringify(await items()) === JSON.stringify(it0), 'a mouse click on every item: no record, no state change, no return');
await page.keyboard.press('Digit1'); await page.waitForTimeout(300); const it1 = await items();
check('H2-photo-mark-by-button1', sel0 === 'photo' && it1[0].done && it1[0].state === '1건' && (await recs()).length === 1, it1[0]); // the old one-press 관찰 item was removed (replaced by 현장 대조 / 관찰 대조)
await page.mouse.wheel(0, 120); await page.waitForTimeout(250); const sel1 = await sel(); await page.mouse.wheel(0, -120); await page.waitForTimeout(250); const sel1b = await sel(); await page.keyboard.press('Digit1'); await page.waitForTimeout(300); const it2 = await items();
check('H2-photo-mark-by-dial-wheel', sel1 === 'memo' && sel1b === 'photo' && it2[0].done && it2[0].state === '2건' && (await recs()).length === 2, it2[0]);
await page.keyboard.press('ArrowDown'); await page.waitForTimeout(250); const sel2 = await sel(); await page.keyboard.press('Digit1'); await page.waitForTimeout(400);
const memoOpen = await mw(() => ({ focused: document.activeElement && document.activeElement.id, value: document.querySelector('#hud-memo').value, speech: !!(window.SpeechRecognition || window.webkitSpeechRecognition) }));
results.info.speechApiAvailable = memoOpen.speech;
check('H3-memo-opens-with-bracket-dial', sel2 === 'memo' && memoOpen.focused === 'hud-memo' && memoOpen.value === '', `voice memo card open; fallback field focused and empty; Web Speech API present in this browser: ${memoOpen.speech}`);
await shot('09b-h3-voice-memo-fallback', 'H3 memo: push-to-talk V, labelled fallback text entry');
const sBefore = (await st()).s; await page.keyboard.type('pale veins along the rock, dark rimmed spots w a s d 1 2', { delay: 8 }); await page.waitForTimeout(200);
check('typing-memo-does-not-move-or-trigger', (await st()).s === sBefore && (await st()).phase === 'onsite' && (await recs()).length === 2, 'W/A/S/D/1/2 typed into the memo are text only');
await page.keyboard.press('Enter'); await page.waitForTimeout(400); const rr = await recs(), memo = rr[2], it3 = await items();
const metaOk = rr.every((r) => r.simT > 0 && Math.abs(r.s - arr.len) < 1e-6 && Math.abs(r.lonE - 77.30519089) < 1e-5 && Math.abs(r.latN - 18.49748444) < 1e-5 && r.sent === true);
check('H3-memo-saved-with-auto-metadata', rr.length === 3 && memo.type === 'memo' && /pale veins/.test(memo.text) && /대체 입력/.test(memo.input) && it3[1].done && metaOk, { id: memo.id, simT: +memo.simT.toFixed(1), s: +memo.s.toFixed(1), lonE: +memo.lonE.toFixed(6), latN: +memo.latN.toFixed(6), input: memo.input, sent: memo.sent });
await page.keyboard.press('Digit1'); await page.waitForTimeout(300); await page.keyboard.press('Digit2'); await page.waitForTimeout(300);
check('memo-cancel-with-button2', (await recs()).length === 3 && !(await page.$('#hud-memo')), 'reopened the memo and cancelled with button 2 on the empty field: no record added');
await shot('09c-h2-all-items-done', 'all three H2 items done, last record metadata shown');
await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200); const selB = await sel(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200); const selR = await sel(); // v0.2 items now sit between 메모 and 복귀 개시, so the test reaches 복귀 개시 by wrapping backwards
check('dial-both-directions', selB === 'photo' && selR === 'return', `[ moved back to ${selB}, [ again wrapped to ${selR}`);

// ---------- visual design audit (sizes, contrast, clear centre) on the busiest screen ----------
const audit = async (label) => {
  const els = await mw(() => { const out = []; document.querySelectorAll('#hud *').forEach((e) => { const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' '); if (!own || e.closest('[aria-hidden]')) return; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (!r.width || !r.height || cs.visibility === 'hidden' || e.closest('.hidden')) return; const clip = e.closest('.hud-compass'); if (clip) { const c = clip.getBoundingClientRect(); if (r.left < c.left || r.right > c.right) return; } // compass ticks scrolled outside the strip are clipped, not shown
    const cv = document.createElement('canvas').getContext('2d'); cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; out.push({ text: own.slice(0, 24), x: r.x, y: r.y, w: r.width, h: r.height, color: cs.color, fontPx: parseFloat(cs.fontSize), capPx: cv.measureText('H').actualBoundingBoxAscent }); }); return out; });
  await page.addStyleTag({ content: '#hud, #hud * { color: transparent !important; } #hud textarea { color: transparent !important; }' }).then((h) => h.evaluate((n) => n.id = 'audit-style')); await page.waitForTimeout(250);
  const png = (await page.screenshot()).toString('base64'); await mw(() => document.getElementById('audit-style').remove());
  return mw(async ({ els, png, label }) => {
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + png)).blob()), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }, L = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
    const pxPerDeg = (innerHeight / 2 / Math.tan((window.__mw.camera.fov / 2) * Math.PI / 180)) * Math.PI / 180;
    const rows = els.map((e) => { const I = 2, d = g.getImageData(Math.max(0, Math.floor(e.x) + I), Math.max(0, Math.floor(e.y) + I), Math.max(1, Math.ceil(e.w) - 2 * I), Math.max(1, Math.ceil(e.h) - 2 * I)).data /* 2 px inset: an element's own outline is not its background */, ls = []; for (let i = 0; i < d.length; i += 4) ls.push(L(d[i], d[i + 1], d[i + 2])); ls.sort((a, b) => a - b);
      const bg = ls[Math.floor(ls.length * 0.95)], m = e.color.match(/[\d.]+/g).map(Number), fg = L(m[0], m[1], m[2]); return { text: e.text, fontPx: e.fontPx, capDegVisor: e.capPx / pxPerDeg, capPx: e.capPx, contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) }; });
    const cx0 = innerWidth * 0.3, cx1 = innerWidth * 0.7, cy0 = innerHeight * 0.24, cy1 = innerHeight * 0.72;
    const central = [...document.querySelectorAll('#hud > div')].filter((e) => !e.classList.contains('hidden')).map((e) => ({ id: e.id || e.className, r: e.getBoundingClientRect() })).filter((e) => e.r.width && e.r.left < cx1 && e.r.right > cx0 && e.r.top < cy1 && e.r.bottom > cy0).map((e) => e.id);
    const minC = rows.reduce((a, b) => (b.contrast < a.contrast ? b : a)), minS = rows.reduce((a, b) => (b.capDegVisor < a.capDegVisor ? b : a));
    return { label, n: rows.length, pxPerDeg, minContrast: +minC.contrast.toFixed(2), minContrastText: minC.text, minCapDegVisor: +minS.capDegVisor.toFixed(3), minCapPx: +minS.capPx.toFixed(1), minFontPx: Math.min(...rows.map((r) => r.fontPx)), minCapText: minS.text, deskDegAt60cm: +(minS.capPx * 0.2646 / 600 * 180 / Math.PI).toFixed(3), centralIntrusions: central, statusVisible: !!document.querySelector('#hud-status').getBoundingClientRect().width };
  }, { els, png, label });
};
const a1 = await audit('onsite: H2 card + panels over bright terrain'); results.info.designAudit = [a1];
check('design-text-size', a1.minCapDegVisor >= 0.25 && a1.deskDegAt60cm >= 0.25, `smallest capital height ${a1.minCapPx} px ("${a1.minCapText}") = ${a1.minCapDegVisor} deg in the visor FOV (${a1.pxPerDeg.toFixed(1)} px/deg) and ${a1.deskDegAt60cm} deg on a 96-dpi screen at 60 cm; standard minimum 0.25 deg`);
check('design-contrast', a1.minContrast >= 6, `${a1.n} text elements; lowest contrast ${a1.minContrast}:1 ("${a1.minContrastText}") against the brightest 5 % of its actual background pixels; standard minimum 6:1`);
check('design-fixed-status-area', a1.statusVisible && /T\+/.test(await txt('#hud-clock')) && /교신/.test(await txt('#hud-comm')) && /경보|주의|경고/.test(await txt('#hud-alerts')), `always-visible strip: "${(await txt('#hud-status')).replace(/\s+/g, ' ').trim()}"`);

// ---------- H5 return: starts only when the crew runs it; same data-based route back; base arrival != mission end ----------
await page.keyboard.press('Digit1'); await page.waitForTimeout(500); const ret0 = await mw(() => { const s = window.__mw.mission.st; return { phase: s.phase, started: s.returnStartedAt, s: s.s, yaw: window.__mw.mission.poseAt(s.s).yaw, outYaw: window.__mw.mission.poseAt(s.s).outYaw }; });
check('H5-return-started-by-crew', ret0.phase === 'returning' && ret0.started !== null && Math.abs(Math.abs(ret0.yaw - ret0.outYaw) - Math.PI) < 1e-9, 'button 1 on "복귀 개시"; travel heading flips 180 deg on the same route');
await lookAhead(); await page.waitForTimeout(400);
const h5 = { navk: await txt('#hud-navk'), label: await txt('#hud-reml'), left: await txt('#hud-rem'), base: await txt('#hud-base'), turn: await txt('#hud-turn') };
check('H5-return-display', /복귀/.test(h5.navk) && /기지까지/.test(h5.label) && Math.abs(parseFloat(h5.left) - (arr.len - data.stats.indoorM)) < 1.5 && /°/.test(h5.base) && /복귀 개시함/.test(h5.turn), h5);
const back1 = await hold(['KeyW'], 2000);
check('return-W-moves-toward-base', Math.abs(back1.ds + ROVER * back1.dsim) < 0.2 && back1.ds < -6, `W while returning: ${back1.ds.toFixed(2)} m along the route in ${back1.dsim.toFixed(2)} sim s (rover)`);
await lookAhead(); await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await page.waitForTimeout(1500);
const a2 = await audit('returning: driving, no card'); results.info.designAudit.push(a2); await shot('12-h5-return-drive', 'H5: returning on the same route, base bearing and remaining distance, warp badge');
check('design-centre-clear-while-moving', a2.centralIntrusions.length === 0 && a2.minContrast >= 6 && a2.minCapDegVisor >= 0.25, `central 40 % x 48 % of the view has no HUD element while moving (intrusions: ${JSON.stringify(a2.centralIntrusions)}); lowest contrast ${a2.minContrast}:1 ("${a2.minContrastText}"), smallest capital ${a2.minCapDegVisor} deg`);
await page.waitForFunction(() => window.__mw.mission.st.phase === 'atBase', null, { timeout: 120000 }); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await page.waitForTimeout(500);
const atb = await st(); const more = await hold(['KeyW'], 800);
check('base-arrival-is-not-mission-end', atb.phase === 'atBase' && Math.abs(atb.s - data.stats.indoorM) < 1e-6 && more.ds === 0 && /임무는 아직 종료되지 않았습니다/.test(await txt('#hud-card')), `stopped at the base ramp (s=${atb.s.toFixed(2)} m); W no longer moves; card asks for mission end`);
await lookAhead(); await page.waitForTimeout(300); await shot('13-base-arrival-card', 'arrived at the base: mission not yet closed');
await page.keyboard.press('Enter'); await page.waitForTimeout(500); const endSt = await mw(() => { const s = window.__mw.mission.st; return { phase: s.phase, endedAt: s.endedAt, rec: window.__mw.mission.addRecord('photo', 'after end') }; });
check('mission-end-by-button1-alias-enter', endSt.phase === 'ended' && endSt.endedAt !== null && endSt.rec === null && /임무 종료/.test(await txt('#hud-card')), 'Enter (alias of button 1) closes the mission; no records after the end');
await shot('14-mission-ended', 'mission ended summary on the HUD');
results.info.end = await st();

// ---------- PAD: records, phase, remote states, data basis ----------
await sw('pad');
const homeTxt = await txt('#pad-main'), rows = await page.$$eval('#home-records tr', (t) => t.length - 1), remTxt = await txt('#home-remote-state');
check('pad-route-basis', /실제 주행선/.test(homeTxt) && /Sapphire Canyon/.test(homeTxt) && /마지막 수신 T\+/.test(homeTxt), 'PAD home states the traverse basis, the sampling-stop meaning and last-received time');
check('pad-shows-records-and-phase', rows === 3 && /pale veins/.test(homeTxt) && /임무 종료/.test(await txt('#home-phase')) && /77\.30519/.test(homeTxt), `${rows} records with time, route position, coordinates and text; phase "${await txt('#home-phase')}"`);
check('pad-remote-states-distinct', /전송 T\+/.test(remTxt) && /HUD 수신 T\+/.test(remTxt) && /대원 확인 T\+/.test(remTxt) && /실행 보류/.test(remTxt), remTxt);
await page.waitForTimeout(300); await shot('10-pad-home-records-remote', 'PAD home: route basis, mission phase, received records, remote instruction states');
await page.click('.pad-navbtn[data-page="site"]'); await page.waitForTimeout(800); await shot('11-pad-map-real-traverse-route', 'PAD map: route drawn along the published Perseverance drive line');

results.finishedAt = new Date().toISOString(); results.summary = { pass: results.checks.filter((c) => c.pass).length, fail: results.checks.filter((c) => !c.pass).length };
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
console.log('\nsummary', JSON.stringify(results.summary), '| console issues', results.console.length, '| failed requests', results.failedRequests.length);
await browser.close(); process.exit(results.summary.fail ? 1 : 0);
