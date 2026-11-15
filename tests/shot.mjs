// Quick single-screenshot helper for iteration: node tests/shot.mjs <url> <out.png> [js-to-eval] [waitMs]
import { chromium } from 'playwright-core';
const [url, out, js, wait] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console.' + m.type() + ']', m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 600)));
page.on('response', (r) => { if (r.status() >= 400) console.log('[http ' + r.status() + ']', r.url()); });
page.on('requestfailed', (r) => console.log('[requestfailed]', r.url()));
await page.goto(url); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 90000 });
if (js) console.log('eval:', JSON.stringify(await page.evaluate(js)));
await page.waitForTimeout(+(wait || 1500));
console.log('stats:', JSON.stringify(await page.evaluate(() => window.__mw.stats && window.__mw.stats())));
await page.screenshot({ path: out }); await browser.close();
