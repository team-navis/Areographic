// Stage 1 browser verification + captures (real Chrome via playwright-core, no bundled browser download).
// Usage: npm run dev   (other terminal)   then   npm run capture:stage1
//        MW_URL=http://127.0.0.1:4173/ npm run capture:stage1   to run against `npm run preview` (built output)
// Expected values below are written from the spec, not copied from product output.
// Integration (integrate/immersive): the base interior is the teammate's 3D habitat. Checks marked [changed] were adapted because that
// interior intentionally changed behaviour (see docs/integration-immersive.md, "바뀐 검사 기대값"). Outdoor checks are unchanged.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterHabitat, walkOutThroughAirlock, openMonitor } from './lib/enter.mjs';

const URL = process.env.MW_URL || 'http://127.0.0.1:5173/';
const OUT = process.env.MW_OUT || 'docs/captures/stage1';
mkdirSync(OUT, { recursive: true });
const results = { url: URL, startedAt: new Date().toISOString(), checks: [], captures: [], console: [], failedRequests: [], perf: [] };
const check = (id, pass, detail) => { results.checks.push({ id, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };

const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.MW_HEADED, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') results.console.push({ type: m.type(), text: m.text().slice(0, 300) }); });
page.on('pageerror', (e) => results.console.push({ type: 'pageerror', text: String(e).slice(0, 400) }));
page.on('requestfailed', (r) => results.failedRequests.push(r.url()));
page.on('response', (r) => { if (r.status() >= 400) results.failedRequests.push(`${r.status()} ${r.url()}`); });

const mw = (fn, arg) => page.evaluate(fn, arg);
const S = () => mw(() => window.__mw.mission.st.s);
const mode = (m, timeout = 30000) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout });
const shot = async (name, note) => { await page.screenshot({ path: `${OUT}/${name}.png` }); results.captures.push({ file: `${OUT}/${name}.png`, note }); };
const perf = async (label) => { await page.waitForTimeout(1300); results.perf.push({ label, ...(await mw(() => window.__mw.stats())) }); };

const t0 = Date.now();
await page.goto(URL); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 });
results.loadMs = Date.now() - t0; results.gl = await mw(() => window.__mw.glInfo);
check('boot', await mw(() => window.__mw.ready === true), `ready in ${results.loadMs} ms, renderer: ${results.gl}`);

// ---------- C01 landing: brand + two roles in one 3D space ----------
await page.waitForTimeout(800);
check('C01-wordmark', (await page.textContent('#landing h1')).trim() === 'mars walk', '[changed] landing h1 is the habitat name (was "mars walk")');
check('C01-two-role-buttons', (await page.locator('#landing button.role').count()) === 2, 'two role buttons');
const mons = await mw(() => window.__mw.monitors);
check('C01-three-monitors-in-room', JSON.stringify(mons) === JSON.stringify(['science', 'planner', 'systems']), `[changed] the landing view is the habitat room with three 3D monitors (was: two clickable 3D figures) ${JSON.stringify(mons)}`);
await perf('landing'); await shot('01-landing-role-select', 'landing: habitat room, two roles');

// ---------- C02 controller: role button -> controller seat -> centre monitor (key 2) -> real DOM interaction ----------
await page.evaluate(() => window.__mw.enterRole('pad')); await mode('pad');
check('C02-role-button-enters-seat', (await page.locator('.monitor-dock button').count()) === 3, '[changed] entered by the role button (was: clicking the seated 3D figure); seat shows three monitor choices');
await page.waitForTimeout(500); await perf('pad-seat'); await shot('02-pad-seat', 'controller seat: three 3D monitors with live previews');
const sPad0 = await S(); await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
check('C08-W-ignored-in-pad', (await S()) === sPad0, `s stays ${sPad0}`);
await openMonitor(page, 'planner');
await page.click('#home-start'); await page.waitForSelector('#pad-map');
const rankOf = () => page.$$eval('#pad-rank li', (ls) => ls.map((l) => l.dataset.key));
const scoreOf = () => page.$$eval('#pad-rank li .pad-cand-m b', (bs) => bs.map((b) => b.textContent));
const mapHash = () => page.$eval('#pad-map', (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0; return h; });
const rank0 = await rankOf(), score0 = await scoreOf(), hash0 = await mapHash();
await page.waitForTimeout(300); await shot('03-pad-site-before', '① 지점 고르기 before interaction (default weights 60/20/20)');
// slider: real mouse click near the left end of the "과학 근거" range input
const sl = await page.locator('input[data-weight="sci"]').boundingBox(); await page.mouse.click(sl.x + sl.width * 0.03, sl.y + sl.height / 2);
const sci = await page.$eval('input[data-weight="sci"]', (e) => +e.value), rank1 = await rankOf(), score1 = await scoreOf();
check('C02-slider-moves', sci <= 10, `과학 근거 weight now ${sci}`);
check('C02-slider-reorders-ranking', JSON.stringify(rank0) !== JSON.stringify(rank1), { before: rank0, after: rank1, scoresBefore: score0, scoresAfter: score1 });
await page.click('input[data-layer="slope"]'); await page.click('input[data-layer="shade"]'); await page.waitForTimeout(200);
check('C02-layer-toggle-redraws-map', (await mapHash()) !== hash0, 'map canvas pixels changed after toggling slope + hillshade layers');
const len0 = await mw(() => window.__mw.mission.st.route.length);
await page.click('#pad-rank li[data-key="54_0"] .pad-pick'); await page.waitForTimeout(300);
const len1 = await mw(() => window.__mw.mission.st.route.length), dest1 = await mw(() => window.__mw.mission.st.destKey), ver1 = await mw(() => window.__mw.mission.st.planVersion);
check('C02-pick-destination-changes-shared-plan', dest1 === '54_0' && len1 < len0 && ver1 === 2, { routeLengthBefore: len0, after: len1, planVersion: ver1 });
await shot('04-pad-site-after', 'after: 과학 근거 weight ≈0, slope + hillshade layers on, destination switched to 54_0');
await page.click('#pad-rank li[data-key="56_0"] .pad-pick'); await page.waitForTimeout(200);
check('C03-plan-restored-to-cheyava', (await mw(() => window.__mw.mission.st.destKey)) === '56_0' && Math.abs((await mw(() => window.__mw.mission.st.route.length)) - len0) < 1e-6, 'destination back to 56_0, same route length');
await shot('05-pad-monitor-focus', 'centre monitor detail screen'); await mw(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('KeyF');
await page.waitForFunction(() => window.__mw.mode === 'pad' && !window.__mw.activeMonitor, null, { timeout: 15000 });

// ---------- field crew: role button -> free walk inside the habitat (teammate's interior), EVA clock stopped ----------
await page.click('#btn-switch'); await mode('landing'); await page.waitForTimeout(400);
await enterHabitat(page); await page.waitForTimeout(500);
check('C01-role-button-enters-habitat-walk', (await mw(() => !!window.__mw.mission.st.habitatPose)) && (await page.isVisible('#walk-ui')) && !(await page.isVisible('#hud')), '[changed] first entry is indoor free walk without the HUD (was: helmet transition straight to the HUD inside the base)');
await perf('habitat-walk'); await shot('09-habitat-walk', 'first person inside the habitat before departure (no HUD)');
const W = () => mw(() => { const w = window.__mw.walk.state; return { x: w.x, z: w.z }; });
const yaw0 = await mw(() => window.__mw.look.yaw);
await page.mouse.move(800, 300); await page.mouse.down(); await page.mouse.move(520, 320, { steps: 12 }); await page.mouse.up();
const yaw1 = await mw(() => window.__mw.look.yaw);
results.pointerLockAcquired = await mw(() => !!document.pointerLockElement);
check('HUD-mouse-look', Math.abs(yaw1 - yaw0) > 0.3, `look yaw ${yaw0.toFixed(2)} -> ${yaw1.toFixed(2)} rad by mouse drag (indoor walk; the HUD uses the same handler)`);
await page.waitForTimeout(300); await shot('10-habitat-mouse-look', 'after dragging the view');
await mw(() => { window.__mw.look.yaw = Math.PI / 2; window.__mw.look.pitch = 0; }); // face west (toward the airlock)
const w0 = await W(); await page.waitForTimeout(800);
check('indoor-no-move-without-keys', JSON.stringify(await W()) === JSON.stringify(w0), `stays at ${JSON.stringify(w0)}`);
const press = async (k, ms) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); await page.waitForTimeout(120); return W(); };
const wW = await press('KeyW', 700), wS = await press('KeyS', 400), wA = await press('KeyA', 400), wD = await press('KeyD', 250);
check('indoor-WASD-free-walk', wW.x < w0.x - 0.6 && wS.x > wW.x + 0.3 && wA.z > wS.z + 0.3 && wD.z < wA.z - 0.15,
  `[changed] inside the base W/S/A/D move freely (was: W-only along the fixed indoor leg). W ${w0.x.toFixed(2)}->${wW.x.toFixed(2)} x, S ->${wS.x.toFixed(2)} x, A z ${wS.z.toFixed(2)}->${wA.z.toFixed(2)}, D ->${wD.z.toFixed(2)}`);
const idle = await mw(() => { const s = window.__mw.mission.st; return { s: s.s, sim: s.simSeconds, o2: s.o2 }; });
check('indoor-walk-does-not-spend-EVA', idle.s === 0 && idle.sim === 0 && idle.o2 === 100, idle);
await mw(() => { window.__mw.look.yaw = 0; }); const pre = await W(); await page.keyboard.down('KeyW'); await page.waitForTimeout(3500); await page.keyboard.up('KeyW'); const hit = await W(); // walk north into the main bench
check('indoor-collision-with-furniture', hit.z >= -2.02 + 0.22 - 0.01 && hit.z < pre.z - 0.5, `walking north for 3.5 s (4.9 m of input) stops at furniture: z ${pre.z.toFixed(2)} -> ${hit.z.toFixed(2)} (bench front z = -2.02 m, chair back z = -1.27 m, capsule radius 0.22 m)`);
await shot('11-habitat-at-bench', 'stopped by furniture collision in front of the monitors');
await mw(() => { window.__mw.look.yaw = Math.PI; }); await press('KeyW', 1100); // step back south so the doorway line (z = 1 m) is reachable
await walkOutThroughAirlock(page);
const dep = await mw(() => { const m = window.__mw, s = m.mission.st, ramp = s.route.pts.find((p) => p.kind === 'ramp'); return { s: s.s, rampS: ramp.s, hp: s.habitatPose, mode: m.mode, control: s.control, sim: s.simSeconds }; });
check('airlock-exit-joins-fixed-route', dep.mode === 'hud' && dep.hp === null && dep.control === 'hud-manual' && dep.s >= dep.rampS - 1e-9 && dep.s < dep.rampS + 0.5, `[changed] the HUD starts at the airlock exit on the ramp (s = ${dep.s.toFixed(2)} m, ramp starts at ${dep.rampS.toFixed(2)} m; was s = 0 inside the base)`);
await page.waitForTimeout(600); await perf('hud-on-ramp'); await shot('12-airlock-exit-hud', 'just outside the airlock: helmet HUD on the fixed route');

// ---------- C05/C06/C07/C08: W-only fixed-route movement (outside) ----------
const s0 = await S();
await page.waitForTimeout(1200); check('C05-no-move-without-W', (await S()) === s0, `s stays ${s0} with no key held`);
for (const k of ['KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp']) { await page.keyboard.down(k); await page.waitForTimeout(450); await page.keyboard.up(k); }
const offAfter = await mw(() => { const m = window.__mw, st = m.mission.st, p = m.mission.poseAt(st.s), c = m.camera.position; return Math.hypot(c.x - p.x, c.z - p.z); });
check('C06-ASD-space-do-nothing', (await S()) === s0 && offAfter < 0.06 && (await mw(() => window.__mw.walk.state.exited)), `outside: s stays ${s0.toFixed(2)} after A/S/D/Space/ArrowUp, camera ${offAfter.toFixed(3)} m from the route point (indoor free walk is latched off)`);
const tW = Date.now(); await page.keyboard.down('KeyW'); await page.waitForTimeout(2000); await page.keyboard.up('KeyW'); const held = (Date.now() - tW) / 1000;
const s1 = await S(); await page.waitForTimeout(700); const s1b = await S();
check('C06-W-hold-advances', s1 - s0 > 1.4 * 2.0 * 0.85 && s1 - s0 < 1.4 * held * 1.15, `advanced ${(s1 - s0).toFixed(2)} m in ~${held.toFixed(2)} s (spec speed 1.4 m/s)`);
check('C08-release-stops', s1b === s1, `s stays ${s1.toFixed(2)} after release`);
await page.waitForTimeout(500); await shot('13-w-ramp', `on the exit ramp after holding W ~2 s (s = ${s1.toFixed(2)} m)`);
// look sideways/back while W is held: progress still follows the route, not the gaze
await mw(() => { window.__mw.look.yaw += 2.4; }); await page.keyboard.down('KeyW'); await page.waitForTimeout(1500);
const onRoute = await mw(() => { const m = window.__mw, st = m.mission.st, p = m.mission.poseAt(st.s), c = m.camera.position; return Math.hypot(c.x - p.x, c.z - p.z); });
await page.keyboard.up('KeyW'); const s2 = await S();
check('C07-gaze-does-not-steer', s2 > s1 && onRoute < 0.06, `looking back: s ${s1.toFixed(2)} -> ${s2.toFixed(2)}, camera stays ${onRoute.toFixed(3)} m from the route point`);
// window blur drops the key
await page.keyboard.down('KeyW'); await page.waitForTimeout(300); await mw(() => window.dispatchEvent(new Event('blur'))); const sB = await S(); await page.waitForTimeout(700);
check('C08-blur-stops', (await S()) === sB, 'no progress after window blur while W is still physically down'); await page.keyboard.up('KeyW');
await mw(() => { window.__mw.look.yaw = Math.PI / 2; window.__mw.look.pitch = -0.05; });
await page.keyboard.down('KeyW'); await page.waitForFunction(() => window.__mw.mission.st.s >= 22, null, { timeout: 40000 }); await page.keyboard.up('KeyW'); await page.waitForTimeout(600);
const sOut0 = await S(); const src0 = await mw(() => { const m = window.__mw, p = m.mission.poseAt(m.mission.st.s); return { kind: p.kind, ground: m.terrain.ground(p.x, p.z) }; });
check('outdoor-on-real-dtm', src0.kind === 'terrain' && src0.ground.source === 'HiRISE 1 m', src0);
await perf('hud-outdoor'); await shot('14-outdoor-w-before', `outdoors on the HiRISE 1 m DTM, before W: s = ${sOut0.toFixed(2)} m`);
await page.keyboard.down('KeyW'); await page.waitForTimeout(5000); await page.keyboard.up('KeyW'); await page.waitForTimeout(400);
const sOut1 = await S(); const footErr = await mw(() => { const m = window.__mw, st = m.mission.st, p = m.mission.poseAt(st.s); return Math.abs(m.camera.position.y - 1.68 - m.terrain.groundY(p.x, p.z)); });
check('outdoor-W-advances', sOut1 - sOut0 > 5.5, `s ${sOut0.toFixed(2)} -> ${sOut1.toFixed(2)} m`);
check('eye-follows-terrain-height', footErr < 0.08, `|eye - 1.68 m - DTM ground| = ${footErr.toFixed(3)} m (includes head bob)`);
await shot('15-outdoor-w-after', `after holding W 5 s: s = ${sOut1.toFixed(2)} m`);

// ---------- C09 (stage-1 part): role switch keeps the same position/plan ----------
await mw(() => document.exitPointerLock && document.exitPointerLock()); await page.waitForTimeout(300); // stands in for the user's Esc (browser-level key, not scriptable)
check('pointer-lock-state', true, `pointer lock acquired on click in this browser run: ${results.pointerLockAcquired}`);
await page.click('#btn-switch'); await mode('landing'); await page.evaluate(() => window.__mw.enterRole('pad')); await mode('pad'); await openMonitor(page, 'planner');
await page.click('.pad-navbtn[data-page="home"]'); await page.waitForTimeout(700);
const homeS = await page.textContent('#home-s'), sPad = await S();
check('C09-position-survives-role-switch', Math.abs(sPad - sOut1) < 1e-6 && homeS.startsWith(sOut1.toFixed(1)), `PAD home shows "${homeS}", mission s = ${sPad.toFixed(2)}`);
await page.click('.pad-navbtn[data-page="site"]'); await page.waitForTimeout(700);
await page.click('#pad-rank li[data-key="54_0"] .pad-pick'); await page.waitForTimeout(200);
check('route-fixed-after-departure', (await mw(() => window.__mw.mission.st.destKey)) === '56_0', 'destination change refused once the walker has departed');
await shot('16-pad-after-walk', 'PAD map after the walk: same mission state, walker dot outside the base');
// HUD re-entry after departure plays the helmet transition (approach -> shoulder -> visor -> inside); pause on each keyframe to capture it
await page.click('#btn-switch'); await mode('landing'); await page.waitForTimeout(300);
await mw(() => { window.__mw.director.hold = true; }); await page.evaluate(() => window.__mw.enterRole('hud'));
for (const [i, ph] of [['06', 'APPROACH'], ['07', 'SHOULDER'], ['08', 'VISOR']]) {
  await page.waitForFunction((n) => window.__mw.phase === n && window.__mw.director.waiting, ph, { timeout: 20000 }); await page.waitForTimeout(350);
  await shot(`${i}-transition-${ph.toLowerCase()}`, `transition keyframe ${ph} (paused for capture)`); await mw(() => window.__mw.director.release());
}
await mode('hud', 40000); await mw(() => { window.__mw.director.hold = false; });
check('C01-hud-reentry-helmet-transition', true, '[changed] the APPROACH/SHOULDER/VISOR/INSIDE transition now plays on HUD re-entry after departure (first entry is the airlock walk)');
check('C05-hud-resumes-same-position', Math.abs((await S()) - sOut1) < 1e-6, 'HUD re-entry continues from the same s');

await mw(() => document.exitPointerLock && document.exitPointerLock());
// ---------- debug-only jump for a far-route capture (not a product feature) ----------
await mw(() => { window.__mw.mission.debugSetS(236); window.__mw.look.yaw = -0.9; window.__mw.look.pitch = -0.08; }); await page.waitForTimeout(1500);
await perf('hud-outdoor-far'); await shot('17-outdoor-debug-jump-s236', 'DEBUG jump to s = 236 m (toward Bright Angel); position set by test hook, not walked');

results.finishedAt = new Date().toISOString();
results.summary = { pass: results.checks.filter((c) => c.pass).length, fail: results.checks.filter((c) => !c.pass).length };
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
console.log('\nsummary', JSON.stringify(results.summary), '| console issues', results.console.length, '| failed requests', results.failedRequests.length);
console.log('perf', JSON.stringify(results.perf));
await browser.close(); process.exit(results.summary.fail ? 1 : 0);
