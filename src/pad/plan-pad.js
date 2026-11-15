import './plan-pad.css';
import { fmtT, PLAN } from '../state/mission.js';

/**
 * Minimal planning -> departure flow on the PAD (own module; replaceable later). Enables ② Build plan, ③ Route preview,
 * ④ Departure check and makes ⑤ Marswalk status a link to the live status on Home. src/pad/pad.js only gets the `addPage` hook.
 * Every number here is simulated or an assumption and is labelled so. No space-weather data is connected (DONKI not connected).
 * Gate choice: leaving the airlock without a sent plan is NOT blocked; the HUD shows "No plan received · check with habitat".
 */
const f = (v) => (v === null || v === undefined ? '—' : 'T+' + fmtT(v));
export function installPlanPad(pad, mission, fieldPad) {
  const st = mission.st, ui = { checks: { route: false, budget: false, branch: false } };
  const dest = () => { const c = mission.candidates.find((x) => x.key === st.destKey); return { ...c, name: `${c.key} ${c.name}` }; }; // one canonical site name everywhere: "<key> <name>"
  // Thin status strip shared by every PAD page: where the data come from, the clock, and the status words OK / caution / alert / delayed / unverified (colour + text together).
  const strip = document.createElement('div'); strip.className = 'pad-strip'; strip.id = 'pad-strip'; pad.root.querySelector('.pad-top').insertAdjacentElement('afterend', strip);
  const chip = (cls, t) => `<span class="ps ps-${cls}">${t}</span>`;
  const stripLive = () => { const open = st.alerts.filter((a) => a.receivedAt !== null && (a.ackAt === null || !a.resolvedAt)), warn = open.some((a) => a.level === 'warning'), t = st.planTx;
    strip.innerHTML = `<span><em>Simulated mission</em></span><button id="pad-info-btn" class="ps-info" title="Show data sources and limits">Sources & limits ⓘ</button><span class="sp"></span>
      <span>Mission clock <b>T+${fmtT(mission.baseView().sim)}</b></span><span>Comm link ${st.comm.up ? chip('ok', 'OK') : chip('late', 'delayed')} last received T+${fmtT(st.comm.lastRx)}</span><span>Alerts ${open.length ? (warn ? chip('alarm', `alert ${open.length}`) : chip('cau', `caution ${open.length}`)) : chip('ok', 'OK')}</span><span>Plan ${!t ? chip('unk', 'unverified · not sent') : t.ackAt === null ? chip('unk', 'unverified · not acknowledged') : chip('ok', `OK · v${t.planVersion} acknowledged`)}</span>`; };
  stripLive(); setInterval(stripLive, 500);
  // UI tidy (rendering review): source/limit sentences are on demand. The long footer opens from the "Sources & limits" button in the strip, and
  // each card note is one line until clicked. Nothing is deleted; the evidence-grade caveat (#fp-evnote) stays fully visible.
  const foot = pad.root.querySelector('.pad-foot'); if (foot) { foot.classList.add('pad-foot-ondemand'); foot.insertAdjacentHTML('afterbegin', '<b>Measured</b> HiRISE/CTX terrain, M20 drive path, sol 1215 Hazcam mesh, sol 1176 Navcam mesh &nbsp;|&nbsp; <b>Computed</b> route length · slope &nbsp;|&nbsp; <b>Estimated</b> sample points A/B (raw metadata) &nbsp;|&nbsp; <b>Simulated</b> clock · oxygen · dose · astronaut position · alerts &nbsp;|&nbsp; '); }
  strip.addEventListener('click', (ev) => { if (ev.target.closest('#pad-info-btn') && foot) foot.classList.toggle('open'); });
  pad.root.addEventListener('click', (ev) => { const n = ev.target.closest('.pad-note'); if (n && !ev.target.closest('button, input, a')) n.classList.toggle('open'); });
  const moveSel = (id) => `<select id="${id}" class="pp-text" style="width:auto"><option value="foot" ${st.planDraft.transport === 'foot' ? 'selected' : ''}>On foot 1.4 m/s (simulated · no rover)</option><option value="rover" ${st.planDraft.transport === 'rover' ? 'selected' : ''}>Rover 3.5 m/s (simulated)</option></select>`;
  const budgetHtml = () => { const b = mission.planBudget(); return `<dl>
      <dt>Transport assumption</dt><dd>${moveSel('pp-transport')} <small>both simulated speeds · the simulated astronaut moves by this assumption</small></dd>
      <dt>One-way travel</dt><dd id="pp-travel">${b.outM.toFixed(0)} m ÷ ${b.speed} m/s = ${fmtT(b.travelSec)} <small>(${b.transportLabel} assumption)</small></dd>
      <dt>Task total</dt><dd id="pp-stay">${fmtT(b.staySec)} <small>(TODO total below = planned stay time)</small></dd>
      <dt>Turnaround time</dt><dd id="pp-turn">T+${fmtT(b.turnaroundSec)} <small>latest return start · not the habitat arrival time (travel + tasks + 3 min margin, rounded up to minutes · simulated)</small></dd>
      <dt>Total time</dt><dd>${fmtT(b.totalSec)} <small>(turnaround time + return travel = expected habitat arrival)</small></dd>
      <dt>Oxygen budget</dt><dd id="pp-o2">use ${b.o2Use.toFixed(1)} % → ${b.o2AtReturn.toFixed(1)} % left on return <small>(${PLAN.o2PctPerMin} %/min simulated model · load not included)</small></dd>
      <dt>Space weather</dt><dd><span class="pad-tag unk" style="margin:0">DONKI not connected · simulated</span> <small>No real data was queried. No basis for choosing a departure window.</small></dd></dl>`; };
  const txHtml = () => { const t = st.planTx, p = st.pkg; return `<span class="st ${t ? 'on' : ''}" id="pp-st-conf" title="${t ? `Plan v${t.planVersion} · send #${t.rev}` : ''}">Confirmed ${t ? f(t.confirmedAt) + ` · decision maker ${t.decider.replace(/[<>&]/g, '')}` : '—'}</span><span class="st ${t ? 'on' : ''}" id="pp-st-sent">Sent ${t ? f(t.sentAt) : '—'}</span><span class="st ${t && t.receivedAt !== null ? 'on' : ''}" id="pp-st-rx">HUD received ${t ? f(t.receivedAt) : '—'}</span><span class="st ${t && t.ackAt !== null ? 'on' : ''}" id="pp-st-ack">Acknowledged ${t ? f(t.ackAt) : '—'}</span><span class="st ${p && !p.stale ? 'on' : ''}" id="pp-st-pkg">POV match package ${p ? (p.stale ? 'for an earlier plan → does not fit current plan · send again' : `sent ${f(p.sentAt)} · received ${f(p.receivedAt)} · acknowledged ${f(p.ackAt)}`) : 'not sent'}</span>`; };
  pad.addPage('plan', (main) => {
    main.innerHTML = `<div class="pad-grid2"><section class="pad-card"><h3>Task list (TODO) <small>${dest().name} · default durations are assumptions · editable</small></h3>
        <table class="pad-table" id="pp-todos">${st.planDraft.todos.map((t) => `<tr><td><input type="checkbox" data-todo="${t.id}" ${t.on ? 'checked' : ''}/></td><td>${t.name}</td><td><input type="number" min="0" max="60" value="${t.min}" data-min="${t.id}" class="pp-min"/> min</td></tr>`).join('')}</table>
        <p class="pad-note">On confirm, the total becomes the planned stay time and the computed turnaround time (latest return start) goes to the HUD. Points of interest the astronaut adds in the field are not listed here.</p></section>
      <section class="pad-card"><h3>Budget · turnaround time <span class="pad-tag sim">simulated · assumption</span></h3><div id="pp-budget">${budgetHtml()}</div>
        <p class="pad-note">Not a verified consumables model. Computed only from route length, assumed speed and task time.</p><div style="display:flex;gap:8px;margin-top:14px"><button class="pad-pick" id="pp-prev" style="margin:0">← ① Choose site</button><button class="pad-primary" id="pp-next" style="margin:0">Next → ③ Route preview</button></div></section></div>`;
    main.querySelector('#pp-prev').addEventListener('click', () => pad.show('site'));
    main.querySelector('#pp-todos').addEventListener('change', (ev) => { const t = ev.target; if (t.dataset.todo) mission.setPlanTodo(t.dataset.todo, { on: t.checked }); if (t.dataset.min) mission.setPlanTodo(t.dataset.min, { min: t.value }); main.querySelector('#pp-budget').innerHTML = budgetHtml(); });
    main.querySelector('#pp-budget').addEventListener('change', (ev) => { if (ev.target.id === 'pp-transport') { mission.setPlanTransport(ev.target.value); main.querySelector('#pp-budget').innerHTML = budgetHtml(); } });
    main.querySelector('#pp-next').addEventListener('click', () => pad.show('route'));
  });
  pad.addPage('route', (main) => { const rs = st.route.stats;
    main.innerHTML = `<div class="pad-site"><div class="pad-mapwrap"><canvas id="pp-map" width="600" height="600"></canvas></div><div class="pad-side">
        <section class="pad-card tight"><h3>Route <small>${dest().name}</small></h3><dl><dt>One way / round trip</dt><dd>${rs.oneWayM.toFixed(0)} m / ${(rs.oneWayM * 2).toFixed(0)} m</dd><dt>Max slope</dt><dd>${rs.maxSlopeDeg.toFixed(1)}° <small>(5 m segments · 1 m DTM)</small></dd>
          <dt>Basis</dt><dd>${rs.traverseM.toFixed(0)} m on the real Perseverance drive path <small>· not verified for astronaut walking or crewed rover safety</small></dd><dt>Comm link</dt><dd><span class="pad-tag unk" style="margin:0">assumption</span> <small>assumed available on the whole route · no line-of-sight calculation</small></dd><dt>Detour</dt><dd><small>no obstacle detour generated · the real drive path is used as is</small></dd></dl></section>
        <section class="pad-card tight"><h3>POV match package</h3><div class="fp-state" id="pp-pkg"></div><button class="pad-pick" id="pp-openpkg" style="margin:8px 0 0">Open POV match package builder</button><p class="pad-note">If not sent yet, it is sent with the plan in ④ using the default sample point (B, estimated).</p></section>
        <section class="pad-card tight"><div style="display:flex;gap:8px"><button class="pad-pick" id="pp-prev2" style="margin:0">← ② Build plan</button><button class="pad-primary" id="pp-next2" style="margin:0">Next → ④ Departure check</button></div></section></div></div>`;
    pad.drawMap(main.querySelector('#pp-map')); main.querySelector('#pp-openpkg').addEventListener('click', () => { fieldPad.setOpen(true); fieldPad.show('pkg'); }); main.querySelector('#pp-next2').addEventListener('click', () => pad.show('go')); main.querySelector('#pp-prev2').addEventListener('click', () => pad.show('plan')); main.querySelector('#pp-pkg').innerHTML = txHtml();
  }, (main) => { const e = main.querySelector('#pp-pkg'); if (e) e.innerHTML = txHtml(); const cv = main.querySelector('#pp-map'); if (cv) pad.drawMap(cv); });
  // ④ Final review (UI friction review item 5): one screen gathers the route, tasks, simulated time/oxygen budget, departure checks and the
  // decision-maker; task minutes and the sampling point are edited only when unfolded. ONE primary action confirms the plan and starts the
  // controller run. Internally the plan send, the package for the same plan version, HUD receipt and the simulated departure stay separate states.
  const sendAll = async (opts = {}) => { if (!mission.sendPlan(opts.decider || st.planDraft.decider, opts)) return false; if (!st.pkg || st.pkg.stale || (st.pkg.planVersion !== st.planTx.planVersion && (st.pkg.ackAt === null || !st.departed))) { await fieldPad.ready; const d = fieldPad.ui.draft || fieldPad.extract(); if (fieldPad.ui.targets.length) mission.sendPackage({ lines: d.polylines, hash: d.hash, detail: fieldPad.ui.detail, targets: fieldPad.ui.targets, auto: !!opts.auto }); } pad.refresh(); return true; }; // before departure the package always matches the plan version that was sent; a package the crew already confirmed in the field is not replaced by a re-send
  /**
   * Astronaut starts directly (joint demo feedback 2026-11-15): when the crew goes out without the controller's preparation, the current draft plan
   * and the line-projection package (default target B) are prepared for the CURRENT plan version and marked "auto-prepared for demo". Nobody is
   * recorded as having confirmed or sent them; the controller's own send path is unchanged and a plan the controller already sent is kept.
   */
  const DEMO_DECIDER = 'Auto-prepared for demo (not a human decision)';
  const ensureDemoPlan = async () => { if (st.planTx && st.planTx.planVersion === st.planVersion && st.pkg && st.pkg.planVersion === st.planVersion && !st.pkg.stale) return false; if (st.departed || ['returning', 'atBase', 'ended'].includes(st.phase)) return false; const ok = await sendAll({ auto: true, decider: DEMO_DECIDER }); pad.refresh(); return ok; };
  /** Next Marswalk: closes the finished EVA's state (kept in the archive) and opens planning for the next one. */
  const nextEva = () => { if (!mission.beginNextEva()) return false; ui.checks = { route: false, budget: false, branch: false }; pad.show('go'); return true; };
  pad.ui.onNextEva = nextEva; // PAD Home button
  const nextEvaBtn = (id) => (st.phase === 'ended' ? `<button class="pad-primary" id="${id}" style="margin:0">Plan next Marswalk → EVA ${st.evaNo + 1}</button>` : '');
  const blockers = () => { const m = []; const left = ['route', 'budget', 'branch'].filter((k) => !ui.checks[k]).length; if (left) m.push(`${left} pre-departure checks left`); if (!st.planDraft.decider.trim()) m.push('no decision maker entered'); if (st.phase === 'ended') m.push('Marswalk ended · press "Plan next Marswalk" below (earlier records are kept)'); else if (['returning', 'atBase'].includes(st.phase)) m.push('Marswalk is returning · end it at the habitat to plan the next one'); return m; };
  pad.addPage('go', (main) => { const rs = st.route.stats;
    main.innerHTML = `<div class="pad-grid2 pp-review"><section class="pad-card"><h3>Final review <small>${dest().name}</small></h3>
        <dl><dt>Route</dt><dd>one way ${rs.oneWayM.toFixed(0)} m · max slope ${rs.maxSlopeDeg.toFixed(1)}° <span class="pad-tag" style="margin:0">computed</span> · comm link <span class="pad-tag unk" style="margin:0">assumption</span></dd>
          <dt>Tasks</dt><dd id="pp-tasksum"></dd><dt>Transport assumption</dt><dd><span id="pp-movesum"></span> ${moveSel('pp-transport4')}</dd><dt>Time · oxygen</dt><dd id="pp-budsum"></dd><dt>Sample point</dt><dd id="pp-tgtsum"></dd></dl>
        <details class="pp-edit" id="pp-edit-tasks"><summary>Expand to edit task times</summary><table class="pad-table" id="pp-todos">${st.planDraft.todos.map((t) => `<tr><td><input type="checkbox" data-todo="${t.id}" ${t.on ? 'checked' : ''}/></td><td>${t.name}</td><td><input type="number" min="0" max="60" value="${t.min}" data-min="${t.id}" class="pp-min"/> min</td></tr>`).join('')}</table></details>
        <details class="pp-edit" id="pp-edit-target"><summary>Expand to edit sample point</summary><p class="pp-inline">You can mark sample points on the planning image. If you do not, the default B (core sample area · estimated from raw metadata) is used.</p><button class="pad-pick" id="pp-openpkg" style="margin:0">Edit points on planning image</button></details></section>
      <section class="pad-card"><h3>Pre-departure check · confirm <span class="pad-tag sim">simulated</span></h3>
        <label class="pad-check pp-chk"><input type="checkbox" data-chk="route" ${ui.checks.route ? 'checked' : ''}/> Route checked</label>
        <label class="pad-check pp-chk"><input type="checkbox" data-chk="budget" ${ui.checks.budget ? 'checked' : ''}/> Time · oxygen budget checked</label>
        <label class="pad-check pp-chk"><input type="checkbox" data-chk="branch" ${ui.checks.branch ? 'checked' : ''}/> 3 contingency plans agreed <small>turnaround time reached → start return · comm loss → recovery point, return · alert → return together</small></label>
        <div class="fp-row" style="margin-top:8px"><span>Decision maker</span><input id="pp-decider" class="pp-text" maxlength="24" placeholder="e.g. Alex Kim" value="${st.planDraft.decider.replace(/"/g, '')}"/></div>
        <div class="pp-actions"><button class="pad-primary" id="pp-start" style="margin:0">Confirm plan and start Marswalk</button><span class="pp-why" id="pp-why"></span></div><div class="pp-actions" id="pp-nexteva-row">${nextEvaBtn('pp-nexteva')}</div>
        <div class="fp-state" id="pp-tx" style="margin-top:8px"></div>
        <div class="pp-actions"><button class="pad-pick" id="pp-prev3" style="margin:0">← ① Site · route</button><button class="pad-pick" id="pp-send" style="margin:0">Send plan only (astronaut departs)</button></div>
        <p class="pad-note">On confirm, the plan and POV match package go to the HUD and the simulated astronaut leaves from the airlock exit. Sent · HUD received · acknowledged · departure are logged separately. To walk out yourself, use "Send plan only", then Switch role → Surface Astronaut.</p></section></div>`;
    const q = (i) => main.querySelector(i);
    const sync = () => { const b = mission.planBudget(), on = st.planDraft.todos.filter((t) => t.on), why = blockers();
      q('#pp-tasksum').innerHTML = `${on.length} tasks · ${fmtT(b.staySec)} <small>${on.map((t) => t.name.split(' · ')[0]).join(', ')}</small>`;
      q('#pp-movesum').innerHTML = `Transport assumption: <b>${b.transportLabel}</b> · one way ${b.outM.toFixed(0)} m = ${fmtT(b.travelSec)}`;
      q('#pp-budsum').innerHTML = `Turnaround time T+${fmtT(b.turnaroundSec)} <small>(latest return start)</small> · expected habitat arrival ${fmtT(b.totalSec)} · oxygen on return ${b.o2AtReturn.toFixed(1)} % <span class="pad-tag sim" style="margin:0">simulated</span>`;
      q('#pp-tgtsum').innerHTML = fieldPad.ui.targets.length && fieldPad.ui.targets[0].preset ? 'Default B · core sample area <span class="pad-tag unk" style="margin:0">estimated</span>' : `${fieldPad.ui.targets.length} points marked by the planner`;
      q('#pp-why').textContent = why.length ? 'Cannot start yet: ' + why.join(' · ') : st.departed ? 'Already departed · press to resend the plan and open the status view' : 'Ready'; q('#pp-why').classList.toggle('bad', why.length > 0);
      q('#pp-start').textContent = st.departed ? 'Confirm plan and view status' : 'Confirm plan and start Marswalk'; { const r = q('#pp-nexteva-row'), h = nextEvaBtn('pp-nexteva'); if (r.dataset.h !== h) { r.dataset.h = h; r.innerHTML = h; } } q('#pp-start').classList.toggle('blocked', why.length > 0); q('#pp-tx').innerHTML = txHtml(); };
    main.querySelectorAll('[data-chk]').forEach((c) => c.addEventListener('change', () => { ui.checks[c.dataset.chk] = c.checked; if (c.checked) c.closest('label').classList.remove('need'); sync(); }));
    q('#pp-decider').addEventListener('input', (e) => { st.planDraft.decider = e.target.value; if (e.target.value.trim()) e.target.classList.remove('need'); sync(); });
    q('#pp-todos').addEventListener('change', (ev) => { const t = ev.target; if (t.dataset.todo) mission.setPlanTodo(t.dataset.todo, { on: t.checked }); if (t.dataset.min) mission.setPlanTodo(t.dataset.min, { min: t.value }); sync(); });
    q('#pp-transport4').addEventListener('change', (e) => { mission.setPlanTransport(e.target.value); sync(); });
    q('#pp-openpkg').addEventListener('click', () => { fieldPad.setOpen(true); fieldPad.show('pkg'); });
    q('#pp-prev3').addEventListener('click', () => pad.show('site'));
    const blocked = () => { const why = blockers(); if (!why.length) return false; const w = q('#pp-why'); w.classList.remove('flash'); void w.offsetWidth; w.classList.add('flash'); main.querySelectorAll('[data-chk]').forEach((c) => c.closest('label').classList.toggle('need', !c.checked)); q('#pp-decider').classList.toggle('need', !st.planDraft.decider.trim()); return true; }; // never a silent dead end: say why, next to the button
    const autoFill = () => { ['route', 'budget', 'branch'].forEach((k) => { ui.checks[k] = true; }); main.querySelectorAll('[data-chk]').forEach((c) => { c.checked = true; c.closest('label').classList.remove('need'); }); if (!st.planDraft.decider.trim()) { st.planDraft.decider = 'Alex Kim'; q('#pp-decider').value = 'Alex Kim'; } }; // demo: confirming the plan marks the departure checks done and uses the example decision-maker if empty
    q('#pp-start').addEventListener('click', async () => { autoFill(); if (blocked()) return; if (!(await sendAll())) return; if (!st.departed) mission.padStart(); pad.show('ctl'); });
    q('#pp-send').addEventListener('click', async () => { autoFill(); if (blocked()) return; await sendAll(); sync(); });
    main.addEventListener('click', (ev) => { if (ev.target.closest('#pp-nexteva')) nextEva(); });
    sync();
  }, (main) => { const e = main.querySelector('#pp-tx'); if (e) e.innerHTML = txHtml(); });
  // ⑤ Marswalk status: live view for the planner. Values come from mission.baseView(): live while the link is up, the last received snapshot while it is down.
  const PH = { outbound: 'Outbound', arrived: 'At destination · not confirmed', onsite: 'Working on site', returning: 'Returning', atBase: 'At habitat · not ended', ended: 'Marswalk ended' };
  const ctlLive = (main) => { const q = (i) => main.querySelector(i); if (!q('#pc-owner')) return; const v = mission.baseView(), r = st.remote;
    q('#pc-owner').textContent = !st.departed ? 'Before departure · nothing running' : st.control === 'hud-manual' ? 'Human astronaut · manual HUD control' : st.control === 'pad-auto' ? 'Simulated astronaut auto-advance · demo answers' + (st.warp > 1 ? ` · speed ×${st.warp} (shorter demo time)` : '') : 'Stopped';
    q('#pc-phase').textContent = (st.departed ? PH[st.phase] : 'In habitat · before EVA departure') + (v.stale ? ' (may be the last state before comm loss)' : '');
    q('#pc-clock').textContent = `T+${fmtT(v.sim)}${v.stale ? ' · last received value' : ''}`; q('#pc-pos').textContent = `${v.s.toFixed(0)} / ${st.route.length.toFixed(0)} m · ${v.transport === 'rover' ? 'rover' : 'on foot'}`; q('#pc-o2').textContent = v.o2.toFixed(1) + ' %';
    q('#pc-comm').textContent = (st.comm.up ? 'Comm link OK' : 'Comm loss — values shown are from the last reception') + ` · last received T+${fmtT(st.comm.lastRx)}`;
    q('#pc-tx').innerHTML = txHtml() + (r ? `<span class="st on">Return instruction sent ${f(r.sentAt)} · received ${f(r.receivedAt)} · acknowledged ${f(r.ackAt)} · executed ${r.declined ? 'hold' : f(r.executedAt)}</span>` : '') + st.alerts.map((a) => `<span class="st on">${a.title}: received ${f(a.receivedAt)} · acknowledged ${f(a.ackAt)} · choice ${a.choice ? (a.choice === 'return' ? 'return ' : 'continue ') + f(a.choiceAt) : '—'} · executed ${f(a.executedAt)}</span>`).join('');
    const log = st.script.log, sig = log.length + '/' + st.records.filter((x) => x.sent).length; const ol = q('#pc-log'); if (ol.dataset.sig !== sig) { ol.dataset.sig = sig; ol.innerHTML = log.length ? [...log].reverse().map((l) => `<li>T+${fmtT(l.t)} · ${l.text} <small>demo answer · simulated astronaut</small></li>`).join('') : '<li class="dim">None yet · actions a person makes in the HUD are not listed here (see the field records table)</li>'; }
    q('#pc-view-note').textContent = st.habitatPose ? 'The astronaut is in the habitat · switch to indoor walking' : 'You can also click the blue dot (astronaut) on the map · the simulated astronaut stops and a person takes over'; q('#pc-warp').textContent = st.autoWarp > 1 ? `Speed ×${st.autoWarp} off` : 'Speed ×4 on (or hold Shift)'; q('#pc-remote').disabled = !st.departed || ['returning', 'atBase', 'ended'].includes(st.phase); q('#pc-wx').disabled = !st.departed || st.phase === 'ended'; { const r = q('#pc-nexteva-row'), h = nextEvaBtn('pc-nexteva'); if (r && r.dataset.h !== h) { r.dataset.h = h; r.innerHTML = h; } } const cv = q('#pc-map'); if (cv) pad.drawMap(cv); };
  pad.addPage('ctl', (main) => {
    main.innerHTML = `<div class="pad-site"><div class="pad-mapwrap"><canvas id="pc-map" width="600" height="600"></canvas></div><div class="pad-side">
        <section class="pad-card tight"><h3>Marswalk status <span class="pad-tag sim">simulated mission clock</span></h3><dl><dt>Driven by</dt><dd id="pc-owner"></dd><dt>Phase</dt><dd id="pc-phase"></dd><dt>Mission clock</dt><dd id="pc-clock"></dd><dt>Position · transport</dt><dd id="pc-pos"></dd><dt>Oxygen</dt><dd id="pc-o2"></dd><dt>Comm link</dt><dd id="pc-comm"></dd></dl>
          <span id="pc-view-note" hidden></span>
          <div class="fp-row" style="margin:8px 0 0;flex-wrap:wrap"><button class="pad-pick" id="pc-remote" style="margin:0">Send return instruction to HUD</button><button class="pad-pick" id="pc-wx" style="margin:0">Send space weather alert (simulated)</button><button class="pad-pick" id="pc-comm-btn" style="margin:0">Comm loss / restore (simulated)</button><button class="pad-pick" id="pc-warp" style="margin:0"></button></div>
          <div class="fp-row" style="margin:6px 0 0"><button class="pad-pick" id="pc-recs" style="margin:0">View field records · follow-up tasks</button><button class="pad-pick" id="pc-alerts" style="margin:0">View alert status</button></div><div class="fp-row" id="pc-nexteva-row" style="margin:6px 0 0"></div></section>
        <section class="pad-card tight"><h3>Sent · received · acknowledged · chosen · executed</h3><div class="fp-state" id="pc-tx"></div></section>
        <section class="pad-card tight grow"><h3>Astronaut answer log <span class="pad-tag sim">demo answers · simulated astronaut</span></h3><ol class="pp-log" id="pc-log"></ol>
          <p class="pad-note">The simulated astronaut only follows a fixed demo order (acknowledge → Confirm arrival → POV match: Match → observation answers → photo and sample record → return → End Marswalk). An alert or return instruction logs acknowledge → choose return → Start return separately. No verdicts are made. Switching role into the HUD stops the demo and a person takes over. The planner's keyboard cannot move the astronaut.</p></section></div></div>`;
    // Astronaut view: the button and the crew dot on the map start the same camera flight (pad.ui.onCrewView is set by src/main.js)
    const crewView = () => { if (pad.ui.onCrewView) pad.ui.onCrewView(); };
    { const cv = main.querySelector('#pc-map'), crewAt = (ev) => { const p = st.comm.up ? mission.currentPose() : mission.poseAt(st.padView.s), [mx, my] = pad.toMap(p.x, p.z), k = cv.width / cv.clientWidth; return Math.hypot(ev.offsetX * k - mx, ev.offsetY * k - my) < 20; };
      /* roles are separate: the controller view never switches into the crew's view (user decision); crew is entered only from the landing */ void crewAt; void crewView; }
    main.querySelector('#pc-remote').addEventListener('click', () => { mission.sendRemote(); ctlLive(main); }); main.querySelector('#pc-wx').addEventListener('click', () => { mission.sendWeatherAlert(); ctlLive(main); });
    main.querySelector('#pc-recs').addEventListener('click', () => { fieldPad.setOpen(true); fieldPad.show('rec'); }); main.querySelector('#pc-alerts').addEventListener('click', () => { fieldPad.setOpen(true); fieldPad.show('alert'); });
    main.addEventListener('click', (ev) => { if (ev.target.closest('#pc-nexteva')) nextEva(); });
    main.querySelector('#pc-comm-btn').addEventListener('click', () => { mission.setComm(!st.comm.up); ctlLive(main); }); main.querySelector('#pc-warp').addEventListener('click', () => { st.autoWarp = st.autoWarp > 1 ? 1 : 4; ctlLive(main); });
    ctlLive(main);
  }, ctlLive);
  return { ui, ensureDemoPlan, nextEva };
}
