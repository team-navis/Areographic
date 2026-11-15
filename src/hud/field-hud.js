import './field-hud.css';
import { assetUrl } from '../util/asset-url.js';
import { fmtT, PLAN } from '../state/mission.js';
import { FIELD, ANSWERS, OBS_ITEMS, REFERENCE, PLAN_IMAGE } from '../state/field-ops.js';
import { parseCommand, GRAMMAR_HINT } from './voice.js';
import { TOL } from '../world/field.js';
import { legendHtml } from './hud.js';
import { applyKit, kitImg, KIT } from './hud-kit.js';
import { installMissionCards } from './mission-cards.js';
import { REVIEW, startRecognition, refreshPermission, envReason, diag as voiceDiag } from './voice-diag.js';

/**
 * v0.2 HUD extension (team feature definition 2026-11-15). Plugs into the existing HUD (src/hud/hud.js) through
 * hud.use(ext); the existing panels, keys and cards are left as they are.
 *
 * Adds: alert cards (receive/acknowledge/choose/execute), POV match package acknowledgement, POV match (line drawing projected on the rock stand-in),
 * observation check board (design proposal d: original image | published analysis | crew's new record + Seen/Not seen/Can't tell),
 * sample record, point of interest with the remaining time, and voice commands.
 *
 * Input (v0.2 HUD #13 "voice commands, 2 physical buttons"): button 1 = `1` runs the highlighted item, button 2 = `2` moves the
 * highlight to the next item on any card with two or more items (single-item cards still fold, as before). With no card,
 * button 1 toggles the minimap. Push-to-talk `V` takes one command from the fixed grammar in voice.js; when speech
 * recognition is missing or fails, the labelled typed field feeds the same grammar. The dial keys of the earlier build
 * (wheel, arrow up/down, M) still work but are demo extras, not team-defined input.
 *
 * The HUD never detects, recognises or judges anything. POV match compares the scene with a planned public image and the
 * crew states the result; observation answers are the crew's own visual answers.
 */
const key = (k) => `<kbd>${k}</kbd>`, esc = (t) => String(t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const BY = { button: 'Button', voice: 'Voice command (performance not verified)', typed: 'Review text input (not astronaut input)' };
export const TYPE = { followup: 'Carry-over task check', compare: 'POV match', obs: 'Observation answer', sample: 'Sample record', photo: 'Photo mark', memo: 'Memo', interest: 'Point of interest', observe: 'Observation' };

export function installFieldHud(hud, mission, hooks = {}) {
  const st = mission.st, el = hud.el; el.classList.add('fx'); applyKit(el); // team design kit (visor frame, panels, icons)
  const add = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); const n = t.content.firstChild; el.appendChild(n); return n; };
  const boardEl = add('<div class="fx-board hud-plate hidden" id="hud-board"></div>');
  // The crew cannot type: the normal flow is buttons + push-to-talk. The typed command field exists only for review (URL ?review) and is labelled so.
  const voiceEl = add(`<div class="fx-voice hud-plate hidden" id="hud-voice"><div id="hud-voice-state"></div>${REVIEW ? `<label for="hud-voicein">Review text command (?review · not astronaut input) — type, then ${key('Enter')}</label><input id="hud-voicein" autocomplete="off" spellcheck="false" placeholder="Review · type a command, then Enter" />` : `<div class="hud-credit" id="hud-voice-alt">Without voice, button 1 ${key('1')} run · button 2 ${key('2')} next do the same tasks</div><input id="hud-voicein" hidden tabindex="-1" />`}<div id="hud-voice-note"></div></div>`);
  const shutterEl = add('<div class="fx-shutter hidden" id="hud-shutter" aria-hidden="true"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><div class="flash"></div><img class="thumb" alt="" /><span class="lbl"></span></div>'); let shutterT = 0; // photo motion: viewfinder corners, a short flash, the captured frame flying to the record corner
  const linesEl = add('<svg class="fx-lines hidden" id="hud-lines" aria-hidden="true"></svg>'); // HUD line projection: planned lines fixed on the visor
  const briefEl = add('<div class="fx-brief hud-plate hidden" id="hud-brief"><div id="hud-brief-auto"></div><div id="hud-brief-text"></div></div>'); // en-route brief: one or two short sentences, never over the navigation or alert panels
  refreshPermission();
  const noteEl = add('<div class="fx-note hud-plate hidden" id="hud-fx-note"></div>');
  const planEl = document.createElement('span'); planEl.id = 'hud-plan-state'; planEl.className = 'fx-chip caution hidden'; planEl.textContent = 'No plan received'; planEl.title = 'No plan received · check with habitat'; el.querySelector('#hud-status').appendChild(planEl); // gate notice only: leaving without a sent plan is not blocked (demo choice)
  { const lg = el.querySelector('#hud-legend'); if (lg) { lg.innerHTML = legendHtml({ b2: 'Next' }); const a = lg.querySelector('.lg-a'); if (a) a.remove(); const k = lg.querySelector('.lg-k'); if (k) { const v = [...k.children].find((s) => /Voice/.test(s.textContent)); if (v) { v.innerHTML = `${kitImg('icon_voice_memo')} ${key('V')} Memo (hold)`; v.classList.add('lg-memo'); } } k.insertAdjacentHTML('beforeend', `<span class="lg-photo">${kitImg('icon_camera')} ${key('3')} Photo</span>`); } } // joint demo feedback: the Select/Next/Voice/Map row is gone; the suit's camera (3) and memo (4) buttons are listed with the other keys
  const $ = (id) => el.querySelector(id), set = (id, t) => { const e = $(id); if (e && e.textContent !== t) e.textContent = t; }, setB = set, setH2 = (id, h) => { const e = $(id); if (e && e.dataset.h !== h) { e.dataset.h = h; e.innerHTML = h; } };
  const ui = { view: null, obsCur: OBS_ITEMS[0].id, field: null, wantSel: null, talking: false, voiceOpen: false, voiceGot: false, voiceT: 0, flash: '', flashT: 0, lastCommand: null };
  let actsKey = '', boardKey = null, rec = null; const speechCtor = hud.speechCtor;
  const dirty = () => { hud.invalidate(); boardKey = null; };
  const flash = (t) => { ui.flash = t; ui.flashT = 4; noteEl.textContent = t; noteEl.classList.remove('hidden'); };
  const ok = (msg) => { flash(msg); return { ok: true, msg }; }, fail = (msg) => { flash(msg); return { ok: false, msg }; };
  const capture = () => (hooks.capture ? hooks.capture() : null);
  const destName = () => { const c = mission.candidates.find((x) => x.key === st.destKey); return `${c.key} ${c.name}`; };
  const pkgOk = () => !!(st.pkg && st.pkg.ackAt !== null);
  const fmtSigned = (s) => (s >= 0 ? fmtT(s) : '−' + fmtT(-s));
  mission.on((type) => { if (type === 'record') { const r = st.records[st.records.length - 1]; if (r && r.type === 'photo' && !r.frame) r.frame = capture(); } dirty(); }); // photo mark keeps a capture of the demo view (not a camera frame)

  // ---------- crew actions (time / position / dose are attached in mission.addRecord) ----------
  function doCompare(result, by, fromCard = false) {
    if (st.phase !== 'onsite') return fail('POV match is available after arrival is confirmed');
    if (!pkgOk()) return fail('No POV match package · habitat must send it and you must acknowledge it');
    if (result === 'match' && !(ui.field && ui.field.aligned)) return fail(`Not aligned · look at the rock (gaze error ${ui.field ? ui.field.gazeErrDeg.toFixed(1) : '—'}° / limit ${TOL.gazeDeg}°)`);
    const r = mission.setCompare(result, by, ui.field || {}, { input: BY[by], frame: result === 'match' ? capture() : null }); if (!r) return fail('Could not save the match result');
    if (!fromCard) ui.view = 'compare'; dirty(); return ok(result === 'match' ? 'Match confirmed · planned sampling points highlighted' : 'No match report recorded');
  }
  function answer(id, a, by) { const it = OBS_ITEMS.find((x) => x.id === id); if (!it || !mission.answerObservation(id, a, by, { input: BY[by], frame: capture() })) return fail('Observation answers are saved only during on-site tasks'); ui.obsCur = id; nextObs(false); dirty(); return ok(`${it.name}: ${ANSWERS[a]} saved`); }
  function nextObs(force) { const i = OBS_ITEMS.findIndex((x) => x.id === ui.obsCur), k = i + (force ? 1 : 0), order = [...OBS_ITEMS.slice(k), ...OBS_ITEMS.slice(0, k)], nx = order.find((x) => !st.observations[x.id]) || (force ? order[0] : OBS_ITEMS[i]); ui.obsCur = nx.id; dirty(); }
  function saveSample(by, note) { const r = mission.addSample(by, note, { input: BY[by], frame: capture() }); dirty(); return r ? ok(`Sample record #${r.id} · position, time, dose attached (simulated)`) : fail('Sample records are only possible during on-site tasks'); }
  /** Collect sample (2026-11-15): the scoop motion runs first (hooks.sampleMotion), the record is saved when the sample is stowed. */
  function doSample(by, note) {
    if (st.phase !== 'onsite') return fail('Sample records are only possible during on-site tasks');
    if (ui.sampling) return fail('Collecting sample');
    if (hooks.sampleMotion && hooks.sampleMotion(() => { ui.sampling = false; saveSample(by, note); }, () => { ui.sampling = false; dirty(); })) { ui.sampling = true; dirty(); return ok('Collecting sample · scooping into the sample tube (simulated motion)'); }
    return saveSample(by, note);
  }
  const outside = () => st.s > st.route.stats.indoorM + 0.5 && st.phase !== 'ended';
  function shutter(r) {
    shutterEl.classList.remove('hidden', 'go'); void shutterEl.offsetWidth; const img = shutterEl.querySelector('.thumb'); if (r.frame) img.src = r.frame; img.style.display = r.frame ? '' : 'none';
    shutterEl.querySelector('.lbl').innerHTML = `${kitImg('icon_camera')} Photo #${r.id} · simulated view (not a real camera)`; shutterEl.classList.add('go'); clearTimeout(shutterT); shutterT = setTimeout(() => shutterEl.classList.add('hidden'), 1500);
  }
  /** Tasks in the plan the HUD received (or in the draft before one is sent). A task the planner switched off is not offered. */
  const planned = (id) => (st.planTx ? st.planTx.todos : st.planDraft.todos.filter((t) => t.on)).some((t) => t.id === id);
  function doPhoto(by) { if (!planned('photo')) return fail('Photo is not in this plan'); const r = outside() ? mission.addRecord('photo', 'Photo mark (simulated: no real camera frame stored)', { input: BY[by] }) : null; dirty(); if (r) shutter(r); return r ? ok(`Photo mark #${r.id} · position and time attached (simulated)`) : fail('Photo marks are only possible outside the habitat'); }
  /** Suit memo button (hold): dictation straight into a memo record. Where voice cannot work, a press saves a clearly labelled demo example. */
  function memoButton(down) {
    if (!down) { if (ui.memoRec) { try { ui.memoRec.stop(); } catch { /* already stopped */ } } return true; }
    if (ui.memoRec) return true; if (!planned('memo')) { fail('Voice memo is not in this plan'); return true; } if (!outside()) { fail('Memos are only possible outside the habitat'); return true; }
    const example = (why) => { const r = mission.addRecord('memo', 'Demo example memo · not real speech recognition', { input: 'Demo example record (memo button · not voice)', demoExample: true }); dirty(); flash(`Voice unavailable · ${why} · demo example memo #${r.id} saved`); };
    if (hooks.voiceStart) hooks.voiceStart(); // the mic prompt / recognition start can drop the pointer lock: not an Esc
    const why = envReason(); if (why) { example(why); return true; }
    ui.memoGot = false; flash('Speak now · release to save · e.g. why sample, surface look, what to check next · performance not verified');
    ui.memoRec = startRecognition({ state: (s) => flash(s), result: (s) => { ui.memoGot = true; const r = mission.addRecord('memo', s, { input: 'Voice dictation (performance not verified)' }); dirty(); ok(`Memo #${r.id} saved · "${s}"`); },
      end: () => { ui.memoRec = null; const e = voiceDiag.error; if (!ui.memoGot && ['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e)) example({ 'not-allowed': 'microphone permission denied', 'service-not-allowed': 'speech service blocked', 'audio-capture': 'no microphone' }[e]); } });
    if (!ui.memoRec) example('could not start speech recognition');
    return true;
  }
  function doInterest(by, note) { const r = mission.addInterest(by, hooks.gazeGround ? hooks.gazeGround() : null, note, { input: BY[by] }); if (!r) return fail('Points of interest can only be added during on-site tasks'); dirty(); return ok(`Point of interest ${r.n} added · stay time left with it ${fmtSigned(mission.stayLeftAfterInterest())} (assumption: +${FIELD.interestCostSec / 60} min per point)`); }
  const openView = (v) => { if (st.phase !== 'onsite') return false; ui.view = v; if (v === 'board') nextObs(false); dirty(); return true; };

  /** Keep the highlight valid: when the action list itself changes, start on the wanted item or the first one. */
  function sync() {
    if (hud.ui.memoOpen) return; if (st.phase !== 'onsite') ui.view = null;
    const acts = hud.actions(), k = acts.map((a) => a.id).join('|');
    if (k !== actsKey) { actsKey = k; const w = ui.wantSel ? acts.findIndex((a) => a.id === ui.wantSel) : -1; hud.ui.sel = w >= 0 ? w : 0; ui.wantSel = null; hud.ui.collapsed = false; dirty(); }
  }
  const alertStates = (a) => `${a.sentAt !== null ? `sent T+${fmtT(a.sentAt)} · ` : ''}received T+${fmtT(a.receivedAt)} · ack ${a.ackAt === null ? '—' : 'T+' + fmtT(a.ackAt)} · choice ${a.choice ? (a.choice === 'return' ? 'return' : 'continue') : '—'} · executed ${a.executedAt === null ? '—' : 'T+' + fmtT(a.executedAt)}`;
  const recLine = (r) => `#${r.id} ${TYPE[r.type] || r.type} · T+${fmtT(r.simT)} · ${r.lonE.toFixed(5)}°E ${r.latN.toFixed(5)}°N · ${r.doseUsv.toFixed(2)} µSv <small>simulated</small> · ${r.sent ? 'sent to habitat' : 'waiting to send'}`;

  const ext = {
    /** Cards that interrupt everything else: an alert, a chosen-but-not-started return, a received package. */
    overlayActions() {
      const al = mission.activeAlert();
      if (al) return al.ackAt === null ? [{ id: 'alert-ack', label: 'Acknowledge alert', run: () => mission.ackAlert(al.id) }]
        : [{ id: 'alert-continue', label: 'Continue (choose continue)', run: () => mission.chooseAlert(al.id, 'continue') }, { id: 'alert-return', label: 'Choose return (start separately)', run: () => { if (mission.chooseAlert(al.id, 'return')) ui.wantSel = 'return'; } }];
      if (mission.pendingReturn() && mission.ext.canReturnEarly()) return [{ id: 'return', label: 'Start return (run choice)', run: () => mission.startReturn() }, { id: 'hold', label: 'Hold · keep going', run: () => mission.holdReturn() }];
      // an acknowledged base return instruction while stopped at the destination (arrived / on site): the same start / hold pair. On the way out the existing HUD card (hud.js) already offers it.
      { const rm = st.remote; if (rm && rm.ackAt !== null && rm.executedAt === null && !rm.declined && (st.phase === 'arrived' || st.phase === 'onsite')) return [{ id: 'return', label: 'Start return (run instruction)', run: () => mission.startReturn() }, { id: 'hold', label: 'Hold · keep going', run: () => mission.declineRemote() }]; }
      if (st.planTx && st.planTx.receivedAt !== null && st.planTx.ackAt === null) return [{ id: 'plan-ack', label: 'Acknowledge plan', run: () => mission.ackPlan() }];
      if (st.pkg && st.pkg.receivedAt !== null && st.pkg.ackAt === null) return [{ id: 'pkg-ack', label: 'Acknowledge POV match package', run: () => mission.ackPackage() }];
      return null;
    },
    onsiteActions(list) {
      const back = { id: 'back', label: ui.view === 'board' ? 'Close' : 'Back to task list', run: () => { ui.view = null; } };
      if (ui.view === 'compare') return pkgOk() ? [{ id: 'match', label: 'Confirm match', state: ui.field && ui.field.aligned ? 'Aligned' : 'Not aligned', run: () => doCompare('match', 'button') }, { id: 'mismatch', label: 'Report no match', state: '', run: () => doCompare('mismatch', 'button') }, back] : [back];
      if (ui.view === 'board') return [...Object.entries(ANSWERS).map(([a, label]) => ({ id: 'ans-' + a, label, run: () => answer(ui.obsCur, a, 'button') })), { id: 'obs-next', label: 'Next item', run: () => nextObs(true) }, back];
      const n = (t) => st.records.filter((r) => r.type === t).length, nObs = Object.keys(st.observations).length, cr = st.compare.result;
      const extra = [
        { id: 'missions', label: 'To mission cards', state: '', done: false, run: () => mc.reopen() },
        { id: 'compare', label: 'POV match', state: cr === 'match' ? 'Match' : cr === 'mismatch' ? 'No match' : pkgOk() ? 'Not done' : 'No package', done: !!cr, run: () => openView('compare') },
        { id: 'board', label: 'Observation check · checklist', state: `${nObs}/${OBS_ITEMS.length}`, done: nObs === OBS_ITEMS.length, run: () => openView('board') },
        { id: 'sample', label: 'Sample record', state: n('sample') ? `${n('sample')}` : 'Not done', done: n('sample') > 0, run: () => doSample('button', '') },
        { id: 'interest', label: 'Add point of interest', state: n('interest') ? `${n('interest')}` : '', done: false, run: () => doInterest('button', '') },
      ];
      for (const c of st.carried || []) extra.push({ id: 'chk-' + c.key, label: `Carry-over · ${c.title}`, state: c.doneAt === null ? 'Carried' : 'Checked', done: c.doneAt !== null, run: () => { const r = mission.checkCarried(c.key, 'button', { input: BY.button }); if (r) ok(`Carry-over task check record #${r.id}`); else fail('Carry-over task already checked'); dirty(); } }); // follow-up tasks carried from the previous EVA (team proposal demo)
      const base = list.filter((a) => a.id !== 'photo' && a.id !== 'memo'); // photo = suit button 3, memo = suit button 4 (joint demo feedback)
      const i = base.findIndex((a) => a.id === 'return'); return [...base.slice(0, i), ...extra, ...base.slice(i)];
    },
    key() { const pk = st.pkg; return [ui.view, st.remote ? [st.remote.ackAt, st.remote.declined, st.remote.executedAt].join() : '', st.alerts.map((a) => [a.receivedAt, a.ackAt, a.choice, a.executedAt, a.held].join()).join(';'), pk ? [pk.rev, pk.receivedAt, pk.ackAt].join() : '', st.planTx ? [st.planTx.rev, st.planTx.receivedAt, st.planTx.ackAt].join() : '', st.compare.result, st.compare.at, mission.interestCount(), (st.carried || []).map((c) => c.doneAt).join(), mc.active].join('~'); },
    /** HTML for the card, '' to hide it (board open), or null to let the existing HUD render its own card. */
    card(acts) {
      if (mc.active) return ''; // field mission card is showing (mission-cards.js)
      const first = acts[0] ? acts[0].id : '', al = mission.activeAlert(), pk = st.pkg, sel = Math.min(hud.ui.sel, acts.length - 1);
      const menu = () => `<div class="hud-menu">${acts.map((a, i) => `<div class="hud-item${i === sel ? ' sel' : ''}${a.done ? ' done' : ''}" data-act="${a.id}"><span>${i === sel ? '▶' : a.done ? '●' : '○'} ${a.label}</span><em>${a.state || ''}</em></div>`).join('')}</div><div class="hud-keys">Button 1 ${key('1')} run · button 2 ${key('2')} ${acts.length > 1 ? 'next' : 'fold'}</div>`;
      if (hud.ui.collapsed) return null; // folded single-item card: the existing HUD draws the folded state
      if (first.startsWith('alert-')) return `<div class="hud-k ${al.level === 'warning' ? 'fx-warn' : 'fx-cau'}">${al.level === 'warning' ? 'Warning' : 'Caution'} · ${al.title}</div><div class="hud-v">${esc(al.text)}</div><div class="hud-credit">${al.source}</div><div class="hud-credit" id="hud-alert-states">${alertStates(al)}</div><div class="hud-credit">${al.ackAt === null ? 'Acknowledging does not start the return.' : 'Choose continue or return. Return still has to be started separately.'}</div>${menu()}`;
      if (first === 'return' && acts[1] && acts[1].id === 'hold' && mission.pendingReturn()) { const a = mission.pendingReturn(); return `<div class="hud-k adv">Return chosen <small>${a.title}</small></div><div class="hud-v">Return chosen T+${fmtT(a.choiceAt)}. Press button 1 to start the return.</div>${menu()}`; }
      if (first === 'return' && acts[1] && acts[1].id === 'hold' && st.remote && st.remote.ackAt !== null && (st.phase === 'arrived' || st.phase === 'onsite')) { const rm = st.remote; return `<div class="hud-k adv">Habitat instruction <small>remote · simulated</small></div><div class="hud-v">"${esc(rm.text)}" acknowledged T+${fmtT(rm.ackAt)}. The astronaut decides whether to run it. Press button 1 to start the return.</div>${menu()}`; }
      if (first === 'plan-ack') { const t = st.planTx, b = t.budget; return `<div class="hud-k adv">Plan received <small>habitat → HUD · simulated</small></div><div class="hud-v">${t.missionId || mission.missionId()} · Plan v${t.planVersion} · decision maker ${esc(t.decider)} · ${t.todos.length} tasks ${fmtT(b.staySec)} · turnaround time T+${fmtT(b.turnaroundSec)} <small>(latest return start)</small> · oxygen at return ${b.o2AtReturn.toFixed(0)}% <small>(simulated)</small> · received T+${fmtT(t.receivedAt)}</div><div class="hud-credit">Contingency plan: turnaround time reached → start return · comm loss → recovery point, return · alert → return together${st.pkg && st.pkg.ackAt === null ? ' · POV match package acknowledged too' : ''}</div>${menu()}`; }
      if (first === 'pkg-ack') return `<div class="hud-k adv">POV match package received <small>habitat → HUD</small></div><div class="hud-v">Plan v${pk.planVersion} · package r${pk.rev} · ${pk.lines.length} lines · ${pk.targets.length} planned sampling points · received T+${fmtT(pk.receivedAt)}</div><div class="hud-credit">Original image ${pk.source} · ${pk.credit}</div>${menu()}`;
      if (st.phase !== 'onsite' || hud.ui.memoOpen) return null;
      if (ui.view === 'board') return '';
      if (ui.view === 'compare') { const cr = st.compare, L = mission.stayLeft();
        return `<div class="hud-k">POV match <small>measured terrain mesh · front Hazcam · sol 1215</small></div>
          <div class="hud-row2"><span>${L >= 0 ? 'Stay time left' : 'Stay time over'} <small>simulated plan ${fmtT(PLAN.staySec)}</small></span><b id="hud-stay">${fmtT(Math.abs(L))}</b></div>
          ${cr.result === 'match' ? '' : `<div class="fx-cmp"><img id="hud-ref2" src="${PLAN_IMAGE.file}" alt="Planning image · front Hazcam sol 1215" /><div><div class="hud-v" id="hud-pkgline">${pkgOk() ? `Package plan v${pk.planVersion} · r${pk.rev}<br>${pk.lines.length} lines · ${pk.targets.length} planned sampling points` : pk ? 'POV match package not yet acknowledged' : 'No POV match package<br>lines appear once the habitat sends it'}</div><div class="hud-credit">Planning image Hazcam sol 1215 · ${PLAN_IMAGE.credit}</div></div></div>`}
          ${pkgOk() ? `<div class="hud-row2"><span>Alignment <small>gaze-based · assumption</small></span><b id="hud-align"></b></div><div class="hud-credit" id="hud-gaze"></div>` : ''}
          ${cr.result === 'match' ? `<div class="hud-v" id="hud-matched">Match confirmed T+${fmtT(cr.at)} · planned sampling points highlighted on the rock. The astronaut decides where to sample.</div>` : cr.result === 'mismatch' ? `<div class="hud-v" id="hud-matched">No match reported T+${fmtT(cr.at)} · no judgement</div>` : ''}
          ${menu()}
          <div class="hud-credit">Lines traced from the planning image, fixed on the HUD · turn your head to lay them on the real rock · not automatic recognition · A·B estimated from raw metadata · no biosignature judgement</div>`; }
      return null;
    },
    /** The existing HUD chose the highlight itself (after a base-instruction ack): do not reset it on the next sync. */
    keepSel() { actsKey = hud.actions().map((x) => x.id).join('|'); },
    /** Close the open POV match / observation check view and go back to the task list (same as the "Back to task list"/"Close" item). */
    closeView() { if (!ui.view) return false; ui.view = null; dirty(); return true; },
    get boardOpen() { return !boardEl.classList.contains('hidden'); },
    /** Returns true when the press was handled here. */
    button(n) {
      if (mc.press(n, true)) return true; // field mission card: buttons 1 · 2 · 3
      sync(); const acts = hud.actions();
      if (n === 2) return acts.length >= 2 && !hud.ui.collapsed ? (hud.dial(1), true) : false; // single-item cards keep the old fold behaviour
      if (!acts.length && st.phase !== 'ended') { mission.toggleMinimap(); return true; } // button 1 with nothing to run: map on/off
      return false;
    },
  };
  hud.use(ext);
  const mc = installMissionCards({ el, mission, st,
    hooks: { planned, goLanding: () => hooks.goLanding && hooks.goLanding(), actions: () => hud.actions(), hudCard: () => $('#hud-card'), overlay: () => ext.overlayActions(), memoOpen: () => !!hud.ui.memoOpen, viewOpen: () => !!ui.view, field: () => ui.field, aligned: () => !!(ui.field && ui.field.aligned), dirty },
    act: { sampling: () => !!ui.sampling, compare: (r) => doCompare(r, 'button', true), answer: (id, a) => answer(id, a, 'button'), memo: memoButton, sample: () => doSample('button', ''), photo: () => doPhoto('button'), interest: () => doInterest('button', ''),
      carried: (k) => { const r = mission.checkCarried(k, 'button', { input: BY.button }); if (r) ok(`Carry-over task check record #${r.id}`); else fail('Carry-over task already checked'); dirty(); } } });
  let projFn = null;

  // ---------- voice: one command per push-to-talk ----------
  /** Run one utterance through the fixed grammar. `by` is 'voice' (recognised) or 'typed' (labelled fallback). */
  function command(text, by = 'typed') {
    const c = parseCommand(text); let r; sync();
    if (!c) r = fail('Empty command');
    else if (hud.ui.memoOpen) r = fail('Memo in progress · save or cancel first');
    else switch (c.cmd) {
      case 'next': r = hud.dial(1) ? ok('Next item') : fail('No item to move to'); break;
      case 'prev': r = hud.dial(-1) ? ok('Previous item') : fail('No item to move to'); break;
      case 'confirm': { const a = hud.actions(); if (a.length) { const label = a[Math.min(hud.ui.sel, a.length - 1)].label; hud.button(1); r = ok(`Run: ${label}`); } else r = fail('Nothing to run'); break; }
      case 'cancel': case 'list': if (ui.view) { ui.view = null; dirty(); r = ok('Back to task list'); } else r = c.cmd === 'list' ? ok('Task list') : fail('Nothing to close'); break;
      case 'map': r = ok(mission.toggleMinimap() ? 'Map on' : 'Map off'); break;
      case 'detail': r = hud.toggleDetail ? ok(hud.toggleDetail() ? 'Suit & mission status open' : 'Suit & mission status closed') : fail('No detail layer'); break; // integration branch: suit & mission status layer
      case 'compare': r = openView('compare') ? ok('POV match') : fail('POV match opens after arrival is confirmed'); break;
      case 'board': r = openView('board') ? ok('Observation check') : fail('Observation check opens only while stopped on site'); break;
      case 'match': r = doCompare('match', by); break;
      case 'mismatch': r = doCompare('mismatch', by); break;
      case 'answer': r = answer(c.item || ui.obsCur, c.answer, by); break;
      case 'sample': r = doSample(by, c.rest); break;
      case 'photo': r = doPhoto(by); break;
      case 'interest': r = doInterest(by, c.rest); break;
      case 'continue': { const al = mission.activeAlert(); r = al && mission.chooseAlert(al.id, 'continue') ? ok('Continue chosen') : fail('No alert to choose on (acknowledge it first)'); break; }
      case 'return': { const al = mission.activeAlert(), a = hud.actions(), i = a.findIndex((x) => x.id === 'return'); // never starts the return by itself
        if (al && mission.chooseAlert(al.id, 'return')) { ui.wantSel = 'return'; r = ok('Return chosen · run "Start return" to begin'); } else if (i >= 0) { hud.ui.sel = i; dirty(); r = ok('"Start return" highlighted · button 1 or "confirm" to run'); } else r = fail('Return cannot be started now'); break; }
      case 'rover': r = hooks.toggleRover && hooks.toggleRover() ? ok('Board / get off rover') : fail('Cannot board or get off now'); break;
      case 'auto': r = mission.resumeAuto() ? ok('Auto-advance on · from the next travel leg') : fail('Auto-advance cannot be turned on now'); break;
      case 'manual': mission.takeManual(); r = ok('Manual control · W forward · S back'); break;
      case 'help': r = ok('Commands: ' + GRAMMAR_HINT); break;
      default: r = fail(`Unknown command "${c.heard}" · available: ${GRAMMAR_HINT}`);
    }
    ui.lastCommand = { text: String(text), by, cmd: c ? c.cmd : null, ok: r.ok, msg: r.msg }; set('#hud-voice-note', `${by === 'voice' ? 'Voice' : 'Fallback input'} "${String(text).trim()}" → ${r.msg}`);
    return ui.lastCommand;
  }
  const voiceIn = $('#hud-voicein');
  function showVoice(v) { ui.voiceOpen = v; voiceEl.classList.toggle('hidden', !v); if (!v) { voiceIn.value = ''; voiceIn.blur(); } }
  voiceIn.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); const t = voiceIn.value; voiceIn.value = ''; voiceIn.blur(); command(t, 'typed'); ui.voiceT = 3.5; } else if (ev.key === 'Escape' || (ev.code === 'Digit2' && !voiceIn.value)) { ev.preventDefault(); showVoice(false); } });
  voiceIn.addEventListener('keyup', (ev) => ev.stopPropagation());
  /** Push-to-talk. Recognition runs only while V is held; if it is missing or fails the labelled typed field takes over. */
  function talk(down) {
    if (down) {
      if (ui.talking) return true; ui.talking = true; ui.voiceGot = false; ui.voiceT = 0; showVoice(true); set('#hud-voice-note', '');
      rec = startRecognition({ state: (s) => { set('#hud-voice-state', s); if (!ui.talking && !ui.voiceGot) ui.voiceT = Math.max(ui.voiceT, 4); }, result: (s) => { ui.voiceGot = true; voiceIn.blur(); command(s, 'voice'); ui.voiceT = 3.5; } });
      if (!rec) ui.voiceT = 5; // could not start: the reason stays on screen for a moment, buttons keep working
    } else { if (!ui.talking) return true; ui.talking = false; if (rec) { try { rec.stop(); } catch { /* already stopped */ } } if (ui.voiceOpen && !ui.voiceGot) { if (REVIEW) voiceIn.focus(); else ui.voiceT = Math.max(ui.voiceT, 4); } }
    return true;
  }

  /** Observation check (design proposal d): original image | published analysis | the crew's new record. Opened only on site, while stopped. */
  function renderBoard(acts) {
    const b = boardEl, pk = st.pkg, cr = st.compare, shot = [...st.records].reverse().find((r) => r.frame), tl = mission.turnaroundLeft();
    setB('#hud-b-stay', fmtT(Math.abs(mission.stayLeft()))); setB('#hud-b-o2', st.o2.toFixed(1) + '%'); setB('#hud-b-turn', tl >= 0 ? fmtT(tl) : 'over ' + fmtT(-tl));
    const k = [hud.ui.sel, ui.obsCur, JSON.stringify(st.observations), shot ? shot.id + '' + shot.sent : '', pk ? pk.rev + '' + pk.ackAt : '', cr.result, st.records.length].join('/'); if (k === boardKey) return; boardKey = k;
    const item = (it) => { const a = st.observations[it.id], cur = it.id === ui.obsCur; return `<div class="b-item${cur ? ' sel' : ''}" data-obs="${it.id}" data-answer="${a ? a.answer : ''}"><div class="t">${cur ? '▶ ' : ''}${it.name}<small>${it.q}</small></div><div class="seg">${Object.entries(ANSWERS).map(([id, lab]) => `<span class="${a && a.answer === id ? 'on' : ''}">${lab}</span>`).join('')}</div></div>`; };
    b.innerHTML = `<div class="b-head"><h1>Observation check</h1><span class="site">${esc(destName())}</span><span class="vit">O2 <b id="hud-b-o2">${st.o2.toFixed(1)}%</b> · Return margin <b id="hud-b-turn">${tl >= 0 ? fmtT(tl) : 'over ' + fmtT(-tl)}</b> · ${mission.stayLeft() >= 0 ? 'Stay time left' : 'Stay time over'} <b id="hud-b-stay">${fmtT(Math.abs(mission.stayLeft()))}</b> <small>simulated</small></span></div>
      <div class="b-panes">
        <section class="b-pane" id="hud-pane1"><h2><em>1</em>Original image <i>rover photo · resized only</i></h2>
          <div class="b-frame"><img id="hud-ref" src="${REFERENCE.file}" alt="Cheyava Falls reference image PIA26368" /></div>
          <div class="b-meta"><b>PIA26368</b> · WATSON · sol 1212 (2024-07-18) · NASA/JPL-Caltech/MSSS<br><span class="tag">measured image</span> <span class="tag none">no scale data</span></div></section>
        <section class="b-pane" id="hud-pane2"><h2><em>2</em>Published analysis <i>PIXL mineral map · not live detection</i></h2>
          <div class="b-frame"><img id="hud-pixl" src="${assetUrl('/data/reference/pia26640_pixl_cheyava_falls.jpg')}" alt="PIXL mineral map PIA26640" />
            <div class="b-legend" id="hud-legend2"><div>Legend <small>NASA caption · swatches approximate</small></div>
              <div><span class="sw" style="background:linear-gradient(90deg,#8d4fb8,#e06ad0)"></span>purple·pink <b>vivianite</b><small>hydrated iron phosphate</small></div>
              <div><span class="sw" style="background:linear-gradient(90deg,#b9a43c,#7fbf3a)"></span>dull yellow·green <b>greigite</b><small>iron sulfide</small></div>
              <div><small>1 mm scale bar is in the original figure. Red background and black squares are not explained in the caption.</small></div></div></div>
          <div class="b-meta"><b>PIA26640</b> · PIXL · released 2025-09-10 · NASA/JPL-Caltech<br><span class="tag">instrument analysis</span> <span class="tag none">registration with ① not verified</span></div></section>
        <section class="b-pane" id="hud-pane3"><h2><em>3</em>Astronaut's new record <i>this Marswalk</i></h2>
          <div class="b-frame new">${shot ? `<img id="hud-shot" src="${shot.frame}" alt="Simulated view capture" />` : '<span class="empty">No record yet<br>a simulated view is saved on match, sample record or photo mark</span>'}<span class="simlabel" id="hud-shot-label">Simulated view · not a real observation</span></div>
          <div class="b-meta" id="hud-shot-meta">${shot ? recLine(shot) + `<br><span class="tag">simulated position·time·dose</span> no analysis or judgement` : '<span class="tag">simulated</span> time, position and dose are added to each record'}</div></section>
      </div>
      <div class="b-plan" id="hud-b-plan">POV match package: ${pkgOk() ? `plan v${pk.planVersion} · r${pk.rev} · ${pk.lines.length} lines · ${pk.targets.length} planned sampling points` : 'none'} · POV match: ${cr.result === 'match' ? `astronaut confirmed Match T+${fmtT(cr.at)}` : cr.result === 'mismatch' ? `astronaut reported No match T+${fmtT(cr.at)}` : cr.result ? 'photo comparison only' : 'not done yet'}</div>
      <div class="b-notice" id="hud-b-notice">Map colours show mineral distribution. They are not how the rock looks, and they are not a helmet analysis of this site.</div>
      <div class="b-items" id="hud-b-items">${OBS_ITEMS.map(item).join('')}</div>
      <div class="b-opts" id="hud-b-opts">${acts.map((a, i) => `<span class="hud-item${i === hud.ui.sel ? ' sel' : ''}" data-act="${a.id}">${i === hud.ui.sel ? '▶ ' : ''}${a.label}</span>`).join('')}<span class="keys">Button 2 ${key('2')} next · button 1 ${key('1')} select</span></div>
      <div class="b-foot" id="hud-b-foot">A potential biosignature is not a confirmation of life. Non-biological explanations have not been ruled out (NASA release 2025-09-10). Answers are the astronaut's visual records, not judgements or scores.</div>`;
  }

  /**
   * Task card overflow (joint demo feedback 2026-11-15): the card has a fixed height between the compass and NAVIGATION, so a long list used to be
   * cut off silently (Start return or the choices missing). When it does not fit: 1) hide pictures and source lines, 2) compact rows, 3) show only the
   * items around the highlighted one plus Start return, with a "▲/▼ n more" line. Re-fitted whenever the card is redrawn or the window is resized.
   */
  function fitCard() {
    const c = $('#hud-card'); if (c.classList.contains('hidden') || !c.firstElementChild) return;
    const wh = innerWidth + 'x' + innerHeight; if (c.firstElementChild.dataset.fitted === '1' && c.dataset.fitWh === wh) return;
    c.dataset.fitWh = wh; c.firstElementChild.dataset.fitted = '1'; c.classList.remove('fit1', 'fit2');
    const max = parseFloat(getComputedStyle(c).maxHeight) || c.clientHeight, over = () => c.scrollHeight > max + 1;
    if (over()) c.classList.add('fit1'); if (over()) c.classList.add('fit2'); if (!over()) return;
    const items = [...c.querySelectorAll('.hud-menu .hud-item')]; if (items.length < 3) return;
    const sel = Math.max(0, items.findIndex((e) => e.classList.contains('sel'))), keep = (i) => i === sel || items[i].dataset.act === 'return';
    const more = document.createElement('div'); more.className = 'fx-more'; items[items.length - 1].parentElement.after(more);
    const hidden = new Set(), label = () => { const up = [...hidden].filter((i) => i < sel).length, dn = [...hidden].filter((i) => i > sel).length; more.textContent = `${up ? `▲ ${up}` : ''}${up && dn ? ' · ' : ''}${dn ? `▼ ${dn}` : ''} more · button 2 to move`; };
    for (let d = items.length; d > 0 && over(); d--) { // drop the item farthest from the highlight first (below before above), never the highlight or Start return
      let far = -1; for (let i = 0; i < items.length; i++) if (!hidden.has(i) && !keep(i) && (far < 0 || Math.abs(i - sel) > Math.abs(far - sel) || (Math.abs(i - sel) === Math.abs(far - sel) && i > far))) far = i;
      if (far < 0) break; hidden.add(far); items[far].classList.add('off'); label(); }
    if (!hidden.size) more.remove();
  }
  /** HUD line projection: planned lines + target marks fixed on the visor, a centre reticle, green once the gaze is on the rock. */
  let linesKey = '';
  function drawLines(L) {
    const on = !!L && L.lines.length > 0; linesEl.classList.toggle('hidden', !on); if (!on) { linesKey = ''; return; }
    const al = !!(ui.field && ui.field.aligned), W = innerWidth, H = innerHeight, k = W + 'x' + H + al + L.lines.length + ':' + L.lines[0][0].map((v) => v.toFixed(0)).join(); if (k === linesKey) return; linesKey = k;
    const col = al ? '#71eaff' : '#ffffff', path = (l) => l.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    linesEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    linesEl.innerHTML = `${L.lines.map((l) => `<path d="${path(l)}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><path d="${path(l)}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"${al ? '' : ' stroke-dasharray="10 6"'}/>`).join('')}
      ${L.targets.map((q) => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="13" fill="none" stroke="${col}" stroke-width="2.4"/><circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3" fill="${col}"/>`).join('')}
      <image href="${KIT}reticle_circle.webp" x="${W / 2 - 66}" y="${H / 2 - 54}" width="132" height="108" opacity="${al ? 1 : .75}" preserveAspectRatio="xMidYMid meet"/>
      <text x="${W / 2}" y="${H / 2 + 76}" text-anchor="middle" fill="${col}" font-size="15" font-weight="600" stroke="#000" stroke-width="3" paint-order="stroke">${al ? 'Aligned · button 1 to confirm match' : 'Turn your head to lay the lines on the rock outline'}</text>`;
  }

  return {
    ui, ext, command, talk, parseCommand, sync, openView, photoButton: () => doPhoto('button'), memoButton,
    /** Suit button 3: the mission card's third button when the card is up, otherwise the camera. */
    button3: () => mc.press(3, true) || doPhoto('button'),
    release: (n) => mc.press(n, false), wantsLines: () => mc.wantsLines(),
    /** ?review only: open the typed command field (the grammar in voice.js) for checking; it is never crew input. */
    reviewCommands: REVIEW ? () => { showVoice(true); ui.voiceT = 0; set('#hud-voice-state', 'Review text command (?review)'); voiceIn.focus(); } : null,
    /** Call once per frame BEFORE hud.update(): `field` = alignment metrics of the 3D view (or null). */
    pre({ field, lines, proj }) { ui.field = field || null; projFn = proj || null; sync(); drawLines(lines || null); },
    /** Call once per frame AFTER hud.update(). */
    post(dt, lookYaw = null) {
      { const ba = el.querySelector('.hk-basearrow'); if (ba && lookYaw !== null) { const d = (r) => ((r * 180 / Math.PI) % 360 + 360) % 360, rel = ((d(-mission.baseBearing().yaw) - d(-lookYaw) + 540) % 360) - 180; ba.style.transform = `rotate(${rel.toFixed(0)}deg)`; } } // BASE row arrow: where the base lies relative to the head (same rule as the compass base marker)
      if (ui.flashT > 0) { ui.flashT -= dt; if (ui.flashT <= 0) { ui.flash = ''; noteEl.classList.add('hidden'); } }
      if (ui.voiceOpen && ui.voiceT > 0) { ui.voiceT -= dt; if (ui.voiceT <= 0 && document.activeElement !== voiceIn) showVoice(false); }
      // getting off at arrival starts the on-site tasks (2026-11-15 user request): no separate Confirm arrival step once the crew is on foot at the stop
      if (st.phase === 'arrived' && st.transport === 'foot' && !mission.activeAlert()) { // getting off at arrival auto-acknowledges plan and package (2026-11-15 user request: the task box first; alerts still come first)
        if (st.planTx && st.planTx.receivedAt !== null && st.planTx.ackAt === null) mission.ackPlan();
        if (st.pkg && st.pkg.receivedAt !== null && st.pkg.ackAt === null) mission.ackPackage();
        if (!ext.overlayActions()) mission.confirmArrival(); }
      mc.update(projFn);
      { const lp = el.querySelector('.lg-photo'), lm = el.querySelector('.lg-memo'); if (lp) lp.classList.toggle('hidden', !planned('photo')); if (lm) lm.classList.toggle('hidden', !planned('memo')); } // key bar: only the tasks in the plan
      fitCard();
      { const d = $('#hud-detail'); if (d && !d.classList.contains('hidden')) { const wh = innerWidth + 'x' + innerHeight; if (d.dataset.fitWh !== wh) { d.dataset.fitWh = wh; d.classList.remove('fit1'); const max = parseFloat(getComputedStyle(d).maxHeight) || d.clientHeight; if (d.scrollHeight > max + 1) d.classList.add('fit1'); } } else if (d) d.dataset.fitWh = ''; } // detail layer: when it does not fit, the source/limit lines go, never a half row
      const card = $('#hud-card'), board = st.phase === 'onsite' && ui.view === 'board' && !hud.ui.memoOpen && !ext.overlayActions();
      el.classList.toggle('has-card', !card.classList.contains('hidden')); el.classList.toggle('has-board', board); boardEl.classList.toggle('hidden', !board);
      planEl.classList.toggle('hidden', !!(st.planTx && st.planTx.receivedAt !== null) || st.phase === 'ended');
      if (board) renderBoard(hud.actions());
      { // fixed status band: add this module's open alerts to the count the existing HUD wrote (it only knows its own cautions)
        const open = st.alerts.filter((x) => x.receivedAt !== null && (x.ackAt === null || !x.resolvedAt)), e = $('#hud-alerts');
        if (open.length) { const t = e.textContent, tl = mission.turnaroundLeft(), dup = open.some((x) => x.kind === 'turnaround') && st.returnStartedAt === null && tl >= 0 && tl < 120 ? 1 : 0; // the old HUD already counts the turnaround caution
          const w = (+(t.match(/Warning (\d+)/) || [0, 0])[1]) + open.filter((x) => x.level === 'warning').length, c = (+(t.match(/Caution (\d+)/) || [0, 0])[1]) + open.filter((x) => x.level === 'caution').length - dup;
          e.textContent = w ? `Warning ${w} · Caution ${c}` : `Caution ${c}`; e.className = w ? 'warning' : 'caution'; } }
      { const r = $('#hud-route'), d = r.textContent === '◀' ? 'left' : r.textContent === '▶' ? 'right' : ''; if ((r.dataset.dir || '') !== d) { if (d) r.dataset.dir = d; else delete r.dataset.dir; } } // kit side arrows when the route is off the compass scale
      { // en-route brief (joint demo feedback item 5): what happens at the destination and why, in one or two short sentences. Not a real-operations claim.
        const moving = (st.phase === 'outbound' || st.phase === 'returning') && st.s > 0.5, blocked = !!ext.overlayActions() || hud.ui.memoOpen;
        briefEl.classList.toggle('hidden', !moving || blocked);
        if (moving && !blocked) {
          const t = st.planTx, todos = (t ? t.todos : st.planDraft.todos.filter((x) => x.on)).map((x) => x.name.split(' · ')[0]), left = st.route.length - st.s, base = st.route.stats.indoorM;
          const auto = st.autoGo ? `Auto-advance${st.autoDir < 0 ? ' backwards' : ''} on` : st.autoOff ? 'Auto-advance stopped' : st.transport === 'foot' && st.leftRoverAt !== null ? 'Got off rover · board again to auto-advance' : st.phase === 'outbound' && st.s < base + 4 ? `Leave the habitat with ${key('W')}: ${((t ? t.transport : st.planDraft.transport) === 'rover') ? 'you board the rover and ' : ''}the route continues to the destination by itself` : '';
          const text = st.phase === 'returning' ? `Returning · ${mission.returnLeft().toFixed(0)} m to habitat. At the habitat ramp, button 1 ends the Marswalk and records are sent to the habitat.`
            : left < 40 ? `Arriving soon (${left.toFixed(0)} m). On arrival, button 1 confirms arrival → POV match comes first. Auto-advance stops at arrival.`
            : `After arrival: ${todos.slice(0, 3).join(' → ')}${todos.length > 3 ? ' …' : ''} (${todos.length} tasks). Find the planned sampling points against the planning image, then record position and time.`;
          setH2('#hud-brief-auto', auto ? `<span>${auto}</span>` : ''); // one inline span: the flex row holds the chevron + this text, so the key cap does not split the sentence into columns set('#hud-brief-text', text); $('#hud-brief-auto').classList.toggle('hidden', !auto);
        }
      }
      if (st.buddyAway) { set('#hud-buddy', st.buddyGap.toFixed(1) + ' m'); $('#hud-buddy').className = st.buddyGap > FIELD.buddyWarnM ? 'caution' : ''; } // simulated incident: the buddy is no longer riding along
      { const h = $('#hud-hint'); if (st.autoGo) { if (h.dataset.fxAuto !== h.dataset.h) { h.dataset.fxAuto = h.dataset.h; h.innerHTML = ''; h.classList.add('quiet'); } } else if (h.dataset.fxAuto) { h.dataset.fxAuto = ''; h.dataset.h = ''; } } // no key hints while the route runs by itself (the key bar below still lists every key)
      { const h = $('#hud-hint'); if (st.phase === 'onsite' && !hud.ui.memoOpen && h.dataset.fxFor !== h.dataset.h) { h.dataset.fxFor = h.dataset.h; h.innerHTML = 'The return starts only with "Start return"'; } else if (st.phase !== 'onsite') h.dataset.fxFor = ''; }
      if (st.phase === 'onsite') { // live values on whichever card is showing
        const f = ui.field, n = mission.interestCount(), L = mission.stayLeft(); set('#hud-stay', fmtT(Math.abs(L)));
        if (f && $('#hud-align')) { set('#hud-align', f.aligned ? 'Aligned · match can be confirmed' : 'Not aligned · look at the rock'); $('#hud-align').className = f.aligned ? '' : 'caution'; set('#hud-gaze', `Gaze error ${f.gazeErrDeg.toFixed(1)}°/limit ${TOL.gazeDeg}° · view angle ${f.obliqDeg.toFixed(0)}°/limit ${TOL.obliqDeg}° · ${f.dist.toFixed(1)} m`); }
        if (n && !$('#hud-stay2')) { const row = $('#hud-stay') && $('#hud-stay').closest('.hud-row2'); if (row) row.insertAdjacentHTML('afterend', `<div class="hud-row2" id="hud-stay2row"><span>With <i id="hud-intn"></i> points of interest <small>+${FIELD.interestCostSec / 60} min each, assumption</small></span><b id="hud-stay2"></b></div>`); }
        if (n) { set('#hud-intn', String(n)); set('#hud-stay2', fmtSigned(mission.stayLeftAfterInterest())); }
      }
    },
  };
}
