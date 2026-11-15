// Stage 3 (feature definition v0.2: 현장 대조, 관찰 대조, 관찰 리스트, 관심 지점, 시료 기록, 경보, two buttons + voice) verification + captures.
// Usage: dev server running, then `MW_URL=http://127.0.0.1:5174/ npm run capture:stage3` (MW_OUT overrides the output dir).
// Expected values come from the spec: stay 20 min, "10분 전 경보" 600 s, turnaround T+25:00 with a 120 s lead, buddy 15 m, comm 10 s,
// interest point 180 s, dose 0.67 mSv/day, waypoint 56_0 = 77.30519089E 18.49748444N, PIA26368 824x600, PIA26640 915x1037.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterHud, enterPad } from './lib/enter.mjs'; // integration build: first HUD entry = indoor walk + airlock exit; PAD = seat + centre monitor
const URL = process.env.MW_URL || 'http://127.0.0.1:5173/', OUT = process.env.MW_OUT || 'docs/captures/stage3-v02-field';
mkdirSync(OUT, { recursive: true });
const results = { url: URL, startedAt: new Date().toISOString(), checks: [], captures: [], console: [], failedRequests: [], info: {} };
const check = (id, pass, detail) => { results.checks.push({ id, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.MW_HEADED, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const watch = (page) => { page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') results.console.push({ type: m.type(), text: m.text().slice(0, 300) }); }); page.on('pageerror', (e) => results.console.push({ type: 'pageerror', text: String(e).slice(0, 400) })); page.on('requestfailed', (r) => results.failedRequests.push(r.url())); page.on('response', (r) => { if (r.status() >= 400) results.failedRequests.push(`${r.status()} ${r.url()}`); }); };
let page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 }); watch(page);
const mw = (fn, arg) => page.evaluate(fn, arg);
const st = () => mw(() => { const s = window.__mw.mission.st; return { s: s.s, sim: s.simSeconds, phase: s.phase, transport: s.transport, len: s.route.length, dose: s.doseUsv, minimap: s.minimap, commUp: s.comm.up }; });
const mode = (m, timeout = 40000) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout });
const shot = async (name, note) => { await page.screenshot({ path: `${OUT}/${name}.png` }); results.captures.push({ file: `${OUT}/${name}.png`, note }); };
const txt = (sel) => page.textContent(sel);
const wait = (ms) => page.waitForTimeout(ms);
const sw = async (to) => { await mw(() => document.exitPointerLock && document.exitPointerLock()); await wait(150); await page.click('#btn-switch'); await mode('landing'); if (to === 'pad') await enterPad(page); else await enterHud(page); await wait(700); };
// ---- inputs. Everything the crew does on the HUD below goes through these helpers, and they record what was used. ----
const used = new Set();
const b1 = async () => { used.add('button 1 (1)'); await page.keyboard.press('Digit1'); await wait(260); };
const b2 = async () => { used.add('button 2 (2)'); await page.keyboard.press('Digit2'); await wait(220); };
/** Push-to-talk, then the labelled typed fallback (headless Chrome has no microphone). */
const say = async (text) => { used.add('voice (V) + typed fallback'); await page.keyboard.down('KeyV'); await wait(180); await page.keyboard.up('KeyV'); await wait(220); const focus = await mw(() => document.activeElement && document.activeElement.id); await page.keyboard.type(text); await wait(60); await page.keyboard.press('Enter'); await wait(320); const c = await mw(() => window.__mw.fx.ui.lastCommand); return { ...c, focus }; };
const walk = async (until, shift = false, timeout = 120000) => { used.add(shift ? 'move (W + Shift)' : 'move (W)'); await page.keyboard.down('KeyW'); if (shift) await page.keyboard.down('ShiftLeft'); await page.waitForFunction(until, null, { timeout }); if (shift) await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await wait(350); };
const sel = () => page.$eval('#hud-card .hud-item.sel', (e) => e.dataset.act).catch(() => null);
const items = () => page.$$eval('#hud-card .hud-item', (els) => els.map((e) => e.dataset.act));
const selectItem = async (id, max = 12) => { for (let i = 0; i < max; i++) { if ((await sel()) === id) return true; await b2(); } return (await sel()) === id; };
const recs = () => mw(() => window.__mw.mission.st.records.map((r) => ({ ...r, frame: r.frame ? r.frame.length : 0 })));
const alerts = () => mw(() => window.__mw.mission.st.alerts.map((a) => ({ ...a })));
/** Look direction stand-in for the mouse: aim at the rock face centre plus an offset (radians). */
const lookRock = (dy = 0, dp = 0) => mw(([dy, dp]) => { const m = window.__mw, c = m.field.centreWorld(), d = c.clone().sub(m.camera.position); m.look.yaw = Math.atan2(-d.x, -d.z) + dy; m.look.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) + dp; }, [dy, dp]);
const fieldInfo = () => mw(() => { const m = window.__mw, f = m.field, t = f.targetWorld(0), M = f.metrics(m.camera), proj = t ? t.clone().project(m.camera) : null; let anc = f.overlay, chain = []; while (anc) { chain.push(anc.name || anc.type); anc = anc.parent; }
  return { overlayVisible: f.overlay.visible, ringsVisible: f.rings.visible, opacity: f.overlay.material.opacity, isMesh: f.overlay.isMesh === true, chain, inDom: !!document.querySelector('#hud [id*="overlay"]'), target: t ? [t.x, t.y, t.z] : null, screen: proj ? [(proj.x + 1) / 2 * innerWidth, (1 - proj.y) / 2 * innerHeight] : null, matrix: f.overlay.matrixWorld.elements.slice(12, 15), ...M }; });
/** Bounding boxes of every visible HUD panel; any two that intersect by more than 1 px are reported. */
const overlaps = (label) => mw((label) => { const S = ['#hud-status', '.hud-brand', '.hud-compass', '.hud-hdg', '#hud-map', '.hud-bl', '.hud-br', '#hud-cue', '#hud-card', '#hud-board', '#hud-voice', '#hud-fx-note', '#hud-act', '#hud-hint', '#hud-legend'];
  const box = S.map((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (!r.width || !r.height || cs.display === 'none' || e.closest('.hidden')) return null; return { s, l: r.left, t: r.top, r: r.right, b: r.bottom, clipped: /card|board/.test(s) && e.scrollHeight - e.clientHeight > 2 }; }).filter(Boolean), hit = [];
  for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) { const a = box[i], b = box[j], w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t); if (w > 1 && h > 1) hit.push(`${a.s} x ${b.s} (${w.toFixed(0)}x${h.toFixed(0)})`); }
  return { label, n: box.length, hit, offscreen: box.filter((b) => b.l < 0 || b.t < 0 || b.r > innerWidth || b.b > innerHeight).map((b) => b.s), clipped: box.filter((b) => b.clipped).map((b) => b.s), shown: box.map((b) => b.s) }; }, label);
const layout = []; const lay = async (label) => { const o = await overlaps(label); layout.push(o); return o; };

await page.goto(URL); await page.waitForFunction(() => window.__mw && (window.__mw.ready || window.__mw.errors.length), null, { timeout: 120000 });
// This file checks the person-in-the-HUD path. TEST HOOK: keep the simulated crew ('pad-auto') idle while the test visits the PAD,
// otherwise it would board the rover, acknowledge and answer by itself. The pad-auto path is covered by tests/scenario-look.mjs.
await mw(() => { window.__mw.mission.st.holdAuto = true; });

// ---------- (fix) destination marker is placed at load ----------
const mk = await mw(() => { const m = window.__mw, e = m.mission.poseAt(m.mission.st.route.length), p = m.marker.position; return { d: Math.hypot(p.x - e.x, p.z - e.z), fromOrigin: Math.hypot(p.x, p.z), dy: Math.abs(p.y - m.terrain.groundY(p.x, p.z)) }; });
check('fix-destination-marker-placed-at-load', Math.abs(mk.d - 1.3) < 0.01 && mk.fromOrigin > 100 && mk.dy < 1e-6, `flag is ${mk.d.toFixed(2)} m from the route end (expected 1.30), ${mk.fromOrigin.toFixed(0)} m from the base origin, on the ground`);

// ====================== PAD: line extraction, target, package ======================
await enterPad(page);
await page.click('#fp-open'); await page.waitForFunction(() => window.__mw.fieldPad.ui.draft, null, { timeout: 20000 }); await wait(300);
const ex = await mw(() => { const fp = window.__mw.fieldPad, a = fp.ui.draft, b = fp.extract(2), c = fp.extract(2), d1 = fp.extract(1), d3 = fp.extract(3), back = fp.extract(2); const flat = a.polylines.flat();
  return { hash: a.hash, again: [b.hash, c.hash, back.hash], same: JSON.stringify(a.polylines) === JSON.stringify(c.polylines), counts: [d1.count, a.count, d3.count], hashes: [d1.hash, a.hash, d3.hash], points: a.points, inRange: flat.every((v) => v >= 0 && v <= 1), minPts: Math.min(...a.polylines.map((p) => p.length / 2)), w: a.width, h: a.height, maxLines: a.params.maxLines, ms: fp.ui.ms }; });
results.info.extraction = ex;
check('line-extraction-deterministic', ex.again.every((h) => h === ex.hash) && ex.same, `same photo, same setting, 4 runs: fingerprint ${ex.hash} each time; polylines identical`);
check('line-extraction-output-sane', ex.w === 1024 && ex.h === 559 && ex.inRange && ex.minPts >= 2 && ex.counts.every((c) => c >= 5 && c <= 32) && new Set(ex.hashes).size >= 2, `1024x559 input (measured mesh texture, half size); ${ex.counts[1]} polylines / ${ex.points} vertices, all inside 0..1; only the longest lines inside the rock's image box are kept (max 32); detail presets give ${ex.counts.join(' / ')} lines; ${ex.ms.toFixed(0)} ms`);
const pre = await txt('#fp-state');
const preT = await mw(() => window.__mw.fieldPad.ui.targets.map((t) => ({ ...t })));
check('package-draft-not-sent', /전송 —/.test(pre) && /HUD 수신 —/.test(pre) && /대원 확인 —/.test(pre) && preT.length === 1 && preT[0].preset === 'B' && (await mw(() => window.__mw.mission.st.pkg)) === null, 'nothing sent yet; the planner target defaults to point B (core area, raw-metadata estimate)');
await page.click('#fp-clear'); await wait(200);
const cvb = await page.locator('#fp-cv').boundingBox(); await page.mouse.click(cvb.x + cvb.width * 0.42, cvb.y + cvb.height * 0.52); await wait(300);
const tg = await mw(() => window.__mw.fieldPad.ui.targets);
check('target-marked-by-mouse-on-pad', tg.length === 1 && Math.abs(tg[0].u - 0.42) < 0.06 && Math.abs(tg[0].v - 0.52) < 0.06 && !(await page.isDisabled('#fp-send')), `one click on the photo -> target at (${(tg[0].u * 100).toFixed(1)} %, ${(tg[0].v * 100).toFixed(1)} %) of the image`);
const padTxt = await txt('#fp-body');
check('pad-photo-credit-and-limits', /Hazcam/.test(padTxt) && /sol 1215/.test(padTxt) && /NASA\/JPL-Caltech/.test(padTxt) && /인식\/분석 아님/.test(padTxt) && /자동 인식 없음/.test(padTxt) && /실측 메시/.test(padTxt) && /raw 메타데이터 기반 추정/.test(padTxt), 'panel names the measured source, credit, "not recognition", crew decides the match, single-view decimated mesh, estimated points');
await shot('01-pad-line-extraction-target', 'PAD: line drawing traced from PIA26368 over the photo, planner-marked sampling target, package not yet sent');
await page.uncheck('#fp-photo'); await wait(250); await shot('02-pad-lines-only', 'PAD: the line drawing alone (what the HUD will receive)'); await page.check('#fp-photo');
await page.click('#fp-send'); await wait(700);
const p1 = await mw(() => { const p = window.__mw.mission.st.pkg; return p && { rev: p.rev, planVersion: p.planVersion, n: p.lines.length, hash: p.lineHash, targets: p.targets, source: p.source, credit: p.credit, sentAt: p.sentAt, receivedAt: p.receivedAt, ackAt: p.ackAt }; }), sentTxt = await txt('#fp-state');
check('package-sent-not-yet-received', p1 && p1.sentAt !== null && p1.receivedAt === null && p1.ackAt === null && /전송 T\+/.test(sentTxt) && /HUD 수신 —/.test(sentTxt), sentTxt.replace(/\s+/g, ' '));
check('package-contents', p1.hash === ex.hash && p1.n === ex.counts[1] && p1.targets.length === 1 && /Hazcam/.test(p1.source) && p1.credit === 'NASA/JPL-Caltech' && p1.planVersion === 1 && p1.rev === 1, `lines ${p1.n} (fingerprint ${p1.hash}), target 1, source "${p1.source}", credit ${p1.credit}, plan v${p1.planVersion}, package r${p1.rev}`);
await page.click('#fp-close');

// ====================== HUD: receive / acknowledge ======================
await sw('hud');
const p2 = await mw(() => ({ ...window.__mw.mission.st.pkg, lines: undefined })), cardP = await txt('#hud-card'), f0 = await fieldInfo();
check('package-received-shows-card', p2.receivedAt !== null && p2.ackAt === null && /대조 패키지 수신/.test(cardP) && /NASA\/JPL-Caltech/.test(cardP) && (await items()).join() === 'pkg-ack' && !f0.overlayVisible, cardP.replace(/\s+/g, ' ').slice(0, 120));
await lay('package card in the base'); await shot('03-hud-package-received', 'HUD in the base: 대조 패키지 received, waits for button 1');
await b1(); const p3 = await mw(() => window.__mw.mission.st.pkg.ackAt);
check('package-acknowledged-with-button1', p3 !== null && !(await page.isVisible('#hud-card')), 'button 1 acknowledges; received and acknowledged are separate timestamps');
await sw('pad'); await page.click('#fp-open'); await wait(700); const ackTxt = await txt('#fp-state');
check('pad-shows-three-package-states', /전송 T\+/.test(ackTxt) && /HUD 수신 T\+/.test(ackTxt) && /대원 확인 T\+/.test(ackTxt), ackTxt.replace(/\s+/g, ' '));
await page.click('#fp-close'); await sw('hud');

// ====================== drive to the site with W, voice "탑승", button 1 ======================
await walk(() => { const s = window.__mw.mission.st; return s.roverS - s.s <= 2.4; }, false, 60000);
const mv = await lay('walking outdoors');
const boarded = await say('탑승');
check('voice-fallback-boards-rover', boarded.ok && boarded.focus === 'hud-voicein' && (await st()).transport === 'rover', `typed fallback "탑승" -> ${boarded.msg}`);
await wait(900); await b1(); const mapOn = (await st()).minimap; await wait(400); const mapLay = await lay('riding, minimap on'); await b1();
check('button1-toggles-minimap-when-no-card', mapOn === true && (await st()).minimap === false, 'with no card, button 1 turns the minimap on and off (team path does not need M)');
await mw(() => { const m = window.__mw; m.look.yaw = m.mission.poseAt(m.mission.st.s).yaw; m.look.pitch = -0.1; });
await walk(() => window.__mw.mission.st.arrived, true);
await lay('arrival card'); await b1();
check('arrival-confirmed-with-button1', (await st()).phase === 'onsite', 'onsite');
const list0 = await items();
check('onsite-list-has-v02-items', list0.join() === 'photo,memo,compare,board,sample,interest,return', list0.join(' · '));

// ====================== 현장 대조: world-anchored overlay, alignment, confirm ======================
await lookRock(0.3, 0.12); await wait(300);
const clickBox = await page.locator('#hud-card .hud-item[data-act="compare"]').boundingBox(); await page.mouse.click(clickBox.x + 20, clickBox.y + 6); await wait(200);
check('mouse-click-on-new-items-does-nothing', (await mw(() => window.__mw.fx.ui.view)) === null, 'clicking 현장 대조 with the mouse opens nothing (mouse = look only)');
check('button2-moves-highlight', (await selectItem('compare')) && (await sel()) === 'compare', 'button 2 stepped the highlight to 현장 대조');
await lay('onsite task list'); await shot('04-hud-onsite-task-list', 'HUD on site: task list with the v0.2 items, remaining stay; navigation panel not covered');
await b1(); await wait(400);
const fMis = await fieldInfo(), cardMis = await txt('#hud-card');
check('overlay-shown-misaligned', fMis.overlayVisible && !fMis.aligned && fMis.gazeErrDeg > 4 && /정렬 안 됨/.test(cardMis) && !fMis.ringsVisible && fMis.opacity < 0.6, `gaze error ${fMis.gazeErrDeg.toFixed(1)} deg (tolerance 4), overlay drawn dim, card says 정렬 안 됨`);
check('compare-card-honesty-labels', /실측 지형 메시/.test(cardMis) && /자동 인식 아님/.test(cardMis) && /raw 메타데이터 기반 추정/.test(cardMis) && /단일 시점/.test(cardMis) && /생명 판정 없음/.test(cardMis) && /NASA\/JPL-Caltech/.test(cardMis), 'card states: measured mesh (single view, decimated), no auto-detection, points are estimates, no life judgement, credit');
await b1(); const rej = await mw(() => window.__mw.mission.st.compare.result);
check('match-rejected-while-misaligned', rej === null && (await recs()).length === 0, 'button 1 on 일치 확인 while the gaze is off: nothing recorded');
await lay('compare card, misaligned'); await shot('05-hud-compare-misaligned', 'HUD 현장 대조: line drawing on the rock stand-in, gaze off the rock -> 정렬 안 됨');
// world anchor: turning the head moves the overlay on screen, not in the world
const a1 = await fieldInfo(); await lookRock(-0.25, 0.05); await wait(300); const a2 = await fieldInfo();
const moved = Math.hypot(a1.screen[0] - a2.screen[0], a1.screen[1] - a2.screen[1]), worldStill = a1.target.every((v, i) => Math.abs(v - a2.target[i]) < 1e-9) && a1.matrix.every((v, i) => Math.abs(v - a2.matrix[i]) < 1e-9);
check('overlay-anchored-in-world-space', a1.isMesh && a1.chain.includes('field-site') && a1.chain.includes('Scene') && !a1.inDom && worldStill && moved > 300, `overlay is a mesh under ${a1.chain.join(' > ')}; head turn 0.55 rad moved the target ${moved.toFixed(0)} px on screen while its world position stayed (${a1.target.map((v) => v.toFixed(2)).join(', ')})`);
await lookRock(0.015, 0); await wait(400);
const fAl = await fieldInfo(), cardAl = await txt('#hud-card');
check('alignment-within-tolerance', fAl.aligned && fAl.gazeErrDeg < 4 && fAl.obliqDeg < 75 && fAl.dist < 6 && /정렬됨/.test(cardAl) && fAl.opacity === 1, `gaze error ${fAl.gazeErrDeg.toFixed(1)} deg / 4, view obliquity ${fAl.obliqDeg.toFixed(0)} deg / 75, distance ${fAl.dist.toFixed(1)} m`);
await shot('06-hud-compare-aligned', 'HUD 현장 대조: gaze on the rock -> 정렬됨, overlay at full strength');
const said = await say('일치'); await wait(400);
const cm = await mw(() => ({ ...window.__mw.mission.st.compare })), fM = await fieldInfo(), r1 = (await recs())[0], cardM = await txt('#hud-card');
check('match-confirmed-by-voice-fallback', said.cmd === 'match' && said.ok && said.by === 'typed' && cm.result === 'match' && cm.by === 'typed' && r1.type === 'compare' && /자동 인식 아님/.test(r1.text) && /대체 입력/.test(r1.input), `typed fallback "일치" -> ${said.msg}; record #${r1.id}: ${r1.text}`);
check('target-highlight-after-confirm', fM.ringsVisible && fM.overlayVisible && /채취 예정 지점을 암석 위에 강조/.test(cardM) && /어디를 채취할지는 대원이 정합니다/.test(cardM) && fM.screen[0] > 0 && fM.screen[0] < 1600 && fM.screen[1] > 0 && fM.screen[1] < 900, `target ring visible at screen (${fM.screen.map((v) => v.toFixed(0)).join(', ')}); card leaves the sampling decision to the crew`);
await lay('compare card, matched + voice bar'); await wait(3600); await lay('compare card, matched');
{ const fs = await fieldInfo(), [sx, sy] = fs.screen, png = (await page.screenshot({ clip: { x: Math.round(sx) - 40, y: Math.round(sy) - 40, width: 80, height: 80 } })).toString('base64');
  const white = await mw(async (png) => { const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + png)).blob()), c = document.createElement('canvas'); c.width = c.height = 80; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, 80, 80).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) n++; return n; }, png);
  check('target-ring-drawn-on-screen', white >= 6, `${white} near-white pixels in the 80x80 px box around the projected target (the ring is the only white element on the rock)`); } await shot('07-hud-target-highlight', 'HUD: after "일치" the planned sampling target is highlighted on the rock');
check('two-buttons-leave-compare', (await selectItem('back')) && (await b1(), (await mw(() => window.__mw.fx.ui.view)) === null), 'button 2 to 작업 목록으로, button 1 closes the view');

// ====================== 관찰 대조 board + 관찰 리스트 ======================
const opened = await say('관찰'); await wait(600);
const bd = await mw(() => { const q = (s) => document.querySelector(s), im = (s) => { const i = q(s); if (!i) return null; const r = i.getBoundingClientRect(); return { nw: i.naturalWidth, nh: i.naturalHeight, ok: i.complete, fit: getComputedStyle(i).objectFit, w: r.width, h: r.height }; };
  return { visible: !q('#hud-board').classList.contains('hidden'), ref: im('#hud-ref'), pixl: im('#hud-pixl'), shot: im('#hud-shot'), p1: q('#hud-pane1').textContent, p2: q('#hud-pane2').textContent, p3: q('#hud-pane3').textContent, notice: q('#hud-b-notice').textContent, foot: q('#hud-b-foot').textContent, plan: q('#hud-b-plan').textContent, all: q('#hud-board').textContent, nItems: document.querySelectorAll('#hud-b-items .b-item').length, linkBoxes: document.querySelectorAll('#hud-board .roi, #hud-board svg').length, statusVisible: !!q('#hud-status').getBoundingClientRect().width }; });
results.info.board = { ref: bd.ref, pixl: bd.pixl, shot: bd.shot };
check('board-opens-by-voice-on-site', opened.ok && bd.visible && bd.statusVisible && bd.nItems === 6, 'typed fallback "관찰" opens the board while stopped on site; fixed status band stays visible');
check('board-pane1-original-uncropped', bd.ref.ok && bd.ref.nw === 824 && bd.ref.nh === 600 && bd.ref.fit === 'contain' && /PIA26368/.test(bd.p1) && /WATSON/.test(bd.p1) && /NASA\/JPL-Caltech\/MSSS/.test(bd.p1) && /축척 자료 미확보/.test(bd.p1), `PIA26368 ${bd.ref.nw}x${bd.ref.nh}, object-fit ${bd.ref.fit} (whole image), credit and "no scale" shown`);
check('board-pane2-public-analysis', bd.pixl.ok && bd.pixl.nw === 915 && bd.pixl.nh === 1037 && Math.abs(bd.pixl.w / bd.pixl.h - 915 / 1037) < 0.02 && /PIA26640/.test(bd.p2) && /NASA\/JPL-Caltech/.test(bd.p2) && /2025-09-10/.test(bd.p2) && /실시간 검출 아님/.test(bd.p2) && /비비아나이트/.test(bd.p2) && /그레이자이트/.test(bd.p2) && /근사색/.test(bd.p2) && /1 mm/.test(bd.p2) && /위치 정합 미확인/.test(bd.p2) && bd.linkBoxes === 0, `PIA26640 ${bd.pixl.nw}x${bd.pixl.nh} shown whole; legend from the caption (swatches labelled approximate), 1 mm bar note, "registration with ① unverified", no linking boxes`);
check('board-pane3-crew-record', bd.shot && bd.shot.ok && bd.shot.nw === 480 && /모의 화면 · 실제 관측 아님/.test(bd.p3) && /T\+/.test(bd.p3) && /°E/.test(bd.p3) && /µSv/.test(bd.p3) && /분석·판정 없음/.test(bd.p3), `capture of the demo view (${bd.shot ? bd.shot.nw + 'x' + bd.shot.nh : 'none'}) labelled 모의 화면 · 실제 관측 아님, with time / coordinates / dose`);
check('board-notices', /표현색/.test(bd.notice) && /헬멧이 이 현장을 분석한 결과도 아닙니다/.test(bd.notice) && /잠재적 생명 흔적은 생명 확인이 아닙니다/.test(bd.foot) && /NASA 2025-09-10/.test(bd.foot) && /일치 확인/.test(bd.plan) && !/확률|스캔|생명 확인됨|생명 발견/.test(bd.all), 'analysis-colour notice, "potential biosignature is not life confirmed", package tie-in line; no probability or scan wording');
const obs = () => mw(() => ({ o: { ...window.__mw.mission.st.observations }, cur: window.__mw.fx.ui.obsCur }));
await b1(); const o1 = await obs();                    // 층리: 봄 (button 1 on the first option)
await b2(); await b1(); const o2 = await obs();        // 입자: 못 봄 (button 2 then 1)
check('observation-answers-by-two-buttons', o1.o.bedding.answer === 'seen' && o1.o.bedding.by === 'button' && o1.cur === 'grain' && o2.o.grain.answer === 'not_seen' && o2.cur === 'sorting', '층리 = 봄 (button 1), 입자 = 못 봄 (button 2, button 1); the highlight moves to the next unanswered item');
const v1 = await say('분급 판단 불가'), v2 = await say('맥 봄'), v3 = await say('반점 봄'), v4 = await say('대안 설명 판단 불가'); const o3 = await obs();
check('observation-answers-by-voice-fallback', [v1, v2, v3, v4].every((v) => v.ok && v.cmd === 'answer') && o3.o.sorting.answer === 'undetermined' && o3.o.vein.answer === 'seen' && o3.o.spots.answer === 'seen' && o3.o.alt.answer === 'undetermined' && o3.o.vein.by === 'typed' && Object.keys(o3.o).length === 6, 'typed fallback "분급 판단 불가", "맥 봄", "반점 봄", "대안 설명 판단 불가" saved with the item named in the utterance');
const obsRecs = (await recs()).filter((r) => r.type === 'obs');
check('observation-answers-saved-as-records', obsRecs.length === 6 && obsRecs.every((r) => r.simT > 0 && r.grade === '육안' && ['seen', 'not_seen', 'undetermined'].includes(r.answer) && Math.abs(r.lonE - 77.30519089) < 1e-5) && /봄|못 봄|판단 불가/.test(obsRecs[0].text), `6 records, enum seen/not_seen/undetermined, grade 육안, time and coordinates attached; e.g. "${obsRecs[1].text}" (${obsRecs[1].input})`);
await wait(4200); const boardLay = await lay('관찰 대조 board'); await shot('08-hud-observation-board', 'HUD 관찰 대조: original PIA26368 | public PIXL analysis PIA26640 + legend | crew record (demo capture), six answered items');
const bb = await page.locator('#hud-board').boundingBox();
check('board-fits-the-view', bb.y > 0 && bb.y + bb.height < 900 * 0.86 && bb.x > 0 && bb.x + bb.width < 1600, `board spans y ${bb.y.toFixed(0)}..${(bb.y + bb.height).toFixed(0)} of 900`);
const closed = await say('닫기'); check('board-closes-by-voice', closed.ok && !(await page.isVisible('#hud-board')) && (await items()).length === 7, 'typed fallback "닫기" returns to the task list');

// ====================== 추가 관심 지점 + remaining time ======================
await lookRock(0.9, -0.12); await wait(300);
await selectItem('interest'); const stayA = await mw(() => window.__mw.mission.stayLeft()); await b1(); await wait(350);
const i1 = (await recs()).filter((r) => r.type === 'interest'), crew = await mw(() => { const m = window.__mw, p = m.mission.poseAt(m.mission.st.s); return { x: p.x, z: p.z }; });
const left1 = await mw(() => ({ shown: document.querySelector('#hud-stay2') && document.querySelector('#hud-stay2').textContent, row: document.querySelector('#hud-stay2row') && document.querySelector('#hud-stay2row').textContent, val: window.__mw.mission.stayLeftAfterInterest(), stay: window.__mw.mission.stayLeft(), pins: window.__mw.field.pins.children.length, note: document.querySelector('#hud-fx-note').textContent }));
const toSec = (t) => { const m = t.replace('−', '').split(':'); return (+m[0] * 60 + +m[1]) * (t.startsWith('−') ? -1 : 1); };
check('interest-point-added-by-button', i1.length === 1 && i1[0].atGaze === true && Math.hypot(i1[0].x - crew.x, i1[0].z - crew.z) > 1 && i1[0].by === 'button' && left1.pins === 1, `point 1 at the gaze ground point, ${Math.hypot(i1[0].x - crew.x, i1[0].z - crew.z).toFixed(1)} m from the crew; pin placed in the world`);
check('remaining-time-after-interest-point', Math.abs(left1.val - (left1.stay - 180)) < 1e-6 && Math.abs(toSec(left1.shown) - (stayA - 180)) <= 2 && /곳당 \+3분 가정/.test(left1.row) && /남는 체류 시간/.test(left1.note), `stay left ${Math.floor(stayA)} s -> shown "${left1.shown}" after one point (3 min each, labelled 가정)`);
const iv = await say('관심 지점 밝은 띠가 끊기는 곳'); await wait(300); const i2 = (await recs()).filter((r) => r.type === 'interest'), left2 = await mw(() => ({ val: window.__mw.mission.stayLeftAfterInterest(), stay: window.__mw.mission.stayLeft(), n: document.querySelector('#hud-intn').textContent }));
check('interest-point-added-by-voice-fallback', iv.ok && i2.length === 2 && i2[1].text === '밝은 띠가 끊기는 곳' && i2[1].by === 'typed' && left2.n === '2' && Math.abs(left2.val - (left2.stay - 360)) < 1e-6, `"관심 지점 밝은 띠가 끊기는 곳" -> point 2 with the dictated note; remaining time now stay - 6 min`);
await wait(300); await lay('task list after interest points'); await shot('09-hud-interest-point-remaining-time', 'HUD: two added interest points (pins on the ground), remaining stay after budgeting them');

// ====================== 시료 기록: 좌표 · 시각 · 선량 자동 첨부 ======================
await lookRock(0.02, 0); await wait(250);
const sv = await say('기록 흰 맥 옆 어두운 테두리 반점'); const sA = await st(); const s1 = (await recs()).filter((r) => r.type === 'sample')[0];
check('sample-record-by-voice-with-auto-attachments', sv.ok && s1 && s1.text === '흰 맥 옆 어두운 테두리 반점' && Math.abs(s1.lonE - 77.30519089) < 1e-5 && Math.abs(s1.latN - 18.49748444) < 1e-5 && s1.simT > 0 && Math.abs(s1.simT - sA.sim) < 2 && Math.abs(s1.doseUsv - (0.67 * 1000 * s1.simT) / 86400) < 1e-9 && s1.videoT === s1.simT && s1.frame > 1000,
  { id: s1.id, text: s1.text, simT: +s1.simT.toFixed(1), lonE: +s1.lonE.toFixed(6), latN: +s1.latN.toFixed(6), doseUsv: +s1.doseUsv.toFixed(4), doseExpected: +((0.67 * 1000 * s1.simT) / 86400).toFixed(4), videoT: +s1.videoT.toFixed(1), frameBytes: s1.frame });
check('sample-record-links-planned-target', s1.target && s1.target.id === 1 && s1.target.planVersion === 1 && Math.abs(s1.target.u - tg[0].u) < 1e-9, `linked to 채취 예정 1 of plan v${s1.target.planVersion} (crew had confirmed 일치)`);
await selectItem('sample'); await b1(); const s2 = (await recs()).filter((r) => r.type === 'sample');
check('sample-record-by-button', s2.length === 2 && s2[1].by === 'button' && s2[1].doseUsv > s2[0].doseUsv && /모의/.test(await txt('#hud-lastrec')), `second sample record by button 1; card line: ${(await txt('#hud-lastrec')).replace(/\s+/g, ' ').slice(0, 110)}`);
await wait(300); await shot('10-hud-sample-record', 'HUD: sample record with automatic coordinates / time / dose (all simulated)');

// ====================== PAD receives the records ======================
await sw('pad'); await page.click('#fp-open'); await wait(300); await page.click('#fp-panel [data-tab="rec"]'); await wait(900);
const allRecs = await recs();
const padRec = await mw(() => { const rows = [...document.querySelectorAll('#fp-recs tr[data-type]')], cv = document.querySelector('#fp-map'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let amber = 0, cyan = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] === 255 && d[i + 1] === 210 && d[i + 2] === 74) amber++; if (d[i] === 79 && d[i + 1] === 208 && d[i + 2] === 255) cyan++; }
  return { n: rows.length, types: rows.map((r) => r.dataset.type), text: document.querySelector('#fp-recs').textContent, ev: [...document.querySelectorAll('#fp-ev tr[data-field]')].map((r) => [r.children[0].textContent, r.children[1].textContent.trim(), r.children[2].textContent]), note: document.querySelector('#fp-evnote').textContent, amber, cyan, rx: document.querySelector('#fp-rx').textContent }; });
check('pad-receives-field-records', padRec.n === allRecs.length && allRecs.every((r) => r.sent) && padRec.types.filter((t) => t === 'sample').length === 2 && padRec.types.filter((t) => t === 'interest').length === 2 && /흰 맥 옆 어두운 테두리 반점/.test(padRec.text) && /77\.30519°E/.test(padRec.text) && /µSv/.test(padRec.text) && /영상 시점 T\+/.test(padRec.text), `${padRec.n} records with time, coordinates, dose; ${padRec.rx}`);
check('pad-map-shows-sample-and-interest-points', padRec.amber > 60 && padRec.cyan > 30, `close-up map drew sample markers (${padRec.amber} amber px) and interest-point markers (${padRec.cyan} cyan px)`);
const fieldEv = padRec.ev.filter((r) => /^현장/.test(r[0]));
check('evidence-grades-updated-from-field-records', fieldEv.length === 6 && fieldEv.every((r) => r[1] === '육안' && /대원 응답/.test(r[2])) && padRec.ev.some((r) => r[1] === '측정') && padRec.ev.some((r) => r[1] === '미확인') && /생명 여부 판정이 아니며/.test(padRec.note) && /다음 계획|갱신된 항목 6개/.test(padRec.note) && !/생명 확인됨|생명 발견|확률/.test(padRec.text + padRec.note), `6 field items moved 미확인 -> 육안 with the crew's answer; grades 측정 / 육안 / 미확인 shown as kinds of evidence, never a verdict`);
await shot('11-pad-received-records-map', 'PAD: received records (time, coordinates, dose), close-up map with sample and interest points, evidence grades updated');
await page.click('#fp-close'); await page.click('.pad-navbtn[data-page="site"]'); await wait(700); await shot('12-pad-site-map-with-records', 'PAD ① site map: received records drawn on the existing map (ui.mapExtras hook)');
// simulated incident from the PAD: space-weather alert
await page.click('#fp-open'); await wait(200); await page.click('#fp-panel [data-tab="alert"]'); await wait(300); await page.click('#fp-wx'); await wait(600);
const w0 = (await alerts())[0];
check('weather-alert-sent-not-yet-received', w0 && w0.kind === 'weather' && w0.sentAt !== null && w0.receivedAt === null && /모의/.test(await txt('#fp-body')) && /DONKI\) 연결은 이 빌드에 없습니다/.test(await txt('#fp-body')), 'PAD button sends a simulated space-weather alert; HUD has not received it yet; panel says no real DONKI data is connected');
await page.click('#fp-close'); await sw('hud'); await lookRock(0.3, 0.1);

// ====================== alerts: 수신 / 확인 / 선택 / 실행 ======================
const seqOk = (a) => a.receivedAt !== null && a.ackAt !== null && a.choiceAt !== null && a.receivedAt <= a.ackAt && a.ackAt <= a.choiceAt;
let a = (await alerts())[0]; const wCard = await txt('#hud-card');
check('weather-alert-received-on-hud', a.receivedAt !== null && a.ackAt === null && /경고 · 우주기상 경보/.test(wCard) && /모의 사건/.test(wCard) && /확인해도 복귀가 자동으로 시작되지는 않습니다/.test(wCard) && /경고 1/.test(await txt('#hud-alerts')) && (await items()).join() === 'alert-ack', wCard.replace(/\s+/g, ' ').slice(0, 150));
await lay('alert card (received)'); await shot('13-hud-alert-received', 'HUD alert: space weather (simulated), received, waits for 확인');
await b1(); a = (await alerts())[0]; const wAck = { ackAt: a.ackAt, choice: a.choice, items: (await items()).join(), phase: (await st()).phase };
await shot('14-hud-alert-choice', 'HUD alert acknowledged: 지속 / 복귀 choice (choosing 복귀 does not start the return)');
await b1(); a = (await alerts())[0];
check('weather-alert-ack-then-continue', wAck.ackAt !== null && wAck.choice === null && wAck.items === 'alert-continue,alert-return' && a.choice === 'continue' && seqOk(a) && a.executedAt === null && (await st()).phase === 'onsite', `수신 T+${a.receivedAt.toFixed(1)} · 확인 T+${a.ackAt.toFixed(1)} · 선택 지속 T+${a.choiceAt.toFixed(1)} · 실행 —`);
// buddy: simulated incident
await mw(() => window.__mw.mission.setBuddyAway(true)); await page.waitForFunction(() => window.__mw.mission.st.alerts.some((x) => x.kind === 'buddy'), null, { timeout: 30000 }); await wait(300);
let bA = (await alerts()).find((x) => x.kind === 'buddy'); const bCard = await txt('#hud-card'), gap = await txt('#hud-buddy');
await b1(); const bCont = await say('계속'); bA = (await alerts()).find((x) => x.kind === 'buddy'); await mw(() => window.__mw.mission.setBuddyAway(false)); await wait(500);
check('buddy-alert-sequence', /주의 · 버디 이탈/.test(bCard) && /15 m/.test(bCard) && parseFloat(gap) > 15 && bCont.ok && bA.choice === 'continue' && seqOk(bA) && (await alerts()).find((x) => x.kind === 'buddy').resolvedAt !== null, `gap ${gap} > 15 m (simulated) -> 수신 T+${bA.receivedAt.toFixed(1)} · 확인 T+${bA.ackAt.toFixed(1)} · 선택 지속 by voice fallback T+${bA.choiceAt.toFixed(1)}; resolved when the buddy is back`);
// comm loss: simulated incident; the HUD raises it by itself after 10 s without the link
await mw(() => window.__mw.mission.setComm(false)); const c0 = (await st()).sim; await wait(3000); const early = (await alerts()).some((x) => x.kind === 'comm');
await page.waitForFunction(() => window.__mw.mission.st.alerts.some((x) => x.kind === 'comm'), null, { timeout: 30000 }); await wait(300);
let cA = (await alerts()).find((x) => x.kind === 'comm'); const cCard = await txt('#hud-card'), commTxt = await txt('#hud-comm');
await shot('15-hud-alert-comm-loss', 'HUD alert: comm loss raised by the HUD itself after 10 s (simulated), last-received time shown');
await b1(); const cRet = await say('복귀'); cA = (await alerts()).find((x) => x.kind === 'comm'); const afterChoice = { phase: (await st()).phase, sel: await sel(), started: await mw(() => window.__mw.mission.st.returnStartedAt) };
check('comm-loss-alert-sequence', !early && cA.raisedAt - c0 >= 9.8 && cA.raisedAt - c0 < 13 && /주의 · 교신 두절/.test(cCard) && /교신 끊김/.test(commTxt) && cRet.ok && cA.choice === 'return' && seqOk(cA) && cA.executedAt === null, `raised ${(cA.raisedAt - c0).toFixed(1)} sim s after the link dropped (threshold 10 s) -> 확인 -> 선택 복귀 by voice fallback; 실행 still empty`);
check('choosing-return-does-not-start-return', afterChoice.phase === 'onsite' && afterChoice.started === null && afterChoice.sel === 'return', 'after choosing 복귀 the crew is still on site; 복귀 개시 is highlighted and waits for button 1');
await mw(() => window.__mw.mission.setComm(true)); await wait(400);
// stay: "10분 전 경보" (design number)
const jump1 = await mw(() => { const m = window.__mw.mission, d = m.stayLeft() - 603; m.debugAdvance(d); return d; }); await wait(600); const before10 = (await alerts()).some((x) => x.kind === 'stay10');
await page.waitForFunction(() => window.__mw.mission.st.alerts.some((x) => x.kind === 'stay10'), null, { timeout: 15000 }); await wait(250);
let sA10 = (await alerts()).find((x) => x.kind === 'stay10'); const sCard = await txt('#hud-card'), stayAt = await mw(() => window.__mw.mission.stayLeft());
await lay('alert card (10 min)'); await shot('16-hud-alert-stay-10min', 'HUD alert: 10 minutes of planned stay left (design number), asks whether to continue');
await b1(); await b1(); sA10 = (await alerts()).find((x) => x.kind === 'stay10');
check('stay-10min-warning', jump1 > 0 && !before10 && stayAt <= 600 && stayAt > 594 && /주의 · 잔여 체류 10분/.test(sCard) && /설계 수치/.test(sCard) && sA10.choice === 'continue' && seqOk(sA10), `TEST HOOK moved the sim clock ${jump1.toFixed(0)} s; alert raised with ${stayAt.toFixed(1)} s of stay left (threshold 600 s, labelled 설계 수치); 확인 -> 지속`);
// turnaround
await mw(() => { const m = window.__mw.mission; m.debugAdvance(m.turnaroundLeft() - 123); }); await wait(500); const beforeT = (await alerts()).some((x) => x.kind === 'turnaround');
await page.waitForFunction(() => window.__mw.mission.st.alerts.some((x) => x.kind === 'turnaround'), null, { timeout: 15000 }); await wait(250);
let tA = (await alerts()).find((x) => x.kind === 'turnaround'); const tCard = await txt('#hud-card'), tLeft = await mw(() => window.__mw.mission.turnaroundLeft());
await b1(); await b2(); const tSel = await sel(); await b1(); tA = (await alerts()).find((x) => x.kind === 'turnaround'); await wait(200);
check('turnaround-alert-sequence', !beforeT && tLeft <= 120 && tLeft > 114 && /주의 · 돌아설 시각 임박/.test(tCard) && /T\+25:00/.test(tCard) && tSel === 'alert-return' && tA.choice === 'return' && seqOk(tA) && tA.executedAt === null && (await st()).phase === 'onsite' && (await sel()) === 'return', `raised with ${tLeft.toFixed(1)} s to the T+25:00 deadline (lead 120 s) -> 확인 -> 선택 복귀 (button 2, button 1); return not started`);
// 실행: the crew starts the return
await b1(); await wait(400); const ret = await st(), fin = await alerts(), ex2 = fin.filter((x) => x.choice === 'return');
check('return-executed-separately', ret.phase === 'returning' && ex2.length === 2 && ex2.every((x) => x.executedAt !== null && x.executedAt >= x.choiceAt) && fin.filter((x) => x.choice === 'continue').every((x) => x.executedAt === null), `button 1 on 복귀 개시 -> returning; 실행 time written on the two alerts where 복귀 was chosen (${ex2.map((x) => x.kind).join(', ')}), not on the ones where 지속 was chosen`);
results.info.alerts = fin.map((x) => ({ kind: x.kind, sentAt: x.sentAt, receivedAt: x.receivedAt, ackAt: x.ackAt, choice: x.choice, choiceAt: x.choiceAt, executedAt: x.executedAt }));
check('four-alert-kinds-plus-stay', ['weather', 'buddy', 'comm', 'turnaround', 'stay10'].every((k) => fin.some((x) => x.kind === k)), fin.map((x) => `${x.kind}:${x.choice}`).join(' · '));

// ====================== back to base, mission end, with the same inputs ======================
await mw(() => { const m = window.__mw; m.look.yaw = m.mission.poseAt(m.mission.st.s).yaw; m.look.pitch = -0.1; });
await walk(() => window.__mw.mission.st.phase === 'atBase', true); await b1(); await wait(400);
const endSt = await st();
results.info.inputsUsed = [...used];
check('core-flow-with-two-buttons-and-voice-only', endSt.phase === 'ended' && [...used].every((u) => /^(button 1|button 2|voice|move)/.test(u)), `package ack -> board rover -> arrive -> 현장 대조 -> 관찰 대조 -> 관심 지점 -> 시료 기록 -> alerts -> return -> mission end used only: ${[...used].join(', ')}. (W/Shift are body movement, not HUD input; no wheel, [ ], M, E or mouse click.)`);

// PAD: alert table after the mission
await sw('pad'); await page.click('#fp-open'); await wait(300); await page.click('#fp-panel [data-tab="alert"]'); await wait(700);
const at = await mw(() => [...document.querySelectorAll('#fp-alerts tr[data-kind]')].map((r) => [...r.children].map((c) => c.textContent)));
check('pad-alert-states-distinct', at.length === 5 && at.every((r) => /T\+/.test(r[4]) && /T\+/.test(r[5]) && /(지속|복귀) T\+/.test(r[6])) && at.filter((r) => /T\+/.test(r[7])).length === 2, at.map((r) => `${r[1]}: 수신 ${r[4]} 확인 ${r[5]} 선택 ${r[6]} 실행 ${r[7]}`).join(' | '));
await shot('17-pad-alert-states', 'PAD: simulated-incident buttons and the 수신 / 확인 / 선택 / 실행 state of each alert');

// ====================== layout: no overlapping HUD panels at 1600x900 ======================
results.info.layout1600 = layout;
check('hud-panels-do-not-overlap-1600x900', layout.every((l) => l.hit.length === 0 && l.offscreen.length === 0) && layout.length >= 9, layout.map((l) => `${l.label}: ${l.n} panels, ${l.hit.length ? 'OVERLAP ' + l.hit.join('; ') : 'ok'}${l.offscreen.length ? ' OFFSCREEN ' + l.offscreen.join() : ''}`).join(' | '));
check('hud-cards-not-clipped-1600x900', layout.every((l) => l.clipped.length === 0), layout.filter((l) => l.clipped.length).map((l) => `${l.label}: ${l.clipped.join()}`).join(' | ') || 'no card content is cut off');
await page.close();

// ====================== second page at 1280x720: same layout states + early-return card ======================
page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); watch(page);
await page.goto(URL); await page.waitForFunction(() => window.__mw && window.__mw.ready, null, { timeout: 120000 });
await mw(async () => { const m = window.__mw; await m.fieldPad.ready; const d = m.fieldPad.extract(2); m.mission.sendPackage({ lines: d.polylines, hash: d.hash, detail: 2, targets: [{ u: 0.42, v: 0.52 }] }); }); // setup shortcut (the click path is covered above)
await enterHud(page); await wait(500);
const L2 = []; const lay2 = async (label) => { const o = await overlaps(label); L2.push(o); return o; };
await lay2('package card'); await b1();
await mw(() => window.__mw.mission.debugSetS(120)); await wait(400); await lay2('walking outdoors');
await page.keyboard.press('Digit1'); await wait(500); await lay2('walking, minimap on'); await page.keyboard.press('Digit1'); await wait(200);
// early return on an alert while outbound: choose 복귀, then hold
await mw(() => window.__mw.mission.sendWeatherAlert()); await wait(500); await lay2('alert card (received)'); await b1(); await lay2('alert card (choice)'); await b2(); await b1(); await wait(300);
const er = { items: (await items()).join(), card: await txt('#hud-card'), phase: (await st()).phase }; await lay2('return-chosen card');
await b2(); await b1(); await wait(300); const er2 = await alerts();
check('outbound-alert-return-choice-then-hold', er.items === 'return,hold' && /복귀 선택됨/.test(er.card) && er.phase === 'outbound' && er2[0].choice === 'return' && er2[0].held === true && er2[0].executedAt === null && (await st()).phase === 'outbound' && !(await page.isVisible('#hud-card')), 'on the way out: 확인 -> 선택 복귀 -> card offers 복귀 개시 / 보류 -> crew holds; nothing started');
await mw(() => { const m = window.__mw.mission; m.debugSetS(m.st.route.length); }); await wait(400); await lay2('arrival card'); await b1(); await wait(300);
const ret1 = await mw(() => window.__mw.hud.button(1)); await wait(150); // first item (촬영 마킹) so the list shows a last-record line
// (fix) tail of the existing button(1): it returns true, and a base-instruction ack on site moves the highlight to 복귀 개시
await mw(() => window.__mw.mission.sendRemote()); await wait(500); const rmItems = (await items()).join(); await b1(); await wait(300);
const rmFix = { sel: await sel(), phase: (await st()).phase, remote: await mw(() => ({ ...window.__mw.mission.st.remote })) };
check('fix-button1-tail-runs', ret1 === true && rmItems === 'ack' && rmFix.sel === 'return' && rmFix.phase === 'onsite' && rmFix.remote.ackAt !== null && rmFix.remote.executedAt === null, `hud.button(1) returned ${ret1}; after acknowledging a base instruction on site the highlight is on "${rmFix.sel}" and nothing was started`);
await mw(() => { window.__mw.hud.ui.sel = 0; window.__mw.hud.invalidate(); });
await lookRock(0.3, 0.1); await wait(300); await lay2('onsite task list');
await page.keyboard.press('KeyM'); await wait(500); await lay2('onsite task list + minimap'); await page.keyboard.press('KeyM'); await wait(200);
await mw(() => window.__mw.fx.command('대조')); await wait(400); await lay2('compare card, misaligned'); await lookRock(0.01, 0); await wait(300); await mw(() => window.__mw.fx.command('일치')); await wait(400); await lay2('compare card, matched');
await shot('18-hud-compare-1280x720', '1280x720: compare card after match, panels do not overlap');
await page.keyboard.down('KeyV'); await wait(150); await page.keyboard.up('KeyV'); await wait(300); await lay2('voice bar open'); await shot('19-hud-voice-fallback-1280x720', '1280x720: push-to-talk bar with the labelled typed fallback'); await page.keyboard.type('관심 지점'); await page.keyboard.press('Enter'); await wait(400); await lay2('interest point row');
await mw(() => window.__mw.fx.command('관찰')); await wait(600); const b720 = await lay2('관찰 대조 board'); const bb2 = await page.locator('#hud-board').boundingBox();
const fitIn = await mw(() => { const b = document.querySelector('#hud-board').getBoundingClientRect(); return [...document.querySelectorAll('#hud-board *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > b.right + 1 || r.bottom > b.bottom + 1 || r.left < b.left - 1); }).map((e) => e.id || e.className).slice(0, 5); });
await shot('20-hud-observation-board-1280x720', '1280x720: 관찰 대조 board');
check('board-fits-1280x720', bb2.y > 0 && bb2.y + bb2.height < 720 * 0.9 && fitIn.length === 0, `board spans y ${bb2.y.toFixed(0)}..${(bb2.y + bb2.height).toFixed(0)} of 720; children outside the board: ${JSON.stringify(fitIn)}`);
results.info.layout1280 = L2;
check('hud-panels-do-not-overlap-1280x720', L2.every((l) => l.hit.length === 0 && l.offscreen.length === 0) && L2.length >= 12, L2.map((l) => `${l.label}: ${l.n} panels, ${l.hit.length ? 'OVERLAP ' + l.hit.join('; ') : 'ok'}${l.offscreen.length ? ' OFFSCREEN ' + l.offscreen.join() : ''}`).join(' | '));
check('hud-cards-not-clipped-1280x720', L2.every((l) => l.clipped.length === 0), L2.filter((l) => l.clipped.length).map((l) => `${l.label}: ${l.clipped.join()}`).join(' | ') || 'no card content is cut off');

results.finishedAt = new Date().toISOString(); results.summary = { pass: results.checks.filter((c) => c.pass).length, fail: results.checks.filter((c) => !c.pass).length };
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
console.log('\nsummary', JSON.stringify(results.summary), '| console issues', results.console.length, '| failed requests', results.failedRequests.length);
await browser.close(); process.exit(results.summary.fail ? 1 : 0);
