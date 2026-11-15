import './plan-pad.css';
import { fmtT, PLAN } from '../state/mission.js';

/**
 * Minimal planning -> departure flow on the PAD (own module; replaceable later). Enables ② 계획 세우기, ③ 경로 미리보기,
 * ④ 출발 확인 and makes ⑤ 관제 a link to the live status on 홈. src/pad/pad.js only gets the `addPage` hook.
 * Every number here is simulated or an assumption and is labelled so. No space-weather data is connected (DONKI 미연결).
 * Gate choice: leaving the airlock without a sent plan is NOT blocked; the HUD shows "계획 미수신 · 기지 확인 필요".
 */
const f = (v) => (v === null || v === undefined ? '—' : 'T+' + fmtT(v));
export function installPlanPad(pad, mission, fieldPad) {
  const st = mission.st, ui = { checks: { route: false, budget: false, branch: false } };
  const dest = () => { const c = mission.candidates.find((x) => x.key === st.destKey); return { ...c, name: `${c.key} ${c.name}` }; }; // one canonical site name everywhere: "<key> <name>"
  // Thin status strip shared by every PAD page: where the data come from, the clock, and the status words 정상 / 주의 / 경보 / 수신 지연 / 미확인 (colour + text together).
  const strip = document.createElement('div'); strip.className = 'pad-strip'; strip.id = 'pad-strip'; pad.root.querySelector('.pad-top').insertAdjacentElement('afterend', strip);
  const chip = (cls, t) => `<span class="ps ps-${cls}">${t}</span>`;
  const stripLive = () => { const open = st.alerts.filter((a) => a.receivedAt !== null && (a.ackAt === null || !a.resolvedAt)), warn = open.some((a) => a.level === 'warning'), t = st.planTx;
    strip.innerHTML = `<span><em>모의 임무</em></span><button id="pad-info-btn" class="ps-info" title="자료 출처와 한계 보기">자료·한계 ⓘ</button><span class="sp"></span>
      <span>임무 시계 <b>T+${fmtT(mission.baseView().sim)}</b></span><span>교신 ${st.comm.up ? chip('ok', '정상') : chip('late', '수신 지연')} 마지막 수신 T+${fmtT(st.comm.lastRx)}</span><span>경보 ${open.length ? (warn ? chip('alarm', `경보 ${open.length}`) : chip('cau', `주의 ${open.length}`)) : chip('ok', '정상')}</span><span>계획 ${!t ? chip('unk', '미확인 · 미전송') : t.ackAt === null ? chip('unk', '미확인 · 대원 확인 전') : chip('ok', `정상 · v${t.planVersion} 확인됨`)}</span>`; };
  stripLive(); setInterval(stripLive, 500);
  // UI tidy (rendering review): source/limit sentences are on demand. The long footer opens from the "자료·한계" button in the strip, and
  // each card note is one line until clicked. Nothing is deleted; the evidence-grade caveat (#fp-evnote) stays fully visible.
  const foot = pad.root.querySelector('.pad-foot'); if (foot) { foot.classList.add('pad-foot-ondemand'); foot.insertAdjacentHTML('afterbegin', '<b>실측</b> HiRISE·CTX 지형, M20 주행선, sol 1215 Hazcam 메시, sol 1176 Navcam 메시 &nbsp;|&nbsp; <b>계산</b> 경로 길이·경사 &nbsp;|&nbsp; <b>추정</b> 채취 지점 A·B(raw 메타데이터) &nbsp;|&nbsp; <b>모의</b> 시계·산소·선량·대원 위치·경보 &nbsp;|&nbsp; '); }
  strip.addEventListener('click', (ev) => { if (ev.target.closest('#pad-info-btn') && foot) foot.classList.toggle('open'); });
  pad.root.addEventListener('click', (ev) => { const n = ev.target.closest('.pad-note'); if (n && !ev.target.closest('button, input, a')) n.classList.toggle('open'); });
  const moveSel = (id) => `<select id="${id}" class="pp-text" style="width:auto"><option value="foot" ${st.planDraft.transport === 'foot' ? 'selected' : ''}>도보 1.4 m/s (모의 · 로버 안 탐)</option><option value="rover" ${st.planDraft.transport === 'rover' ? 'selected' : ''}>로버 3.5 m/s (모의)</option></select>`;
  const budgetHtml = () => { const b = mission.planBudget(); return `<dl>
      <dt>이동 가정</dt><dd>${moveSel('pp-transport')} <small>둘 다 모의 속도 · 모의 대원도 이 가정대로 이동</small></dd>
      <dt>이동 편도</dt><dd id="pp-travel">${b.outM.toFixed(0)} m ÷ ${b.speed} m/s = ${fmtT(b.travelSec)} <small>(${b.transportLabel} 가정)</small></dd>
      <dt>작업 합계</dt><dd id="pp-stay">${fmtT(b.staySec)} <small>(아래 TODO 합계 = 계획 체류)</small></dd>
      <dt>귀환 시각</dt><dd id="pp-turn">T+${fmtT(b.turnaroundSec)} <small>귀환을 시작해야 하는 기한 · 기지 도착 시각 아님 (이동 + 작업 + 여유 3분, 분 단위 올림 · 모의)</small></dd>
      <dt>총 소요</dt><dd>${fmtT(b.totalSec)} <small>(귀환 시각 + 귀환 이동 = 기지 도착 예상)</small></dd>
      <dt>산소 예산</dt><dd id="pp-o2">사용 ${b.o2Use.toFixed(1)} % → 귀환 시 잔여 ${b.o2AtReturn.toFixed(1)} % <small>(분당 ${PLAN.o2PctPerMin} % 모의 모델 · 적재 미반영)</small></dd>
      <dt>우주기상</dt><dd><span class="pad-tag unk" style="margin:0">DONKI 미연결 · 모의</span> <small>실제 자료를 조회하지 않았습니다. 출발 시간대 판단 근거 없음.</small></dd></dl>`; };
  const txHtml = () => { const t = st.planTx, p = st.pkg; return `<span class="st ${t ? 'on' : ''}" id="pp-st-conf" title="${t ? `계획 v${t.planVersion} · 전송 ${t.rev}회차` : ''}">확정 ${t ? f(t.confirmedAt) + ` · 결정자 ${t.decider.replace(/[<>&]/g, '')}` : '—'}</span><span class="st ${t ? 'on' : ''}" id="pp-st-sent">전송 ${t ? f(t.sentAt) : '—'}</span><span class="st ${t && t.receivedAt !== null ? 'on' : ''}" id="pp-st-rx">HUD 수신 ${t ? f(t.receivedAt) : '—'}</span><span class="st ${t && t.ackAt !== null ? 'on' : ''}" id="pp-st-ack">대원 확인 ${t ? f(t.ackAt) : '—'}</span><span class="st ${p && !p.stale ? 'on' : ''}" id="pp-st-pkg">대조 패키지 ${p ? (p.stale ? '이전 계획용 → 현재 계획과 불일치 · 재전송 필요' : `전송 ${f(p.sentAt)} · 수신 ${f(p.receivedAt)} · 확인 ${f(p.ackAt)}`) : '미전송'}</span>`; };
  pad.addPage('plan', (main) => {
    main.innerHTML = `<div class="pad-grid2"><section class="pad-card"><h3>작업 목록 (TODO) <small>${dest().name} · 기본 소요는 가정 · 수정 가능</small></h3>
        <table class="pad-table" id="pp-todos">${st.planDraft.todos.map((t) => `<tr><td><input type="checkbox" data-todo="${t.id}" ${t.on ? 'checked' : ''}/></td><td>${t.name}</td><td><input type="number" min="0" max="60" value="${t.min}" data-min="${t.id}" class="pp-min"/> 분</td></tr>`).join('')}</table>
        <p class="pad-note">확정하면 합계가 계획 체류 시간으로, 계산된 귀환 시각(귀환 시작 기한)이 HUD에 전달됩니다. 현장에서 대원이 추가하는 관심 지점은 여기에 없습니다.</p></section>
      <section class="pad-card"><h3>예산 · 귀환 시각 <span class="pad-tag sim">모의 · 가정</span></h3><div id="pp-budget">${budgetHtml()}</div>
        <p class="pad-note">검증된 소모품 모델이 아닙니다. 경로 길이와 가정한 속도, 작업 시간만으로 계산합니다.</p><div style="display:flex;gap:8px;margin-top:14px"><button class="pad-pick" id="pp-prev" style="margin:0">← ① 지점 고르기</button><button class="pad-primary" id="pp-next" style="margin:0">다음 → ③ 경로 미리보기</button></div></section></div>`;
    main.querySelector('#pp-prev').addEventListener('click', () => pad.show('site'));
    main.querySelector('#pp-todos').addEventListener('change', (ev) => { const t = ev.target; if (t.dataset.todo) mission.setPlanTodo(t.dataset.todo, { on: t.checked }); if (t.dataset.min) mission.setPlanTodo(t.dataset.min, { min: t.value }); main.querySelector('#pp-budget').innerHTML = budgetHtml(); });
    main.querySelector('#pp-budget').addEventListener('change', (ev) => { if (ev.target.id === 'pp-transport') { mission.setPlanTransport(ev.target.value); main.querySelector('#pp-budget').innerHTML = budgetHtml(); } });
    main.querySelector('#pp-next').addEventListener('click', () => pad.show('route'));
  });
  pad.addPage('route', (main) => { const rs = st.route.stats;
    main.innerHTML = `<div class="pad-site"><div class="pad-mapwrap"><canvas id="pp-map" width="600" height="600"></canvas></div><div class="pad-side">
        <section class="pad-card tight"><h3>경로 <small>${dest().name}</small></h3><dl><dt>편도 / 왕복</dt><dd>${rs.oneWayM.toFixed(0)} m / ${(rs.oneWayM * 2).toFixed(0)} m</dd><dt>최대 경사</dt><dd>${rs.maxSlopeDeg.toFixed(1)}° <small>(5 m 구간 · 1 m DTM)</small></dd>
          <dt>근거</dt><dd>${rs.traverseM.toFixed(0)} m는 Perseverance 실제 주행선 <small>· 사람 보행·유인 로버 안전성 검증 아님</small></dd><dt>교신</dt><dd><span class="pad-tag unk" style="margin:0">가정</span> <small>전 구간 교신 가능으로 둠 · 가시선 계산 없음</small></dd><dt>우회</dt><dd><small>장애물 회피 경로 생성 없음 · 실제 주행선을 그대로 사용</small></dd></dl></section>
        <section class="pad-card tight"><h3>현장 대조 패키지</h3><div class="fp-state" id="pp-pkg"></div><button class="pad-pick" id="pp-openpkg" style="margin:8px 0 0">대조 패키지 만들기 열기</button><p class="pad-note">④에서 계획을 전송할 때 아직 보내지 않았다면 기본 채취 예정 지점(B, 추정)으로 함께 전송합니다.</p></section>
        <section class="pad-card tight"><div style="display:flex;gap:8px"><button class="pad-pick" id="pp-prev2" style="margin:0">← ② 계획 세우기</button><button class="pad-primary" id="pp-next2" style="margin:0">다음 → ④ 출발 확인</button></div></section></div></div>`;
    pad.drawMap(main.querySelector('#pp-map')); main.querySelector('#pp-openpkg').addEventListener('click', () => { fieldPad.setOpen(true); fieldPad.show('pkg'); }); main.querySelector('#pp-next2').addEventListener('click', () => pad.show('go')); main.querySelector('#pp-prev2').addEventListener('click', () => pad.show('plan')); main.querySelector('#pp-pkg').innerHTML = txHtml();
  }, (main) => { const e = main.querySelector('#pp-pkg'); if (e) e.innerHTML = txHtml(); const cv = main.querySelector('#pp-map'); if (cv) pad.drawMap(cv); });
  // ④ 최종 검토 (UI friction review item 5): one screen gathers the route, tasks, simulated time/oxygen budget, departure checks and the
  // decision-maker; task minutes and the sampling point are edited only when unfolded. ONE primary action confirms the plan and starts the
  // controller run. Internally the plan send, the package for the same plan version, HUD receipt and the simulated departure stay separate states.
  const sendAll = async (opts = {}) => { if (!mission.sendPlan(opts.decider || st.planDraft.decider, opts)) return false; if (!st.pkg || st.pkg.stale || (st.pkg.planVersion !== st.planTx.planVersion && (st.pkg.ackAt === null || !st.departed))) { await fieldPad.ready; const d = fieldPad.ui.draft || fieldPad.extract(); if (fieldPad.ui.targets.length) mission.sendPackage({ lines: d.polylines, hash: d.hash, detail: fieldPad.ui.detail, targets: fieldPad.ui.targets, auto: !!opts.auto }); } pad.refresh(); return true; }; // before departure the package always matches the plan version that was sent; a package the crew already confirmed in the field is not replaced by a re-send
  /**
   * 탐사자 바로 시작 (joint demo feedback 2026-11-15): when the crew goes out without the controller's preparation, the current draft plan
   * and the line-projection package (default target B) are prepared for the CURRENT plan version and marked 시연 자동 준비. Nobody is
   * recorded as having confirmed or sent them; the controller's own send path is unchanged and a plan the controller already sent is kept.
   */
  const DEMO_DECIDER = '시연 자동 준비 (사람 결정 아님)';
  const ensureDemoPlan = async () => { if (st.planTx && st.planTx.planVersion === st.planVersion && st.pkg && st.pkg.planVersion === st.planVersion && !st.pkg.stale) return false; if (st.departed || ['returning', 'atBase', 'ended'].includes(st.phase)) return false; const ok = await sendAll({ auto: true, decider: DEMO_DECIDER }); pad.refresh(); return ok; };
  /** 다음 탐사: closes the finished EVA's state (kept in the archive) and opens planning for the next one. */
  const nextEva = () => { if (!mission.beginNextEva()) return false; ui.checks = { route: false, budget: false, branch: false }; pad.show('go'); return true; };
  pad.ui.onNextEva = nextEva; // PAD 홈 button
  const nextEvaBtn = (id) => (st.phase === 'ended' ? `<button class="pad-primary" id="${id}" style="margin:0">다음 탐사 계획 시작 → EVA ${st.evaNo + 1}</button>` : '');
  const blockers = () => { const m = []; const left = ['route', 'budget', 'branch'].filter((k) => !ui.checks[k]).length; if (left) m.push(`출발 점검 ${left}건 남음`); if (!st.planDraft.decider.trim()) m.push('결정자 미입력'); if (st.phase === 'ended') m.push('임무 종료됨 · 아래 "다음 탐사 계획 시작"을 누르세요 (이전 기록은 보존)'); else if (['returning', 'atBase'].includes(st.phase)) m.push('복귀 중인 임무 · 기지 도착 후 종료하면 다음 계획을 세울 수 있음'); return m; };
  pad.addPage('go', (main) => { const rs = st.route.stats;
    main.innerHTML = `<div class="pad-grid2 pp-review"><section class="pad-card"><h3>최종 검토 <small>${dest().name}</small></h3>
        <dl><dt>경로</dt><dd>편도 ${rs.oneWayM.toFixed(0)} m · 최대 경사 ${rs.maxSlopeDeg.toFixed(1)}° <span class="pad-tag" style="margin:0">계산</span> · 교신 <span class="pad-tag unk" style="margin:0">가정</span></dd>
          <dt>작업</dt><dd id="pp-tasksum"></dd><dt>이동 가정</dt><dd><span id="pp-movesum"></span> ${moveSel('pp-transport4')}</dd><dt>시간 · 산소</dt><dd id="pp-budsum"></dd><dt>채취 지점</dt><dd id="pp-tgtsum"></dd></dl>
        <details class="pp-edit" id="pp-edit-tasks"><summary>작업 시간 펼쳐서 편집</summary><table class="pad-table" id="pp-todos">${st.planDraft.todos.map((t) => `<tr><td><input type="checkbox" data-todo="${t.id}" ${t.on ? 'checked' : ''}/></td><td>${t.name}</td><td><input type="number" min="0" max="60" value="${t.min}" data-min="${t.id}" class="pp-min"/> 분</td></tr>`).join('')}</table></details>
        <details class="pp-edit" id="pp-edit-target"><summary>채취 지점 펼쳐서 편집</summary><p class="pp-inline">계획 영상에서 채취 예정 지점을 직접 찍을 수 있습니다. 찍지 않으면 기본값 B(코어 채취 구역 · raw 메타데이터 기반 추정)를 씁니다.</p><button class="pad-pick" id="pp-openpkg" style="margin:0">계획 영상에서 지점 고치기</button></details></section>
      <section class="pad-card"><h3>출발 점검 · 확정 <span class="pad-tag sim">모의</span></h3>
        <label class="pad-check pp-chk"><input type="checkbox" data-chk="route" ${ui.checks.route ? 'checked' : ''}/> 경로 확인</label>
        <label class="pad-check pp-chk"><input type="checkbox" data-chk="budget" ${ui.checks.budget ? 'checked' : ''}/> 시간 · 산소 예산 확인</label>
        <label class="pad-check pp-chk"><input type="checkbox" data-chk="branch" ${ui.checks.branch ? 'checked' : ''}/> 비상 분기 3건 합의 <small>귀환 시각 도달 → 귀환 시작 · 교신 두절 → 회복 위치·귀환 · 경보 → 함께 귀환</small></label>
        <div class="fp-row" style="margin-top:8px"><span>결정자</span><input id="pp-decider" class="pp-text" maxlength="24" placeholder="예: 김선비" value="${st.planDraft.decider.replace(/"/g, '')}"/></div>
        <div class="pp-actions"><button class="pad-primary" id="pp-start" style="margin:0">계획 확정하고 관제 시작</button><span class="pp-why" id="pp-why"></span></div><div class="pp-actions" id="pp-nexteva-row">${nextEvaBtn('pp-nexteva')}</div>
        <div class="fp-state" id="pp-tx" style="margin-top:8px"></div>
        <div class="pp-actions"><button class="pad-pick" id="pp-prev3" style="margin:0">← ① 지점·경로</button><button class="pad-pick" id="pp-send" style="margin:0">계획만 전송 (대원이 직접 출발)</button></div>
        <p class="pad-note">확정하면 계획과 대조 패키지를 HUD로 보내고 모의 대원이 에어록 출구에서 출발합니다. 전송 · HUD 수신 · 대원 확인 · 출발은 따로 기록됩니다. 직접 걸어 나가려면 "계획만 전송" 뒤 역할 전환 → 현장 대원을 쓰세요.</p></section></div>`;
    const q = (i) => main.querySelector(i);
    const sync = () => { const b = mission.planBudget(), on = st.planDraft.todos.filter((t) => t.on), why = blockers();
      q('#pp-tasksum').innerHTML = `${on.length}건 · ${fmtT(b.staySec)} <small>${on.map((t) => t.name.split(' · ')[0]).join(', ')}</small>`;
      q('#pp-movesum').innerHTML = `이동 가정: <b>${b.transportLabel}</b> · 편도 ${b.outM.toFixed(0)} m = ${fmtT(b.travelSec)}`;
      q('#pp-budsum').innerHTML = `귀환 시각 T+${fmtT(b.turnaroundSec)} <small>(귀환 시작 기한)</small> · 기지 도착 예상 ${fmtT(b.totalSec)} · 귀환 시 산소 ${b.o2AtReturn.toFixed(1)} % <span class="pad-tag sim" style="margin:0">모의</span>`;
      q('#pp-tgtsum').innerHTML = fieldPad.ui.targets.length && fieldPad.ui.targets[0].preset ? '기본값 B · 코어 채취 구역 <span class="pad-tag unk" style="margin:0">추정</span>' : `계획자가 찍은 지점 ${fieldPad.ui.targets.length}곳`;
      q('#pp-why').textContent = why.length ? '아직 시작할 수 없음: ' + why.join(' · ') : st.departed ? '이미 출발함 · 누르면 계획을 다시 보내고 관제 화면으로 갑니다' : '준비됨'; q('#pp-why').classList.toggle('bad', why.length > 0);
      q('#pp-start').textContent = st.departed ? '계획 확정하고 관제 보기' : '계획 확정하고 관제 시작'; { const r = q('#pp-nexteva-row'), h = nextEvaBtn('pp-nexteva'); if (r.dataset.h !== h) { r.dataset.h = h; r.innerHTML = h; } } q('#pp-start').classList.toggle('blocked', why.length > 0); q('#pp-tx').innerHTML = txHtml(); };
    main.querySelectorAll('[data-chk]').forEach((c) => c.addEventListener('change', () => { ui.checks[c.dataset.chk] = c.checked; if (c.checked) c.closest('label').classList.remove('need'); sync(); }));
    q('#pp-decider').addEventListener('input', (e) => { st.planDraft.decider = e.target.value; if (e.target.value.trim()) e.target.classList.remove('need'); sync(); });
    q('#pp-todos').addEventListener('change', (ev) => { const t = ev.target; if (t.dataset.todo) mission.setPlanTodo(t.dataset.todo, { on: t.checked }); if (t.dataset.min) mission.setPlanTodo(t.dataset.min, { min: t.value }); sync(); });
    q('#pp-transport4').addEventListener('change', (e) => { mission.setPlanTransport(e.target.value); sync(); });
    q('#pp-openpkg').addEventListener('click', () => { fieldPad.setOpen(true); fieldPad.show('pkg'); });
    q('#pp-prev3').addEventListener('click', () => pad.show('site'));
    const blocked = () => { const why = blockers(); if (!why.length) return false; const w = q('#pp-why'); w.classList.remove('flash'); void w.offsetWidth; w.classList.add('flash'); main.querySelectorAll('[data-chk]').forEach((c) => c.closest('label').classList.toggle('need', !c.checked)); q('#pp-decider').classList.toggle('need', !st.planDraft.decider.trim()); return true; }; // never a silent dead end: say why, next to the button
    const autoFill = () => { ['route', 'budget', 'branch'].forEach((k) => { ui.checks[k] = true; }); main.querySelectorAll('[data-chk]').forEach((c) => { c.checked = true; c.closest('label').classList.remove('need'); }); if (!st.planDraft.decider.trim()) { st.planDraft.decider = '김선비'; q('#pp-decider').value = '김선비'; } }; // demo: confirming the plan marks the departure checks done and uses the example decision-maker if empty
    q('#pp-start').addEventListener('click', async () => { autoFill(); if (blocked()) return; if (!(await sendAll())) return; if (!st.departed) mission.padStart(); pad.show('ctl'); });
    q('#pp-send').addEventListener('click', async () => { autoFill(); if (blocked()) return; await sendAll(); sync(); });
    main.addEventListener('click', (ev) => { if (ev.target.closest('#pp-nexteva')) nextEva(); });
    sync();
  }, (main) => { const e = main.querySelector('#pp-tx'); if (e) e.innerHTML = txHtml(); });
  // ⑤ 관제: live view for the controller. Values come from mission.baseView(): live while the link is up, the last received snapshot while it is down.
  const PH = { outbound: '이동 중(가는 길)', arrived: '목적지 도착 · 확인 전', onsite: '현장 작업 중', returning: '복귀 중', atBase: '기지 도착 · 종료 전', ended: '임무 종료' };
  const ctlLive = (main) => { const q = (i) => main.querySelector(i); if (!q('#pc-owner')) return; const v = mission.baseView(), r = st.remote;
    q('#pc-owner').textContent = !st.departed ? '출발 전 · 아무것도 진행되지 않음' : st.control === 'hud-manual' ? '사람 대원 · HUD 수동 조작' : st.control === 'pad-auto' ? '모의 대원 자동 진행 · 시연 응답' + (st.warp > 1 ? ` · 배속 ×${st.warp} (체험 시간 단축)` : '') : '정지';
    q('#pc-phase').textContent = (st.departed ? PH[st.phase] : '기지 내부 · EVA 출발 전') + (v.stale ? ' (교신 끊김 전 마지막 상태일 수 있음)' : '');
    q('#pc-clock').textContent = `T+${fmtT(v.sim)}${v.stale ? ' · 마지막 수신값' : ''}`; q('#pc-pos').textContent = `${v.s.toFixed(0)} / ${st.route.length.toFixed(0)} m · ${v.transport === 'rover' ? '로버' : '도보'}`; q('#pc-o2').textContent = v.o2.toFixed(1) + ' %';
    q('#pc-comm').textContent = (st.comm.up ? '교신 양호' : '교신 끊김 — 표시값은 마지막 수신 기준') + ` · 마지막 수신 T+${fmtT(st.comm.lastRx)}`;
    q('#pc-tx').innerHTML = txHtml() + (r ? `<span class="st on">복귀 지시 전송 ${f(r.sentAt)} · 수신 ${f(r.receivedAt)} · 확인 ${f(r.ackAt)} · 실행 ${r.declined ? '보류' : f(r.executedAt)}</span>` : '') + st.alerts.map((a) => `<span class="st on">${a.title}: 수신 ${f(a.receivedAt)} · 확인 ${f(a.ackAt)} · 선택 ${a.choice ? (a.choice === 'return' ? '귀환 ' : '지속 ') + f(a.choiceAt) : '—'} · 실행 ${f(a.executedAt)}</span>`).join('');
    const log = st.script.log, sig = log.length + '/' + st.records.filter((x) => x.sent).length; const ol = q('#pc-log'); if (ol.dataset.sig !== sig) { ol.dataset.sig = sig; ol.innerHTML = log.length ? [...log].reverse().map((l) => `<li>T+${fmtT(l.t)} · ${l.text} <small>시연 응답 · 모의 대원</small></li>`).join('') : '<li class="dim">아직 없음 · 사람이 HUD로 조작한 내용은 여기에 넣지 않습니다(현장 기록 표에서 봄)</li>'; }
    q('#pc-view-note').textContent = st.habitatPose ? '대원이 기지 안에 있습니다 · 실내 걷기로 전환' : '지도의 파란 점(대원)을 눌러도 됩니다 · 모의 대원 진행은 멈추고 사람이 이어받습니다'; q('#pc-warp').textContent = st.autoWarp > 1 ? `배속 ×${st.autoWarp} 끄기` : '배속 ×4 켜기 (또는 Shift 누르는 동안)'; q('#pc-remote').disabled = !st.departed || ['returning', 'atBase', 'ended'].includes(st.phase); q('#pc-wx').disabled = !st.departed || st.phase === 'ended'; { const r = q('#pc-nexteva-row'), h = nextEvaBtn('pc-nexteva'); if (r && r.dataset.h !== h) { r.dataset.h = h; r.innerHTML = h; } } const cv = q('#pc-map'); if (cv) pad.drawMap(cv); };
  pad.addPage('ctl', (main) => {
    main.innerHTML = `<div class="pad-site"><div class="pad-mapwrap"><canvas id="pc-map" width="600" height="600"></canvas></div><div class="pad-side">
        <section class="pad-card tight"><h3>관제 <span class="pad-tag sim">모의 임무 시계</span></h3><dl><dt>진행 주체</dt><dd id="pc-owner"></dd><dt>단계</dt><dd id="pc-phase"></dd><dt>임무 시계</dt><dd id="pc-clock"></dd><dt>위치 · 수단</dt><dd id="pc-pos"></dd><dt>산소</dt><dd id="pc-o2"></dd><dt>교신</dt><dd id="pc-comm"></dd></dl>
          <span id="pc-view-note" hidden></span>
          <div class="fp-row" style="margin:8px 0 0;flex-wrap:wrap"><button class="pad-pick" id="pc-remote" style="margin:0">HUD로 복귀 지시 전송</button><button class="pad-pick" id="pc-wx" style="margin:0">우주기상 경보 전송 (모의)</button><button class="pad-pick" id="pc-comm-btn" style="margin:0">교신 두절/복구 (모의)</button><button class="pad-pick" id="pc-warp" style="margin:0"></button></div>
          <div class="fp-row" style="margin:6px 0 0"><button class="pad-pick" id="pc-recs" style="margin:0">현장 기록 · 후속 과제 보기</button><button class="pad-pick" id="pc-alerts" style="margin:0">경보 상태 보기</button></div><div class="fp-row" id="pc-nexteva-row" style="margin:6px 0 0"></div></section>
        <section class="pad-card tight"><h3>전송 · 수신 · 확인 · 선택 · 실행</h3><div class="fp-state" id="pc-tx"></div></section>
        <section class="pad-card tight grow"><h3>대원 응답 기록 <span class="pad-tag sim">시연 응답 · 모의 대원</span></h3><ol class="pp-log" id="pc-log"></ol>
          <p class="pad-note">모의 대원은 정해진 시연 순서만 수행합니다(수신 확인 → 도착 확인 → 현장 대조 일치 → 관찰 응답 → 촬영·시료 기록 → 복귀 → 임무 종료). 경보나 복귀 지시를 보내면 확인 → 귀환 선택 → 복귀 개시를 따로 남깁니다. 판정은 하지 않습니다. 역할 전환으로 HUD에 들어가면 시연이 멈추고 사람이 이어받습니다. 관제자의 키보드는 대원을 움직이지 못합니다.</p></section></div></div>`;
    // 대원 시점: the button and the crew dot on the map start the same camera flight (pad.ui.onCrewView is set by src/main.js)
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
