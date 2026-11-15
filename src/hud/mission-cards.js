import './mission-cards.css';
import { OBS_ITEMS, REFERENCE, PLAN_IMAGE } from '../state/field-ops.js';
import { kitImg, KIT } from './hud-kit.js';

/**
 * Field mission cards (2026-11-15, user request): on site the crew does one mission at a time on one card with at most three buttons
 * (keys 1 · 2 · 3, also clickable), and a floating arrow above the mission's target in the scene points down at it.
 * Missions reuse the existing records (POV match, observation answer, memo, sample record, carry-over check); nothing here judges or detects anything.
 * Alerts, plan/package receipts and base instructions still come first (the card steps aside while they are open).
 */
const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
  cross: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  skip: '<svg viewBox="0 0 24 24"><path d="M5 6l6 6-6 6M12 6l6 6-6 6"/></svg>',
  zoom: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  q: '<svg viewBox="0 0 24 24"><path d="M9 9a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.9V15"/><circle cx="12" cy="18.5" r=".6"/></svg>',
  home: kitImg('icon_base', '', 'svg'), list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  pin: kitImg('icon_pin'), cam: kitImg('icon_camera'), mic: kitImg('icon_voice_memo'),
};

export function installMissionCards({ el, mission, st, hooks, act }) {
  const card = document.createElement('div'); card.className = 'mc-card hidden'; card.id = 'hud-mission'; el.appendChild(card);
  const arrow = document.createElement('div'); arrow.className = 'mc-target hidden'; arrow.id = 'hud-mtarget';
  arrow.innerHTML = `<span class="mc-tlabel"></span><img src="${KIT}arrow_triangle.webp" alt="" draggable="false" /><i class="mc-tdist"></i>`; el.appendChild(arrow);
  const m = { onsiteAt: null, skipped: new Set(), closed: false, zoom: false, holding: 0, key: '' };

  const nSample = () => st.records.filter((r) => r.type === 'sample').length;
  /** The mission list for this stop. done/skip decide which one is current; `steps` are the sub-steps shown as k / K. */
  function list() {
    const L = [], todos = (st.planTx ? st.planTx.todos : st.planDraft.todos.filter((t) => t.on)).map((t) => t.id), planned = (id) => todos.includes(id); // the controller's plan decides which missions there are
    if (planned('compare') && st.pkg && st.pkg.ackAt !== null) L.push({ id: 'compare', title: 'POV match', target: 'rock', tlabel: 'Rock to match', done: !!st.compare.result });
    if (planned('observe')) { const k = OBS_ITEMS.findIndex((it) => !st.observations[it.id]); L.push({ id: 'observe', title: 'Observation check', target: 'rock', tlabel: 'Observation target', steps: OBS_ITEMS.length, step: k < 0 ? OBS_ITEMS.length - 1 : k, item: OBS_ITEMS[Math.max(0, k)], done: k < 0 }); }
    if (planned('sample')) L.push({ id: 'sample', title: 'Collect sample', target: 'sample', tlabel: 'Planned sampling point', done: nSample() > 0 });
    if (planned('photo')) L.push({ id: 'photo', title: 'Photo record', target: 'rock', tlabel: 'Photo target', done: st.records.some((r) => r.type === 'photo' && r.simT >= st.onsiteSince) });
    for (const c of st.carried || []) L.push({ id: 'chk-' + c.key, carried: c, title: 'Carry-over task', target: 'rock', tlabel: 'Carry-over target', done: c.doneAt !== null });
    return L;
  }
  const current = () => list().find((x) => !x.done && !m.skipped.has(x.id)) || null;
  const blocked = () => !!(hooks.overlay() || hooks.memoOpen() || hooks.viewOpen());
  const active = () => st.phase === 'onsite' && !m.closed && !blocked();

  /** Buttons of the current mission (max 3). hold = runs on press and release (voice memo). */
  function buttons(cur) {
    const skip = (id, label = 'Skip') => ({ icon: ICON.skip, label, run: () => { m.skipped.add(id); } });
    if (!cur) return [
      { icon: ICON.home, label: 'Start return', run: () => mission.startReturn() },
      { icon: ICON.pin, label: 'Add point of interest', run: () => act.interest() },
      { icon: ICON.list, label: 'Task list', run: () => { m.closed = true; } },
    ];
    if (cur.id === 'compare') return [
      { icon: ICON.check, label: 'Confirm match', dim: !hooks.aligned(), run: () => act.compare('match') },
      { icon: ICON.cross, label: 'Report no match', run: () => act.compare('mismatch') },
      skip('compare'),
    ];
    if (cur.id === 'observe') { const alt = cur.item.id === 'alt', ans = (a) => () => act.answer(cur.item.id, a); return [
      { icon: ICON.check, label: alt ? 'Yes' : 'Match', run: ans('seen') },
      { icon: ICON.cross, label: alt ? 'No' : 'No match', run: ans('not_seen') },
      { icon: ICON.q, label: "Can't tell", run: ans('undetermined') },
    ]; }
    if (cur.id === 'photo') return [
      { icon: ICON.cam, label: 'Photo', run: () => act.photo() },
      { icon: ICON.mic, label: m.holding ? 'Listening · release to save' : 'Voice memo (hold)', on: !!m.holding, hold: true, run: (down) => act.memo(down) },
      skip('photo', 'Next'),
    ];
    if (cur.id === 'sample') return [
      { icon: ICON.check, label: act.sampling() ? 'Collecting…' : 'Collect sample', on: act.sampling(), run: () => act.sample() },
      { icon: ICON.cam, label: 'Photo', run: () => act.photo() },
      skip('sample'),
    ];
    return [ // carry-over task
      { icon: ICON.check, label: 'Checked', run: () => act.carried(cur.carried.key) },
      { icon: ICON.cam, label: 'Photo', run: () => act.photo() },
      skip(cur.id),
    ];
  }

  function body(cur) {
    const L = list(), n = cur ? L.findIndex((x) => x.id === cur.id) + 1 : L.length, N = L.length;
    if (!cur) { const done = L.filter((x) => x.done).length;
      return { n: '✓', title: 'Field missions done', chip: `${done} / ${N}`, text: `${done} done${N - done ? ` · ${N - done} skipped` : ''}. Records go to the habitat when the comm link is up. The return starts only with "Start return".`, media: '' }; }
    const chip = cur.steps ? `${cur.step + 1} / ${cur.steps}` : `${n} / ${N}`;
    const img = (src, label, alt) => `<figure class="mc-media${m.zoom ? ' big' : ''}"><span class="mc-mlabel">${label}</span><img src="${src}" alt="${alt}" /></figure>`;
    if (cur.id === 'compare') { const f = hooks.field();
      return { n, title: cur.title, chip, text: 'Lines from the planning image are on the visor. Turn your head to lay them on the rock outline, then choose a result.',
        sub: `<div class="mc-state ${f && f.aligned ? 'ok' : 'wait'}">${f && f.aligned ? 'Aligned · match can be confirmed' : `Not aligned · look at the rock under the arrow${f ? ` (gaze error ${f.gazeErrDeg.toFixed(1)}°)` : ''}`}</div>`,
        media: img(PLAN_IMAGE.file, 'Planning image', 'Planning image · front Hazcam sol 1215'), credit: `Planning image Hazcam sol 1215 · ${PLAN_IMAGE.credit} · not automatic recognition` }; }
    if (cur.id === 'observe') { const it = cur.item, alt = it.id === 'alt';
      return { n, title: `Observation · ${it.name}`, chip, text: alt ? `${it.q}?` : `Compare with the original image. ${it.q.replace(' · compare with ①', '')}?`, sub: `<div class="mc-state">${alt ? '' : 'Looks like the original = Match · '}astronaut's visual record · not a judgement or score · say what you see with ${'<kbd>V</kbd>'} voice memo</div>`, media: img(REFERENCE.file, 'Original image', 'Cheyava Falls reference image PIA26368'), credit: `${REFERENCE.source} · ${REFERENCE.credit}` }; }
    if (cur.id === 'photo') return { n, title: cur.title, chip, text: 'Photograph the sampled spot and the rock. Position and time are added (simulated view · not a real camera).', media: '' };
    if (cur.id === 'sample') return { n, title: cur.title, chip, text: 'Go to the planned sampling point under the arrow and press "Collect sample" to scoop it into the sample tube. The astronaut decides where to sample.', sub: `<div class="mc-state">Position, time, dose attached (simulated)${st.compare.result === 'match' ? ' · matched planned site' : ''}</div>`, media: '', credit: 'Planned sampling points are estimated from public raw-data metadata' };
    return { n, title: cur.title, chip, text: `Carried over from the last Marswalk: ${cur.carried.title}`, media: '' };
  }

  /** Every other short card (plan / package receipt, alerts, base instructions, arrival, end) in the same look: title and text are taken
   *  from the card the existing HUD rendered (kept hidden), its 1–3 actions become the numbered buttons. Longer menus keep the old card. */
  const GICON = { 'alert-return': ICON.home, return: ICON.home, hold: ICON.skip, 'alert-continue': ICON.skip };
  const genericActs = () => { if (active() || hooks.memoOpen() || hooks.viewOpen() || st.phase === 'onsite' && !hooks.overlay() && !m.closed) return null; const a = hooks.actions(); return a.length >= 1 && a.length <= 3 ? a : null; };
  function renderGeneric(acts) {
    const src = hooks.hudCard(), hk = src && src.querySelector('.hud-k'), k = acts.map((a) => a.id + a.label).join('|') + (src ? src.textContent : '');
    if (k === m.gkey) return; m.gkey = k; m.key = '';
    const chip = hk && hk.querySelector('small') ? hk.querySelector('small').textContent : '', title = hk ? hk.textContent.replace(chip, '').trim() : acts[0].label;
    const warn = hk && /fx-warn|fx-cau/.test(hk.className), text = src ? [...src.querySelectorAll('.hud-v')].map((e) => e.innerHTML).join('<br>') : '', credit = src ? [...src.querySelectorAll('.hud-credit')].map((e) => e.innerHTML).join('<br>') : '';
    card.dataset.kind = warn ? 'alert' : 'info';
    card.innerHTML = `<div class="mc-head"><span class="mc-n${warn ? ' warn' : ''}">${warn ? '!' : 'i'}</span><h3>${title}</h3>${chip ? `<span class="mc-chip">${chip}</span>` : ''}</div>
      ${text ? `<p class="mc-text">${text}</p>` : ''}${credit ? `<div class="mc-credit">${credit}</div>` : ''}<div class="mc-sep"></div>
      <div class="mc-btns">${acts.map((x, i) => `<button type="button" class="mc-btn" data-i="${i}"><kbd>${i + 1}</kbd><span class="mc-ic">${GICON[x.id] || ICON.check}</span><span class="mc-bl">${x.label}</span></button>`).join('')}</div>`;
  }

  function render() {
    m.gkey = ''; delete card.dataset.kind;
    const cur = current(), b = body(cur), btns = buttons(cur), f = hooks.field();
    const k = [cur ? cur.id + (cur.step || 0) + (cur.item ? cur.item.id : '') : 'done', m.zoom, m.holding, act.sampling(), f && f.aligned, cur && cur.id === 'compare' && f ? f.gazeErrDeg.toFixed(0) : '', st.records.length, st.compare.result].join('|');
    if (k === m.key) return; m.key = k;
    card.innerHTML = `<div class="mc-head"><span class="mc-n">${b.n}</span><h3>${b.title}</h3><span class="mc-chip">${b.chip}</span></div>
      <p class="mc-text">${b.text}</p>${b.sub || ''}${b.media || ''}${b.credit ? `<div class="mc-credit">${b.credit}</div>` : ''}<div class="mc-sep"></div>
      <div class="mc-btns">${btns.map((x, i) => `<button type="button" class="mc-btn${x.on ? ' on' : ''}${x.dim ? ' dim' : ''}" data-i="${i}"><kbd>${i + 1}</kbd><span class="mc-ic">${x.icon}</span><span class="mc-bl">${x.label}</span></button>`).join('')}</div>`;
  }
  card.addEventListener('pointerdown', (ev) => { const b = ev.target.closest('.mc-btn'); if (!b) return; ev.preventDefault(); ev.stopPropagation(); press(+b.dataset.i + 1, true); const up = () => { press(+b.dataset.i + 1, false); removeEventListener('pointerup', up); }; addEventListener('pointerup', up); });

  /** Keys 1 · 2 · 3 (and clicks). Returns true when the card took the press. */
  function press(n, down) {
    if (down && !active()) { const g = genericActs(); if (!g) return false; const a = g[n - 1]; if (a) { a.run(); m.gkey = ''; hooks.dirty(); } return true; }
    const btns = buttons(current()), x = btns[n - 1];
    if (!down) { if (m.holding === n) { m.holding = 0; if (x && x.hold) x.run(false); m.key = ''; return true; } return false; }
    if (!x) return true;
    if (x.hold) { m.holding = n; x.run(true); } else x.run();
    m.key = ''; hooks.dirty(); return true;
  }

  /** Arrow above the mission target. `proj(kind)` returns {x, y, on, behind, dist} in CSS pixels or null. */
  const rot0 = (p) => (p.behind ? (p.x < innerWidth / 2 ? 1 : -1) : p.x < innerWidth / 2 ? -1 : 1);
  function placeArrow(proj) {
    const cur = active() ? current() : null, p = cur && proj ? proj(cur.target) : null;
    arrow.classList.toggle('hidden', !p); if (!p) return;
    const W = innerWidth, H = innerHeight, mg = 70, inView = p.on && !p.behind && p.x > mg && p.x < W - mg && p.y > mg && p.y < H - mg;
    arrow.classList.toggle('edge', !inView); arrow.dataset.side = inView ? '' : (rot0(p) < 0 ? 'left' : 'right');
    let x = p.x, y = p.y, rot = 180;
    if (!inView) { const side = p.behind ? (p.x < W / 2 ? 1 : -1) : p.x < W / 2 ? -1 : 1; x = side < 0 ? mg : W - mg; y = Math.min(Math.max(p.behind ? H / 2 : p.y, H * .3), H * .7); rot = side < 0 ? -90 : 90; }
    arrow.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`; arrow.style.setProperty('--rot', rot + 'deg');
    const lab = arrow.querySelector('.mc-tlabel'); if (lab.textContent !== cur.tlabel) lab.textContent = cur.tlabel;
    arrow.querySelector('.mc-tdist').textContent = p.dist != null ? `${p.dist.toFixed(1)} m` : '';
  }

  return {
    get active() { return active(); },
    /** The planned lines stay on the visor while the POV match mission is the current one. */
    wantsLines: () => active() && (current() || {}).id === 'compare',
    press,
    reopen() { m.closed = false; m.key = ''; },
    update(proj) {
      if (st.phase === 'onsite' && st.onsiteSince !== m.onsiteAt) { m.onsiteAt = st.onsiteSince; m.skipped.clear(); m.closed = false; m.zoom = false; m.key = ''; } // a new stop (or next EVA): start over
      if (st.phase !== 'onsite' && m.holding) { m.holding = 0; act.memo(false); }
      const on = active(), g = on ? null : genericActs(); card.classList.toggle('hidden', !on && !g); el.classList.toggle('has-mission', on || !!g); el.classList.toggle('mc-onsite', on);
      if (on) render(); else if (g) renderGeneric(g); placeArrow(proj);
    },
  };
}
