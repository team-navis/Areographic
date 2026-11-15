// Run against Vite or the production preview. External planning-map UI is outside this check.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const URL = process.env.MW_URL || 'http://127.0.0.1:5173/';
const OUT = process.env.MW_OUT || 'docs/review/areographic-suit';
await mkdir(OUT, { recursive: true });
const bytes = await readFile('public/models/areographic/integrated-suit.glb');
const manifest = JSON.parse(await readFile('public/models/areographic/provenance.json', 'utf8'));
assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
assert.equal(bytes.length, manifest.bytes);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
const checks = [];
try {
  async function open(query = '', failSuit = false) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1066 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const errors = [], failed = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => requests.push(r.url()));
    page.on('response', r => { if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() }); });
    await page.route('**/*', route => {
      const u = new globalThis.URL(route.request().url());
      if (u.origin !== new globalThis.URL(URL).origin) return route.abort();
      if (u.pathname.endsWith('/pad/pad.html')) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Planning display excluded from suit check</title>' });
      if (failSuit && u.pathname.endsWith('/models/areographic/integrated-suit.glb')) return route.fulfill({ status: 404, body: 'Intentional fallback check' });
      return route.continue();
    });
    await page.goto(`${URL}?nosplash${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mw?.ready || window.__mw?.errors.length, null, { timeout: 120000 });
    assert.deepEqual(await page.evaluate(() => window.__mw.errors), []);
    assert.equal(await page.evaluate(() => window.__mw.ready), true);
    await page.locator('#loading.hidden').waitFor({ state: 'attached' });
    return { page, errors, failed, requests };
  }
  const { page, errors, failed, requests } = await open();
  const initial = await page.evaluate(() => {
    const a = window.__mw, meshes = [];
    a.astro.model.traverse(o => { if (o.isMesh) meshes.push({ name: o.name, shadow: o.castShadow, hoverOwn: o.userData.hoverOwn }); });
    return { info: a.astroInfo, meshes, materials: a.astro.materials.map(m => ({ name: m.name, transmission: m.transmission || 0, roomBounce: m.customProgramCacheKey().includes('habitat-static-irradiance'), normalColorSpace: m.normalMap?.colorSpace, envMapIntensity: m.envMapIntensity })) };
  });
  assert.equal(initial.info.kind, 'areographic');
  assert.equal(initial.info.triangles, 51716);
  assert.ok(Math.abs(initial.info.rawSize[1] * initial.info.scale - 1.9) < 1e-6);
  assert.equal(initial.meshes.length, 4);
  const glass = initial.materials.find(m => m.transmission > 0);
  assert.ok(glass); assert.equal(glass.roomBounce, false);
  assert.equal(initial.meshes.find(m => /visor/i.test(m.name)).shadow, false);
  assert.equal(initial.materials.filter(m => m.roomBounce).length, 3);
  assert.equal(initial.materials.find(m => m.normalColorSpace !== undefined).normalColorSpace, '');
  assert.ok(!requests.some(u => u.includes('/models/nasa/')));
  await page.screenshot({ path: `${OUT}/landing.jpg`, type: 'jpeg', quality: 82 });
  // Exercise the real hover path and retain the material/shader identities.
  await page.evaluate(() => { window.__suitMaterials = [...window.__mw.astro.materials]; });
  const p = await page.evaluate(() => {
    const a = window.__mw, v = a.astro.hit.getWorldPosition(a.camera.position.clone()).project(a.camera);
    return { x: (v.x + 1) * innerWidth / 2, y: (1 - v.y) * innerHeight / 2 };
  });
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => document.body.classList.contains('person-hover')), true);
  await page.mouse.move(5, 5); await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => {
    const a = window.__mw; let stable = true;
    a.astro.model.traverse(o => { if (o.isMesh && !window.__suitMaterials.includes(o.material)) stable = false; });
    return stable;
  }), true);
  // Enter from the real landing state, before using inspection-only debug cameras.
  await page.evaluate(() => window.__mw.enterRole('hud'));
  await page.waitForFunction(() => window.__mw.mode === 'habitat', null, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__mw.astro.model.visible), false);
  await page.screenshot({ path: `${OUT}/first-person.jpg`, type: 'jpeg', quality: 80 });
  async function shot(name, close) {
    await page.evaluate(({ close }) => {
      const a = window.__mw, g = a.astro.group, yaw = g.rotation.y;
      const target = close ? g.position.clone().set(.098, 1.455, .14).applyMatrix4(a.astro.model.matrixWorld) : g.position.clone().add({ x: 0, y: .98, z: 0 });
      const d = close ? .52 : 3.15, angle = 20 * Math.PI / 180, r = Math.sin(angle) * d, f = Math.cos(angle) * d;
      a.debugCamWorld(target.x + r * Math.cos(yaw) - f * Math.sin(yaw), target.y + (close ? .025 : .32), target.z - r * Math.sin(yaw) - f * Math.cos(yaw), target.x, target.y, target.z, close ? 32 : 44);
      a.astro.model.visible = true;
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, { close });
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 85 });
  }
  await shot('simulator', false); await shot('logo', true);
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  checks.push({ name: 'default suit, hover, room optics, first-person entry', passed: true, ...initial, failedAssets: failed, errors });
  await page.close();
  for (const [name, query, failSuit] of [['explicit NASA comparison', '&suit=mark3', false], ['missing suit fallback', '', true]]) {
    const r = await open(query, failSuit);
    assert.equal(await r.page.evaluate(() => window.__mw.astro.group.name), 'astronaut-mark3');
    assert.deepEqual(r.errors, []);
    assert.equal(r.failed.length, failSuit ? 1 : 0);
    checks.push({ name, passed: true, expected404: failSuit });
    await r.page.close();
  }
  const result = { url: URL, sha256: manifest.sha256, bytes: bytes.length, checks, excluded: ['external fonts', 'independent planning display/maps'] };
  await writeFile(`${OUT}/verification.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
