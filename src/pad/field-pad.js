import './field-pad.css';
import { assetUrl } from '../util/asset-url.js';
import { fmtT } from '../state/mission.js';
import { PLAN_IMAGE as REFERENCE, ANSWERS, ALERT_KINDS } from '../state/field-ops.js';
import { extractLines, DETAIL } from '../util/lines.js';
import { TYPE } from '../hud/field-hud.js';

/**
 * v0.2 PAD panel, self-contained: opened from one button added to the PAD top bar; the existing PAD pages and
 * navigation are not changed (src/pad/pad.js only gets the `ui.mapExtras` hook for record markers on the site map).
 *
 *  1 POV match package: the planner opens the destination reference photo (PIA26368), the browser traces its brightness edges
 *    into a line drawing (deterministic, see src/util/lines.js), the planner clicks the intended sampling point(s),
 *    and the package goes to the HUD. Drafted / Sent / HUD received / Acknowledged are shown separately.
 *  2 Field records: records received from the HUD on a close-up map + evidence level update (kind of evidence, never a verdict).
 *  3 Alerts: simulated incidents for the demo and the received / acknowledged / chosen / executed state of each alert.
 */
const MAX_LINES = 32; const CW = 660, CH = Math.round(CW * 1118 / 2048), SW = 1024, SH = Math.round(SW * 1118 / 2048), MAP = 470, HALF = 14; // planning image = measured mesh texture (2048x1118), traced at 1024 px wide
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const esc = (t) => String(t).replace(/[<>&"]/g, '');
// evidence level -> tag colour; accepts the English levels and the earlier Korean ones (\uBBF8\uD655\uC778 = unverified, \uC721\uC548 = visual)
const gradeTag = (g) => { const k = String(g).toLowerCase(); return k === 'unverified' || k === '\uBBF8\uD655\uC778' ? 'unk' : k === 'visual' || k === '\uC721\uC548' ? 'sim' : 'ok'; };

export function installFieldPad(pad, mission, terrain, opt = {}) {
  const st = mission.st, root = pad.root;
  const open = h('<button class="fp-open" id="fp-open">POV match · records · alerts <small>v0.2</small></button>'); root.querySelector('.pad-top').insertBefore(open, root.querySelector('#pad-status'));
  const panel = h(`<div class="fp hidden" id="fp-panel"><div class="fp-tabs"><button data-tab="pkg">① Build POV match package</button><button data-tab="rec">② Field records · evidence level</button><button data-tab="alert">③ Alerts · simulated events</button><span class="fp-sp"></span><button id="fp-close">Close</button></div><div class="fp-body" id="fp-body"></div></div>`); root.appendChild(panel);
  const body = panel.querySelector('#fp-body'), $ = (s) => panel.querySelector(s);
  const ui = { tab: 'pkg', detail: 2, showPhoto: true, showLines: true, draft: null, targets: opt.defaultTarget ? [{ ...opt.defaultTarget, preset: 'B' }] : [], ms: 0, img: null, runs: 0 };
  const setOpen = (v) => { panel.classList.toggle('hidden', !v); if (v) show(ui.tab); };
  open.addEventListener('click', () => setOpen(panel.classList.contains('hidden'))); $('#fp-close').addEventListener('click', () => setOpen(false));
  panel.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));

  // ---------- 1. line extraction + target ----------
  const src = document.createElement('canvas'); src.width = SW; src.height = SH;
  let readyP = null; // lazy: the 0.5 MB planning image loads when the panel, the plan send or a check first needs it
  const load = () => readyP || (readyP = new Promise((res, rej) => { const im = new Image(); im.onload = () => { src.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0, SW, SH); ui.img = im; res(); }; im.onerror = rej; im.src = REFERENCE.file; }));
  function extract(detail = ui.detail) { const t0 = performance.now(), d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, SW, SH); ui.detail = detail; const all = extractLines(d, { detail }), R = opt.region;
    // keep only the most salient lines on the rock itself: mostly inside the rock's image box, longest first (extractLines sorts by length), at most 32
    const inside = (l) => { let k = 0; for (let i = 0; i < l.length; i += 2) if (l[i] >= R.u0 && l[i] <= R.u1 && l[i + 1] >= R.v0 && l[i + 1] <= R.v1) k++; return k / (l.length / 2) >= 0.7; };
    const kept = (R ? all.polylines.filter(inside) : all.polylines).slice(0, MAX_LINES); let hsh = 0x811c9dc5; const str = kept.map((p) => p.join(',')).join(';'); for (let i = 0; i < str.length; i++) { hsh ^= str.charCodeAt(i); hsh = Math.imul(hsh, 0x01000193); }
    ui.draft = { ...all, polylines: kept, count: kept.length, points: kept.reduce((a2, p) => a2 + p.length / 2, 0), hash: (hsh >>> 0).toString(16).padStart(8, '0'), tracedAll: all.count }; ui.ms = performance.now() - t0; ui.runs++; return ui.draft; }
  function drawPkg() {
    const cv = $('#fp-cv'); if (!cv) return; const g = cv.getContext('2d'); g.fillStyle = '#05080a'; g.fillRect(0, 0, CW, CH);
    if (ui.showPhoto && ui.img) { g.globalAlpha = ui.showLines ? 0.62 : 1; g.drawImage(ui.img, 0, 0, CW, CH); g.globalAlpha = 1; }
    if (ui.showLines && ui.draft) { g.lineWidth = 2.4; g.strokeStyle = ui.showPhoto ? '#7dffb0' : '#c9ffd9'; g.lineJoin = 'round'; for (const l of ui.draft.polylines) { g.beginPath(); for (let i = 0; i < l.length; i += 2) { if (i) g.lineTo(l[i] * CW, l[i + 1] * CH); else g.moveTo(l[i] * CW, l[i + 1] * CH); } g.stroke(); } }
    ui.targets.forEach((t, i) => { const x = t.u * CW, y = t.v * CH; g.strokeStyle = '#000'; g.lineWidth = 5; g.beginPath(); g.arc(x, y, 13, 0, 6.2832); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 13, 0, 6.2832); g.moveTo(x - 22, y); g.lineTo(x - 6, y); g.moveTo(x + 6, y); g.lineTo(x + 22, y); g.moveTo(x, y - 22); g.lineTo(x, y - 6); g.moveTo(x, y + 6); g.lineTo(x, y + 22); g.stroke(); g.font = '600 14px system-ui, sans-serif'; g.fillStyle = '#000'; g.fillText(`Sample point ${i + 1}`, x + 19, y - 11); g.fillStyle = '#fff'; g.fillText(`Sample point ${i + 1}`, x + 18, y - 12); });
  }
  const f = (v) => (v === null || v === undefined ? '—' : 'T+' + fmtT(v));
  function pkgState() {
    const p = st.pkg, e = $('#fp-state'); if (!e) return;
    const dirty = p && ui.draft && (p.lineHash !== ui.draft.hash || JSON.stringify(p.targets.map((t) => [t.u, t.v])) !== JSON.stringify(ui.targets.map((t) => [t.u, t.v])));
    e.innerHTML = `<span class="st ${ui.draft && ui.targets.length ? 'on' : ''}">Drafted ${ui.draft ? `${ui.draft.count} lines · ${ui.targets.length} targets` : '—'}</span><span class="st ${p ? 'on' : ''}" id="fp-st-sent">Sent ${p ? f(p.sentAt) : '—'}</span><span class="st ${p && p.receivedAt !== null ? 'on' : ''}" id="fp-st-rx">HUD received ${p ? f(p.receivedAt) : '—'}</span><span class="st ${p && p.ackAt !== null ? 'on' : ''}" id="fp-st-ack">Acknowledged ${p ? f(p.ackAt) : '—'}</span>${dirty ? '<span class="st warn">Changed after sending · send again</span>' : ''}`;
    const b = $('#fp-send'); b.disabled = !(ui.draft && ui.targets.length && st.destKey === REFERENCE.key); b.textContent = ui.targets.length && ui.targets[0].preset ? 'Send POV match package to HUD · default B (estimated)' : 'Send POV match package to HUD'; $('#fp-info').textContent = ui.draft ? `${ui.draft.count} lines in the rock area` : 'Not traced yet'; $('#fp-tech').textContent = ui.draft ? `${ui.draft.count} long lines of ${ui.draft.tracedAll} traced · ${ui.draft.points} vertices · hash ${ui.draft.hash} · ${ui.ms.toFixed(0)} ms · detail "${DETAIL[ui.detail].label}"${p ? ` · package r${p.rev} · plan v${p.planVersion}` : ''}` : '';
    $('#fp-tlist').innerHTML = ui.targets.length ? ui.targets.map((t, i) => `<li>Sample point ${i + 1} · image position (${(t.u * 100).toFixed(1)}%, ${(t.v * 100).toFixed(1)}%)${t.preset ? ' · default: B core sample area (estimated from raw metadata)' : ''}</li>`).join('') : '<li class="dim">Click the photo to mark sample points (up to 3)</li>';
  }
  const pages = {
    pkg() {
      const okDest = st.destKey === REFERENCE.key;
      body.innerHTML = `<div class="fp-cols"><div><canvas id="fp-cv" width="${CW}" height="${CH}"></canvas>
          <div class="fp-credit">Planning image: ${REFERENCE.source} · credit ${REFERENCE.credit} (PDS Imaging Node) · measured mesh texture cropped to the workspace, reduced to 2048 px · lines traced here and projected back through the mesh texture coordinates</div></div>
        <div class="fp-side">
          <section class="pad-card tight"><h3>Trace lines from the planning image <small>brightness edges · not recognition or analysis</small></h3>
            <div class="fp-row" id="fp-detail">${Object.entries(DETAIL).map(([k, v]) => `<button class="pad-pick" data-detail="${k}" style="margin:0">${v.label}</button>`).join('')}</div>
            <div class="fp-row"><label class="pad-check"><input type="checkbox" id="fp-photo" ${ui.showPhoto ? 'checked' : ''}/> Photo</label><label class="pad-check"><input type="checkbox" id="fp-lines" ${ui.showLines ? 'checked' : ''}/> Lines</label></div>
            <span id="fp-info" style="font-size:13px;color:#cfd6dc"></span><details class="fp-tech"><summary>Trace details (for review)</summary><span id="fp-tech"></span></details></section>
          <section class="pad-card tight"><h3>Sample points <small>marked on the photo by the planner</small></h3><ul class="fp-tlist" id="fp-tlist"></ul><button class="pad-pick" id="fp-clear" style="margin:6px 0 0">Clear points</button></section>
          <section class="pad-card tight"><h3>POV match package <small>lines · points · source · plan version</small></h3>
            <div class="fp-state" id="fp-state"></div>
            <button class="pad-primary" id="fp-send" style="margin-top:8px">Send POV match package to HUD</button>
            <p class="pad-note">${okDest ? 'Sending only shows a card on the HUD. Lines appear on the visor after the astronaut acknowledges it. The field terrain is the same-day front Hazcam measured mesh (single view · reduced); sample points A/B are estimated from raw metadata. The astronaut says whether it matches (no automatic recognition).' : 'No point-of-view image was collected for this destination. The POV match package is only available at the Cheyava Falls sample site.'}</p></section></div></div>`;
      const cv = $('#fp-cv'); cv.addEventListener('click', (ev) => { if (ui.targets.length && ui.targets[0].preset) ui.targets = []; /* the first click replaces the default B estimate */ if (ui.targets.length >= 3) return; const u = ev.offsetX / cv.clientWidth, v = ev.offsetY / cv.clientHeight; if (u < 0 || u > 1 || v < 0 || v > 1) return; ui.targets.push({ u: Math.round(u * 10000) / 10000, v: Math.round(v * 10000) / 10000 }); drawPkg(); pkgState(); });
      $('#fp-detail').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { extract(+b.dataset.detail); mark(); drawPkg(); pkgState(); }));
      const mark = () => $('#fp-detail').querySelectorAll('button').forEach((b) => { b.disabled = +b.dataset.detail === ui.detail; });
      $('#fp-photo').addEventListener('change', (e) => { ui.showPhoto = e.target.checked; drawPkg(); }); $('#fp-lines').addEventListener('change', (e) => { ui.showLines = e.target.checked; drawPkg(); });
      $('#fp-clear').addEventListener('click', () => { ui.targets = []; drawPkg(); pkgState(); });
      $('#fp-send').addEventListener('click', () => { mission.sendPackage({ lines: ui.draft.polylines, hash: ui.draft.hash, detail: ui.detail, targets: ui.targets }); pkgState(); });
      load().then(() => { if (!ui.draft) extract(); mark(); drawPkg(); pkgState(); });
    },
    rec() {
      body.innerHTML = `<div class="fp-cols"><div><canvas id="fp-map" width="${MAP}" height="${MAP}"></canvas><div class="fp-credit">${HALF * 2} m around the destination · HiRISE 25 cm orthoimage · record positions are simulated positions on map coordinates · rock marker is point B on the measured mesh (estimated)</div></div>
        <div class="fp-side"><section class="pad-card tight"><h3>Field records received <span class="pad-tag sim">simulated mission clock</span> <small id="fp-rx"></small> <button class="pad-pick" id="fp-export" style="margin:0 0 0 8px" title="Save inputs, plan, send states, astronaut answers, received records and follow-up tasks as one JSON">Export Marswalk record</button> <small id="fp-export-note"></small></h3><div class="fp-scroll"><table class="pad-table" id="fp-recs"></table></div></section>
          <section class="pad-card tight"><h3>Evidence level update <small>input for the next plan · level = kind of evidence</small></h3><div class="fp-scroll"><table class="pad-table" id="fp-ev"></table></div><p class="pad-note" id="fp-evnote"></p></section>
          <section class="pad-card tight"><h3>Follow-up tasks <span class="pad-tag sim">team proposal (demo of a proposal not yet adopted)</span> <small id="fp-fu-n"></small></h3><div class="fp-scroll" style="max-height:120px"><table class="pad-table" id="fp-fu"></table></div>
            <div class="fp-row" style="margin:6px 0 0"><button class="pad-pick" id="fp-next" style="margin:0">Carry over to the next Marswalk plan (simulated restart)</button><span class="dim" id="fp-carried" style="font-size:12px"></span></div></section></div></div>`;
      $('#fp-export').addEventListener('click', async () => { const tr = await exportTrace(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(tr, null, 1)], { type: 'application/json' })); a.download = `areographic-trace-eva${tr.eva}-plan-v${tr.plan.planVersion}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); $('#fp-export-note').textContent = `Saved · ${tr.records.length} records · ${tr.inputs.length} inputs`; });
      $('#fp-next').addEventListener('click', () => { if (mission.beginNextEva()) recLive(true); });
      $('#fp-fu').addEventListener('change', (ev) => { const k = ev.target.dataset.fu; if (k) { mission.markFollowUp(k, ev.target.checked); recLive(true); } });
      recLive(true);
    },
    alert() {
      body.innerHTML = `<div class="fp-cols"><div class="fp-side" style="width:430px;flex:none"><section class="pad-card tight"><h3>Simulated events <small>for the demo · not a real observation</small></h3>
          <div class="fp-col"><button class="pad-pick" id="fp-wx" style="margin:0">Send space weather alert to HUD (simulated)</button><button class="pad-pick" id="fp-buddy" style="margin:0"></button><button class="pad-pick" id="fp-comm" style="margin:0"></button></div>
          <p class="pad-note">The HUD raises the turnaround-time and 10-minute stay-time-left alerts itself from the simulated mission clock. "10 minutes" is a team design value, not a NASA standard. This build has no real space weather data (DONKI) connection.</p></section></div>
        <div class="fp-side"><section class="pad-card tight"><h3>Alert status <small>received · acknowledged · chosen · executed are separate times</small></h3><div class="fp-scroll" style="max-height:470px"><table class="pad-table" id="fp-alerts"></table></div>
          <p class="pad-note">Choosing "return" does not start the return. "Executed" records when the astronaut pressed Start return. HUD changes during a comm loss show here at once; in a real system the habitat would only learn of them after the link returns (this demo does not simulate that delay).</p></section></div></div>`;
      $('#fp-wx').addEventListener('click', () => { mission.sendWeatherAlert(); alertLive(); }); $('#fp-buddy').addEventListener('click', () => { mission.setBuddyAway(!st.buddyAway); alertLive(); }); $('#fp-comm').addEventListener('click', () => { mission.setComm(!st.comm.up); alertLive(); });
      alertLive();
    },
  };
  function drawRecMap() {
    const cv = $('#fp-map'); if (!cv) return; const g = cv.getContext('2d'), e = mission.poseAt(st.route.length), B = terrain.bounds, img = terrain.nearImg, w = img.width, k = MAP / (2 * HALF);
    const M = (x, z) => [(x - e.x + HALF) * k, (z - e.z + HALF) * k], u = (x) => ((x - B.x0) / (B.x1 - B.x0)) * w, v = (z) => ((z - B.z0) / (B.z1 - B.z0)) * w;
    g.fillStyle = '#0b0d10'; g.fillRect(0, 0, MAP, MAP); g.imageSmoothingQuality = 'high'; g.drawImage(img, u(e.x - HALF), v(e.z - HALF), u(e.x + HALF) - u(e.x - HALF), v(e.z + HALF) - v(e.z - HALF), 0, 0, MAP, MAP);
    g.lineWidth = 2.5; g.strokeStyle = '#ffb84a'; g.beginPath(); let on = false; for (const p of st.route.pts) { const [mx, my] = M(p.x, p.z); if (mx < -50 || mx > MAP + 50 || my < -50 || my > MAP + 50) { on = false; continue; } if (on) g.lineTo(mx, my); else { g.moveTo(mx, my); on = true; } } g.stroke();
    const lab = (t, x, y) => { g.font = '600 13px system-ui, sans-serif'; g.fillStyle = '#000'; g.fillText(t, x + 1, y + 1); g.fillStyle = '#f1ece0'; g.fillText(t, x, y); };
    { const [mx, my] = M(e.x, e.z); g.strokeStyle = '#ffb84a'; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, 9, 0, 6.2832); g.stroke(); lab('Rover stop 56_0 (real)', mx - 60, my + 44); }
    if (st.destKey === REFERENCE.key && opt.points) { const b = opt.points.B.meta.snapped_vertex_ned_m, [mx, my] = M(e.x + b[1], e.z - b[0]); g.fillStyle = '#e8e2d4'; g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.rect(mx - 7, my - 5, 14, 10); g.fill(); g.stroke(); lab('Cheyava Falls (measured mesh)', mx - 150, my + 4); }
    markers(g, M, true);
    g.fillStyle = '#f1ece0'; g.fillRect(14, MAP - 18, 5 * k, 3); g.font = '12px system-ui, sans-serif'; g.fillText('5 m', 14, MAP - 24); g.fillText('N ↑', MAP - 40, 22);
  }
  /** Record markers shared by the close-up map and (through ui.mapExtras) the existing ① site map. Only records the base has received. */
  function markers(g, M, labels) {
    let nS = 0; const placed = []; for (const r of st.records) { if (!r.sent || r.x === undefined || !['sample', 'interest', 'photo', 'compare'].includes(r.type)) continue; let [mx, my] = M(r.x, r.z);
      if (r.type === 'sample') { mx += 9 * nS; nS++; g.fillStyle = '#ffd24a'; g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(mx, my - 8); g.lineTo(mx + 7, my); g.lineTo(mx, my + 8); g.lineTo(mx - 7, my); g.closePath(); g.fill(); g.stroke(); }
      else if (r.type === 'interest') { g.fillStyle = '#4fd0ff'; g.strokeStyle = '#04222e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(mx, my - 8); g.lineTo(mx + 7.5, my + 6); g.lineTo(mx - 7.5, my + 6); g.closePath(); g.fill(); g.stroke(); }
      else { g.fillStyle = '#fff'; g.beginPath(); g.arc(mx, my, 2.5, 0, 6.2832); g.fill(); continue; }
      if (labels) { g.font = '600 12px system-ui, sans-serif'; const t = `#${r.id} ${r.type === 'sample' ? 'Sample' : 'POI'} T+${fmtT(r.simT)}`; let lx = r.type === 'interest' ? mx - 122 : mx + 12, ly = my - 12; while (placed.some((q) => Math.abs(q[0] - lx) < 110 && Math.abs(q[1] - ly) < 14)) ly -= 14; placed.push([lx, ly]); // co-located records: stack the labels upward
        g.fillStyle = '#000'; g.fillText(t, lx + 1, ly + 1); g.fillStyle = '#fff'; g.fillText(t, lx, ly); } }
  }
  pad.ui.mapExtras = (g, toMap) => markers(g, toMap, false);
  function recLive(force) {
    const tb = $('#fp-recs'); if (!tb) return; const rx = st.records.filter((r) => r.sent), sig = rx.length + '/' + st.records.length + '/' + st.comm.up + '/' + st.phase + '/' + st.evaNo + '/' + Object.keys(st.followMarks).length; if (!force && tb.dataset.sig === sig) return; tb.dataset.sig = sig;
    $('#fp-rx').textContent = `${st.comm.up ? 'Comm link OK' : 'Comm loss'} · last received T+${fmtT(st.comm.lastRx)} · received ${rx.length} / created in field ${st.comm.up ? st.records.length : '?'}`;
    tb.innerHTML = '<tr><th>#</th><th>Time</th><th>Type</th><th>Coordinates (simulated position)</th><th>Dose (simulated)</th><th>Content</th></tr>' + (rx.length ? [...rx].reverse().map((r) => `<tr data-type="${r.type}"><td>${r.id}</td><td>T+${fmtT(r.simT)}</td><td>${TYPE[r.type] || r.type}</td><td>${r.lonE.toFixed(5)}°E ${r.latN.toFixed(5)}°N</td><td>${r.doseUsv.toFixed(2)} µSv</td><td>${esc(r.text) || '—'}${r.type === 'sample' ? ` <small>video time T+${fmtT(r.videoT)}${r.target ? ` · sample point ${r.target.id} (plan v${r.target.planVersion})` : ' · not linked to a planned point'}</small>` : ''}${r.input ? ` <small>(${r.input})</small>` : ''}</td></tr>`).join('') : '<tr><td colspan="6" class="dim">No records received</td></tr>');
    const ev = mission.evidence(); $('#fp-ev').innerHTML = '<tr><th>Item</th><th>Evidence level</th><th>Basis</th></tr>' + ev.rows.map((r) => `<tr data-field="${r.field ? 1 : 0}"><td>${r.feature}</td><td><span class="pad-tag ${gradeTag(r.grade)}" style="margin:0">${r.grade}</span></td><td>${r.basis}</td></tr>`).join('');
    $('#fp-evnote').textContent = `Items updated by this Marswalk: ${ev.updated} · sample records ${ev.samples} (not analysed) · points of interest ${ev.interests} · POV match ${ev.compare === 'match' ? 'astronaut confirmed Match' : ev.compare === 'mismatch' ? 'astronaut reported No match' : 'none'}. Levels (observed from orbit · measured by rover instruments · visual by the astronaut · unverified) only state the kind of evidence. This is not a biosignature verdict, and "unverified" does not mean absent. Saved only within this browser session.`;
    const fu = mission.followUps(), nm = fu.filter((x) => x.marked).length; $('#fp-fu-n').textContent = `${fu.length} tasks · ${nm} to check on the next Marswalk`;
    $('#fp-fu').innerHTML = '<tr><th>Check next Marswalk</th><th>Kind</th><th>Content</th><th>Source record · time · coordinates (simulated position)</th></tr>' + (fu.length ? fu.map((x) => `<tr data-fu-kind="${x.kind}"><td><input type="checkbox" data-fu="${x.key}" ${x.marked ? 'checked' : ''}/></td><td>${x.kind}</td><td>${esc(x.title)} <small>${x.note}</small></td><td>#${x.recId} · T+${fmtT(x.simT)} · ${x.lonE.toFixed(5)}°E ${x.latN.toFixed(5)}°N</td></tr>`).join('') : '<tr><td colspan="4" class="dim">No tasks · Not seen / Can\'t tell answers, No match reports, points of interest and sample records collect here</td></tr>');
    $('#fp-next').disabled = st.phase !== 'ended'; $('#fp-carried').textContent = `EVA ${st.evaNo}` + (st.carried.length ? ` · ${st.carried.length} carry-over tasks from the last Marswalk (in the HUD task list · ${st.carried.filter((c) => c.doneAt !== null).length} checked)` : st.phase === 'ended' ? ' · Marswalk ended: marked items can move to the next plan' : ' · carry-over is possible after End Marswalk') + ' · no automatic research, scoring or verdict';
    drawRecMap();
  }
  function alertLive() {
    const tb = $('#fp-alerts'); if (!tb) return;
    $('#fp-buddy').textContent = st.buddyAway ? 'End partner separation (simulated)' : 'Start partner separation (simulated)'; $('#fp-comm').textContent = st.comm.up ? 'Start comm loss (simulated)' : 'Restore comm link (simulated)';
    tb.innerHTML = '<tr><th>#</th><th>Alert</th><th>Source</th><th>Raised/sent</th><th>HUD received</th><th>Acknowledged</th><th>Choice</th><th>Executed (Start return)</th></tr>' + (st.alerts.length ? st.alerts.map((a) => `<tr data-kind="${a.kind}"><td>${a.id}</td><td>${ALERT_KINDS[a.kind].title}</td><td>${a.source}</td><td>${f(a.sentAt ?? a.raisedAt)}</td><td>${f(a.receivedAt)}</td><td>${f(a.ackAt)}</td><td>${a.choice ? (a.choice === 'return' ? 'Return ' : 'Continue ') + f(a.choiceAt) : a.ackAt !== null && !a.choosable ? 'n/a' : '—'}</td><td>${a.executedAt !== null ? f(a.executedAt) : a.held ? 'Hold' : '—'}</td></tr>`).join('') : '<tr><td colspan="8" class="dim">No alerts</td></tr>');
  }
  function show(tab) { ui.tab = tab; panel.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); pages[tab](); }
  setInterval(() => { if (panel.classList.contains('hidden')) return; if (ui.tab === 'pkg') pkgState(); else if (ui.tab === 'rec') recLive(false); else alertLive(); }, 500);
  mission.on((type) => { if (type === 'plan' && !panel.classList.contains('hidden') && ui.tab === 'pkg') show('pkg'); });
  /** Input data identifiers for the trace: what each file is, where it came from and the hash recorded in this repository (local hashes; not a re-download check). */
  async function traceInputs() {
    const j = (u) => fetch(assetUrl(u)).then((r) => r.json()).catch(() => null), [src, route, ws] = await Promise.all([j('/data/reference/SOURCES.json'), j('/data/jezero/route.json'), j('/data/workspace/fhaz_1215_workspace.json')]);
    const m = terrain.meta, S = src || {}, pick = (k) => S[Object.keys(S).find((x) => x.startsWith(k))] || {};
    const hz = pick('fhaz_1215'), nv = pick('navcam_1176'), w = pick('pia26368'), px = pick('pia26640');
    return [
      { id: 'HiRISE DTM 1 m (JEZ_hirise_soc_006)', kind: 'measured · orbital', usedFor: 'local terrain height · route slope', source: m.near.source, localFile: m.near.dtm.file, localSha256: (m.files[m.near.dtm.file] || {}).sha256 || null, processing: '640 m window cropped · 16-bit quantised (max error 0.7 mm)' },
      { id: 'HiRISE orthoimage 25 cm', kind: 'measured · orbital', usedFor: 'map base · terrain tint (presentation)', source: m.near.ortho_source, localFile: 'hirise_ortho_25cm_2560.jpg', localSha256: (m.files['hirise_ortho_25cm_2560.jpg'] || {}).sha256 || null },
      { id: 'CTX DTM 20 m (JEZ_ctx_B_soc_008)', kind: 'measured · orbital', usedFor: 'regional terrain', source: m.far.source, localFile: m.far.dtm.file, localSha256: (m.files[m.far.dtm.file] || {}).sha256 || null },
      { id: 'M20 traverse (MMGIS M20_traverse.json)', kind: 'measured · rover position', usedFor: 'fixed route (drive path)', source: route ? route.source : null, sourceSha256: route ? route.sha256 : null, localFile: 'route.json' },
      { id: 'M20 waypoints (MMGIS M20_waypoints.json)', kind: 'measured · rover position', usedFor: 'stops · destination 56_0', source: m.waypoints_source },
      { id: hz.product_id || (ws ? ws.source_id : REFERENCE.id), kind: 'measured · front Hazcam mesh (sol 1215)', usedFor: 'planning image · POV match package lines · POV match target', source: hz.urls || hz.canonical || null, localFile: hz.local || 'fhaz_1215_workspace.*', localSha256: hz.local_sha256 || (ws ? ws.sha256 : null), limits: hz.limits || null, presentation: 'mesh height shift · edge blending · tint is presentation' },
      { id: nv.product_id || 'NLG_1176 Navcam mesh', kind: 'measured · Navcam mesh (sol 1176)', usedFor: 'terrain patch beside the route (display only)', source: nv.urls || null, localSha256: nv.local_sha256 || null, presentation: 'height shift · edge blending · tint is presentation' },
      { id: 'PIA26368', kind: 'measured image · WATSON (sol 1212)', usedFor: 'observation check ① original image', source: w.page || null, originalSha256: w.original_sha256 || null, credit: w.credit || null },
      { id: 'PIA26640', kind: 'instrument analysis · PIXL mineral map', usedFor: 'observation check ② published analysis (alignment with ① not verified)', source: px.page || null, originalSha256: px.original_sha256 || null, credit: px.credit || null },
    ];
  }
  async function exportTrace() { return mission.exportTrace(await traceInputs()); }
  return { ui, panel, show, setOpen, extract, exportTrace, get ready() { return load(); }, ANSWERS };
}
