// Iteration helper: capture a set of views. node tests/tour.mjs <outdir> [views,comma]
import { chromium } from 'playwright-core';
const [out, which] = process.argv.slice(2); const want = (n) => !which || which.split(',').includes(n);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 600)));
const load = async (q = '') => { await page.goto('http://127.0.0.1:5173/' + q); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 90000 }); await page.waitForTimeout(1200); };
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
if (want('land')) { await load(); await shot('land'); }
if (want('pad')) { await load(); const p = await page.evaluate(() => window.__mw.screenPos('operator')); await page.mouse.click(p.x, p.y); await page.waitForFunction(() => window.__mw.mode === 'pad', null, { timeout: 15000 }); await page.waitForTimeout(500); await shot('pad'); await page.click('#home-start'); await page.waitForTimeout(700); await shot('pad-site'); }
if (want('hud')) { await load(); await page.evaluate(() => { window.__mw.director.hold = true; }); const p = await page.evaluate(() => window.__mw.screenPos('astronaut')); await page.mouse.click(p.x, p.y);
  for (const ph of ['APPROACH', 'SHOULDER', 'VISOR']) { await page.waitForFunction((n) => window.__mw.phase === n && window.__mw.director.waiting, ph, { timeout: 15000 }); await page.waitForTimeout(300); await shot('t-' + ph.toLowerCase()); await page.evaluate(() => window.__mw.director.release()); }
  await page.waitForFunction(() => window.__mw.mode === 'hud', null, { timeout: 15000 }); await page.waitForTimeout(600); await shot('hud-in'); }
if (want('out')) { await load('?s=60'); await page.evaluate(() => window.__mw.enterRole('hud')); await page.waitForFunction(() => window.__mw.mode === 'hud', null, { timeout: 30000 }); await page.waitForTimeout(800); await shot('out-60');
  await page.evaluate(() => { window.__mw.mission.debugSetS(230); window.__mw.look.yaw += 0.5; }); await page.waitForTimeout(1200); await shot('out-230'); await page.evaluate(() => { window.__mw.look.pitch = -0.6; }); await page.waitForTimeout(500); await shot('out-230-down'); }
console.log(JSON.stringify(await page.evaluate(() => window.__mw.stats()))); await browser.close();
