// Integration checks for integrate/immersive (teammate's 3D habitat + our outdoor HUD/route). Real Chrome via playwright-core.
// Usage: MW_URL=http://127.0.0.1:5176/ npm run capture:integration   (MW_OUT overrides the capture directory)
// Input is real keyboard/mouse unless a line says "hook". Expected behaviour comes from the resolution policy in
// docs/integration-immersive.md, not from product output.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterHabitat, walkOutThroughAirlock, openMonitor } from './lib/enter.mjs';

const URL = process.env.MW_URL || 'http://127.0.0.1:5176/', OUT = process.env.MW_OUT || 'docs/captures/integration-immersive';
mkdirSync(OUT, { recursive: true });
const results = { url: URL, startedAt: new Date().toISOString(), checks: [], captures: [], console: [], failedRequests: [], info: {} };
const check = (id, pass, detail) => { results.checks.push({ id, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.MW_HEADED, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') results.console.push({ type: m.type(), text: m.text().slice(0, 300) }); });
page.on('pageerror', (e) => results.console.push({ type: 'pageerror', text: String(e).slice(0, 400) }));
page.on('requestfailed', (r) => results.failedRequests.push(r.url())); page.on('response', (r) => { if (r.status() >= 400) results.failedRequests.push(`${r.status()} ${r.url()}`); });
const mw = (fn, arg) => page.evaluate(fn, arg);
const mode = (m, timeout = 40000) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout });
const shot = async (name, note) => { await page.screenshot({ path: `${OUT}/${name}.png` }); results.captures.push({ file: `${OUT}/${name}.png`, note }); };
const unlock = () => mw(() => document.exitPointerLock && document.exitPointerLock());
// everything a stray key or click could change
const snap = () => mw(() => { const m = window.__mw, s = m.mission.st, u = m.hud.ui, w = m.walk.state; return { mode: m.mode, monitor: m.activeMonitor ?? null, s: s.s, phase: s.phase, transport: s.transport, minimap: s.minimap, records: s.records.length, remote: !!s.remote, sim: s.simSeconds, warp: s.warp, habitat: !!s.habitatPose, wx: w.x, wz: w.z, detail: u.detail, declutter: u.declutter, collapsed: u.collapsed, sel: u.sel, memo: u.memoOpen }; });
const same = (a, b, keys) => keys.every((k) => a[k] === b[k]);
const HUD_KEYS = ['phase', 'transport', 'minimap', 'records', 'detail', 'declutter', 'collapsed', 'sel', 'memo', 's'];
const tap = async (keys, ms = 140) => { for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(ms); } };
const holdKeys = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of [...keys].reverse()) await page.keyboard.up(k); await page.waitForTimeout(150); };
const lookAhead = (pitch = -0.1) => mw((p) => { const m = window.__mw; m.look.yaw = m.mission.poseAt(m.mission.st.s).yaw; m.look.pitch = p; }, pitch);

await page.goto(URL); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 });
check('boot', await mw(() => window.__mw.ready === true), await mw(() => window.__mw.glInfo));
await page.waitForTimeout(900); await shot('01-landing', 'landing: habitat room (teammate), two role buttons');

// ---------- controller seat: 1/2/3 select monitors and never reach the HUD ----------
await page.evaluate(() => window.__mw.enterRole('pad')); await mode('pad'); await page.waitForTimeout(600); await shot('02-seat', 'controller seat: three 3D monitors with live previews of the shared mission (344 m real traverse route)');
const seat0 = await snap(); const seen = [];
for (const [key, id] of [['Digit1', 'science'], ['Digit3', 'systems'], ['Digit2', 'planner']]) {
  await page.keyboard.press(key); await page.waitForFunction((x) => window.__mw.activeMonitor === x && !!document.querySelector('#terminal-overlay .terminal-active'), id, { timeout: 15000 }); seen.push((await snap()).monitor);
  if (id === 'science') { await page.waitForTimeout(700); await shot('03-monitor-detail', 'left monitor opened with seat key 1: DOM detail screen over the 3D monitor (mouse-operable)'); }
}
const seat1 = await snap();
check('seat-123-select-monitors', JSON.stringify(seen) === JSON.stringify(['science', 'systems', 'planner']), `seat keys 1/3/2 opened ${seen.join(', ')}`);
check('seat-keys-do-not-reach-hud', same(seat0, seat1, HUD_KEYS) && !(await page.isVisible('#hud')), { hudStateBefore: seat0, after: seat1 });
await page.mouse.click(...(await page.locator('.pad-navbtn[data-page="site"]').boundingBox().then((b) => [b.x + b.width / 2, b.y + b.height / 2]))); await page.waitForSelector('#pad-map');
check('monitor-stays-mouse-operable', await page.isVisible('#pad-map'), 'a real mouse click on the PAD navigation opened ① 지점 고르기 (monitors keep pointer input)');
await mw(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__mw.mode === 'pad' && !window.__mw.activeMonitor, null, { timeout: 15000 });

// ---------- inside the habitat: free WASD walk; HUD/suit keys are inert ----------
await page.click('#btn-switch'); await mode('landing'); await enterHabitat(page); await page.waitForTimeout(500);
await mw(() => { window.__mw.look.yaw = Math.PI / 2; window.__mw.look.pitch = 0; });
const in0 = await snap(); await holdKeys(['KeyW'], 600); const in1 = await snap(); await holdKeys(['KeyD'], 300); const in2 = await snap(); await holdKeys(['KeyS'], 300); const in3 = await snap(); await holdKeys(['KeyA'], 300); const in4 = await snap();
check('indoor-WASD-moves-before-exit', in1.wx < in0.wx - 0.5 && in2.wz < in1.wz - 0.2 && in3.wx > in2.wx + 0.2 && in4.wz > in3.wz + 0.2 && in4.s === 0 && in4.sim === 0 && in4.habitat,
  `W x ${in0.wx.toFixed(2)}->${in1.wx.toFixed(2)}, D z ->${in2.wz.toFixed(2)}, S x ->${in3.wx.toFixed(2)}, A z ->${in4.wz.toFixed(2)}; route s ${in4.s}, EVA clock ${in4.sim}`);
await tap(['Digit1', 'Digit2', 'Digit3', 'Enter', 'KeyE', 'KeyM', 'KeyV', 'ArrowDown']); await holdKeys(['ShiftLeft'], 200); const in5 = await snap();
check('indoor-suit-and-seat-keys-inert', same(in4, in5, [...HUD_KEYS, 'mode', 'monitor', 'wx', 'wz', 'sim', 'warp']), 'inside the base 1/2/3/Enter/E/M/V/]/Shift change nothing (no monitor opened, no HUD state, no movement)');
await page.waitForTimeout(200); await shot('04-indoor-walk', 'indoor free walk before departure: no HUD, EVA clock stopped');

// ---------- airlock exit joins the fixed route; from here W only ----------
await walkOutThroughAirlock(page); await page.waitForTimeout(500);
const out0 = await snap(); await shot('05-airlock-exit-hud', 'airlock exit: helmet HUD (evidence-based green HUD, fixed status band) on the fixed route');
for (const k of ['KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowUp', 'Space']) await holdKeys([k], 350);
const out1 = await snap(); const yawKept = await mw(() => window.__mw.look.yaw);
check('outside-ASD-arrows-inert', out1.s === out0.s && out1.wx === out0.wx && out1.wz === out0.wz && !out1.habitat && out1.mode === 'hud', `after exit A/S/D/arrows/Space: route s stays ${out1.s.toFixed(2)} m, indoor pose frozen (${out1.wx.toFixed(2)}, ${out1.wz.toFixed(2)}), look yaw ${yawKept.toFixed(2)}`);
await mw(() => { window.__mw.look.yaw += 1.9; }); await holdKeys(['KeyW'], 1500); const out2 = await snap();
const offRoute = await mw(() => { const m = window.__mw, p = m.mission.poseAt(m.mission.st.s), c = m.camera.position; return Math.hypot(c.x - p.x, c.z - p.z); });
check('outside-W-only-along-route', out2.s - out1.s > 1.4 * 1.5 * 0.8 && out2.s - out1.s < 1.4 * 1.5 * 1.25 && offRoute < 0.06, `W for 1.5 s while looking sideways: +${(out2.s - out1.s).toFixed(2)} m along the route (1.4 m/s), camera ${offRoute.toFixed(3)} m from the route point`);
await page.click('#btn-switch'); await mode('landing'); const lbl = await page.textContent('#btn-hud span'); await page.evaluate(() => window.__mw.enterRole('hud')); await mode('hud', 40000); const re = await snap();
check('no-indoor-walk-after-departure', re.mode === 'hud' && !re.habitat && re.s === out2.s && /HUD/.test(lbl), `after departure the crew button reads "${lbl}" and resumes the HUD at s = ${re.s.toFixed(2)} m (no way back into indoor free walk)`);

// ---------- HUD takes no pointer input ----------
await lookAhead();
const dom = await mw(() => { const h = document.querySelector('#hud'), all = [...h.querySelectorAll('*')]; return { controls: h.querySelectorAll('button, a[href], input, select, [role="button"], [onclick], [tabindex]').length, pointerAuto: all.filter((e) => getComputedStyle(e).pointerEvents !== 'none').length, total: all.length, hudSelf: getComputedStyle(h).pointerEvents }; });
check('hud-has-no-clickable-elements', dom.controls === 0 && dom.pointerAuto === 0 && dom.hudSelf === 'none', `${dom.total} HUD elements: ${dom.controls} buttons/links/inputs, ${dom.pointerAuto} with pointer-events other than none`);
const plates = ['#hud-status', '.hud-brand', '.hud-bl', '.hud-br', '#hud-hint', '#hud-legend', '.hud-compass'];
const c0 = await snap(); let hitHud = 0;
for (const sel of plates) { const b = await page.locator(sel).boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2; if (await mw(([px, py]) => !!document.elementFromPoint(px, py)?.closest('#hud'), [x, y])) hitHud++; await page.mouse.click(x, y); await page.waitForTimeout(120); }
await unlock(); await page.waitForTimeout(200); const c1 = await snap();
check('hud-clicks-do-nothing', same(c0, c1, HUD_KEYS) && hitHud === 0, `real mouse clicks on ${plates.length} HUD plates: no state change; hit-testing never lands on a HUD element (clicks fall through to the view, which only locks the mouse look)`);

// ---------- 우주복·임무 상태 layer: button 2 (and the voice word "상세"), display only ----------
await lookAhead(); await page.keyboard.press('Digit2'); await page.waitForTimeout(300);
const d1 = await snap(), dTxt = await page.textContent('#hud-detail'), dBox = await page.locator('#hud-detail').boundingBox();
const need = ['계획', '경로 진행', '산소 모델', '남은 이동', '지형', '심박·압력·체온', '전력·통신 지연', '버디 위치'];
const unavailable = await page.$$eval('#hud-detail .hud-unavailable', (e) => e.map((x) => x.textContent.trim()));
check('status-layer-opens-with-button2', d1.detail && await page.isVisible('#hud-detail') && need.every((k) => dTxt.includes(k)) && unavailable.length === 3 && unavailable.every((t) => t.startsWith('미연결')),
  `button 2 opened the layer; rows ${need.join(' / ')}; 미연결 rows: ${JSON.stringify(unavailable)}`);
const centre = { x0: 0.30 * 1600, x1: 0.70 * 1600, y0: 0.24 * 900, y1: 0.72 * 900 };
check('status-layer-outside-central-field', dBox.x + dBox.width <= centre.x0 || dBox.x >= centre.x1, `layer spans x ${dBox.x.toFixed(0)}–${(dBox.x + dBox.width).toFixed(0)} px; central field starts at ${centre.x0} px (same zone as the stage 2 design audit)`);
await shot('06-hud-status-layer-open', 'HUD with the 우주복·임무 상태 layer opened by button 2 (teammate\'s panel content, 미연결 labels kept, no click targets)');
await page.mouse.click(dBox.x + dBox.width / 2, dBox.y + 14); await page.mouse.click(dBox.x + dBox.width - 12, dBox.y + 12); await unlock(); await page.waitForTimeout(200);
check('status-layer-not-clickable', (await snap()).detail && (await page.locator('#hud-detail button, #hud-status-toggle, #hud-detail-close').count()) === 0, 'clicking the layer (including where the old × close button was) leaves it open; no toggle/close buttons exist');
const m0 = await snap(); await holdKeys(['KeyW'], 800); const m1 = await snap();
check('status-layer-does-not-block-walking', m1.s > m0.s + 0.6 && m1.detail, `with the layer open W still advances (+${(m1.s - m0.s).toFixed(2)} m); the layer is a display, not a modal`);
await page.keyboard.press('Digit2'); await page.waitForTimeout(200); const d2 = await snap(); await page.keyboard.press('Digit2'); await page.waitForTimeout(200); const d3 = await snap();
check('button2-cycle-detail-declutter-normal', !d2.detail && d2.declutter && !d3.detail && !d3.declutter, 'button 2 without a card: 기본 → 상세 → 부가 정보 숨김 → 기본');
const v1 = await mw(() => window.__mw.hud.voiceCommand('상세 열어')), v1s = await snap(); const v2 = await mw(() => window.__mw.hud.voiceCommand('상세')), v2s = await snap(); const v3 = await mw(() => window.__mw.hud.voiceCommand('지도')), v3s = await snap();
results.info.speechRecognitionApi = await mw(() => window.__mw.hud.speechAvailable);
check('voice-word-toggles-status-layer', v1 && v1s.detail && v2 && !v2s.detail && !v3 && !v3s.detail, `hook: recognised text containing "상세" toggles the layer, other words do nothing. Browser SpeechRecognition API present: ${results.info.speechRecognitionApi}. Microphone recognition itself is NOT exercised here`);
await page.keyboard.down('KeyV'); await page.waitForTimeout(300); await page.keyboard.up('KeyV'); await page.waitForTimeout(200); results.info.voiceHint = await page.textContent('#hud-hint');
check('V-key-does-not-move-or-act', same(v3s, await snap(), HUD_KEYS.filter((k) => k !== 'detail')), `holding V outside the memo only listens for the word; hint: "${results.info.voiceHint}"`);
if ((await snap()).detail) await mw(() => window.__mw.hud.setDetail(false));
// HUD digits never reach the monitors
const k0 = await snap(); await tap(['Digit3', 'Digit1', 'KeyF']); const k1 = await snap();
check('hud-keys-do-not-reach-monitors', k1.mode === 'hud' && k1.monitor === null && same(k0, k1, HUD_KEYS), 'in the HUD 3 / 1 (no card) / F open no monitor and change no HUD state');

// ---------- rover: E key only; the on-screen E prompt is a hint, not a button ----------
await lookAhead(); await page.keyboard.down('KeyW'); await page.waitForFunction(() => { const s = window.__mw.mission.st; return Math.abs(s.s - s.roverS) < 1.5; }, null, { timeout: 30000 }); await page.keyboard.up('KeyW'); await page.waitForTimeout(400);
const act = page.locator('#hud-act'), actTxt = await act.textContent(), ab = await act.boundingBox();
await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2); await unlock(); await page.waitForTimeout(300); const r0 = await snap();
check('E-prompt-is-hint-not-button', await act.isVisible() && /E/.test(actTxt) && r0.transport === 'foot' && (await act.evaluate((e) => e.tagName)) === 'DIV', `"${actTxt}" is shown as a hint; clicking it does not board (transport ${r0.transport})`);
await page.keyboard.press('KeyE'); await page.waitForTimeout(1200); const r1 = await snap();
check('E-key-boards-rover', r1.transport === 'rover', `E key: transport ${r1.transport}`);
await lookAhead(-0.2); await holdKeys(['ShiftLeft', 'KeyW'], 2500); await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await page.waitForTimeout(600);
await shot('07-rover-warp', 'riding the rover along the real traverse line with Shift ×4 time compression'); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');

// ---------- arrival -> H2 -> H3 -> H5 -> base -> mission end (keys only) ----------
await lookAhead(); await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await page.waitForFunction(() => window.__mw.mission.st.phase === 'arrived', null, { timeout: 120000 }); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); await page.waitForTimeout(400);
// with a card on screen, seat key meanings must still not leak: 3 does nothing; 1 confirms (HUD button 1)
await page.keyboard.press('Digit3'); await page.waitForTimeout(150); const a0 = await snap(); await page.keyboard.press('Digit1'); await page.waitForTimeout(400); const a1 = await snap();
check('arrival-confirm-button1', a0.phase === 'arrived' && a0.monitor === null && a1.phase === 'onsite', 'key 3 ignored; button 1 confirmed the arrival');
await page.keyboard.press('Digit1'); await page.waitForTimeout(300); await page.keyboard.press('Digit1'); await page.waitForTimeout(400); const h2 = await snap(); // v0.2: the one-press 관찰 item is gone; two 촬영 마킹 records
check('onsite-records-by-keys', h2.records === 2 && h2.phase === 'onsite', `two photo marks recorded with button 1 (${h2.records} records)`);
await page.waitForTimeout(300); await shot('08-onsite-h2-tasks', 'on site: H2 task card with the PIA26368 reference photo, records made with dial + button 1');
// seat keys while a HUD action is pending must not run it: go to the seat, press 1/Enter, come back
await tap(['ArrowUp']); const selReturn = await mw(() => window.__mw.hud.actions()[window.__mw.hud.ui.sel]?.id);
await unlock(); await page.click('#btn-switch'); await mode('landing'); await page.evaluate(() => window.__mw.enterRole('pad')); await mode('pad'); await openMonitor(page, 'science');
await mw(() => document.activeElement && document.activeElement.blur()); await tap(['Enter', 'Digit1']); await page.waitForTimeout(300); const sx = await snap();
check('seat-1-and-enter-do-not-run-hud-action', selReturn === 'return' && sx.phase === 'onsite' && sx.records === 2 && sx.monitor === 'science', `HUD highlight was "복귀 개시"; in the seat 1/Enter left the mission ${sx.phase} with ${sx.records} records`);
await page.click('#btn-switch'); await mode('landing'); await page.evaluate(() => window.__mw.enterRole('hud')); await mode('hud', 40000); await page.waitForTimeout(300);
await page.keyboard.press('Digit1'); await page.waitForTimeout(400); const ret = await snap();
check('return-started-by-button1', ret.phase === 'returning', `back in the HUD, button 1 ran the highlighted item: phase ${ret.phase}`);
await lookAhead(); await holdKeys(['ShiftLeft', 'KeyW'], 1500); await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await shot('09-return-h5', 'H5 return: driving back along the same route toward the base'); await page.keyboard.up('KeyW');
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await page.waitForFunction(() => window.__mw.mission.st.phase === 'atBase', null, { timeout: 120000 }); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); await page.waitForTimeout(400);
const b0 = await snap(); await page.keyboard.press('Digit1'); await page.waitForTimeout(400); const b1 = await snap();
check('base-arrival-then-mission-end', b0.phase === 'atBase' && b1.phase === 'ended' && b1.mode === 'hud' && !b1.habitat, 'base arrival is a separate state; button 1 ended the mission; the crew stays on the route outside (no re-entry into indoor walk)');
await page.waitForTimeout(400); await shot('10-mission-end', 'mission ended at the base ramp');

results.info.end = await snap();
results.finishedAt = new Date().toISOString(); results.summary = { pass: results.checks.filter((c) => c.pass).length, fail: results.checks.filter((c) => !c.pass).length };
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
console.log('\nsummary', JSON.stringify(results.summary), '| console issues', results.console.length, '| failed requests', results.failedRequests.length);
await browser.close(); process.exit(results.summary.fail ? 1 : 0);
