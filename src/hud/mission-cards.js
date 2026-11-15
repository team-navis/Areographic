import './mission-cards.css';
import { OBS_ITEMS, REFERENCE, PLAN_IMAGE } from '../state/field-ops.js';
import { kitImg, KIT } from './hud-kit.js';

/**
 * 현장 미션 카드 (2026-11-15, user request): on site the crew does one mission at a time on one card with at most three buttons
 * (keys 1 · 2 · 3, also clickable), and a floating arrow above the mission's target in the scene points down at it.
 * Missions reuse the existing records (현장 대조, 관찰 응답, 메모, 시료 기록, 이월 확인); nothing here judges or detects anything.
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
    if (planned('compare') && st.pkg && st.pkg.ackAt !== null) L.push({ id: 'compare', title: '현장 대조', target: 'rock', tlabel: '대조할 암석', done: !!st.compare.result });
    if (planned('observe')) { const k = OBS_ITEMS.findIndex((it) => !st.observations[it.id]); L.push({ id: 'observe', title: '관찰 대조', target: 'rock', tlabel: '관찰 대상', steps: OBS_ITEMS.length, step: k < 0 ? OBS_ITEMS.length - 1 : k, item: OBS_ITEMS[Math.max(0, k)], done: k < 0 }); }
    if (planned('sample')) L.push({ id: 'sample', title: '시료 채취', target: 'sample', tlabel: '채취 예정 지점', done: nSample() > 0 });
    if (planned('photo')) L.push({ id: 'photo', title: '기록 촬영', target: 'rock', tlabel: '촬영 대상', done: st.records.some((r) => r.type === 'photo' && r.simT >= st.onsiteSince) });
    for (const c of st.carried || []) L.push({ id: 'chk-' + c.key, carried: c, title: '이월 과제', target: 'rock', tlabel: '이월 과제 대상', done: c.doneAt !== null });
    return L;
  }
  const current = () => list().find((x) => !x.done && !m.skipped.has(x.id)) || null;
  const blocked = () => !!(hooks.overlay() || hooks.memoOpen() || hooks.viewOpen());
  const active = () => st.phase === 'onsite' && !m.closed && !blocked();

  /** Buttons of the current mission (max 3). hold = runs on press and release (voice memo). */
  function buttons(cur) {
    const skip = (id, label = '건너뛰기') => ({ icon: ICON.skip, label, run: () => { m.skipped.add(id); } });
    if (!cur) return [
      { icon: ICON.home, label: '복귀 개시', run: () => mission.startReturn() },
      { icon: ICON.pin, label: '관심 지점 추가', run: () => act.interest() },
      { icon: ICON.list, label: '작업 목록', run: () => { m.closed = true; } },
    ];
    if (cur.id === 'compare') return [
      { icon: ICON.check, label: '일치 확인', dim: !hooks.aligned(), run: () => act.compare('match') },
      { icon: ICON.cross, label: '불일치 보고', run: () => act.compare('mismatch') },
      skip('compare'),
    ];
    if (cur.id === 'observe') { const alt = cur.item.id === 'alt', ans = (a) => () => act.answer(cur.item.id, a); return [
      { icon: ICON.check, label: alt ? '그렇다' : '일치', run: ans('seen') },
      { icon: ICON.cross, label: alt ? '아니다' : '불일치', run: ans('not_seen') },
      { icon: ICON.q, label: '판단 불가', run: ans('undetermined') },
    ]; }
    if (cur.id === 'photo') return [
      { icon: ICON.cam, label: '촬영', run: () => act.photo() },
      { icon: ICON.mic, label: m.holding ? '듣는 중 · 떼면 저장' : '음성 메모 (누르는 동안)', on: !!m.holding, hold: true, run: (down) => act.memo(down) },
      skip('photo', '다음'),
    ];
    if (cur.id === 'sample') return [
      { icon: ICON.check, label: act.sampling() ? '채취 중…' : '시료 채취', on: act.sampling(), run: () => act.sample() },
      { icon: ICON.cam, label: '촬영', run: () => act.photo() },
      skip('sample'),
    ];
    return [ // 이월 과제
      { icon: ICON.check, label: '확인함', run: () => act.carried(cur.carried.key) },
      { icon: ICON.cam, label: '촬영', run: () => act.photo() },
      skip(cur.id),
    ];
  }

  function body(cur) {
    const L = list(), n = cur ? L.indexOf(cur) + 1 : L.length, N = L.length;
    if (!cur) { const done = L.filter((x) => x.done).length;
      return { n: '✓', title: '현장 미션 완료', chip: `${done} / ${N}`, text: `완료 ${done}건${N - done ? ` · 건너뜀 ${N - done}건` : ''}. 기록은 교신이 되면 기지로 전송됩니다. 복귀는 "복귀 개시"를 눌러야 시작합니다.`, media: '' }; }
    const chip = cur.steps ? `${cur.step + 1} / ${cur.steps}` : `${n} / ${N}`;
    const img = (src, label, alt) => `<figure class="mc-media${m.zoom ? ' big' : ''}"><span class="mc-mlabel">${label}</span><img src="${src}" alt="${alt}" /></figure>`;
    if (cur.id === 'compare') { const f = hooks.field();
      return { n, title: cur.title, chip, text: '계획 영상에서 딴 선이 화면에 떠 있습니다. 고개를 돌려 선을 실제 암석 윤곽에 겹친 뒤 결과를 고르세요.',
        sub: `<div class="mc-state ${f && f.aligned ? 'ok' : 'wait'}">${f && f.aligned ? '정렬됨 · 일치 확인 가능' : `정렬 안 됨 · 화살표 아래 암석을 바라보세요${f ? ` (시선 오차 ${f.gazeErrDeg.toFixed(1)}°)` : ''}`}</div>`,
        media: img(PLAN_IMAGE.file, '계획 영상', '계획 영상 · 전방 Hazcam sol 1215'), credit: `계획 영상 Hazcam sol 1215 · ${PLAN_IMAGE.credit} · 자동 인식 아님` }; }
    if (cur.id === 'observe') { const it = cur.item, alt = it.id === 'alt';
      return { n, title: `${cur.title} · ${it.name}`, chip, text: alt ? `${it.q}?` : `원본 사진과 비교해 보세요. ${it.q.replace(' · ①과 비교', '')}?`, sub: `<div class="mc-state">${alt ? '' : '원본처럼 보이면 일치 · '}대원의 육안 기록 · 판정·점수 아님 · 본 것은 ${'<kbd>V</kbd>'} 음성 메모</div>`, media: img(REFERENCE.file, '원본 사진', 'Cheyava Falls 기준 사진 PIA26368'), credit: `${REFERENCE.source} · ${REFERENCE.credit}` }; }
    if (cur.id === 'photo') return { n, title: cur.title, chip, text: '채취한 자리와 암석을 촬영해 남기세요. 위치·시각이 자동으로 붙습니다 (모의 화면 · 실제 카메라 아님).', media: '' };
    if (cur.id === 'sample') return { n, title: cur.title, chip, text: '화살표가 가리키는 채취 예정 지점으로 가서 "시료 채취"를 누르면 스쿠프로 파서 시료 통에 담습니다. 어디를 채취할지는 대원이 정합니다.', sub: `<div class="mc-state">좌표·시각·선량 자동 첨부 (모의)${st.compare.result === 'match' ? ' · 일치 확인한 계획 지점' : ''}</div>`, media: '', credit: '채취 예정 지점은 공개 원자료 메타데이터 기반 추정' };
    return { n, title: cur.title, chip, text: `지난 선외활동에서 넘어온 과제: ${cur.carried.title}`, media: '' };
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
  function placeArrow(proj) {
    const cur = active() ? current() : null, p = cur && proj ? proj(cur.target) : null;
    arrow.classList.toggle('hidden', !p); if (!p) return;
    const W = innerWidth, H = innerHeight, mg = 70, inView = p.on && !p.behind && p.x > mg && p.x < W - mg && p.y > mg && p.y < H - mg;
    arrow.classList.toggle('edge', !inView);
    let x = p.x, y = p.y, rot = 180;
    if (!inView) { const side = p.behind ? (p.x < W / 2 ? 1 : -1) : p.x < W / 2 ? -1 : 1; x = side < 0 ? mg : W - mg; y = Math.min(Math.max(p.behind ? H / 2 : p.y, H * .3), H * .7); rot = side < 0 ? -90 : 90; }
    arrow.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`; arrow.style.setProperty('--rot', rot + 'deg');
    const lab = arrow.querySelector('.mc-tlabel'); if (lab.textContent !== cur.tlabel) lab.textContent = cur.tlabel;
    arrow.querySelector('.mc-tdist').textContent = p.dist != null ? `${p.dist.toFixed(1)} m` : '';
  }

  return {
    get active() { return active(); },
    /** The planned lines stay on the visor while the 현장 대조 mission is the current one. */
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
