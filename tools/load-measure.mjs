// Load-size measurement + fixed-viewpoint screenshots. Real Chrome via playwright-core, cold cache.
// Usage: MW_URL=http://127.0.0.1:4180/ node tools/load-measure.mjs <label> [outDir]
// Counts every request until the landing screen is ready (window.__mw.ready), then again after going outside.
// "raw" = decoded body bytes (what a static host without compression sends), "wire" = bytes on the wire from this server.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterHabitat, walkOutThroughAirlock } from '../tests/lib/enter.mjs';

const URL = process.env.MW_URL || 'http://127.0.0.1:4180/', label = process.argv[2] || 'run', OUT = process.argv[3] || 'docs/captures/assets';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.MW_HEADED, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const reqs = new Map();
cdp.on('Network.responseReceived', (e) => { reqs.set(e.requestId, { url: e.response.url.replace(URL, '/'), raw: 0, wire: 0, done: false }); });
cdp.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.raw += e.dataLength; });
cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.wire = e.encodedDataLength; r.done = true; } });
const snap = () => { const a = [...reqs.values()].filter((r) => !r.url.startsWith('data:') && !r.url.startsWith('blob:')); return { requests: a.length, rawMB: +(a.reduce((s, r) => s + r.raw, 0) / 1e6).toFixed(2), wireMB: +(a.reduce((s, r) => s + r.wire, 0) / 1e6).toFixed(2), list: a.map((r) => ({ url: r.url, raw: r.raw })).sort((p, q) => q.raw - p.raw) }; };
const shot = (name) => page.screenshot({ path: `${OUT}/${label}-${name}.png` });
const mode = (m) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout: 60000 });
const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', (e) => errors.push(String(e)));

const t0 = Date.now(); await page.goto(URL);
await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 });
const landingMs = Date.now() - t0, landing = snap();
const deferredMs = await page.evaluate(async () => { const d = window.__mw.deferred; if (!d) return null; const t = performance.now(); while (!d.ready) await new Promise((r) => setTimeout(r, 20)); return Math.round(performance.now() - t); });
const deferredState = await page.evaluate(() => { const d = window.__mw.deferred; return d ? { total: d.total, done: d.done, failed: d.failed } : null; });
await page.waitForTimeout(1500); await shot('01-landing');
await page.evaluate(() => window.__mw.enterRole('pad')); await mode('pad'); await page.waitForTimeout(2000); await shot('02-seat');
await page.evaluate(() => document.getElementById('btn-switch').click()); await mode('landing'); await enterHabitat(page);
for (const [n, yaw] of [['03-indoor-west', Math.PI / 2], ['04-indoor-north', 0], ['05-indoor-southeast', -2.2]]) { await page.evaluate((y) => { window.__mw.look.yaw = y; window.__mw.look.pitch = 0; }, yaw); await page.waitForTimeout(400); await shot(n); }
await page.evaluate(() => { window.__mw.look.pitch = -1.1; }); await page.waitForTimeout(400); await shot('06-indoor-floor');
const tOut = Date.now(); await walkOutThroughAirlock(page); const outMs = Date.now() - tOut; await page.waitForTimeout(1500); await shot('07-outdoor-hud');
await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW');
await page.evaluate(() => { window.__mw.look.pitch = -0.9; }); await page.waitForTimeout(600); await shot('08-outdoor-ground');
await page.evaluate(() => { window.__mw.look.pitch = -0.15; window.__mw.look.yaw += 1.2; }); await page.waitForTimeout(600); await shot('09-outdoor-side');
await page.waitForTimeout(1500); const outside = snap();
const res = { url: URL, at: new Date().toISOString(), landingMs, deferredMs, deferredState, airlockWalkMs: outMs, landing, outside: { requests: outside.requests, rawMB: outside.rawMB, wireMB: outside.wireMB, added: outside.list.filter((r) => !landing.list.some((l) => l.url === r.url)) }, errors, appErrors: await page.evaluate(() => window.__mw.errors) };
writeFileSync(`${OUT}/load-${label}.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ landingMs, deferredMs, deferredState, landing: { requests: landing.requests, rawMB: landing.rawMB, wireMB: landing.wireMB }, outside: res.outside.requests + ' req ' + res.outside.rawMB + ' MB', errors: errors.length, top: landing.list.slice(0, 8) }, null, 1));
await browser.close();
