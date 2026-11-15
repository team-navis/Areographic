// Quick look at the minimal PAD planning -> departure flow (② ③ ④) and the HUD plan card. MW_URL / MW_OUT as usual.
import { chromium } from 'playwright-core';
import { enterHud, enterPad } from './lib/enter.mjs';
const URL = process.env.MW_URL || 'http://127.0.0.1:5173/', OUT = process.env.MW_OUT || 'docs/captures/stage3-v02-field';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
await page.goto(URL); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 120000 });
const mw = (fn, a) => page.evaluate(fn, a), wait = (ms) => page.waitForTimeout(ms), mode = (m) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout: 40000 });
await enterPad(page);
await page.click('.pad-navbtn[data-page="plan"]'); await wait(300); await page.fill('[data-min="observe"]', '8'); await page.dispatchEvent('[data-min="observe"]', 'change'); await wait(300);
console.log('budget', JSON.stringify(await mw(() => { const b = window.__mw.mission.planBudget(); return { stay: b.staySec, turn: b.turnaroundSec, o2: +b.o2AtReturn.toFixed(1), shown: document.querySelector('#pp-turn').textContent.slice(0, 10) }; })));
await page.screenshot({ path: `${OUT}/27-pad-plan-todo-budget.png` });
await page.click('#pp-next'); await wait(500); await page.screenshot({ path: `${OUT}/28-pad-route-preview.png` }); await page.click('#pp-next2'); await wait(300);
const dis0 = /left|no decision maker/.test(await page.textContent('#pp-why')); for (const k of ['route', 'budget', 'branch']) await page.check(`[data-chk="${k}"]`); await page.click('#pp-decider'); await page.keyboard.type('Planner 123'); await wait(200);
const before = await mw(() => ({ tx: window.__mw.mission.st.planTx, monitor: window.__mw.activeMonitor, decider: window.__mw.mission.st.planDraft.decider })); await page.click('#pp-send'); await wait(700);
console.log('send', JSON.stringify({ dis0, before, after: await mw(() => { const s = window.__mw.mission.st, P = window.__mw.mission.PLAN; return { tx: { ...s.planTx, todos: s.planTx.todos.length, budget: undefined }, pkg: s.pkg && { rev: s.pkg.rev, sentAt: s.pkg.sentAt, receivedAt: s.pkg.receivedAt }, stay: P.staySec, turn: P.turnaroundSec, states: document.querySelector('#pp-tx').textContent }; }) }));
await page.screenshot({ path: `${OUT}/29-pad-departure-confirm-sent.png` });
await page.click('#btn-switch'); await mode('landing'); await enterHud(page); await wait(600);
console.log('hud', JSON.stringify(await mw(() => ({ card: document.querySelector('#hud-card').textContent.slice(0, 140), items: [...document.querySelectorAll('#hud-card .hud-item')].map((e) => e.dataset.act), notice: !document.querySelector('#hud-plan-state').classList.contains('hidden') }))));
await page.screenshot({ path: `${OUT}/30-hud-plan-received.png` }); await page.keyboard.press('Digit1'); await wait(400);
console.log('ack', JSON.stringify(await mw(() => { const s = window.__mw.mission.st; return { planAck: s.planTx.ackAt, pkgAck: s.pkg.ackAt, cardVisible: !document.querySelector('#hud-card').classList.contains('hidden') }; })));
// gate notice on a fresh page: walk out without sending a plan
const p2 = await browser.newPage({ viewport: { width: 1600, height: 900 } }); await p2.goto(URL); await p2.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 120000 }); await enterHud(p2); await p2.waitForTimeout(500);
console.log('gate', JSON.stringify(await p2.evaluate(() => ({ notice: !document.querySelector('#hud-plan-state').classList.contains('hidden'), text: document.querySelector('#hud-plan-state').textContent, mode: window.__mw.mode, phase: window.__mw.mission.st.phase }))));
await p2.screenshot({ path: `${OUT}/31-hud-plan-not-received-notice.png` }); await browser.close();
