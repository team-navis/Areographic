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
 * Adds: alert cards (수신/확인/선택/실행), 대조 패키지 수신 확인, 현장 대조 (line drawing projected on the rock stand-in),
 * 관찰 대조 board (design proposal d: original image | public analysis | crew's new record + 봄/못 봄/판단 불가),
 * 시료 기록, 추가 관심 지점 with the remaining time, and voice commands.
 *
 * Input (v0.2 HUD #13 "음성 명령, 물리 버튼 2개"): button 1 = `1` runs the highlighted item, button 2 = `2` moves the
 * highlight to the next item on any card with two or more items (single-item cards still fold, as before). With no card,
 * button 1 toggles the minimap. Push-to-talk `V` takes one command from the fixed grammar in voice.js; when speech
 * recognition is missing or fails, the labelled typed field feeds the same grammar. The dial keys of the earlier build
 * (wheel, arrow up/down, M) still work but are demo extras, not team-defined input.
 *
 * The HUD never detects, recognises or judges anything. 현장 대조 compares the scene with a planned public image and the
 * crew states the result; observation answers are the crew's own visual answers.
 */
const key = (k) => `<kbd>${k}</kbd>`, esc = (t) => String(t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const BY = { button: '버튼', voice: '음성 명령(성능 미검증)', typed: '검수용 텍스트 입력 (대원 입력 아님)' };
export const TYPE = { followup: '이월 과제 확인', compare: '현장 대조', obs: '관찰 응답', sample: '시료 기록', photo: '촬영 마킹', memo: '메모', interest: '추가 관심 지점', observe: '관찰' };

export function installFieldHud(hud, mission, hooks = {}) {
  const st = mission.st, el = hud.el; el.classList.add('fx'); applyKit(el); // team design kit (visor frame, panels, icons)
  const add = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); const n = t.content.firstChild; el.appendChild(n); return n; };
  const boardEl = add('<div class="fx-board hud-plate hidden" id="hud-board"></div>');
  // The crew cannot type: the normal flow is buttons + push-to-talk. The typed command field exists only for review (URL ?review) and is labelled so.
  const voiceEl = add(`<div class="fx-voice hud-plate hidden" id="hud-voice"><div id="hud-voice-state"></div>${REVIEW ? `<label for="hud-voicein">검수용 텍스트 명령 (?review · 대원 입력 아님) — 타이핑 후 ${key('Enter')}</label><input id="hud-voicein" autocomplete="off" spellcheck="false" placeholder="검수용 · 명령 타이핑 후 Enter" />` : `<div class="hud-credit" id="hud-voice-alt">음성이 안 되면 버튼 1 ${key('1')} 실행 · 버튼 2 ${key('2')} 다음으로 같은 작업을 할 수 있습니다</div><input id="hud-voicein" hidden tabindex="-1" />`}<div id="hud-voice-note"></div></div>`);
  const shutterEl = add('<div class="fx-shutter hidden" id="hud-shutter" aria-hidden="true"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><div class="flash"></div><img class="thumb" alt="" /><span class="lbl"></span></div>'); let shutterT = 0; // 촬영 motion: viewfinder corners, a short flash, the captured frame flying to the record corner
  const linesEl = add('<svg class="fx-lines hidden" id="hud-lines" aria-hidden="true"></svg>'); // HUD line projection: planned lines fixed on the visor
  const briefEl = add('<div class="fx-brief hud-plate hidden" id="hud-brief"><div id="hud-brief-auto"></div><div id="hud-brief-text"></div></div>'); // 이동 중 안내: one or two short sentences, never over the navigation or alert panels
  refreshPermission();
  const noteEl = add('<div class="fx-note hud-plate hidden" id="hud-fx-note"></div>');
  const planEl = document.createElement('span'); planEl.id = 'hud-plan-state'; planEl.className = 'fx-chip caution hidden'; planEl.textContent = '계획 미수신'; planEl.title = '계획 미수신 · 기지 확인 필요'; el.querySelector('#hud-status').appendChild(planEl); // gate notice only: leaving without a sent plan is not blocked (demo choice)
  { const lg = el.querySelector('#hud-legend'); if (lg) { lg.innerHTML = legendHtml({ b2: 'Next' }); const a = lg.querySelector('.lg-a'); if (a) a.remove(); const k = lg.querySelector('.lg-k'); if (k) { const v = [...k.children].find((s) => /음성/.test(s.textContent)); if (v) v.innerHTML = `${kitImg('icon_voice_memo')} ${key('V')} 메모 (누르는 동안)`; } k.insertAdjacentHTML('beforeend', `<span>${kitImg('icon_camera')} ${key('3')} 촬영</span>`); } } // joint demo feedback: the Select/Next/Voice/Map row is gone; the suit's camera (3) and memo (4) buttons are listed with the other keys
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
  mission.on((type) => { if (type === 'record') { const r = st.records[st.records.length - 1]; if (r && r.type === 'photo' && !r.frame) r.frame = capture(); } dirty(); }); // 촬영 마킹 keeps a capture of the demo view (not a camera frame)

  // ---------- crew actions (time / position / dose are attached in mission.addRecord) ----------
  function doCompare(result, by, fromCard = false) {
    if (st.phase !== 'onsite') return fail('현장 대조는 목적지 도착 확인 뒤에 할 수 있습니다');
    if (!pkgOk()) return fail('대조 패키지가 없습니다 · 기지에서 전송하고 수신 확인해야 합니다');
    if (result === 'match' && !(ui.field && ui.field.aligned)) return fail(`정렬 안 됨 · 암석을 바라보세요 (시선 오차 ${ui.field ? ui.field.gazeErrDeg.toFixed(1) : '—'}° / 허용 ${TOL.gazeDeg}°)`);
    const r = mission.setCompare(result, by, ui.field || {}, { input: BY[by], frame: result === 'match' ? capture() : null }); if (!r) return fail('대조 결과를 저장하지 못했습니다');
    if (!fromCard) ui.view = 'compare'; dirty(); return ok(result === 'match' ? '일치 확인 · 채취 예정 지점을 강조합니다' : '불일치 보고를 기록했습니다');
  }
  function answer(id, a, by) { const it = OBS_ITEMS.find((x) => x.id === id); if (!it || !mission.answerObservation(id, a, by, { input: BY[by], frame: capture() })) return fail('관찰 응답은 현장 작업 중에만 저장됩니다'); ui.obsCur = id; nextObs(false); dirty(); return ok(`${it.name}: ${ANSWERS[a]} 저장`); }
  function nextObs(force) { const i = OBS_ITEMS.findIndex((x) => x.id === ui.obsCur), k = i + (force ? 1 : 0), order = [...OBS_ITEMS.slice(k), ...OBS_ITEMS.slice(0, k)], nx = order.find((x) => !st.observations[x.id]) || (force ? order[0] : OBS_ITEMS[i]); ui.obsCur = nx.id; dirty(); }
  function saveSample(by, note) { const r = mission.addSample(by, note, { input: BY[by], frame: capture() }); dirty(); return r ? ok(`시료 기록 #${r.id} · 좌표·시각·선량 자동 첨부 (모의)`) : fail('시료 기록은 현장 작업 중에만 할 수 있습니다'); }
  /** 시료 채취 (2026-11-15): the scoop motion runs first (hooks.sampleMotion), the record is saved when the sample is stowed. */
  function doSample(by, note) {
    if (st.phase !== 'onsite') return fail('시료 기록은 현장 작업 중에만 할 수 있습니다');
    if (ui.sampling) return fail('시료 채취 중입니다');
    if (hooks.sampleMotion && hooks.sampleMotion(() => { ui.sampling = false; saveSample(by, note); }, () => { ui.sampling = false; dirty(); })) { ui.sampling = true; dirty(); return ok('시료 채취 중 · 파서 시료 통에 담는 중 (모의 동작)'); }
    return saveSample(by, note);
  }
  const outside = () => st.s > st.route.stats.indoorM + 0.5 && st.phase !== 'ended';
  function shutter(r) {
    shutterEl.classList.remove('hidden', 'go'); void shutterEl.offsetWidth; const img = shutterEl.querySelector('.thumb'); if (r.frame) img.src = r.frame; img.style.display = r.frame ? '' : 'none';
    shutterEl.querySelector('.lbl').innerHTML = `${kitImg('icon_camera')} 촬영 #${r.id} · 모의 화면 (실제 카메라 아님)`; shutterEl.classList.add('go'); clearTimeout(shutterT); shutterT = setTimeout(() => shutterEl.classList.add('hidden'), 1500);
  }
  function doPhoto(by) { const r = outside() ? mission.addRecord('photo', '영상 마킹 (모의: 실제 카메라 프레임 저장 없음)', { input: BY[by] }) : null; dirty(); if (r) shutter(r); return r ? ok(`촬영 마킹 #${r.id} · 위치·시각 자동 첨부 (모의)`) : fail('촬영 마킹은 기지 밖에서 할 수 있습니다'); }
  /** Suit memo button (hold): dictation straight into a memo record. Where voice cannot work, a press saves a clearly labelled demo example. */
  function memoButton(down) {
    if (!down) { if (ui.memoRec) { try { ui.memoRec.stop(); } catch { /* already stopped */ } } return true; }
    if (ui.memoRec) return true; if (!outside()) { fail('메모는 기지 밖에서 남길 수 있습니다'); return true; }
    const example = (why) => { const r = mission.addRecord('memo', '시연 예시 메모 · 실제 음성 인식 아님', { input: '시연 예시 기록 (메모 버튼 · 음성 아님)', demoExample: true }); dirty(); flash(`음성 불가 · ${why} · 예시 메모(시연) #${r.id} 저장`); };
    if (hooks.voiceStart) hooks.voiceStart(); // the mic prompt / recognition start can drop the pointer lock: not an Esc
    const why = envReason(); if (why) { example(why); return true; }
    ui.memoGot = false; flash('말하세요 · 떼면 저장 · 예: 채취 이유, 표면 모습, 다음에 확인할 것 · 성능 미검증');
    ui.memoRec = startRecognition({ state: (s) => flash(s), result: (s) => { ui.memoGot = true; const r = mission.addRecord('memo', s, { input: '음성 받아쓰기(성능 미검증)' }); dirty(); ok(`메모 #${r.id} 저장 · "${s}"`); },
      end: () => { ui.memoRec = null; const e = voiceDiag.error; if (!ui.memoGot && ['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e)) example({ 'not-allowed': '마이크 권한 거부', 'service-not-allowed': '음성 인식 서비스 막힘', 'audio-capture': '마이크 없음' }[e]); } });
    if (!ui.memoRec) example('음성 인식을 시작하지 못함');
    return true;
  }
  function doInterest(by, note) { const r = mission.addInterest(by, hooks.gazeGround ? hooks.gazeGround() : null, note, { input: BY[by] }); if (!r) return fail('관심 지점은 현장 작업 중에만 추가할 수 있습니다'); dirty(); return ok(`관심 지점 ${r.n} 추가 · 반영 시 남는 체류 시간 ${fmtSigned(mission.stayLeftAfterInterest())}`); }
  const openView = (v) => { if (st.phase !== 'onsite') return false; ui.view = v; if (v === 'board') nextObs(false); dirty(); return true; };

  /** Keep the highlight valid: when the action list itself changes, start on the wanted item or the first one. */
  function sync() {
    if (hud.ui.memoOpen) return; if (st.phase !== 'onsite') ui.view = null;
    const acts = hud.actions(), k = acts.map((a) => a.id).join('|');
    if (k !== actsKey) { actsKey = k; const w = ui.wantSel ? acts.findIndex((a) => a.id === ui.wantSel) : -1; hud.ui.sel = w >= 0 ? w : 0; ui.wantSel = null; hud.ui.collapsed = false; dirty(); }
  }
  const alertStates = (a) => `${a.sentAt !== null ? `전송 T+${fmtT(a.sentAt)} · ` : ''}수신 T+${fmtT(a.receivedAt)} · 확인 ${a.ackAt === null ? '—' : 'T+' + fmtT(a.ackAt)} · 선택 ${a.choice ? (a.choice === 'return' ? '복귀' : '지속') : '—'} · 실행 ${a.executedAt === null ? '—' : 'T+' + fmtT(a.executedAt)}`;
  const recLine = (r) => `#${r.id} ${TYPE[r.type] || r.type} · T+${fmtT(r.simT)} · ${r.lonE.toFixed(5)}°E ${r.latN.toFixed(5)}°N · ${r.doseUsv.toFixed(2)} µSv <small>모의</small> · ${r.sent ? '기지 전송됨' : '전송 대기'}`;

  const ext = {
    /** Cards that interrupt everything else: an alert, a chosen-but-not-started return, a received package. */
    overlayActions() {
      const al = mission.activeAlert();
      if (al) return al.ackAt === null ? [{ id: 'alert-ack', label: '경보 확인', run: () => mission.ackAlert(al.id) }]
        : [{ id: 'alert-continue', label: '계속 진행 (지속 선택)', run: () => mission.chooseAlert(al.id, 'continue') }, { id: 'alert-return', label: '복귀 선택 (개시는 따로 실행)', run: () => { if (mission.chooseAlert(al.id, 'return')) ui.wantSel = 'return'; } }];
      if (mission.pendingReturn() && mission.ext.canReturnEarly()) return [{ id: 'return', label: '복귀 개시 (선택 실행)', run: () => mission.startReturn() }, { id: 'hold', label: '보류 · 계속 진행', run: () => mission.holdReturn() }];
      // an acknowledged base return instruction while stopped at the destination (arrived / on site): the same 개시 / 보류 pair. On the way out the existing HUD card (hud.js) already offers it.
      { const rm = st.remote; if (rm && rm.ackAt !== null && rm.executedAt === null && !rm.declined && (st.phase === 'arrived' || st.phase === 'onsite')) return [{ id: 'return', label: '복귀 개시 (지시 실행)', run: () => mission.startReturn() }, { id: 'hold', label: '보류 · 계속 진행', run: () => mission.declineRemote() }]; }
      if (st.planTx && st.planTx.receivedAt !== null && st.planTx.ackAt === null) return [{ id: 'plan-ack', label: '계획 수신 확인', run: () => mission.ackPlan() }];
      if (st.pkg && st.pkg.receivedAt !== null && st.pkg.ackAt === null) return [{ id: 'pkg-ack', label: '대조 패키지 수신 확인', run: () => mission.ackPackage() }];
      return null;
    },
    onsiteActions(list) {
      const back = { id: 'back', label: ui.view === 'board' ? '닫기' : '작업 목록으로', run: () => { ui.view = null; } };
      if (ui.view === 'compare') return pkgOk() ? [{ id: 'match', label: '일치 확인', state: ui.field && ui.field.aligned ? '정렬됨' : '정렬 안 됨', run: () => doCompare('match', 'button') }, { id: 'mismatch', label: '불일치 보고', state: '', run: () => doCompare('mismatch', 'button') }, back] : [back];
      if (ui.view === 'board') return [...Object.entries(ANSWERS).map(([a, label]) => ({ id: 'ans-' + a, label, run: () => answer(ui.obsCur, a, 'button') })), { id: 'obs-next', label: '다음 항목', run: () => nextObs(true) }, back];
      const n = (t) => st.records.filter((r) => r.type === t).length, nObs = Object.keys(st.observations).length, cr = st.compare.result;
      const extra = [
        { id: 'missions', label: '현장 미션 카드로', state: '', done: false, run: () => mc.reopen() },
        { id: 'compare', label: '현장 대조 · 선 투영', state: cr === 'match' ? '일치 확인' : cr === 'mismatch' ? '불일치 보고' : pkgOk() ? '미완료' : '패키지 없음', done: !!cr, run: () => openView('compare') },
        { id: 'board', label: '관찰 대조 · 관찰 리스트', state: `${nObs}/${OBS_ITEMS.length}`, done: nObs === OBS_ITEMS.length, run: () => openView('board') },
        { id: 'sample', label: '시료 기록', state: n('sample') ? `${n('sample')}건` : '미완료', done: n('sample') > 0, run: () => doSample('button', '') },
        { id: 'interest', label: '관심 지점 추가', state: n('interest') ? `${n('interest')}곳` : '', done: false, run: () => doInterest('button', '') },
      ];
      for (const c of st.carried || []) extra.push({ id: 'chk-' + c.key, label: `이월 확인 · ${c.title}`, state: c.doneAt === null ? '이월' : '확인함', done: c.doneAt !== null, run: () => { const r = mission.checkCarried(c.key, 'button', { input: BY.button }); if (r) ok(`이월 과제 확인 기록 #${r.id}`); else fail('이미 확인한 이월 과제입니다'); dirty(); } }); // 후속 확인 과제 carried from the previous EVA (team proposal demo)
      const base = list.filter((a) => a.id !== 'photo' && a.id !== 'memo'); // 촬영 = suit button 3, 메모 = suit button 4 (joint demo feedback)
      const i = base.findIndex((a) => a.id === 'return'); return [...base.slice(0, i), ...extra, ...base.slice(i)];
    },
    key() { const pk = st.pkg; return [ui.view, st.remote ? [st.remote.ackAt, st.remote.declined, st.remote.executedAt].join() : '', st.alerts.map((a) => [a.receivedAt, a.ackAt, a.choice, a.executedAt, a.held].join()).join(';'), pk ? [pk.rev, pk.receivedAt, pk.ackAt].join() : '', st.planTx ? [st.planTx.rev, st.planTx.receivedAt, st.planTx.ackAt].join() : '', st.compare.result, st.compare.at, mission.interestCount(), (st.carried || []).map((c) => c.doneAt).join(), mc.active].join('~'); },
    /** HTML for the card, '' to hide it (board open), or null to let the existing HUD render its own card. */
    card(acts) {
      if (mc.active) return ''; // 현장 미션 카드 is showing (mission-cards.js)
      const first = acts[0] ? acts[0].id : '', al = mission.activeAlert(), pk = st.pkg, sel = Math.min(hud.ui.sel, acts.length - 1);
      const menu = () => `<div class="hud-menu">${acts.map((a, i) => `<div class="hud-item${i === sel ? ' sel' : ''}${a.done ? ' done' : ''}" data-act="${a.id}"><span>${i === sel ? '▶' : a.done ? '●' : '○'} ${a.label}</span><em>${a.state || ''}</em></div>`).join('')}</div><div class="hud-keys">버튼 1 ${key('1')} 실행 · 버튼 2 ${key('2')} ${acts.length > 1 ? '다음' : '접기'}</div>`;
      if (hud.ui.collapsed) return null; // folded single-item card: the existing HUD draws the folded state
      if (first.startsWith('alert-')) return `<div class="hud-k ${al.level === 'warning' ? 'fx-warn' : 'fx-cau'}">${al.level === 'warning' ? '경고' : '주의'} · ${al.title}</div><div class="hud-v">${esc(al.text)}</div><div class="hud-credit">${al.source}</div><div class="hud-credit" id="hud-alert-states">${alertStates(al)}</div><div class="hud-credit">${al.ackAt === null ? '확인해도 복귀가 자동으로 시작되지는 않습니다.' : '지속·복귀를 고릅니다. 복귀를 골라도 개시는 따로 실행합니다.'}</div>${menu()}`;
      if (first === 'return' && acts[1] && acts[1].id === 'hold' && mission.pendingReturn()) { const a = mission.pendingReturn(); return `<div class="hud-k adv">복귀 선택됨 <small>${a.title}</small></div><div class="hud-v">복귀를 골랐습니다 T+${fmtT(a.choiceAt)}. 버튼 1로 개시해야 복귀가 시작됩니다.</div>${menu()}`; }
      if (first === 'return' && acts[1] && acts[1].id === 'hold' && st.remote && st.remote.ackAt !== null && (st.phase === 'arrived' || st.phase === 'onsite')) { const rm = st.remote; return `<div class="hud-k adv">기지 지시 <small>원격 · 모의</small></div><div class="hud-v">"${esc(rm.text)}" 확인함 T+${fmtT(rm.ackAt)}. 실행 여부는 대원이 정합니다. 버튼 1로 개시해야 복귀가 시작됩니다.</div>${menu()}`; }
      if (first === 'plan-ack') { const t = st.planTx, b = t.budget; return `<div class="hud-k adv">계획 수신 <small>기지 → HUD · 모의</small></div><div class="hud-v">계획 v${t.planVersion} · 결정자 ${esc(t.decider)} · 작업 ${t.todos.length}건 ${fmtT(b.staySec)} · 귀환 시각 T+${fmtT(b.turnaroundSec)} <small>(귀환 시작 기한)</small> · 수신 T+${fmtT(t.receivedAt)}</div><div class="hud-credit">비상 분기: 귀환 시각 도달 → 귀환 시작 · 교신 두절 → 회복 위치·귀환 · 경보 → 함께 귀환${st.pkg && st.pkg.ackAt === null ? ' · 대조 패키지 함께 확인' : ''}</div>${menu()}`; }
      if (first === 'pkg-ack') return `<div class="hud-k adv">대조 패키지 수신 <small>기지 → HUD</small></div><div class="hud-v">계획 v${pk.planVersion} · 패키지 r${pk.rev} · 선 ${pk.lines.length}개 · 채취 예정 지점 ${pk.targets.length}곳 · 수신 T+${fmtT(pk.receivedAt)}</div><div class="hud-credit">원본 ${pk.source} · ${pk.credit}</div>${menu()}`;
      if (st.phase !== 'onsite' || hud.ui.memoOpen) return null;
      if (ui.view === 'board') return '';
      if (ui.view === 'compare') { const cr = st.compare, L = mission.stayLeft();
        return `<div class="hud-k">현장 대조 <small>실측 지형 메시 · 전방 Hazcam · sol 1215</small></div>
          <div class="hud-row2"><span>${L >= 0 ? '잔여 체류' : '체류 초과'} <small>모의 계획 ${fmtT(PLAN.staySec)}</small></span><b id="hud-stay">${fmtT(Math.abs(L))}</b></div>
          ${cr.result === 'match' ? '' : `<div class="fx-cmp"><img id="hud-ref2" src="${PLAN_IMAGE.file}" alt="계획 영상 · 전방 Hazcam sol 1215" /><div><div class="hud-v" id="hud-pkgline">${pkgOk() ? `패키지 계획 v${pk.planVersion} · r${pk.rev}<br>선 ${pk.lines.length}개 · 채취 예정 지점 ${pk.targets.length}곳` : pk ? '대조 패키지 수신 확인 전' : '대조 패키지 없음<br>기지에서 전송해야 선이 투영됩니다'}</div><div class="hud-credit">계획 영상 Hazcam sol 1215 · ${PLAN_IMAGE.credit}</div></div></div>`}
          ${pkgOk() ? `<div class="hud-row2"><span>정렬 <small>시선 기준 · 가정</small></span><b id="hud-align"></b></div><div class="hud-credit" id="hud-gaze"></div>` : ''}
          ${cr.result === 'match' ? `<div class="hud-v" id="hud-matched">일치 확인됨 T+${fmtT(cr.at)} · 채취 예정 지점을 암석 위에 강조. 어디를 채취할지는 대원이 정합니다.</div>` : cr.result === 'mismatch' ? `<div class="hud-v" id="hud-matched">불일치 보고됨 T+${fmtT(cr.at)} · 판정 없음</div>` : ''}
          ${menu()}
          <div class="hud-credit">계획 영상에서 딴 선을 HUD에 고정해 띄움 · 고개를 돌려 선을 실제 암석에 겹치면 정렬 · 자동 인식 아님 · A·B는 raw 메타데이터 기반 추정 · 생명 판정 없음</div>`; }
      return null;
    },
    /** The existing HUD chose the highlight itself (after a base-instruction ack): do not reset it on the next sync. */
    keepSel() { actsKey = hud.actions().map((x) => x.id).join('|'); },
    /** Close the open 현장 대조 / 관찰 대조 view and go back to the task list (same as the "작업 목록으로"/"닫기" item). */
    closeView() { if (!ui.view) return false; ui.view = null; dirty(); return true; },
    get boardOpen() { return !boardEl.classList.contains('hidden'); },
    /** Returns true when the press was handled here. */
    button(n) {
      if (mc.press(n, true)) return true; // 현장 미션 카드: buttons 1 · 2 · 3
      sync(); const acts = hud.actions();
      if (n === 2) return acts.length >= 2 && !hud.ui.collapsed ? (hud.dial(1), true) : false; // single-item cards keep the old fold behaviour
      if (!acts.length && st.phase !== 'ended') { mission.toggleMinimap(); return true; } // button 1 with nothing to run: map on/off
      return false;
    },
  };
  hud.use(ext);
  const mc = installMissionCards({ el, mission, st,
    hooks: { actions: () => hud.actions(), hudCard: () => $('#hud-card'), overlay: () => ext.overlayActions(), memoOpen: () => !!hud.ui.memoOpen, viewOpen: () => !!ui.view, field: () => ui.field, aligned: () => !!(ui.field && ui.field.aligned), dirty },
    act: { sampling: () => !!ui.sampling, compare: (r) => doCompare(r, 'button', true), answer: (id, a) => answer(id, a, 'button'), memo: memoButton, sample: () => doSample('button', ''), photo: () => doPhoto('button'), interest: () => doInterest('button', ''),
      carried: (k) => { const r = mission.checkCarried(k, 'button', { input: BY.button }); if (r) ok(`이월 과제 확인 기록 #${r.id}`); else fail('이미 확인한 이월 과제입니다'); dirty(); } } });
  let projFn = null;

  // ---------- voice: one command per push-to-talk ----------
  /** Run one utterance through the fixed grammar. `by` is 'voice' (recognised) or 'typed' (labelled fallback). */
  function command(text, by = 'typed') {
    const c = parseCommand(text); let r; sync();
    if (!c) r = fail('명령이 비어 있습니다');
    else if (hud.ui.memoOpen) r = fail('메모 입력 중입니다 · 저장하거나 취소한 뒤 명령하세요');
    else switch (c.cmd) {
      case 'next': r = hud.dial(1) ? ok('다음 항목') : fail('옮길 항목이 없습니다'); break;
      case 'prev': r = hud.dial(-1) ? ok('이전 항목') : fail('옮길 항목이 없습니다'); break;
      case 'confirm': { const a = hud.actions(); if (a.length) { const label = a[Math.min(hud.ui.sel, a.length - 1)].label; hud.button(1); r = ok(`실행: ${label}`); } else r = fail('실행할 항목이 없습니다'); break; }
      case 'cancel': case 'list': if (ui.view) { ui.view = null; dirty(); r = ok('작업 목록으로'); } else r = c.cmd === 'list' ? ok('작업 목록') : fail('닫을 화면이 없습니다'); break;
      case 'map': r = ok(mission.toggleMinimap() ? '지도 켬' : '지도 끔'); break;
      case 'detail': r = hud.toggleDetail ? ok(hud.toggleDetail() ? '우주복·임무 상태 열림' : '우주복·임무 상태 닫힘') : fail('상세 층이 없습니다'); break; // integration branch: 우주복·임무 상태 layer
      case 'compare': r = openView('compare') ? ok('현장 대조') : fail('현장 대조는 목적지 도착 확인 뒤에 열 수 있습니다'); break;
      case 'board': r = openView('board') ? ok('관찰 대조') : fail('관찰 대조는 현장에 멈춰 있을 때만 열 수 있습니다'); break;
      case 'match': r = doCompare('match', by); break;
      case 'mismatch': r = doCompare('mismatch', by); break;
      case 'answer': r = answer(c.item || ui.obsCur, c.answer, by); break;
      case 'sample': r = doSample(by, c.rest); break;
      case 'photo': r = doPhoto(by); break;
      case 'interest': r = doInterest(by, c.rest); break;
      case 'continue': { const al = mission.activeAlert(); r = al && mission.chooseAlert(al.id, 'continue') ? ok('지속 선택') : fail('선택할 경보가 없습니다 (먼저 경보 확인)'); break; }
      case 'return': { const al = mission.activeAlert(), a = hud.actions(), i = a.findIndex((x) => x.id === 'return'); // never starts the return by itself
        if (al && mission.chooseAlert(al.id, 'return')) { ui.wantSel = 'return'; r = ok('복귀 선택 · 개시는 "복귀 개시"를 실행해야 시작'); } else if (i >= 0) { hud.ui.sel = i; dirty(); r = ok('"복귀 개시"를 강조했습니다 · 버튼 1 또는 "확인"으로 실행'); } else r = fail('지금은 복귀를 개시할 수 없습니다'); break; }
      case 'rover': r = hooks.toggleRover && hooks.toggleRover() ? ok('로버 탑승/하차') : fail('지금은 탑승·하차할 수 없습니다'); break;
      case 'auto': r = mission.resumeAuto() ? ok('자동 진행 켬 · 다음 이동 구간부터') : fail('지금은 자동 진행을 켤 수 없습니다'); break;
      case 'manual': mission.takeManual(); r = ok('직접 조작 · W 전진 · S 후진'); break;
      case 'help': r = ok('명령: ' + GRAMMAR_HINT); break;
      default: r = fail(`알 수 없는 명령 "${c.heard}" · 사용 가능: ${GRAMMAR_HINT}`);
    }
    ui.lastCommand = { text: String(text), by, cmd: c ? c.cmd : null, ok: r.ok, msg: r.msg }; set('#hud-voice-note', `${by === 'voice' ? '음성' : '대체 입력'} "${String(text).trim()}" → ${r.msg}`);
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

  /** 관찰 대조 (design proposal d): original image | public analysis | the crew's new record. Opened only on site, while stopped. */
  function renderBoard(acts) {
    const b = boardEl, pk = st.pkg, cr = st.compare, shot = [...st.records].reverse().find((r) => r.frame), tl = mission.turnaroundLeft();
    setB('#hud-b-stay', fmtT(Math.abs(mission.stayLeft()))); setB('#hud-b-o2', st.o2.toFixed(1) + '%'); setB('#hud-b-turn', tl >= 0 ? fmtT(tl) : '초과 ' + fmtT(-tl));
    const k = [hud.ui.sel, ui.obsCur, JSON.stringify(st.observations), shot ? shot.id + '' + shot.sent : '', pk ? pk.rev + '' + pk.ackAt : '', cr.result, st.records.length].join('/'); if (k === boardKey) return; boardKey = k;
    const item = (it) => { const a = st.observations[it.id], cur = it.id === ui.obsCur; return `<div class="b-item${cur ? ' sel' : ''}" data-obs="${it.id}" data-answer="${a ? a.answer : ''}"><div class="t">${cur ? '▶ ' : ''}${it.name}<small>${it.q}</small></div><div class="seg">${Object.entries(ANSWERS).map(([id, lab]) => `<span class="${a && a.answer === id ? 'on' : ''}">${lab}</span>`).join('')}</div></div>`; };
    b.innerHTML = `<div class="b-head"><h1>관찰 대조</h1><span class="site">${esc(destName())}</span><span class="vit">산소 <b id="hud-b-o2">${st.o2.toFixed(1)}%</b> · 복귀 여유 <b id="hud-b-turn">${tl >= 0 ? fmtT(tl) : '초과 ' + fmtT(-tl)}</b> · ${mission.stayLeft() >= 0 ? '잔여 체류' : '체류 초과'} <b id="hud-b-stay">${fmtT(Math.abs(mission.stayLeft()))}</b> <small>모의</small></span></div>
      <div class="b-panes">
        <section class="b-pane" id="hud-pane1"><h2><em>1</em>원본 영상 <i>로버가 찍은 사진 · 축소 외 수정 없음</i></h2>
          <div class="b-frame"><img id="hud-ref" src="${REFERENCE.file}" alt="Cheyava Falls 기준 사진 PIA26368" /></div>
          <div class="b-meta"><b>PIA26368</b> · WATSON · sol 1212 (2024-07-18) · NASA/JPL-Caltech/MSSS<br><span class="tag">실측 영상</span> <span class="tag none">축척 자료 미확보</span></div></section>
        <section class="b-pane" id="hud-pane2"><h2><em>2</em>공개 분석 자료 <i>PIXL 광물 지도 · 실시간 검출 아님</i></h2>
          <div class="b-frame"><img id="hud-pixl" src="${assetUrl('/data/reference/pia26640_pixl_cheyava_falls.jpg')}" alt="PIXL 광물 지도 PIA26640" />
            <div class="b-legend" id="hud-legend2"><div>범례 <small>NASA 설명문 · 견본은 근사색</small></div>
              <div><span class="sw" style="background:linear-gradient(90deg,#8d4fb8,#e06ad0)"></span>보라·분홍 <b>비비아나이트</b><small>vivianite · 수화 인산철</small></div>
              <div><span class="sw" style="background:linear-gradient(90deg,#b9a43c,#7fbf3a)"></span>탁한 노랑·녹색 <b>그레이자이트</b><small>greigite · 황화철</small></div>
              <div><small>축척 막대 1 mm는 원본 그림에 포함. 붉은 바탕색·검은 사각형은 원문에 설명 없음.</small></div></div></div>
          <div class="b-meta"><b>PIA26640</b> · PIXL · 공개 2025-09-10 · NASA/JPL-Caltech<br><span class="tag">장비 분석</span> <span class="tag none">①과의 위치 정합 미확인</span></div></section>
        <section class="b-pane" id="hud-pane3"><h2><em>3</em>대원 새 기록 <i>이번 선외활동</i></h2>
          <div class="b-frame new">${shot ? `<img id="hud-shot" src="${shot.frame}" alt="모의 화면 캡처" />` : '<span class="empty">아직 기록 없음<br>일치 확인·시료 기록·촬영 마킹 때 모의 화면이 저장됩니다</span>'}<span class="simlabel" id="hud-shot-label">모의 화면 · 실제 관측 아님</span></div>
          <div class="b-meta" id="hud-shot-meta">${shot ? recLine(shot) + `<br><span class="tag">모의 위치·시각·선량</span> 분석·판정 없음` : '<span class="tag">모의</span> 기록하면 시각·좌표·선량이 자동으로 붙습니다'}</div></section>
      </div>
      <div class="b-plan" id="hud-b-plan">계획 대조 패키지: ${pkgOk() ? `계획 v${pk.planVersion} · r${pk.rev} · 선 ${pk.lines.length}개 · 채취 예정 지점 ${pk.targets.length}곳` : '없음'} · 선 투영 대조: ${cr.result === 'match' ? `대원 일치 확인 T+${fmtT(cr.at)}` : cr.result === 'mismatch' ? `대원 불일치 보고 T+${fmtT(cr.at)}` : cr.result ? '사진만 대조' : '아직 안 함'}</div>
      <div class="b-notice" id="hud-b-notice">분석 지도의 색은 광물 분포를 나타내는 표현색입니다. 암석이 그 색으로 보인다는 뜻이 아니며, 헬멧이 이 현장을 분석한 결과도 아닙니다.</div>
      <div class="b-items" id="hud-b-items">${OBS_ITEMS.map(item).join('')}</div>
      <div class="b-opts" id="hud-b-opts">${acts.map((a, i) => `<span class="hud-item${i === hud.ui.sel ? ' sel' : ''}" data-act="${a.id}">${i === hud.ui.sel ? '▶ ' : ''}${a.label}</span>`).join('')}<span class="keys">버튼 2 ${key('2')} 다음 · 버튼 1 ${key('1')} 선택</span></div>
      <div class="b-foot" id="hud-b-foot">잠재적 생명 흔적은 생명 확인이 아닙니다. 비생물학적 설명이 배제되지 않았습니다 (NASA 2025-09-10 발표). 응답은 대원의 육안 기록이며 판정·점수가 아닙니다.</div>`;
  }

  /**
   * Task card overflow (joint demo feedback 2026-11-15): the card has a fixed height between the compass and NAVIGATION, so a long list used to be
   * cut off silently (복귀 개시 or the choices missing). When it does not fit: 1) hide pictures and source lines, 2) compact rows, 3) show only the
   * items around the highlighted one plus 복귀 개시, with a "▲/▼ n개 더" line. Re-fitted whenever the card is redrawn or the window is resized.
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
    const hidden = new Set(), label = () => { const up = [...hidden].filter((i) => i < sel).length, dn = [...hidden].filter((i) => i > sel).length; more.textContent = `${up ? `▲ ${up}개` : ''}${up && dn ? ' · ' : ''}${dn ? `▼ ${dn}개` : ''} 더 · 버튼 2로 이동`; };
    for (let d = items.length; d > 0 && over(); d--) { // drop the item farthest from the highlight first (below before above), never the highlight or 복귀 개시
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
      <text x="${W / 2}" y="${H / 2 + 76}" text-anchor="middle" fill="${col}" font-size="15" font-weight="600" stroke="#000" stroke-width="3" paint-order="stroke">${al ? '정렬됨 · 버튼 1로 일치 확인' : '고개를 돌려 선을 암석 윤곽에 겹치세요'}</text>`;
  }

  return {
    ui, ext, command, talk, parseCommand, sync, openView, photoButton: () => doPhoto('button'), memoButton,
    /** Suit button 3: the mission card's third button when the card is up, otherwise the camera. */
    button3: () => mc.press(3, true) || doPhoto('button'),
    release: (n) => mc.press(n, false), wantsLines: () => mc.wantsLines(),
    /** ?review only: open the typed command field (the grammar in voice.js) for checking; it is never crew input. */
    reviewCommands: REVIEW ? () => { showVoice(true); ui.voiceT = 0; set('#hud-voice-state', '검수용 텍스트 명령 (?review)'); voiceIn.focus(); } : null,
    /** Call once per frame BEFORE hud.update(): `field` = alignment metrics of the 3D view (or null). */
    pre({ field, lines, proj }) { ui.field = field || null; projFn = proj || null; sync(); drawLines(lines || null); },
    /** Call once per frame AFTER hud.update(). */
    post(dt, lookYaw = null) {
      { const ba = el.querySelector('.hk-basearrow'); if (ba && lookYaw !== null) { const d = (r) => ((r * 180 / Math.PI) % 360 + 360) % 360, rel = ((d(-mission.baseBearing().yaw) - d(-lookYaw) + 540) % 360) - 180; ba.style.transform = `rotate(${rel.toFixed(0)}deg)`; } } // BASE row arrow: where the base lies relative to the head (same rule as the compass base marker)
      if (ui.flashT > 0) { ui.flashT -= dt; if (ui.flashT <= 0) { ui.flash = ''; noteEl.classList.add('hidden'); } }
      if (ui.voiceOpen && ui.voiceT > 0) { ui.voiceT -= dt; if (ui.voiceT <= 0 && document.activeElement !== voiceIn) showVoice(false); }
      // 도착 후 하차하면 곧바로 현장 작업 시작 (2026-11-15 user request): no separate 도착 확인 step once the crew is on foot at the stop
      if (st.phase === 'arrived' && st.transport === 'foot' && !mission.activeAlert()) { // 도착해 내리면 계획·패키지 수신 확인은 자동 처리 (2026-11-15 user request: the task box first; alerts still come first)
        if (st.planTx && st.planTx.receivedAt !== null && st.planTx.ackAt === null) mission.ackPlan();
        if (st.pkg && st.pkg.receivedAt !== null && st.pkg.ackAt === null) mission.ackPackage();
        if (!ext.overlayActions()) mission.confirmArrival(); }
      mc.update(projFn);
      fitCard();
      { const d = $('#hud-detail'); if (d && !d.classList.contains('hidden')) { const wh = innerWidth + 'x' + innerHeight; if (d.dataset.fitWh !== wh) { d.dataset.fitWh = wh; d.classList.remove('fit1'); const max = parseFloat(getComputedStyle(d).maxHeight) || d.clientHeight; if (d.scrollHeight > max + 1) d.classList.add('fit1'); } } else if (d) d.dataset.fitWh = ''; } // 상세 층: when it does not fit, the source/limit lines go, never a half row
      const card = $('#hud-card'), board = st.phase === 'onsite' && ui.view === 'board' && !hud.ui.memoOpen && !ext.overlayActions();
      el.classList.toggle('has-card', !card.classList.contains('hidden')); el.classList.toggle('has-board', board); boardEl.classList.toggle('hidden', !board);
      planEl.classList.toggle('hidden', !!(st.planTx && st.planTx.receivedAt !== null) || st.phase === 'ended');
      if (board) renderBoard(hud.actions());
      { // fixed status band: add this module's open alerts to the count the existing HUD wrote (it only knows its own cautions)
        const open = st.alerts.filter((x) => x.receivedAt !== null && (x.ackAt === null || !x.resolvedAt)), e = $('#hud-alerts');
        if (open.length) { const t = e.textContent, tl = mission.turnaroundLeft(), dup = open.some((x) => x.kind === 'turnaround') && st.returnStartedAt === null && tl >= 0 && tl < 120 ? 1 : 0; // the old HUD already counts the turnaround caution
          const w = (+(t.match(/경고 (\d+)/) || [0, 0])[1]) + open.filter((x) => x.level === 'warning').length, c = (+(t.match(/주의 (\d+)/) || [0, 0])[1]) + open.filter((x) => x.level === 'caution').length - dup;
          e.textContent = w ? `경고 ${w} · 주의 ${c}` : `주의 ${c}`; e.className = w ? 'warning' : 'caution'; } }
      { const r = $('#hud-route'), d = r.textContent === '◀' ? 'left' : r.textContent === '▶' ? 'right' : ''; if ((r.dataset.dir || '') !== d) { if (d) r.dataset.dir = d; else delete r.dataset.dir; } } // kit side arrows when the route is off the compass scale
      { // 이동 중 안내 (joint demo feedback item 5): what happens at the destination and why, in one or two short sentences. Not a real-operations claim.
        const moving = (st.phase === 'outbound' || st.phase === 'returning') && st.s > 0.5, blocked = !!ext.overlayActions() || hud.ui.memoOpen;
        briefEl.classList.toggle('hidden', !moving || blocked);
        if (moving && !blocked) {
          const t = st.planTx, todos = (t ? t.todos : st.planDraft.todos.filter((x) => x.on)).map((x) => x.name.split(' · ')[0]), left = st.route.length - st.s, base = st.route.stats.indoorM;
          const auto = st.autoGo ? `${st.autoDir < 0 ? '뒤로 ' : ''}자동 진행 중` : st.autoOff ? '자동 진행 멈춤' : st.transport === 'foot' && st.leftRoverAt !== null ? '로버에서 내림 · 다시 타면 자동 진행' : st.phase === 'outbound' && st.s < base + 4 ? `${key('W')}로 기지를 나가면 ${((t ? t.transport : st.planDraft.transport) === 'rover') ? '로버에 자동 탑승해 ' : ''}목적지까지 자동으로 이어집니다` : '';
          const text = st.phase === 'returning' ? `귀환 중 · 기지까지 ${mission.returnLeft().toFixed(0)} m. 기지 경사로에 도착하면 버튼 1로 임무를 종료하고, 기록은 기지로 전송됩니다.`
            : left < 40 ? `곧 도착 (${left.toFixed(0)} m). 도착하면 버튼 1로 도착 확인 → 현장 대조부터 시작합니다. 자동 진행은 도착에서 멈춥니다.`
            : `도착 후: ${todos.slice(0, 3).join(' → ')}${todos.length > 3 ? ' 등' : ''} ${todos.length}건. 채취 예정 지점을 계획 영상과 맞춰 찾고, 위치·시각을 기록으로 남기려는 순서입니다.`;
          setH2('#hud-brief-auto', auto); set('#hud-brief-text', text); $('#hud-brief-auto').classList.toggle('hidden', !auto);
        }
      }
      if (st.buddyAway) { set('#hud-buddy', st.buddyGap.toFixed(1) + ' m'); $('#hud-buddy').className = st.buddyGap > FIELD.buddyWarnM ? 'caution' : ''; } // simulated incident: the buddy is no longer riding along
      { const h = $('#hud-hint'); if (st.autoGo) { if (h.dataset.fxAuto !== h.dataset.h) { h.dataset.fxAuto = h.dataset.h; h.innerHTML = ''; h.classList.add('quiet'); } } else if (h.dataset.fxAuto) { h.dataset.fxAuto = ''; h.dataset.h = ''; } } // no key hints while the route runs by itself (the key bar below still lists every key)
      { const h = $('#hud-hint'); if (st.phase === 'onsite' && !hud.ui.memoOpen && h.dataset.fxFor !== h.dataset.h) { h.dataset.fxFor = h.dataset.h; h.innerHTML = '복귀는 "복귀 개시"를 실행해야 시작'; } else if (st.phase !== 'onsite') h.dataset.fxFor = ''; }
      if (st.phase === 'onsite') { // live values on whichever card is showing
        const f = ui.field, n = mission.interestCount(), L = mission.stayLeft(); set('#hud-stay', fmtT(Math.abs(L)));
        if (f && $('#hud-align')) { set('#hud-align', f.aligned ? '정렬됨 · 일치 확인 가능' : '정렬 안 됨 · 암석을 바라보세요'); $('#hud-align').className = f.aligned ? '' : 'caution'; set('#hud-gaze', `시선 오차 ${f.gazeErrDeg.toFixed(1)}°/허용 ${TOL.gazeDeg}° · 시야각 ${f.obliqDeg.toFixed(0)}°/허용 ${TOL.obliqDeg}° · ${f.dist.toFixed(1)} m`); }
        if (n && !$('#hud-stay2')) { const row = $('#hud-stay') && $('#hud-stay').closest('.hud-row2'); if (row) row.insertAdjacentHTML('afterend', `<div class="hud-row2" id="hud-stay2row"><span>관심 지점 <i id="hud-intn"></i>곳 반영 시 <small>곳당 +${FIELD.interestCostSec / 60}분 가정</small></span><b id="hud-stay2"></b></div>`); }
        if (n) { set('#hud-intn', String(n)); set('#hud-stay2', fmtSigned(mission.stayLeftAfterInterest())); }
      }
    },
  };
}
