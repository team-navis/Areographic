// Scripted crew follows the plan's travel assumption: boards the rover only when the plan says 로버. Usage: MW_URL=... node tools/plan-transport-check.mjs
import { chromium } from 'playwright-core';
const URL = process.env.MW_URL || 'http://127.0.0.1:4180/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] }); let fails = 0;
for (const t of ['foot', 'rover']) { const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 120000 });
  const r = await page.evaluate(async (t) => { const m = window.__mw.mission, st = m.st; m.setPlanTransport(t); m.sendPlan('검사'); m.padStart(); st.autoWarp = 4; const t0 = performance.now();
    while (st.s < st.roverS + 25 && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
    return { plan: st.planTx.transport, budgetSpeed: st.planTx.budget.speed, crewTransport: st.transport, s: +st.s.toFixed(1), roverS: +st.roverS.toFixed(1), log: st.script.log.map((l) => l.text) }; }, t);
  const ok = r.plan === t && r.crewTransport === t && r.budgetSpeed === (t === 'rover' ? 3.5 : 1.4) && r.log.includes('로버 탑승') === (t === 'rover'); if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', `scripted-crew-follows-plan-${t}`, JSON.stringify(r)); await page.close(); }
await browser.close(); process.exit(fails ? 1 : 0);
