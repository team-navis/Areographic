// One human-path run (no scripted crew) that checks the Astra follow-ups and saves a sample trace.
//   plan (도보 가정) sent from the PAD -> crew walks out -> acks -> on-site compare / observation answers / memo / sample
//   -> base return instruction: 보류 -> weather alert: 확인 -> 복귀 선택 -> 복귀 개시 -> base -> airlock -> inside -> PAD export.
// Travel along the route is skipped with the debugSetS test hook (the walk itself is covered elsewhere); every decision is a HUD button
// or a typed HUD command. Usage: MW_URL=http://127.0.0.1:4180/ node tools/evidence-trace.mjs
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { enterHabitat, walkOutThroughAirlock } from '../tests/lib/enter.mjs';
const URL = process.env.MW_URL || 'http://127.0.0.1:4180/', SHOTS = 'docs/captures/evidence'; mkdirSync(SHOTS, { recursive: true }); mkdirSync('docs/evidence', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true }), page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e.stack).slice(0, 400)));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms), shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.jpg`, quality: 85 }), mode = (m) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout: 40000 });
let fails = 0; const check = (name, ok, info = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' · ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const acts = () => ev(() => window.__mw.hud.actions().map((a) => a.id)), b1 = async () => { await page.keyboard.press('Digit1'); await wait(350); }, cmd = async (t) => { const r = await ev((x) => { window.__mw.fx.command(x); return window.__mw.fx.ui.lastCommand; }, t); await wait(350); return r; };
const pick = async (id) => { await ev((x) => { const h = window.__mw.hud, i = h.actions().findIndex((a) => a.id === x); if (i >= 0) h.ui.sel = i; }, id); await wait(150); const before = await acts(); await page.keyboard.press(before.indexOf(id) >= 0 ? 'Digit1' : 'F24'); await wait(400); }; // highlight (dial) + button 1
const st = () => ev(() => { const s = window.__mw.mission.st; return { phase: s.phase, s: s.s, control: s.control, transport: s.transport }; });

await page.goto(URL); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 }); await ev(() => { window.__mw.mission.st.holdAuto = true; });
// ---- PAD: plan with the walking assumption (item 3) ----
await ev(() => window.__mw.enterRole('pad')); await mode('pad'); await page.keyboard.press('Digit2'); await page.waitForFunction(() => window.__mw.activeMonitor === 'planner' && !!document.querySelector('#terminal-overlay .terminal-active'), null, { timeout: 15000 });
await ev(() => window.__mw.pad.show('go')); await wait(500);
const bud = async (t) => { await page.selectOption('#pp-transport4', t); await wait(200); return ev(() => { const b = window.__mw.mission.planBudget(); return { transport: b.transport, speed: b.speed, outM: +b.outM.toFixed(1), travelSec: +b.travelSec.toFixed(1), staySec: b.staySec, turnaroundSec: b.turnaroundSec, totalSec: +b.totalSec.toFixed(1), o2AtReturn: +b.o2AtReturn.toFixed(2), summary: document.querySelector('#pp-movesum').textContent }; }); };
const rover = await bud('rover'), foot = await bud('foot'); console.log('budget rover', JSON.stringify(rover)); console.log('budget foot ', JSON.stringify(foot));
check('budget-uses-chosen-speed', Math.abs(foot.travelSec - foot.outM / 1.4) < 0.2 && Math.abs(rover.travelSec - rover.outM / 3.5) < 0.2 && foot.staySec === rover.staySec && foot.outM === rover.outM, `same ${foot.outM} m and ${foot.staySec} s of tasks: 도보 ${foot.travelSec} s vs 로버 ${rover.travelSec} s one way`);
check('turnaround-follows-speed', foot.turnaroundSec === Math.ceil((foot.travelSec + foot.staySec + 180) / 60) * 60 && foot.turnaroundSec > rover.turnaroundSec, `돌아설 시각 도보 ${foot.turnaroundSec} s / 로버 ${rover.turnaroundSec} s`);
check('final-review-shows-assumption', /이동 가정: 도보 1\.4 m\/s \(모의\)/.test(foot.summary), foot.summary); await shot('01-final-review-walk-assumption');
await page.click('#pp-send'); await wait(800); check('plan-sent-with-transport', await ev(() => { const t = window.__mw.mission.st.planTx; return !!t && t.transport === 'foot' && !window.__mw.mission.st.departed; }));
// scripted crew follows the plan transport (separate state probe, restored afterwards): on foot it never boards
// ---- crew: walk out, acknowledge ----
await ev(() => document.getElementById('btn-switch').click()); await mode('landing'); await enterHabitat(page); await walkOutThroughAirlock(page); await wait(1500);
for (let i = 0; i < 4 && /ack/.test((await acts())[0] || ''); i++) await b1();
check('plan-and-package-acked-by-person', await ev(() => { const s = window.__mw.mission.st; return s.planTx.ackAt !== null && s.planTx.ackBy === 'hud-manual' && s.pkg && s.pkg.ackAt !== null; }));
await ev(() => { const m = window.__mw.mission; m.debugSetS(m.st.route.length - 2.5); }); await page.keyboard.down('KeyW'); await page.waitForFunction(() => window.__mw.mission.st.phase === 'arrived', null, { timeout: 20000 }); await page.keyboard.up('KeyW'); await wait(300); await b1();
check('on-site', (await st()).phase === 'onsite'); await ev(async () => { await window.__mw.field.ensure(); }); await wait(1200);
// ---- crew's own judgement ----
await cmd('대조'); await ev(() => { const m = window.__mw, c = m.field.centreWorld(), d = c.clone().sub(m.camera.position); m.look.yaw = Math.atan2(-d.x, -d.z) + 0.01; m.look.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }); await wait(500); await pick('match'); await wait(300);
check('compare-match-by-button', await ev(() => window.__mw.mission.st.compare.result === 'match'), await ev(() => window.__mw.mission.st.compare)); await shot('02-hud-compare-match');
await cmd('관찰'); await wait(400); const answers = []; for (const t of ['맥 봄', '반점 판단 불가', '층리 못 봄', '대안 설명 판단 불가']) answers.push(await cmd(t));
check('observation-answers', await ev(() => { const o = window.__mw.mission.st.observations; return o.vein?.answer === 'seen' && o.spots?.answer === 'undetermined' && o.bedding?.answer === 'not_seen'; }), answers.map((a) => a && a.msg));
await wait(400); check('board-pane3-shows-latest-capture', await ev(() => { const i = document.querySelector('#hud-shot'); return !!i && i.src.startsWith('data:image') && /모의 화면 · 실제 관측 아님/.test(document.querySelector('#hud-shot-label').textContent); })); await shot('03-board-third-pane-filled');
await cmd('메모 반점 테두리가 흐려서 PIXL 지도와 같은 위치인지 판단 못함. 가까이서 다시 확인 필요'); await cmd('시료'); await cmd('관찰'); await wait(300);
// ---- item 1a: base return instruction on site -> 보류 ----
await ev(() => window.__mw.mission.sendRemote()); await wait(1200); check('remote-ack-card', (await acts())[0] === 'ack', await acts()); await b1();
let a = await acts(); check('remote-on-site-offers-start-or-hold', a[0] === 'return' && a[1] === 'hold' && (await st()).phase === 'onsite', a); await shot('04-remote-return-start-or-hold-on-site');
const s0 = (await st()).s; await pick('hold'); await wait(600);
check('hold-does-not-move', await ev((s0) => { const s = window.__mw.mission.st; return s.phase === 'onsite' && s.s === s0 && s.remote.declined && s.remote.executedAt === null && s.returnStartedAt === null; }, s0));
// ---- item 1b: alert -> 확인 -> 복귀 선택 -> 복귀 개시 ----
await ev(() => window.__mw.mission.sendWeatherAlert()); await wait(1200); a = await acts(); check('alert-ack-first', a[0] === 'alert-ack', a); await b1();
a = await acts(); check('alert-choice-separate', a.includes('alert-continue') && a.includes('alert-return'), a); await pick('alert-return');
a = await acts(); const mid = await ev(() => { const s = window.__mw.mission.st, al = s.alerts.find((x) => x.kind === 'weather'); return { phase: s.phase, choice: al.choice, executedAt: al.executedAt, card: document.querySelector('#hud-card').innerText.slice(0, 80), cardHidden: document.querySelector('#hud-card').classList.contains('hidden') }; });
check('return-chosen-on-site-offers-start-or-hold', a[0] === 'return' && a[1] === 'hold' && mid.phase === 'onsite' && mid.choice === 'return' && mid.executedAt === null && !mid.cardHidden, { acts: a, ...mid }); await shot('05-return-chosen-start-or-hold-on-site');
await pick('return'); await wait(500);
const after = await ev(() => { const s = window.__mw.mission.st, al = s.alerts.find((x) => x.kind === 'weather'); return { phase: s.phase, executedAt: al.executedAt, executedBy: al.executedBy, returnStartedAt: s.returnStartedAt, remoteExecutedAt: s.remote.executedAt }; });
check('start-return-executes', after.phase === 'returning' && after.executedAt !== null && after.executedAt === after.returnStartedAt && after.executedBy === 'hud-manual' && after.remoteExecutedAt === null, after); await shot('06-returning');
// ---- back to base, through the airlock ----
await ev(() => { const m = window.__mw.mission; m.debugSetS(m.st.route.stats.indoorM + 4); }); await page.keyboard.down('KeyW'); await page.waitForFunction(() => window.__mw.mission.st.phase === 'atBase', null, { timeout: 20000 });
for (let i = 0; i < 400 && (await ev(() => window.__mw.mode)) !== 'habitat'; i++) { await ev(() => { window.__mw.look.yaw = window.__mw.mission.currentPose().yaw; }); await wait(100); } await page.keyboard.up('KeyW');
check('mission-ended-inside', await ev(() => { const s = window.__mw.mission.st; return s.phase === 'ended' && !!s.habitatPose && s.endedHow === 'inner-door'; }));
// ---- PAD: received records, follow-up, export ----
await ev(() => document.getElementById('btn-switch').click()); await mode('landing'); await ev(() => window.__mw.enterRole('pad')); await mode('pad'); await page.keyboard.press('Digit2'); await page.waitForFunction(() => !!document.querySelector('#terminal-overlay .terminal-active'), null, { timeout: 15000 });
await ev(() => { const f = window.__mw.fieldPad; f.setOpen(true); f.show('rec'); }); await wait(700);
await ev(() => { const c = [...document.querySelectorAll('#fp-fu input[data-fu]')]; c.slice(0, 2).forEach((x) => x.click()); }); await wait(400);
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#fp-export')]); const path = await dl.path(); const { readFileSync } = await import('node:fs'); const trace = JSON.parse(readFileSync(path, 'utf8'));
writeFileSync('docs/evidence/trace-sample.json', JSON.stringify(trace, null, 1)); await wait(300); await shot('07-pad-records-export');
const humanOnly = trace.records.every((r) => r.actor === 'human') && trace.scriptedCrewLog.length === 0;
check('trace-links', trace.inputs.length >= 8 && trace.plan.sent.planVersion === trace.package.planVersion && trace.package.lineFingerprint && trace.transmissions.plan.ack.actor === 'human' && trace.responses.compare.result === 'match' && trace.responses.observations.some((o) => o.answer === 'undetermined') && trace.responses.memos.length === 1 && trace.recordsReceivedAtPad === trace.records.length && trace.followUps.some((f) => f.markedForNextEva) && humanOnly,
  { file: dl.suggestedFilename(), inputs: trace.inputs.length, planV: trace.plan.sent.planVersion, pkg: `r${trace.package.rev}/v${trace.package.planVersion}`, records: trace.records.length, followUps: trace.followUps.length, marked: trace.followUps.filter((f) => f.markedForNextEva).length, humanOnly });
console.log('page errors', JSON.stringify(errs.slice(0, 3)), JSON.stringify(await ev(() => window.__mw.errors)), 'FAILS', fails);
await browser.close(); process.exit(fails ? 1 : 0);
