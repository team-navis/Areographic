// Debug camera capture: node tests/cam.mjs <out.png> "px,py,pz,tx,ty,tz,fov" [query]
import { chromium } from 'playwright-core';
const [out, cam, q] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); }); page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 600)));
await page.goto('http://127.0.0.1:5173/' + (q || '')); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 90000 });
await page.evaluate((c) => window.__mw.debugCam(...c.split(',').map(Number)), cam); await page.waitForTimeout(900); await page.screenshot({ path: out });
console.log(await page.evaluate(() => JSON.stringify(window.__mw.astroInfo.materials.map((m) => [m.name.split('_').slice(-1)[0], m.type, m.transmission, m.color])))); await browser.close();
