import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://127.0.0.1:5173/'); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 90000 });
await page.evaluate(() => window.__mw.enterRole('hud')); await page.waitForFunction(() => window.__mw.mode === 'hud', null, { timeout: 40000 });
await page.evaluate(() => { const m = window.__mw.mission; m.debugSetS(9999); }); await page.waitForTimeout(400);
await page.keyboard.press('Digit1'); await page.waitForTimeout(400);
const snap = async (k) => console.log(k, await page.evaluate(() => ({ recs: window.__mw.mission.st.records.length, sel: document.querySelector('#hud-card .hud-item.sel')?.dataset.act, act: document.activeElement?.id || document.activeElement?.tagName, memo: document.querySelector('#hud-memo')?.value })));
for (const k of ['ArrowDown', 'ArrowDown', 'Digit1']) { await page.keyboard.press(k); await page.waitForTimeout(300); await snap(k); }
await page.keyboard.type('abc'); await snap('typed'); await page.keyboard.press('Enter'); await page.waitForTimeout(400); await snap('enter');
await page.keyboard.press('Digit1'); await page.waitForTimeout(300); await snap('1'); await page.keyboard.press('Digit2'); await page.waitForTimeout(300); await snap('2');
await page.screenshot({ path: process.argv[2] }); await browser.close();
