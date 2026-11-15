// Iteration helper: enter HUD, hold W through the airlock, capture every few seconds.
import { chromium } from 'playwright-core';
const out = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 600)));
await page.goto('http://127.0.0.1:5173/'); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 90000 });
await page.evaluate(() => window.__mw.enterRole('hud')); await page.waitForFunction(() => window.__mw.mode === 'hud', null, { timeout: 30000 });
await page.evaluate(() => { window.__mw.look.yaw = Math.PI / 2; }); // face west toward the airlock
await page.keyboard.down('KeyW');
for (let i = 1; i <= 5; i++) { await page.waitForTimeout(2300); await page.screenshot({ path: `${out}/walk-${i}.png` }); console.log(i, await page.evaluate(() => window.__mw.mission.st.s.toFixed(2))); }
await page.keyboard.up('KeyW'); await browser.close();
