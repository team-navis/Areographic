import './hud.css';
import { assetUrl } from '../util/asset-url.js';
import './visor-theme.css';
import { fmtT, PLAN, WARP } from '../state/mission.js';
import { deriveHudTelemetry, formatClock } from './telemetry.js';
import { REVIEW, startRecognition, envReason } from './voice-diag.js'; // voice failure causes + review-only typed input (joint demo feedback 2026-11-15)

/**
 * Visor HUD. Scope: team required pages H1 (always-on navigation), H2 (task), H3 (record), H5 (return) + 9th HUD decision.
 * Design basis is documented item by item in docs/hud-design-basis.md. In short:
 *  - fixed, always-visible status area: time, alert state, comm status (NASA-STD-3001 Vol 2 Rev E, App. F.4.2 f)
 *  - monochrome green for normal information (Joint AR prototype, NTRS 20250011653); colour is reserved for alert
 *    semantics: red = warning, yellow = caution, blue = advisory, cyan = stale/missing data (Table 10.3-1, F.6.4, F.5-1)
 *  - text on dark plates so character/background contrast can reach 6:1 (F.5.10 f); sizes checked against 0.25 deg (F.5.1 g)
 *  - information at the periphery, central field kept clear ([V2 11022] unencumbered field of regard)
 *  - input: emulated forearm hand controller = detented dial + two momentary push buttons (Joint AR, NTRS 20250011653; KLM study NTRS 20230010234),
 *    plus push-to-talk voice. Keyboard stand-ins: dial turn = mouse wheel or arrow up/down, dial press = M, button 1 = 1 / Enter, button 2 = 2, voice = hold V.
 *    The mouse is head/look direction only; nothing on the HUD is clickable (gloved hands cannot use a pointer: GECO, NTRS 20130014736).
 * The HUD never judges life and never analyses a record; every simulated number is labelled simulated.
 *
 * Visor theme (src/hud/visor-theme.css, 2026-11-15 design request): white type + one cyan accent + line icons instead of
 * monochrome green, everything kept inside the visor. Layout/look only: the same ids, inputs and alert meanings
 * (yellow = caution, red = warning) remain; stale/missing data moves from cyan to violet so it never reads as the accent.
 *
 * Integration with feat/immersive-mission-control: the teammate's "suit & mission status" detail panel (calculation notes and the
 * honest not-connected sensor list) is kept as a display-only layer. It is opened/closed with button 2 or the voice word "detail";
 * it has no toggle button, no close button and takes no pointer input. Rest speed / route ETA use the teammate's telemetry.js.
 */
const MAP_PX = 230, MAP_HALF_M = 70, CPX = 6; // CPX: compass pixels per degree (visor theme)
const key = (k) => `<kbd>${k}</kbd>`;
/** Line icons for the visor theme (stroke = currentColor). Decorative only; every icon sits next to a text label. */
export const ICON = {
  pulse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h5l2-5 4 10 2-5h7"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l5-5M14 10l5-5M8 6l4 4-3 3-4-4zM16 11l4 4-3 3-4-4zM4 15a5 5 0 005 5"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/></svg>',
  turn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
  rad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.2"/><path d="M12 7.5v2.3M8.1 14.3l2-1.1M15.9 14.3l-2-1.1"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.4-7-12a7 7 0 0114 0c0 5.6-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h12l-2.5 4L17 12H5"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5"/></svg>',
  buddy: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c0-3.3 2.7-5 6-5s6 1.7 6 5M15 15.2c3.3-.4 7 .9 7 4.8"/></svg>',
  route: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 20-8-5-8 5z"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  btn1: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h3l2-4 3 9 3-12 3 9 2-2h4"/></svg>',
  map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5L9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/></svg>',
};
/** Bottom control bar: the same inputs as before (button 1, button 2, push-to-talk V, dial press M, wheel, W, E), only laid out as a bar. */
export function legendHtml({ b2 = 'Detail' } = {}) { // top row: what the inputs do; bottom row: which key (keyboard stand-ins for the hand controller)
  return `<div class="lg-a"><span>${ICON.btn1} Select</span><span>${ICON.list} ${b2}</span><span>${ICON.mic} Voice</span><span>${ICON.map} Map</span></div>
    <div class="lg-k"><span>${key('W')}${key('S')} Fwd·Back</span><span>${key('Wheel')}${key('↑')}${key('↓')} Dial</span><span>${key('1')}${key('2')} Buttons</span><span>${key('V')} Voice</span><span>${key('M')} Map</span></div>`;
}
export function createHud(mission, terrain, hooks = {}) {
  const el = document.createElement('div'); el.id = 'hud'; el.className = 'hud vt hidden';
  el.innerHTML = `
    <div class="hud-visor" aria-hidden="true"><i></i></div>
    <div class="hud-brand hud-plate">Areographic <small>SIMULATION · simulated values</small></div>
    <div class="hud-status hud-plate" id="hud-status" title="Fixed, always-visible area"><span><span class="en">MISSION</span> <b id="hud-clock"></b> <small>simulated</small></span><i class="st-sep"></i><span id="hud-commw" class="st-ok">${ICON.link}<em id="hud-commen">LINK GOOD</em> <span id="hud-comm"></span></span><i class="st-sep"></i><span id="hud-alertw" class="st-ok"><span id="hud-alertico">${ICON.check}</span><em id="hud-alerten">NO ALERT</em> <span id="hud-alerts"></span></span><span class="hud-warp hidden" id="hud-warp"></span></div>
    <div class="hud-tc"><div class="hud-compass"><div class="hud-strip" id="hud-strip"></div><div class="hud-needle"></div><div class="hud-route" id="hud-route" aria-hidden="true">▼</div><div class="hud-basem" id="hud-basem" aria-hidden="true">⌂</div></div><div class="hud-hdg"><span id="hud-hdg"></span></div></div>
    <div class="hud-tr hud-plate hidden" id="hud-map"><canvas id="hud-mapcv" width="${MAP_PX}" height="${MAP_PX}"></canvas><div class="hud-mapcap" id="hud-mapcap"></div></div>
    <div class="hud-rlegend" id="hud-rlegend"><div class="rl-h">${ICON.route} ROUTE</div><div><i class="sw"></i>Planned route</div><div><i class="sw trav"></i>Traveled</div><div><i class="sw ret"></i>Return route</div><div><span class="sw pin">${ICON.pin}</span>Waypoint</div></div>
    <div class="hud-wp hidden" id="hud-wp"><small>NEXT WP</small><b id="hud-wpd"></b>${ICON.pin}</div>
    <div class="hud-bl hud-plate"><div class="hud-k">${ICON.pulse} LIFE SUPPORT <small>simulated</small></div>
      <div class="ls-body"><div class="hud-bar vbar" aria-hidden="true"><i id="hud-o2bar"></i></div><div class="ls-rows">
      <div class="hud-row"><span class="o2l">O<sub>2</sub></span><b id="hud-o2"></b></div>
      <div class="hud-row2"><span>${ICON.turn} TURNAROUND <small>time left to start return</small></span><b id="hud-turn"></b></div>
      <div class="hud-row2"><span>${ICON.rad} RADIATION <small>assumption · total</small></span><b id="hud-rad"></b></div></div></div></div>
    <div class="hud-br hud-plate"><div class="hud-k">${ICON.pin} NAVIGATION <small id="hud-navk">Nav</small></div>
      <div class="nv-top"><span class="nv-arrow" id="hud-navarrow">${ICON.arrow}</span><b id="hud-brg"></b><i class="nv-sep"></i><small>NEXT</small><b id="hud-next"></b></div>
      <div class="hud-row2"><span>${ICON.flag} <em id="hud-remen">TARGET</em> <small id="hud-reml">destination</small></span><b id="hud-rem"></b></div>
      <div class="hud-row2"><span>${ICON.home} BASE <small>habitat, straight line</small></span><b id="hud-base"></b></div><div class="hud-row2"><span>${ICON.buddy} PARTNER <small>gap · simulated</small></span><b id="hud-buddy"></b></div>
      <div class="hud-row2 minor"><span>MODE <small>travel</small></span><b id="hud-mode"></b></div><div class="hud-row2 minor"><span>OFF-ROUTE <small>off route</small></span><b id="hud-off"></b></div></div>
    <div class="hud-detail hud-plate hidden" id="hud-detail" aria-label="Suit & mission status detail"><div class="hud-k">Suit & mission status <small>detail</small></div>
      <dl><dt>Plan</dt><dd id="hud-detail-plan"></dd><dt>Route progress</dt><dd id="hud-detail-distance"></dd>
      <dt>Current speed <small>simulated</small></dt><dd id="hud-detail-speed"></dd><dt id="hud-detail-etal">Travel left <small>computed</small></dt><dd id="hud-detail-eta"></dd>
      <dt>Oxygen model <small>simulated</small></dt><dd>−${PLAN.o2PctPerMin}% per min · runs only in the outdoor HUD</dd>
      <dt>Travel time</dt><dd>Route left ÷ set speed. Stops and survey time excluded</dd><dt>Terrain</dt><dd>Archived HiRISE / CTX elevation data</dd>
      <dt>Heart rate · pressure · temp</dt><dd class="hud-unavailable">Not connected</dd><dt>Power · comm delay</dt><dd class="hud-unavailable">Not connected</dd><dt>Partner position</dt><dd class="hud-unavailable">Not connected <small>gap value simulated</small></dd></dl>
      <div class="hud-credit">Position, oxygen, time and vehicle are simulated. The route is Perseverance's real traverse, not a route verified as safe for crewed exploration.</div>
      <div class="hud-keys">Button 2 ${key('2')} close · voice ${key('V')} "detail"</div></div>
    <div class="hud-cue hidden" id="hud-cue"></div>
    <div class="hud-card hud-plate hidden" id="hud-card"></div>
    <button class="hud-x hidden" id="hud-x" type="button" aria-label="Close" title="Close">${ICON.x}</button>
    <div class="hud-bc"><div id="hud-act" class="hud-plate hidden"></div><div class="hud-plate" id="hud-hint"></div><div class="hud-plate hud-legend" id="hud-legend">${legendHtml()}</div></div>`;
  const $ = (id) => el.querySelector(id);
  const strip = $('#hud-strip'); const marks = [];
  for (let d = -360; d <= 720; d += 5) {
    marks.push(`<i class="tk${d % 15 ? '' : ' maj'}" style="left:${d * CPX}px"></i>`);
    if (d % 15) continue; const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[((d % 360) + 360) % 360];
    marks.push(`<span style="left:${d * CPX}px" class="${lab ? 'card' : ''}">${lab || (((d % 360) + 360) % 360)}</span>`);
  }
  strip.innerHTML = marks.join('');
  const deg = (r) => ((r * 180 / Math.PI) % 360 + 360) % 360, d3 = (v) => String(Math.round(v) % 360).padStart(3, '0') + '°';
  const set = (id, t) => { const e = $(id); if (e && e.textContent !== t) e.textContent = t; };
  const BOOT_MS = 1400; let bootUntil = 0; // HUD start-up sequence length (+ a short gap) before the sun visor may lower
  const setH = (id, h) => { const e = $(id); if (e && e.dataset.h !== h) { e.dataset.h = h; e.innerHTML = h; } };
  const st = mission.st; let cardKey = null, mapT = 0;
  const ui = { sel: 0, memoOpen: false, memoNote: '', collapsed: false, declutter: false, talking: false, detail: false, voiceNote: '', voiceNoteT: 0 }; // hand-controller menu state
  const speechCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null; let rec = null;
  let ext = null; // v0.2 extension (src/hud/field-hud.js): alerts, POV match package, POV match, observation check, sample record, point of interest, voice commands

  // ---------- actions available from the current card (A = run selected, B = next) ----------
  function actions() {
    if (ui.memoOpen) return [];
    { const x = ext && ext.overlayActions(); if (x) return x; } // v0.2: alert / package cards come first
    const rm = st.remote;
    if (rm && rm.receivedAt !== null && rm.ackAt === null) return [{ id: 'ack', label: 'Acknowledge habitat instruction', run: () => mission.ackRemote() }];
    if (rm && rm.ackAt !== null && rm.executedAt === null && !rm.declined && st.phase === 'outbound' && st.s > st.route.stats.indoorM) return [{ id: 'return', label: 'Start return (run instruction)', run: () => mission.startReturn() }, { id: 'hold', label: 'Hold · keep going', run: () => mission.declineRemote() }];
    if (st.phase === 'arrived') return [{ id: 'confirm', label: 'Confirm arrival → start observing', run: () => mission.confirmArrival() }];
    if (st.phase === 'onsite') {
      const n = (t) => st.records.filter((r) => r.type === t).length;
      const list = [
        { id: 'photo', label: 'Photo · photo mark', state: n('photo') ? `${n('photo')}` : 'Not done', done: n('photo') > 0, run: () => mission.addRecord('photo', 'Photo mark (simulated: no real camera frame stored)') },
        { id: 'memo', label: 'Memo · voice dictation/text', state: n('memo') ? `${n('memo')}` : 'Not done', done: n('memo') > 0, run: () => openMemo() },
        { id: 'return', label: 'Start return', state: '', run: () => mission.startReturn() },
      ];
      return ext ? ext.onsiteActions(list) : list; // v0.2 items are inserted before Start return
    }
    if (st.phase === 'atBase') return [{ id: 'end', label: 'End Marswalk', run: () => mission.endMission() }];
    return [];
  }
  function openMemo() { ui.memoOpen = true; ui.memoNote = ''; ui.dictated = ''; cardKey = null; renderCard(); const t = $('#hud-memo'); if (t) t.focus(); }
  function closeMemo(save) {
    const t = $('#hud-memo'), typed = t ? t.value.trim() : '', text = (typed || ui.dictated || '').trim(); if (rec) { try { rec.stop(); } catch { /* already stopped */ } rec = null; }
    // the crew cannot type: a dictated note is saved as voice; with nothing dictated, button 1 saves a clearly labelled demo example (never shown as recognised speech)
    if (save && text) mission.addRecord('memo', text, { input: ui.usedSpeech && !(typed && typed !== ui.dictated) ? 'Voice dictation (performance not verified)' : 'Review text input (not astronaut input)' });
    else if (save) mission.addRecord('memo', 'Demo example memo · not real speech recognition', { input: 'Demo example record (button · not voice)', demoExample: true });
    ui.usedSpeech = false; ui.talking = false; ui.dictated = '';
    ui.memoOpen = false; cardKey = null; if (t) t.blur();
  }
  /** Suit & mission status layer (teammate's panel content). Display only: opened by button 2 or the voice word "detail". */
  function setDetail(open) { ui.detail = !!open; $('#hud-detail').classList.toggle('hidden', !ui.detail); el.classList.toggle('detail-open', ui.detail); return ui.detail; }
  /** Mouse close (X, top right of the open card or board): memo -> cancel, POV match / observation check -> back to the task list,
   *  detail layer -> close, otherwise fold the card (button 2 unfolds it again). Same results as the existing button paths. */
  function closeTop() {
    if (ui.memoOpen) { closeMemo(false); return; }
    if (ext && ext.closeView()) { cardKey = null; return; }
    if (ui.detail && $('#hud-card').classList.contains('hidden')) { setDetail(false); return; }
    ui.collapsed = true; cardKey = null;
  }
  $('#hud-x').addEventListener('click', (ev) => { ev.stopPropagation(); closeTop(); });
  const voiceNote = (t) => { ui.voiceNote = t; ui.voiceNoteT = 4; };
  /** Voice command words. Only "detail" exists; anything else is reported as not understood (no free-form commands). */
  function voiceCommand(text) { if (/\bdetails?\b/i.test(String(text))) { setDetail(!ui.detail); voiceNote(`Voice "detail" · suit & mission status ${ui.detail ? 'open' : 'closed'}`); return true; } voiceNote(`Voice command not understood · button 2 ${key('2')} opens detail`); return false; }
  /** Push-to-talk: recognition runs only while V is held. In the memo card it dictates; elsewhere it listens for the word "detail". */
  function talkCommand(down) {
    if (down) {
      if (ui.talking) return true; ui.talking = true;
      rec = startRecognition({ state: (s) => voiceNote(`${s} · button 2 ${key('2')} opens detail`), result: (s) => voiceCommand(s) });
    } else { ui.talking = false; if (rec) { try { rec.stop(); } catch { /* already stopped */ } } }
    return true;
  }
  function talk(down) {
    if (!ui.memoOpen) return talkCommand(down); const note = (t) => { ui.memoNote = t; const n = $('#hud-memonote'); if (n) n.textContent = t; };
    if (down) {
      if (ui.talking) return true; ui.talking = true;
      rec = startRecognition({ state: (s) => note(`${s}${ui.dictated ? '' : ' · button 1 saves a demo example record'}`), result: (s) => { ui.dictated = ((ui.dictated || '') + ' ' + s).trim(); ui.usedSpeech = true; const d = $('#hud-memotext'); if (d) d.textContent = ui.dictated; const t = $('#hud-memo'); if (t) t.value = (t.value + ' ' + s).trim(); } });
    } else { ui.talking = false; if (rec) { try { rec.stop(); } catch { /* already stopped */ } } }
    return true;
  }

  function drawMap(lookYaw) {
    const g = $('#hud-mapcv').getContext('2d'), p = mission.poseAt(st.s), B = terrain.bounds, img = terrain.nearImg, w = img.width;
    const u = (x) => ((x - B.x0) / (B.x1 - B.x0)) * w, v = (z) => ((z - B.z0) / (B.z1 - B.z0)) * w, H = MAP_HALF_M, k = MAP_PX / (2 * H);
    const M = (x, z) => [(x - p.x + H) * k, (z - p.z + H) * k];
    g.fillStyle = '#0b0d10'; g.fillRect(0, 0, MAP_PX, MAP_PX); g.globalAlpha = 0.8; g.drawImage(img, u(p.x - H), v(p.z - H), u(p.x + H) - u(p.x - H), v(p.z + H) - v(p.z - H), 0, 0, MAP_PX, MAP_PX); g.globalAlpha = 1;
    const pts = st.route.pts, line = (from, to, style, dash, lw) => { g.beginPath(); let on = false; for (const q of pts) { if (q.s < from || q.s > to) continue; const [mx, my] = M(q.x, q.z); if (on) g.lineTo(mx, my); else { g.moveTo(mx, my); on = true; } } g.setLineDash(dash); g.lineWidth = lw; g.strokeStyle = style; g.stroke(); g.setLineDash([]); };
    const back = st.phase === 'returning' || st.phase === 'atBase' || st.phase === 'ended';
    if (back) { line(st.s, st.route.length, 'rgba(255,255,255,.9)', [], 2); line(0, st.s, '#8cff9e', [5, 4], 2); } else { line(0, st.s, 'rgba(255,255,255,.9)', [], 2); line(st.s, st.route.length, '#8cff9e', [5, 4], 2); } // travelled solid, planned dashed
    for (const h of st.route.hazards) line(h.s0, h.s1, '#ffd84d', [], 4);
    const dot = (x, z, r, fill, stroke) => { const [mx, my] = M(x, z); g.beginPath(); g.arc(mx, my, r, 0, 6.283); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } };
    { const [bx, by] = M(mission.base.x + 6, mission.base.z - 1); g.fillStyle = '#e8e2d4'; g.fillRect(bx - 6, by - 4, 12, 8); }
    const e = pts[pts.length - 1]; dot(e.x, e.z, 6, 'rgba(140,255,158,.25)', '#8cff9e');
    for (const r of st.records) { const q = mission.poseAt(r.s); dot(q.x, q.z, 2.5, '#ffffff'); }
    const rw = mission.roverWorld(); { const [rx, ry] = M(rw.x, rw.z); g.save(); g.translate(rx, ry); g.rotate(-rw.yaw); g.fillStyle = st.transport === 'rover' ? '#8cff9e' : '#e8e2d4'; g.fillRect(-3, -5, 6, 10); g.restore(); }
    g.save(); g.translate(MAP_PX / 2, MAP_PX / 2); g.rotate(-lookYaw); g.fillStyle = '#ffffff'; g.strokeStyle = '#04222e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
    g.fillStyle = '#f1ece0'; g.font = '12px system-ui, sans-serif'; g.fillRect(8, MAP_PX - 12, 20 * k, 2); g.fillText('20 m', 8, MAP_PX - 17); g.fillText('N↑', MAP_PX - 26, 16);
  }

  function renderCard() {
    const c = $('#hud-card'), acts = actions(); if (acts.length) ui.sel = Math.min(ui.sel, acts.length - 1); // keep the highlight while the memo field is open
    const rm = st.remote, k = [st.phase, ui.memoOpen, ui.sel, ui.collapsed, acts.map((a) => a.id + a.state).join('|'), st.records.length, rm ? [rm.receivedAt, rm.ackAt, rm.executedAt, rm.declined].join() : '', ext ? ext.key() : ''].join('/');
    if (k === cardKey) { if (st.phase === 'onsite') set('#hud-stay', fmtT(Math.abs(mission.stayLeft()))); return; }
    cardKey = k;
    { const x = ext ? ext.card(acts) : null; if (x !== null) { c.classList.toggle('hidden', x === ''); c.dataset.phase = st.phase; c.innerHTML = x; return; } } // v0.2 cards ('' = hidden while the observation check board is open)
    const remoteCard = acts.length && (acts[0].id === 'ack' || acts[0].id === 'return' && st.phase === 'outbound');
    const show = remoteCard || ['arrived', 'onsite', 'atBase', 'ended'].includes(st.phase); c.classList.toggle('hidden', !show); c.dataset.phase = st.phase; if (!show) return;
    if (remoteCard) { c.innerHTML = `<div class="hud-k adv">Habitat instruction <small>remote · simulated</small></div><div class="hud-v">${rm.ackAt === null ? `"${rm.text}" · received T+${fmtT(rm.receivedAt)}. Acknowledging does not start the return.` : `"${rm.text}" acknowledged T+${fmtT(rm.ackAt)}. The astronaut decides whether to run it.`}</div>${menu()}`; return; }
    if (ui.collapsed && st.phase !== 'ended') { c.innerHTML = `<div class="hud-k">${st.phase === 'onsite' ? 'Tasks H2' : st.phase === 'arrived' ? 'Arrival' : 'At habitat'} <small>folded</small></div><div class="hud-keys">Button 2 ${key('2')} unfold${st.phase === 'onsite' ? '' : ` · button 1 ${key('1')} ${acts[0] ? acts[0].label : ''}`}</div>`; return; }
    function menu() { return `<div class="hud-menu">${acts.map((a, i) => `<div class="hud-item${i === ui.sel ? ' sel' : ''}${a.done ? ' done' : ''}" data-act="${a.id}"><span>${i === ui.sel ? '▶' : a.done ? '●' : '○'} ${a.label}</span><em>${a.state || ''}</em></div>`).join('')}</div>
      <div class="hud-keys">Dial ${key('Wheel')}${key('↑')}${key('↓')} move · button 1 ${key('1')} run · button 2 ${key('2')} ${ext && acts.length > 1 ? 'next' : 'fold'}</div>`; }
    if (ui.memoOpen) {
      const why = envReason();
      c.innerHTML = `<div class="hud-k">Record · voice memo <small>H3 · performance not verified</small></div>
        <div class="hud-v">Dictates while ${key('V')} is held.${why ? ` <span class="caution">Voice unavailable · ${why}</span>` : ''}</div>
        <div class="hud-v" id="hud-memotext">${ui.dictated ? ui.dictated.replace(/[<>&]/g, '') : '<small>Nothing dictated</small>'}</div>
        ${REVIEW ? '<label class="hud-credit" for="hud-memo">Review text input (?review · not astronaut input)</label><textarea id="hud-memo" rows="2"></textarea>' : ''}
        <div class="hud-keys">Button 1 ${key('1')} save${ui.dictated ? '' : ' (nothing dictated: <b>demo example record</b>)'} · button 2 ${key('2')} cancel</div>
        <div class="hud-credit" id="hud-memonote">${ui.memoNote || 'Time, route position and coordinates are added on save · no content analysis or judgement'}</div>`;
      if (REVIEW) c.querySelector('#hud-memo').addEventListener('keydown', (ev) => { if (ev.code === 'KeyV' && !ev.target.value && speechCtor) { ev.preventDefault(); talk(true); return; } ev.stopPropagation(); if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); closeMemo(true); } else if (ev.key === 'Escape' || (ev.code === 'Digit2' && !ev.target.value)) { ev.preventDefault(); closeMemo(false); } }); // Esc may be swallowed by the browser's pointer-lock exit, so button 2 on an empty field also cancels
      if (REVIEW) c.querySelector('#hud-memo').addEventListener('keyup', (ev) => { if (ev.code === 'KeyV') talk(false); });
      return;
    }
    if (st.phase === 'arrived') c.innerHTML = `<div class="hud-k adv">Arrival</div><div class="hud-v">You have reached the destination. Confirm to switch to the observation view.</div>${menu()}`;
    else if (st.phase === 'onsite') {
      const last = st.records[st.records.length - 1];
      c.innerHTML = `<div class="hud-k">Tasks <small>H2</small></div>
        <div class="hud-row2"><span>${mission.stayLeft() >= 0 ? 'Stay time left' : 'Stay time over'} <small>simulated plan ${fmtT(PLAN.staySec)}</small></span><b id="hud-stay">${fmtT(Math.abs(mission.stayLeft()))}</b></div>
        ${menu()}
        <img src="${assetUrl('/data/reference/pia26368_cheyava_falls.jpg')}" alt="Cheyava Falls reference image" id="hud-ref" />
        <div class="hud-credit">Reference image PIA26368 · WATSON · sol 1212 · NASA/JPL-Caltech/MSSS</div>
        <ul class="hud-feat"><li>White calcium sulfate veins (along the rock)</li><li>Leopard spots, dark rims <i>rover measured</i></li><li>Orbital evidence <i class="unk">unverified</i></li></ul>
        <div class="hud-credit" id="hud-lastrec">${last ? `Last record #${last.id} · T+${fmtT(last.simT)} · route ${last.s.toFixed(0)} m · ${last.lonE.toFixed(5)}°E ${last.latN.toFixed(5)}°N (simulated position) · ${last.sent ? 'sent to habitat' : 'waiting to send'}` : 'No records · the field view does not model this rock in 3D · no biosignature judgement'}</div>`;
    } else if (st.phase === 'atBase') c.innerHTML = `<div class="hud-k adv">At habitat <small>H5</small></div><div class="hud-v">You reached the habitat ramp. The Marswalk has not ended yet.</div>${menu()}`;
    else c.innerHTML = `<div class="hud-k">End Marswalk</div><div class="hud-v">Ended T+${fmtT(st.endedAt)} <small>simulated</small> · ${st.records.length} records · O2 ${st.o2.toFixed(1)}% <small>simulated</small></div><div class="hud-credit">Records and summary are on the Planning Display home · Esc for the start screen (role select)</div>`;
  }

  return {
    el, ui, show(v) { el.classList.toggle('hidden', !v); if (!v) { setDetail(false); el.classList.remove('visor-down'); } }, // visor slides (and the readouts light up) again on the next entry
    get detailsOpen() { return ui.detail; }, closeDetails() { setDetail(false); }, setDetail, voiceCommand,
    /** Hand-controller emulation. Returns true when the input was consumed. */
    dial(step) { if (ui.memoOpen || ui.collapsed) return false; const acts = actions(); if (acts.length < 2) return false; ui.sel = (ui.sel + (step > 0 ? 1 : acts.length - 1)) % acts.length; cardKey = null; return true; },
    button(n) {
      if (ui.memoOpen) { closeMemo(n === 1); return true; }
      if (ext && ext.button(n)) return true; // v0.2: button 2 = next item on multi-item cards; board options
      const acts = actions();
      if (n === 2) { // back / detail layer / declutter. With a card: fold or unfold it. Without a card: default -> detail -> declutter -> default.
        const hasCard = acts.length || st.phase === 'ended';
        if (ui.detail) { setDetail(false); if (!hasCard) ui.declutter = true; }
        else if (hasCard) { ui.collapsed = !ui.collapsed; cardKey = null; }
        else if (ui.declutter) ui.declutter = false;
        else setDetail(true);
        el.classList.toggle('declutter', ui.declutter);
        return true;
      }
      if (!acts.length) return false; if (ui.collapsed && st.phase === 'onsite') return false; // expand first: no blind execution of a hidden list
      const a = acts[Math.min(ui.sel, acts.length - 1)], before = st.phase; a.run(); if (!ui.memoOpen) cardKey = null; // keep the freshly focused memo field
      // (fix) the rest of this function used to sit inside the comment above and never ran
      if (a.id === 'ack' && st.phase === 'onsite') { ui.sel = Math.max(0, actions().findIndex((x) => x.id === 'return')); if (ext) ext.keepSel(); } // after acknowledging a base instruction on site, highlight Start return (was the fixed index 3)
      else if (st.phase !== before || a.id === 'ack' || a.id === 'hold') { ui.sel = 0; ui.collapsed = false; }
      return true;
    },
    talk, closeMemo, openMemo, actions, speechAvailable: !!speechCtor, speechCtor,
    use(x) { ext = x; cardKey = null; }, invalidate() { cardKey = null; }, toggleDetail: () => setDetail(!ui.detail), // v0.2 extension hooks
    /** lookYaw/routeYaw: radians, 0 = north (-z), positive = toward west (three.js yaw). */
    update({ lookYaw, routeYaw, locked, dt, wp }) {
      const hdg = deg(-lookYaw), brg = deg(-routeYaw), rel = ((brg - hdg + 540) % 360) - 180, next = mission.nextNode(), bb = mission.baseBearing(), relB = ((deg(-bb.yaw) - hdg + 540) % 360) - 180;
      const back = st.phase === 'returning', moving = st.phase === 'outbound' || back;
      { const outside = st.s > st.route.stats.indoorM + 0.5 && st.phase !== 'atBase' && st.phase !== 'ended'; if (el.classList.contains('visor-down') !== outside) el.classList.toggle('visor-down', outside); } // the orange film is the HUD hardware: readouts show only while it is down (visor-theme.css); sun visor down outside the base, up at the base
      const half = $('.hud-compass').clientWidth / 2 - 12, halfDeg = half / CPX;
      strip.style.transform = `translateX(${-hdg * CPX}px)`; set('#hud-hdg', d3(hdg));
      const rm = $('#hud-route'); rm.style.left = `calc(50% + ${Math.max(-half, Math.min(half, rel * CPX))}px)`; set('#hud-route', Math.abs(rel) > halfDeg ? (rel > 0 ? '▶' : '◀') : '▼');
      $('#hud-basem').style.left = `calc(50% + ${Math.max(-half, Math.min(half, relB * CPX))}px)`;
      // ---- fixed status area: time, comm (AOS/LOS + last received), alert state ----
      set('#hud-clock', 'T+' + fmtT(st.simSeconds));
      set('#hud-comm', st.comm.up ? `Comm OK · rx T+${fmtT(st.comm.lastRx)}` : `Comm loss · last rx T+${fmtT(st.comm.lastRx)}`); $('#hud-comm').classList.toggle('stale', !st.comm.up);
      set('#hud-commen', st.comm.up ? 'LINK GOOD' : 'LINK LOST'); $('#hud-commw').className = st.comm.up ? 'st-ok' : 'st-stale';
      const w = $('#hud-warp'); w.classList.toggle('hidden', st.warp === 1); if (st.warp !== 1) set('#hud-warp', `Speed ×${st.warp} · shortened demo time (clock and O2 ×${st.warp} too)`);
      // ---- H1 life ----
      set('#hud-o2', st.o2.toFixed(1) + '%'); $('#hud-o2bar').style.height = st.o2 + '%'; // vertical gauge (visor theme)
      const tl = mission.turnaroundLeft(), started = st.returnStartedAt !== null;
      setH('#hud-turn', started ? `Return started T+${fmtT(st.returnStartedAt)}` : (tl >= 0 ? fmtT(tl) : 'over ' + fmtT(-tl)) + `<span class="hud-turn-x"> · by T+${fmtT(PLAN.turnaroundSec)}</span>`); // deadline kept in the text, not drawn by the visor theme
      const turnLvl = started ? '' : tl < 0 ? 'warning' : tl < 120 ? 'caution' : ''; $('#hud-turn').className = turnLvl;
      setH('#hud-rad', `${PLAN.doseMsvPerDay} mSv/day<span class="hud-rad-x"> · ${st.doseUsv.toFixed(2)} µSv total</span>`);
      // ---- H1 nav / H5 return ----
      set('#hud-navk', back ? 'Nav · return H5' : 'Nav');
      set('#hud-next', !moving ? (st.phase === 'atBase' || st.phase === 'ended' ? 'Habitat' : 'Arrived') : `${Math.abs(next.s - st.s).toFixed(0)} m`);
      set('#hud-brg', moving ? d3(brg) : '—'); $('#hud-navarrow').style.transform = `rotate(${moving ? rel : 0}deg)`; // route direction relative to where the head points
      set('#hud-remen', back || st.phase === 'atBase' || st.phase === 'ended' ? 'BASE ROUTE' : 'TARGET');
      { const w = $('#hud-wp'), on = !!(wp && wp.on && moving); w.classList.toggle('hidden', !on); if (on) { w.style.left = wp.x + 'px'; w.style.top = wp.y + 'px'; set('#hud-wpd', `${Math.abs(next.s - st.s).toFixed(0)} m`); } }
      set('#hud-reml', back || st.phase === 'atBase' || st.phase === 'ended' ? 'to habitat (route)' : 'destination'); set('#hud-rem', back || st.phase === 'atBase' || st.phase === 'ended' ? `${mission.returnLeft().toFixed(0)} m` : `${Math.max(0, st.route.length - st.s).toFixed(0)} m`);
      set('#hud-base', `${d3(deg(-bb.yaw))} · ${bb.dist.toFixed(0)} m`); set('#hud-buddy', st.s < 0.5 ? 'In habitat' : st.transport === 'rover' ? 'On rover' : st.buddyGap.toFixed(1) + ' m');
      const riding = st.transport === 'rover'; set('#hud-mode', `${riding ? 'Rover' : 'On foot'} · simulated ${mission.speed().toFixed(1)} m/s`); el.classList.toggle('riding', riding);
      const off = mission.offRouteNow(); set('#hud-off', off.m < 0.05 ? 'On route' : off.m.toFixed(1) + ' m'); $('#hud-off').className = off.warn ? 'caution' : ''; $('#hud-off').parentElement.classList.toggle('on', off.warn); // visor theme draws the row only while off route
      // ---- alert line (caution = yellow). Off-route has priority over the avoidance cue. ----
      const hz = mission.nextHazard(), cue = $('#hud-cue'), outdoors = st.s > st.route.stats.indoorM; let cueText = '';
      if (off.warn) cueText = `Caution · off route ${off.m.toFixed(1)} m · return to route`;
      else if (hz && outdoors) cueText = hz.inside ? `Caution · avoid cue · passing slope 6 m ${hz.side} (DTM ${hz.max.toFixed(0)}°, simulated limit ${PLAN.hazardSlopeDeg}°) · stay on route` : `Caution · avoid cue · slope 6 m ${hz.side} in ${hz.ahead.toFixed(0)} m (DTM ${hz.max.toFixed(0)}°, simulated limit ${PLAN.hazardSlopeDeg}°) · stay on route`;
      else if (st.phase === 'onsite' && mission.stayLeft() < 0) cueText = 'Caution · planned stay time exceeded · decide whether to continue';
      cue.classList.toggle('hidden', !cueText); if (cueText) set('#hud-cue', cueText);
      const nCaution = (cueText ? 1 : 0) + (turnLvl === 'caution' ? 1 : 0), nWarn = turnLvl === 'warning' ? 1 : 0;
      set('#hud-alerts', nWarn ? `Warning ${nWarn} · Caution ${nCaution}` : nCaution ? `Caution ${nCaution}` : 'No alert'); $('#hud-alerts').className = nWarn ? 'warning' : nCaution ? 'caution' : '';
      { const lvl = nWarn ? 'st-warn' : nCaution ? 'st-cau' : 'st-ok', aw = $('#hud-alertw'); if (aw.className !== lvl) { aw.className = lvl; $('#hud-alertico').innerHTML = lvl === 'st-ok' ? ICON.check : ICON.warn; } set('#hud-alerten', nWarn ? 'WARNING' : nCaution ? 'CAUTION' : 'NO ALERT'); }
      // ---- minimap: on dial press (M), or briefly while a cue zone is near (personal layout choice, not a team decision) ----
      const auto = !!hz && !st.minimap && outdoors, showMap = st.minimap || auto; $('#hud-map').classList.toggle('hidden', !showMap);
      if (showMap) { mapT -= dt; if (mapT <= 0) { mapT = 0.2; drawMap(lookYaw); } set('#hud-mapcap', st.minimap ? 'Minimap · dial M to close · HiRISE 25 cm' : 'Minimap auto-shown · caution zone ahead'); } else mapT = 0;
      renderCard();
      if (ui.detail) { // teammate's instrument notes: live plan/progress, rest speed 0, route-length / configured-speed estimate
        const tel = deriveHudTelemetry({ st, next, lookYaw, routeYaw, speed: mission.speed() }), home = back || st.phase === 'atBase' || st.phase === 'ended';
        set('#hud-detail-plan', `v${st.planVersion} · ${st.planStatus}`); set('#hud-detail-distance', `${Math.max(0, st.s).toFixed(1)} / ${st.route.length.toFixed(1)} m`);
        set('#hud-detail-speed', `${(st.moving ? mission.speed() : 0).toFixed(1)} m/s`);
        $('#hud-detail-etal').firstChild.textContent = home ? 'To habitat ' : 'Travel left '; set('#hud-detail-eta', home ? formatClock(mission.returnLeft() / mission.speed()) : tel.routeEta === null ? '—' : formatClock(tel.routeEta));
      }
      if (ui.voiceNoteT > 0) ui.voiceNoteT -= dt;
      const canBoard = mission.canBoard(), canDismount = mission.canDismount() && st.phase !== 'ended', roverDist = st.transport === 'foot' ? Math.abs(st.roverS - st.s) : null;
      const act = $('#hud-act'); act.classList.toggle('hidden', !(canBoard || canDismount)); set('#hud-act', canBoard ? 'E · board rover' : 'E · get off rover');
      const hint = ui.voiceNoteT > 0 && !ui.memoOpen ? ui.voiceNote
        : ui.memoOpen ? `Voice memo · hold ${key('V')} to dictate · button 1 ${key('1')} save · button 2 ${key('2')} cancel`
        : st.phase === 'arrived' ? `Arrived · button 1 ${key('1')} to confirm and open the observation view`
        : st.phase === 'onsite' ? `Dial to move, button 1 to run · the return starts only with "Start return"`
        : st.phase === 'atBase' ? `At habitat · button 1 ${key('1')} to end the Marswalk`
        : st.phase === 'ended' ? `Marswalk ended · ${key('Esc')} start screen`
        : riding ? `${key('W')} drive rover · ${key('S')} reverse (no steering) · hold ${key('Shift')} for ×${WARP} · stop, then ${key('E')} get off`
        : !canBoard && roverDist !== null && roverDist < 40 && outdoors ? `Rover ${roverDist.toFixed(0)} m along route · ${key('W')} forward`
        : locked ? `${key('W')} hold to move along route · mouse is look only · ${key('Esc')} start screen` : `Click the view to lock mouse look · ${key('W')} hold to move along route`;
      const h = $('#hud-hint'); if (h.dataset.h !== hint) { h.dataset.h = hint; h.innerHTML = hint; }
      { // close (X) follows whichever card/board is open
        const x = $('#hud-x'), card = $('#hud-card'), board = ext && ext.boardOpen ? el.querySelector('#hud-board') : null;
        const t = board || (!card.classList.contains('hidden') && !ui.collapsed ? card : null) || (ui.detail ? $('#hud-detail') : null);
        x.classList.toggle('hidden', !t);
        if (t) { const r = t.getBoundingClientRect(), e = el.getBoundingClientRect(); x.style.left = `${Math.min(r.right, e.right - 24) - e.left}px`; x.style.top = `${r.top - e.top}px`; } // on the corner, kept on screen
      }
      h.classList.toggle('quiet', hint.startsWith(`${key('W')} hold`) || hint.startsWith('Click the view')); // the default walking hint repeats the control bar
    },
  };
}
