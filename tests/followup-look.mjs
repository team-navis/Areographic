// Quick look at the 후속 확인 과제 loop (team proposal demo): records -> PAD list -> mark -> next EVA -> HUD task list. MW_URL / MW_OUT as usual.
import { chromium } from 'playwright-core';
import { enterHud, enterPad } from './lib/enter.mjs';
const URL = process.env.MW_URL || 'http://127.0.0.1:5173/', OUT = process.env.MW_OUT || 'docs/captures/stage3-v02-field';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
await page.goto(URL); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 120000 });
const mw = (fn, a) => page.evaluate(fn, a), wait = (ms) => page.waitForTimeout(ms), mode = (m) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout: 40000 });
await enterHud(page); await mw(() => { const m = window.__mw.mission; m.debugSetS(m.st.route.length); }); await wait(400); await page.keyboard.press('Digit1'); await wait(400);
for (const c of ['관찰', '층리 못 봄', '분급 판단 불가', '맥 봄', '닫기', '관심 지점 밝은 띠', '기록 반점 옆']) { await mw((t) => window.__mw.fx.command(t), c); await wait(250); }
// shortcut to mission end (the full key path is covered by stage3): return, jump to the base, end
await mw(() => { const m = window.__mw.mission; m.startReturn(); m.debugSetS(m.st.route.stats.indoorM + 0.5); }); await page.keyboard.down('KeyW'); await page.waitForFunction(() => window.__mw.mission.st.phase === 'atBase', null, { timeout: 30000 }); await page.keyboard.up('KeyW'); await page.keyboard.press('Digit1'); await wait(400);
await mw(() => document.exitPointerLock && document.exitPointerLock()); await page.click('#btn-switch'); await mode('landing'); await enterPad(page); await page.click('#fp-open'); await wait(300); await page.click('#fp-panel [data-tab="rec"]'); await wait(800);
const boxes = await page.$$('#fp-fu input[type=checkbox]'); await boxes[0].click(); await wait(200); await (await page.$$('#fp-fu input[type=checkbox]'))[2].click(); await wait(400);
console.log('followUps', JSON.stringify(await mw(() => window.__mw.mission.followUps().map((f) => [f.kind, f.title, f.marked]))));
await page.screenshot({ path: `${OUT}/25-pad-followup-list.png` });
await page.click('#fp-next'); await wait(600); console.log('next', JSON.stringify(await mw(() => { const s = window.__mw.mission.st; return { eva: s.evaNo, phase: s.phase, carried: s.carried.map((c) => c.title), records: s.records.length, archived: s.archive.length }; })));
await page.click('#fp-close'); await page.click('#btn-switch'); await mode('landing'); await enterHud(page); await mw(() => { const m = window.__mw.mission; m.debugSetS(m.st.route.length); }); await wait(400); await page.keyboard.press('Digit1'); await wait(500);
console.log('hud items', JSON.stringify(await page.$$eval('#hud-card .hud-item', (els) => els.map((e) => e.textContent.trim().slice(0, 30)))));
for (let i = 0; i < 6; i++) { await page.keyboard.press('Digit2'); await wait(120); } await page.keyboard.press('Digit1'); await wait(400);
console.log('after check', JSON.stringify(await mw(() => { const s = window.__mw.mission.st; return { carried: s.carried.map((c) => c.doneAt !== null), last: s.records.slice(-1)[0]?.text }; })));
await page.screenshot({ path: `${OUT}/26-hud-carried-followup-items.png` }); await browser.close();
