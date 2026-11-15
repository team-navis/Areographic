// Role selection: real mouse hover + click on each person (no role buttons). MW_URL / MW_OUT as usual.
import { chromium } from 'playwright-core';
const URL = process.env.MW_URL || 'http://127.0.0.1:5173/', OUT = process.env.MW_OUT || 'docs/captures/stage3-v02-field';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] }); let fail = 0;
for (const [who, expect, off] of [['operator', 'pad', [0, 0]], ['astro', /toHabitat|habitat/, [0, 0]], ['operator', 'pad', [22, -40]], ['astro', /toHabitat|habitat/, [-28, 150]]]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
  await page.goto(URL); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 180000 }); await page.waitForTimeout(1200);
  const p = await page.evaluate((w) => { const m = window.__mw, v = m[w].hit.getWorldPosition(new m.camera.position.constructor()).project(m.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, who); const x = p[0] + off[0], y = p[1] + off[1];
  await page.mouse.move(x - 40, y - 10); await page.mouse.move(x, y, { steps: 5 }); await page.waitForTimeout(500);
  const hover = await page.evaluate(() => ({ cursor: document.body.classList.contains('person-hover') ? 'pointer' : getComputedStyle(document.body).cursor, hot: [...document.querySelectorAll('.who-label.hot')].map((e) => e.textContent), labels: [...document.querySelectorAll('.who-label:not(.hidden)')].length, buttons: [...document.querySelectorAll('#btn-pad, #btn-hud')].filter((b) => b.getBoundingClientRect().width > 0).length, top: (document.elementFromPoint(innerWidth / 2, innerHeight / 2) || {}).id }));
  if (who === 'astro' && off[0] === 0) await page.screenshot({ path: `${OUT}/36-landing-role-select.png` });
  await page.mouse.down(); await page.mouse.move(x + 6, y + 4); await page.mouse.up(); await page.waitForTimeout(2200); // a slightly shaky click
  const mode = await page.evaluate(() => window.__mw.mode), ok = (typeof expect === 'string' ? mode === expect : expect.test(mode)) && hover.cursor === 'pointer' && hover.hot.length === 1 && hover.labels === 2 && hover.buttons === 0; if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', who, JSON.stringify({ at: [Math.round(x), Math.round(y)], hover, mode })); await page.close();
}
{ const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); await page.goto(URL); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 180000 }); await page.keyboard.press('Digit1'); await page.waitForTimeout(1800); const m = await page.evaluate(() => window.__mw.mode); if (m !== 'pad') fail++; console.log(m === 'pad' ? 'PASS' : 'FAIL', 'key-1-controller', m); await page.close(); }
await browser.close(); process.exit(fail ? 1 : 0);
