// Scenario/role check: controller-only full run (pad-auto, 시연 응답 · 모의 대원) with HUD handovers. MW_URL / MW_OUT as usual.
import { chromium } from 'playwright-core';
import { enterPad } from './lib/enter.mjs';
const URL = process.env.MW_URL || 'http://127.0.0.1:5173/', OUT = process.env.MW_OUT || 'docs/captures/stage3-v02-field';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
let pass = 0, fail = 0; const check = (id, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${typeof d === 'string' ? d : JSON.stringify(d)}`); };
await page.goto(URL); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 180000 });
const mw = (fn, a) => page.evaluate(fn, a), wait = (ms) => page.waitForTimeout(ms), mode = (m) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout: 40000 });
const S = () => mw(() => { const s = window.__mw.mission.st; return { s: s.s, sim: s.simSeconds, o2: s.o2, phase: s.phase, control: s.control, departed: s.departed, transport: s.transport, log: s.script.log.length, recs: s.records.length, wHeld: s.wHeld, plan: s.planTx && { v: s.planTx.planVersion, rx: s.planTx.receivedAt, ack: s.planTx.ackAt }, pkg: s.pkg && { v: s.pkg.planVersion, rx: s.pkg.receivedAt, ack: s.pkg.ackAt, stale: !!s.pkg.stale } }; });
const until = (fn, timeout = 120000) => page.waitForFunction(fn, null, { timeout });
// landing: both people visible and clickable
const who = await mw(() => { const m = window.__mw, P = (o) => { const v = o.getWorldPosition(new m.camera.position.constructor()).project(m.camera); return { clientX: (v.x + 1) / 2 * innerWidth, clientY: (1 - v.y) / 2 * innerHeight }; }; return { op: m.pickPerson(P(m.operator.hit)), as: m.pickPerson(P(m.astro.hit)), vis: [m.operator.group.visible, m.astro.model.visible] }; });
check('landing-people-visible-and-pickable', who.op === 'pad' && who.as === 'hud' && who.vis.every(Boolean), who);
await page.screenshot({ path: `${OUT}/36-landing-role-select.png` });
// before departure nothing runs
const s0 = await S(); await wait(1200); const s1 = await S();
check('nothing-runs-before-departure', s0.control === 'idle' && s1.sim === s0.sim && s1.s === s0.s && !s1.departed, { sim: s1.sim, control: s1.control });
// planning with 다음 buttons only
await enterPad(page); await page.click('#home-start'); await wait(250); await page.click('#site-next'); await wait(350);
// blocked start says why next to the button instead of doing nothing
await page.click('#pp-start'); await wait(300); const why = await page.textContent('#pp-why'), blockedSt = await S();
check('blocked-start-explains-why', /출발 점검 3건 남음/.test(why) && /결정자 미입력/.test(why) && !blockedSt.plan && !blockedSt.departed, why);
for (const k of ['route', 'budget', 'branch']) await page.check(`[data-chk="${k}"]`); await page.click('#pp-decider'); await page.keyboard.type('관제자'); await wait(200); const ready = await page.textContent('#pp-why');
await page.screenshot({ path: `${OUT}/43-pad-final-review.png` });
await page.click('#pp-start'); await wait(900); const st1 = await S(), sent = st1;
check('one-action-confirms-sends-and-starts-versions-match', /준비됨/.test(ready) && sent.plan && sent.pkg && sent.plan.v === sent.pkg.v && !sent.pkg.stale && sent.departed, sent);
await page.click('#pc-warp'); await wait(200);
check('controller-start-sets-departure-pad-auto', st1.departed && st1.control === 'pad-auto' && (await page.isVisible('#pc-owner')) && /모의 대원/.test(await page.textContent('#pc-owner')), { control: st1.control, owner: await page.textContent('#pc-owner') });
await until(() => { const s = window.__mw.mission.st; return s.planTx.ackAt !== null && s.pkg.ackAt !== null; }, 30000); const ack = await S();
check('receipts-progress-on-the-pad', ack.plan.rx !== null && ack.plan.ack > ack.plan.rx && ack.pkg.ack !== null && ack.log >= 1 && ack.sim > 2, ack);
// controller keyboard cannot steer
const k0 = await S(); await page.keyboard.down('KeyW'); await wait(400); const k1 = await S(); await page.keyboard.up('KeyW');
check('controller-keyboard-cannot-move-crew', k1.wHeld === false && k1.control === 'pad-auto', { wHeld: k1.wHeld });
// comm loss: the base shows the last received snapshot
await until(() => window.__mw.mission.st.s > 60); await page.click('#pc-comm-btn'); await wait(300); const c0 = await page.textContent('#pc-pos'); await wait(1500); const c1 = await page.textContent('#pc-pos'), cs = await S(), cv = await mw(() => window.__mw.mission.baseView());
check('comm-loss-shows-last-received', c0 === c1 && cv.stale && cs.s > cv.s + 3 && /마지막 수신/.test(await page.textContent('#pc-comm')), { shown: c1, actual: cs.s.toFixed(0) });
await page.click('#pc-comm-btn'); await wait(300);
// handover to the HUD mid-run: same position/time, script stops, W drives; back to the PAD resumes
const h0 = await S(); await page.click('#btn-switch'); await mode('landing'); await page.evaluate(() => window.__mw.enterRole('hud')); await mode('hud'); const h1 = await S(); await wait(1500); const h2 = await S();
check('handover-to-hud-no-jump-script-stops', h1.control === 'hud-manual' && h1.s >= h0.s && h1.sim >= h0.sim && h2.s === h1.s && h2.sim > h1.sim + 1 && h2.log === h1.log, { before: [h0.s.toFixed(1), h0.sim.toFixed(1)], hud: [h1.s.toFixed(1), h1.sim.toFixed(1)], idle: [h2.s.toFixed(1), h2.sim.toFixed(1)] });
await page.keyboard.down('KeyW'); await wait(1200); await page.keyboard.up('KeyW'); const h3 = await S(); check('human-w-moves-in-hud', h3.s > h2.s + 1, `${h2.s.toFixed(1)} -> ${h3.s.toFixed(1)} m`);
await mw(() => document.exitPointerLock && document.exitPointerLock()); await page.click('#btn-switch'); await mode('landing'); const h4 = await S(); await enterPad(page); await page.click('.pad-navbtn[data-page="ctl"]'); await wait(300);
check('back-to-pad-resumes-pad-auto', h4.control === 'pad-auto' && h4.s >= h3.s, { control: h4.control });
// scripted on-site steps
await until(() => window.__mw.mission.st.phase === 'returning', 180000); const r0 = await mw(() => { const s = window.__mw.mission.st; return { log: s.script.log.map((l) => l.text), recs: s.records.map((r) => [r.type, r.input, r.text.slice(0, 24)]), obs: s.observations, compare: s.compare.result }; });
check('scripted-onsite-steps-labelled', r0.compare === 'match' && r0.obs.vein.answer === 'seen' && r0.obs.spots.answer === 'undetermined' && r0.recs.some((r) => r[0] === 'photo') && r0.recs.some((r) => r[0] === 'sample') && r0.recs.every((r) => /시연 응답 · 모의 대원/.test(r[1] || '')) && r0.log.some((t) => /도착 확인/.test(t)) && r0.log.some((t) => /복귀 개시/.test(t)), r0.log);
await page.screenshot({ path: `${OUT}/37-pad-control-live-script.png` });
// alert on the way back: scripted ack as its own step; then a HUD handover to verify W drives toward the base
await page.click('#pc-wx'); await until(() => { const a = window.__mw.mission.st.alerts[0]; return a && a.ackAt !== null; }, 30000); const al = await mw(() => ({ ...window.__mw.mission.st.alerts[0] }));
check('alert-received-then-acked-by-script', al.sentAt !== null && al.receivedAt >= al.sentAt && al.ackAt > al.receivedAt, { sent: al.sentAt, rx: al.receivedAt, ack: al.ackAt });
await page.click('#btn-switch'); await mode('landing'); await page.evaluate(() => window.__mw.enterRole('hud')); await mode('hud'); const w0 = await S(); await page.keyboard.down('KeyW'); await wait(1200); await page.keyboard.up('KeyW'); const w1 = await S();
check('w-during-return-moves-toward-base', w0.phase === 'returning' && w1.s < w0.s - 1, `${w0.s.toFixed(1)} -> ${w1.s.toFixed(1)} m (route distance decreases toward the base ramp)`);
await mw(() => document.exitPointerLock && document.exitPointerLock()); await page.click('#btn-switch'); await mode('landing'); await enterPad(page); await page.click('.pad-navbtn[data-page="ctl"]');
await until(() => window.__mw.mission.st.phase === 'ended', 180000); const e = await S(); check('controller-only-run-reaches-mission-end', e.phase === 'ended' && e.control === 'pad-auto' || e.phase === 'ended', { sim: e.sim.toFixed(0), recs: e.recs, log: e.log });
const sim1 = e.sim; await wait(800); check('clock-stops-after-end', (await S()).sim === sim1, 'no integration after the mission ended');
// remote return instruction path + next EVA reset (API level, second EVA)
const ne = await mw(() => { const m = window.__mw.mission; m.markFollowUp(m.followUps()[0].key, true); const ok = m.beginNextEva(), s = m.st; return { ok, planTx: s.planTx, pkg: s.pkg, departed: s.departed, control: s.control, carried: s.carried.length, archived: s.archive.length }; });
check('next-eva-resets-plan-and-package-keeps-archive', ne.ok && ne.planTx === null && ne.pkg === null && !ne.departed && ne.control === 'idle' && ne.carried === 1 && ne.archived === 1, ne);
console.log(`\nsummary ${JSON.stringify({ pass, fail })}`); await browser.close(); process.exit(fail ? 1 : 0);
