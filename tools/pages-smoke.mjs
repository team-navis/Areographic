// Automated hosting smoke, not a user study or microphone-recognition test.
import { chromium } from 'playwright-core';
import { enterHabitat, walkOutThroughAirlock } from '../tests/lib/enter.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.env.MW_URL || 'http://127.0.0.1:4192/Areographic/';
const out = process.argv[2] || 'test-results/pages';
mkdirSync(out, { recursive: true });
const origin = new URL(url).origin;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const result = { url, anonymousContext: true, checks: [], pageErrors: [], failedOwnRequests: [], rootAssetRequests: [], excludedModelRequests: [] };
const check = (name, value, detail) => { result.checks.push({ name, passed: !!value, detail }); assert.ok(value, name); };
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', e => result.pageErrors.push(String(e)));
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.origin === origin && /\/models\/(eva|operator|rover)\//.test(u.pathname)) result.excludedModelRequests.push(u.pathname);
  });
  page.on('response', r => {
    const u = new URL(r.url());
    if (u.origin !== origin) return;
    if (r.status() >= 400 && u.pathname !== '/favicon.ico') result.failedOwnRequests.push({ path: u.pathname, status: r.status() });
    if (/^\/(data|models|textures|draco|assets|pad)\//.test(u.pathname)) result.rootAssetRequests.push(u.pathname);
  });
  await page.goto(url);
  check('application-identity', await page.locator('meta[name="application-name"]').getAttribute('content') === 'Areographic');
  await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 });
  check('landing-ready', await page.evaluate(() => window.__mw.ready && window.__mw.mode === 'landing' && window.__mw.errors.length === 0));
  await page.waitForFunction(() => window.__mw.deferred.ready, null, { timeout: 90000 });
  const models = await page.evaluate(() => ({ failures: window.__mw.deferred.failed, astronaut: window.__mw.astro.group.name, operator: window.__mw.operator.group.name, rover: window.__mw.rover.group.name }));
  check('nasa-suit-and-procedural-models', models.failures.length === 0 && models.astronaut === 'astronaut-mark3' && models.operator === 'operator-provisional' && models.rover === 'rover-fictional', models);
  await page.evaluate(() => window.__mw.dismissSplash());
  await page.screenshot({ path: `${out}/01-landing.jpg`, type: 'jpeg', quality: 85 });
  await page.evaluate(() => window.__mw.enterRole('pad'));
  await page.locator('#control-pad.terminal-active.full').waitFor({ state: 'visible', timeout: 30000 });
  const child = page.frameLocator('#control-pad iframe');
  await child.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 45000 });
  const pad = await child.locator('body').evaluate(() => ({ features: window.GRID?.features?.length, leaflet: window.L?.version, logoReady: document.getElementById('logo').naturalWidth > 0, title: document.title }));
  check('control-pad-data-and-map', pad.features > 0 && pad.leaflet === '1.9.4' && pad.logoReady, pad);
  const beforeFrame = page.frames().find(f => f.url().endsWith('/pad/pad.html'));
  await page.screenshot({ path: `${out}/02-control-pad.jpg`, type: 'jpeg', quality: 85 });
  await page.click('#control-pad .pad-back');
  await page.locator('#control-pad').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__mw.mode === 'pad' && !window.__mw.director.busy);
  await page.keyboard.press('Digit1');
  await page.locator('#control-pad.terminal-active.full').waitFor({ state: 'visible' });
  check('control-pad-persists-between-visits', page.frames().find(f => f.url().endsWith('/pad/pad.html')) === beforeFrame);
  await child.locator('body').press('Escape');
  await page.waitForFunction(() => window.__mw.mode === 'landing' && !window.__mw.director.busy);
  await enterHabitat(page);
  check('crew-habitat-entry', await page.evaluate(() => window.__mw.mode === 'habitat'));
  await page.screenshot({ path: `${out}/03-crew-habitat.jpg`, type: 'jpeg', quality: 85 });
  await walkOutThroughAirlock(page);
  await page.waitForFunction(() => [...document.querySelectorAll('.hud .hk-ic')].length > 0 && [...document.querySelectorAll('.hud .hk-ic')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 20000 });
  const hud = await page.evaluate(() => ({ mode: window.__mw.mode, departed: window.__mw.mission.st.departed, kitIcons: document.querySelectorAll('.hud .hk-ic').length }));
  check('crew-airlock-to-hud-and-design-assets', hud.mode === 'hud' && hud.departed && hud.kitIcons > 0, hud);
  await page.screenshot({ path: `${out}/04-hud.jpg`, type: 'jpeg', quality: 85 });
  check('no-page-errors', result.pageErrors.length === 0, result.pageErrors);
  check('no-failed-hosted-requests', result.failedOwnRequests.length === 0, result.failedOwnRequests);
  check('no-origin-root-asset-leaks', result.rootAssetRequests.length === 0, result.rootAssetRequests);
  check('no-excluded-model-requests', result.excludedModelRequests.length === 0, result.excludedModelRequests);
  result.passed = true;
} catch (error) {
  result.passed = false; result.error = String(error); throw error;
} finally {
  writeFileSync(`${out}/receipt.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await browser.close();
}
