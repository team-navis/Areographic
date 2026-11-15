import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://127.0.0.1:5173/'); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 90000 });
console.log(await page.evaluate(() => { const m = window.__mw, T = m.terrain, pts = m.mission.routes['56_0'].pts.filter((p) => p.kind === 'terrain');
  const sl = (x, z) => { const d = 1.5, gx = (T.groundY(x + d, z) - T.groundY(x - d, z)) / 3, gz = (T.groundY(x, z + d) - T.groundY(x, z - d)) / 3; return Math.atan(Math.hypot(gx, gz)) * 57.2958; };
  const rows = []; for (let i = 1; i < pts.length - 1; i += 1) { const p = pts[i], dx = pts[i + 1].x - pts[i - 1].x, dz = pts[i + 1].z - pts[i - 1].z, l = Math.hypot(dx, dz) || 1, rx = -dz / l, rz = dx / l; const o = {}; for (const L of [3, 4, 6, 8]) { o['r' + L] = sl(p.x + rx * L, p.z + rz * L); o['l' + L] = sl(p.x - rx * L, p.z - rz * L); } rows.push({ s: p.s, ...o }); }
  const out = {}; for (const k of Object.keys(rows[0]).filter((k) => k !== 's')) { const v = rows.map((r) => r[k]); out[k] = { max: Math.max(...v).toFixed(1), n10: v.filter((x) => x >= 10).length, n12: v.filter((x) => x >= 12).length, n15: v.filter((x) => x >= 15).length, at: rows[v.indexOf(Math.max(...v))].s.toFixed(0) }; } return JSON.stringify(out); }));
await browser.close();
