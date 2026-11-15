// Same viewpoints before/after a presentation change: terrain colour near the workspace, wide outdoor view, airlock exterior. MW_TAG names the files.
import { chromium } from 'playwright-core';
const URL = process.env.MW_URL || 'http://127.0.0.1:5173/', OUT = process.env.MW_OUT || 'docs/captures/stage3-v02-field', TAG = process.env.MW_TAG || 'after';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
await page.goto(URL); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 120000 });
const mw = (fn, a) => page.evaluate(fn, a), wait = (ms) => page.waitForTimeout(ms);
await mw(() => { const m = window.__mw, c = m.field.centreWorld(); m.debugCamWorld(c.x + 2.6, c.y + 1.7, c.z + 2.2, c.x, c.y - 0.05, c.z, 45); }); await wait(700); await page.screenshot({ path: `${OUT}/32-colour-workspace-${TAG}.png` });
await mw(() => { const m = window.__mw, p = m.mission.poseAt(150), g = m.terrain.groundY(p.x, p.z); m.debugCamWorld(p.x, g + 1.7, p.z, p.x - 40, g + 3, p.z - 12, 62); }); await wait(700); await page.screenshot({ path: `${OUT}/33-colour-wide-${TAG}.png` });
await mw(() => { const m = window.__mw, y = m.site.floorY; m.debugCamWorld(-11.5, y + 0.4, 7.5, -7.2, y - 0.2, 1.0, 50); }); await wait(700); await page.screenshot({ path: `${OUT}/34-airlock-legs-${TAG}.png` });
console.log(JSON.stringify(await mw(() => ({ rocks: window.__mw.rockCount, placement: window.__mw.field.placement, door: window.__mw.base ? window.__mw.base.doorState : null }))));
await browser.close();
