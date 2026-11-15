// Iteration helper: outside views of the rover. node tests/rover-look.mjs <outdir>
import { chromium } from 'playwright-core';
const out = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); }); page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 600)));
await page.goto('http://127.0.0.1:5173/?s=14'); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 90000 });
const view = async (name, off, fov = 45) => { await page.evaluate(([o, f]) => { const m = window.__mw, p = m.rover.group.position; m.debugCamWorld(p.x + o[0], p.y + o[1], p.z + o[2], p.x, p.y + 1.0, p.z, f); }, [off, fov]); await page.waitForTimeout(700); await page.screenshot({ path: `${out}/${name}.png` }); };
await view('rv-a', [3.2, 1.9, 4.6]); await view('rv-b', [-4.5, 1.4, -2.5]);
console.log(await page.evaluate(() => JSON.stringify({ fit: window.__mw.roverFit(), roverS: window.__mw.mission.st.roverS })));
await browser.close();
