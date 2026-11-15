// Terrain placement probe: prints ground heights and mesh placement so two builds can be compared (e.g. float32 vs uint16 DTM).
// Usage: MW_URL=http://127.0.0.1:4180/ node tools/terrain-probe.mjs > out.json
import { chromium } from 'playwright-core';
const URL = process.env.MW_URL || 'http://127.0.0.1:4180/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(URL + '?s=12'); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 });
const out = await page.evaluate(async () => { const m = window.__mw, t = m.terrain, st = m.mission.st;
  if (t.ensureOutdoor) await t.ensureOutdoor();
  await m.field.ensure(); await m.routeMesh.ensure();
  const grid = []; for (let x = -300; x <= 300; x += 37.5) for (let z = -300; z <= 300; z += 37.5) grid.push(t.groundY(x + 0.37, z + 0.61));
  const farPts = []; for (let x = -3900; x <= 3900; x += 650) for (let z = -3900; z <= 3900; z += 650) farPts.push(t.groundY(x + 3.3, z + 7.1));
  const route = []; for (let s = 0; s <= st.route.length; s += st.route.length / 40) { const p = m.mission.poseAt(s); route.push([p.x, p.y, p.z, t.groundY(p.x, p.z)]); }
  const end = m.mission.poseAt(st.route.length);
  return { errors: m.errors, floorY: m.site.floorY, h0: t.h0, grid, farPts, route, routeLen: st.route.length, markerDy: Math.abs(m.marker.position.y - t.groundY(m.marker.position.x, m.marker.position.z)),
    fieldPlacement: m.field.placement || null, routeMeshPlacement: m.routeMesh.placement, endGround: t.groundY(end.x, end.z), cameraY: m.camera.position.y }; });
console.log(JSON.stringify(out)); await browser.close();
