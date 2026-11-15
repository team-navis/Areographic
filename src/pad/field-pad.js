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
 *  1 대조 패키지: the planner opens the destination reference photo (PIA26368), the browser traces its brightness edges
 *    into a line drawing (deterministic, see src/util/lines.js), the planner clicks the intended sampling point(s),
 *    and the package goes to the HUD. 작성 / 전송 / HUD 수신 / 대원 확인 are shown separately.
 *  2 현장 기록: records received from the HUD on a close-up map + 근거 등급 갱신 (kind of evidence, never a verdict).
 *  3 경보: simulated incidents for the demo and the 수신 / 확인 / 선택 / 실행 state of each alert.
 */
const MAX_LINES = 32; const CW = 660, CH = Math.round(CW * 1118 / 2048), SW = 1024, SH = Math.round(SW * 1118 / 2048), MAP = 470, HALF = 14; // planning image = measured mesh texture (2048x1118), traced at 1024 px wide
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const esc = (t) => String(t).replace(/[<>&"]/g, '');

export function installFieldPad(pad, mission, terrain, opt = {}) {
  const st = mission.st, root = pad.root;
  const open = h('<button class="fp-open" id="fp-open">현장 대조 · 기록 · 경보 <small>v0.2</small></button>'); root.querySelector('.pad-top').insertBefore(open, root.querySelector('#pad-status'));
  const panel = h(`<div class="fp hidden" id="fp-panel"><div class="fp-tabs"><button data-tab="pkg">① 대조 패키지 만들기</button><button data-tab="rec">② 현장 기록 · 근거 등급</button><button data-tab="alert">③ 경보 · 모의 사건</button><span class="fp-sp"></span><button id="fp-close">닫기</button></div><div class="fp-body" id="fp-body"></div></div>`); root.appendChild(panel);
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
    ui.targets.forEach((t, i) => { const x = t.u * CW, y = t.v * CH; g.strokeStyle = '#000'; g.lineWidth = 5; g.beginPath(); g.arc(x, y, 13, 0, 6.2832); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 13, 0, 6.2832); g.moveTo(x - 22, y); g.lineTo(x - 6, y); g.moveTo(x + 6, y); g.lineTo(x + 22, y); g.moveTo(x, y - 22); g.lineTo(x, y - 6); g.moveTo(x, y + 6); g.lineTo(x, y + 22); g.stroke(); g.font = '600 14px system-ui, sans-serif'; g.fillStyle = '#000'; g.fillText(`채취 예정 ${i + 1}`, x + 19, y - 11); g.fillStyle = '#fff'; g.fillText(`채취 예정 ${i + 1}`, x + 18, y - 12); });
  }
  const f = (v) => (v === null || v === undefined ? '—' : 'T+' + fmtT(v));
  function pkgState() {
    const p = st.pkg, e = $('#fp-state'); if (!e) return;
    const dirty = p && ui.draft && (p.lineHash !== ui.draft.hash || JSON.stringify(p.targets.map((t) => [t.u, t.v])) !== JSON.stringify(ui.targets.map((t) => [t.u, t.v])));
    e.innerHTML = `<span class="st ${ui.draft && ui.targets.length ? 'on' : ''}">작성 ${ui.draft ? `선 ${ui.draft.count}개 · 목표 ${ui.targets.length}곳` : '—'}</span><span class="st ${p ? 'on' : ''}" id="fp-st-sent">전송 ${p ? f(p.sentAt) : '—'}</span><span class="st ${p && p.receivedAt !== null ? 'on' : ''}" id="fp-st-rx">HUD 수신 ${p ? f(p.receivedAt) : '—'}</span><span class="st ${p && p.ackAt !== null ? 'on' : ''}" id="fp-st-ack">대원 확인 ${p ? f(p.ackAt) : '—'}</span>${dirty ? '<span class="st warn">전송 뒤 내용이 바뀜 · 다시 전송 필요</span>' : ''}`;
    const b = $('#fp-send'); b.disabled = !(ui.draft && ui.targets.length && st.destKey === REFERENCE.key); b.textContent = ui.targets.length && ui.targets[0].preset ? 'HUD로 대조 패키지 전송 · 기본값 B(추정) 사용' : 'HUD로 대조 패키지 전송'; $('#fp-info').textContent = ui.draft ? `암석 구역의 선 ${ui.draft.count}개` : '추출 전'; $('#fp-tech').textContent = ui.draft ? `추출 ${ui.draft.tracedAll}개 중 긴 선 ${ui.draft.count}개 · 꼭짓점 ${ui.draft.points}개 · 지문 ${ui.draft.hash} · ${ui.ms.toFixed(0)} ms · 세밀도 "${DETAIL[ui.detail].label}"${p ? ` · 패키지 r${p.rev} · 계획 v${p.planVersion}` : ''}` : '';
    $('#fp-tlist').innerHTML = ui.targets.length ? ui.targets.map((t, i) => `<li>채취 예정 ${i + 1} · 영상 좌표 (${(t.u * 100).toFixed(1)}%, ${(t.v * 100).toFixed(1)}%)${t.preset ? ' · 기본값: B 코어 채취 구역 (raw 메타데이터 기반 추정)' : ''}</li>`).join('') : '<li class="dim">사진을 클릭해 채취 예정 지점을 찍으세요 (최대 3곳)</li>';
  }
  const pages = {
    pkg() {
      const okDest = st.destKey === REFERENCE.key;
      body.innerHTML = `<div class="fp-cols"><div><canvas id="fp-cv" width="${CW}" height="${CH}"></canvas>
          <div class="fp-credit">계획 영상: ${REFERENCE.source} · 크레딧 ${REFERENCE.credit} (PDS Imaging Node) · 실측 메시의 텍스처를 작업 구역만 잘라 2048 px로 줄임 · 선은 이 영상에서 따서 메시의 텍스처 좌표로 되돌려 투영</div></div>
        <div class="fp-side">
          <section class="pad-card tight"><h3>계획 사진에서 선 따기 <small>밝기 경계 추적 · 인식/분석 아님</small></h3>
            <div class="fp-row" id="fp-detail">${Object.entries(DETAIL).map(([k, v]) => `<button class="pad-pick" data-detail="${k}" style="margin:0">${v.label}</button>`).join('')}</div>
            <div class="fp-row"><label class="pad-check"><input type="checkbox" id="fp-photo" ${ui.showPhoto ? 'checked' : ''}/> 사진</label><label class="pad-check"><input type="checkbox" id="fp-lines" ${ui.showLines ? 'checked' : ''}/> 선</label></div>
            <span id="fp-info" style="font-size:13px;color:#cfd6dc"></span><details class="fp-tech"><summary>추출 정보 (검수용)</summary><span id="fp-tech"></span></details></section>
          <section class="pad-card tight"><h3>채취 예정 지점 <small>계획자가 사진 위에 직접 표시</small></h3><ul class="fp-tlist" id="fp-tlist"></ul><button class="pad-pick" id="fp-clear" style="margin:6px 0 0">지점 지우기</button></section>
          <section class="pad-card tight"><h3>대조 패키지 <small>선 · 지점 · 출처 · 계획 버전</small></h3>
            <div class="fp-state" id="fp-state"></div>
            <button class="pad-primary" id="fp-send" style="margin-top:8px">HUD로 대조 패키지 전송</button>
            <p class="pad-note">${okDest ? '전송은 HUD에 카드를 띄울 뿐입니다. 대원이 버튼으로 수신을 확인해야 현장에서 선이 투영됩니다. 현장 지형은 같은 날 전방 Hazcam의 실측 메시(단일 시점 · 축소)이고, 채취 지점 A·B는 raw 메타데이터 기반 추정입니다. 일치 여부는 대원이 말합니다(자동 인식 없음).' : '선택한 목적지에는 지점 영상을 수집하지 않았습니다. 대조 패키지는 Cheyava Falls 시료 채취 지점에서만 만들 수 있습니다.'}</p></section></div></div>`;
      const cv = $('#fp-cv'); cv.addEventListener('click', (ev) => { if (ui.targets.length && ui.targets[0].preset) ui.targets = []; /* the first click replaces the default B estimate */ if (ui.targets.length >= 3) return; const u = ev.offsetX / cv.clientWidth, v = ev.offsetY / cv.clientHeight; if (u < 0 || u > 1 || v < 0 || v > 1) return; ui.targets.push({ u: Math.round(u * 10000) / 10000, v: Math.round(v * 10000) / 10000 }); drawPkg(); pkgState(); });
      $('#fp-detail').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { extract(+b.dataset.detail); mark(); drawPkg(); pkgState(); }));
      const mark = () => $('#fp-detail').querySelectorAll('button').forEach((b) => { b.disabled = +b.dataset.detail === ui.detail; });
      $('#fp-photo').addEventListener('change', (e) => { ui.showPhoto = e.target.checked; drawPkg(); }); $('#fp-lines').addEventListener('change', (e) => { ui.showLines = e.target.checked; drawPkg(); });
      $('#fp-clear').addEventListener('click', () => { ui.targets = []; drawPkg(); pkgState(); });
      $('#fp-send').addEventListener('click', () => { mission.sendPackage({ lines: ui.draft.polylines, hash: ui.draft.hash, detail: ui.detail, targets: ui.targets }); pkgState(); });
      load().then(() => { if (!ui.draft) extract(); mark(); drawPkg(); pkgState(); });
    },
    rec() {
      body.innerHTML = `<div class="fp-cols"><div><canvas id="fp-map" width="${MAP}" height="${MAP}"></canvas><div class="fp-credit">목적지 주변 ${HALF * 2} m · HiRISE 25 cm 정사영상 · 기록 위치는 모의 위치를 지도 좌표로 바꾼 값 · 암석 표시는 실측 메시의 B 지점(추정)</div></div>
        <div class="fp-side"><section class="pad-card tight"><h3>현장 기록 수신 <span class="pad-tag sim">모의 임무 시계</span> <small id="fp-rx"></small> <button class="pad-pick" id="fp-export" style="margin:0 0 0 8px" title="입력 자료 · 계획 · 전송 상태 · 대원 응답 · 수신 기록 · 후속 과제를 한 JSON으로 저장">임무 기록 내보내기</button> <small id="fp-export-note"></small></h3><div class="fp-scroll"><table class="pad-table" id="fp-recs"></table></div></section>
          <section class="pad-card tight"><h3>근거 등급 갱신 <small>다음 계획의 입력 · 등급은 근거의 종류</small></h3><div class="fp-scroll"><table class="pad-table" id="fp-ev"></table></div><p class="pad-note" id="fp-evnote"></p></section>
          <section class="pad-card tight"><h3>후속 확인 과제 <span class="pad-tag sim">팀 제안 반영(미채택 제안 기반 데모)</span> <small id="fp-fu-n"></small></h3><div class="fp-scroll" style="max-height:120px"><table class="pad-table" id="fp-fu"></table></div>
            <div class="fp-row" style="margin:6px 0 0"><button class="pad-pick" id="fp-next" style="margin:0">다음 선외활동 계획으로 넘기기 (모의 재시작)</button><span class="dim" id="fp-carried" style="font-size:12px"></span></div></section></div></div>`;
      $('#fp-export').addEventListener('click', async () => { const tr = await exportTrace(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(tr, null, 1)], { type: 'application/json' })); a.download = `areographic-trace-eva${tr.eva}-plan-v${tr.plan.planVersion}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); $('#fp-export-note').textContent = `저장함 · 기록 ${tr.records.length}건 · 입력 자료 ${tr.inputs.length}종`; });
      $('#fp-next').addEventListener('click', () => { if (mission.beginNextEva()) recLive(true); });
      $('#fp-fu').addEventListener('change', (ev) => { const k = ev.target.dataset.fu; if (k) { mission.markFollowUp(k, ev.target.checked); recLive(true); } });
      recLive(true);
    },
    alert() {
      body.innerHTML = `<div class="fp-cols"><div class="fp-side" style="width:430px;flex:none"><section class="pad-card tight"><h3>모의 사건 <small>데모 진행용 · 실제 관측 아님</small></h3>
          <div class="fp-col"><button class="pad-pick" id="fp-wx" style="margin:0">우주기상 경보를 HUD로 전송 (모의)</button><button class="pad-pick" id="fp-buddy" style="margin:0"></button><button class="pad-pick" id="fp-comm" style="margin:0"></button></div>
          <p class="pad-note">귀환 시각 임박과 잔여 체류 10분 경보는 HUD가 모의 임무 시계로 스스로 띄웁니다. "10분"은 팀 설계 수치이며 NASA 기준이 아닙니다. 우주기상 경보의 실제 자료(DONKI) 연결은 이 빌드에 없습니다.</p></section></div>
        <div class="fp-side"><section class="pad-card tight"><h3>경보 상태 <small>수신 · 확인 · 선택 · 실행은 서로 다른 시각</small></h3><div class="fp-scroll" style="max-height:470px"><table class="pad-table" id="fp-alerts"></table></div>
          <p class="pad-note">복귀를 "선택"해도 복귀가 시작되지는 않습니다. 대원이 복귀 개시를 실행한 시각이 "실행"에 남습니다. 교신이 끊긴 동안의 HUD 쪽 변화는 이 표에 바로 보이지만, 실제 체계라면 다시 이어진 뒤에야 기지가 알 수 있습니다(이 데모는 그 지연을 흉내 내지 않음).</p></section></div></div>`;
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
    { const [mx, my] = M(e.x, e.z); g.strokeStyle = '#ffb84a'; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, 9, 0, 6.2832); g.stroke(); lab('로버 정지점 56_0 (실제)', mx - 60, my + 44); }
    if (st.destKey === REFERENCE.key && opt.points) { const b = opt.points.B.meta.snapped_vertex_ned_m, [mx, my] = M(e.x + b[1], e.z - b[0]); g.fillStyle = '#e8e2d4'; g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.rect(mx - 7, my - 5, 14, 10); g.fill(); g.stroke(); lab('Cheyava Falls (실측 메시)', mx - 150, my + 4); }
    markers(g, M, true);
    g.fillStyle = '#f1ece0'; g.fillRect(14, MAP - 18, 5 * k, 3); g.font = '12px system-ui, sans-serif'; g.fillText('5 m', 14, MAP - 24); g.fillText('N ↑', MAP - 40, 22);
  }
  /** Record markers shared by the close-up map and (through ui.mapExtras) the existing ① site map. Only records the base has received. */
  function markers(g, M, labels) {
    let nS = 0; const placed = []; for (const r of st.records) { if (!r.sent || r.x === undefined || !['sample', 'interest', 'photo', 'compare'].includes(r.type)) continue; let [mx, my] = M(r.x, r.z);
      if (r.type === 'sample') { mx += 9 * nS; nS++; g.fillStyle = '#ffd24a'; g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(mx, my - 8); g.lineTo(mx + 7, my); g.lineTo(mx, my + 8); g.lineTo(mx - 7, my); g.closePath(); g.fill(); g.stroke(); }
      else if (r.type === 'interest') { g.fillStyle = '#4fd0ff'; g.strokeStyle = '#04222e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(mx, my - 8); g.lineTo(mx + 7.5, my + 6); g.lineTo(mx - 7.5, my + 6); g.closePath(); g.fill(); g.stroke(); }
      else { g.fillStyle = '#fff'; g.beginPath(); g.arc(mx, my, 2.5, 0, 6.2832); g.fill(); continue; }
      if (labels) { g.font = '600 12px system-ui, sans-serif'; const t = `#${r.id} ${r.type === 'sample' ? '시료' : '관심'} T+${fmtT(r.simT)}`; let lx = r.type === 'interest' ? mx - 122 : mx + 12, ly = my - 12; while (placed.some((q) => Math.abs(q[0] - lx) < 110 && Math.abs(q[1] - ly) < 14)) ly -= 14; placed.push([lx, ly]); // co-located records: stack the labels upward
        g.fillStyle = '#000'; g.fillText(t, lx + 1, ly + 1); g.fillStyle = '#fff'; g.fillText(t, lx, ly); } }
  }
  pad.ui.mapExtras = (g, toMap) => markers(g, toMap, false);
  function recLive(force) {
    const tb = $('#fp-recs'); if (!tb) return; const rx = st.records.filter((r) => r.sent), sig = rx.length + '/' + st.records.length + '/' + st.comm.up + '/' + st.phase + '/' + st.evaNo + '/' + Object.keys(st.followMarks).length; if (!force && tb.dataset.sig === sig) return; tb.dataset.sig = sig;
    $('#fp-rx').textContent = `${st.comm.up ? '교신 양호' : '교신 끊김'} · 마지막 수신 T+${fmtT(st.comm.lastRx)} · 수신 ${rx.length}건 / 현장 생성 ${st.comm.up ? st.records.length : '?'}건`;
    tb.innerHTML = '<tr><th>#</th><th>시각</th><th>종류</th><th>좌표 (모의 위치)</th><th>선량 (모의)</th><th>내용</th></tr>' + (rx.length ? [...rx].reverse().map((r) => `<tr data-type="${r.type}"><td>${r.id}</td><td>T+${fmtT(r.simT)}</td><td>${TYPE[r.type] || r.type}</td><td>${r.lonE.toFixed(5)}°E ${r.latN.toFixed(5)}°N</td><td>${r.doseUsv.toFixed(2)} µSv</td><td>${esc(r.text) || '—'}${r.type === 'sample' ? ` <small>영상 시점 T+${fmtT(r.videoT)}${r.target ? ` · 채취 예정 ${r.target.id} (계획 v${r.target.planVersion})` : ' · 계획 지점 연결 없음'}</small>` : ''}${r.input ? ` <small>(${r.input})</small>` : ''}</td></tr>`).join('') : '<tr><td colspan="6" class="dim">수신한 기록 없음</td></tr>');
    const ev = mission.evidence(); $('#fp-ev').innerHTML = '<tr><th>항목</th><th>근거 등급</th><th>근거</th></tr>' + ev.rows.map((r) => `<tr data-field="${r.field ? 1 : 0}"><td>${r.feature}</td><td><span class="pad-tag ${r.grade === '미확인' ? 'unk' : r.grade === '육안' ? 'sim' : 'ok'}" style="margin:0">${r.grade}</span></td><td>${r.basis}</td></tr>`).join('');
    $('#fp-evnote').textContent = `이번 선외활동으로 갱신된 항목 ${ev.updated}개 · 시료 기록 ${ev.samples}건(분석 전) · 추가 관심 지점 ${ev.interests}곳 · 현장 대조 ${ev.compare === 'match' ? '대원 일치 확인' : ev.compare === 'mismatch' ? '대원 불일치 보고' : '없음'}. 등급은 관측(궤도)·측정(로버 장비)·육안(대원)·미확인으로 근거의 종류만 나타냅니다. 생명 여부 판정이 아니며 "미확인"은 없음이 아닙니다. 저장은 이 브라우저 세션 안에서만 유지됩니다.`;
    const fu = mission.followUps(), nm = fu.filter((x) => x.marked).length; $('#fp-fu-n').textContent = `${fu.length}건 · 다음 탐사에서 확인 ${nm}건`;
    $('#fp-fu').innerHTML = '<tr><th>다음 탐사에서 확인</th><th>구분</th><th>내용</th><th>출처 기록 · 시각 · 좌표(모의 위치)</th></tr>' + (fu.length ? fu.map((x) => `<tr data-fu-kind="${x.kind}"><td><input type="checkbox" data-fu="${x.key}" ${x.marked ? 'checked' : ''}/></td><td>${x.kind}</td><td>${esc(x.title)} <small>${x.note}</small></td><td>#${x.recId} · T+${fmtT(x.simT)} · ${x.lonE.toFixed(5)}°E ${x.latN.toFixed(5)}°N</td></tr>`).join('') : '<tr><td colspan="4" class="dim">과제 없음 · 못 봄/판단 불가 응답, 불일치 보고, 관심 지점, 시료 기록이 들어오면 모입니다</td></tr>');
    $('#fp-next').disabled = st.phase !== 'ended'; $('#fp-carried').textContent = `EVA ${st.evaNo}` + (st.carried.length ? ` · 이전 탐사에서 넘어온 확인 항목 ${st.carried.length}건 (HUD 작업 목록에 표시 · 확인 ${st.carried.filter((c) => c.doneAt !== null).length}건)` : st.phase === 'ended' ? ' · 임무 종료됨: 표시한 항목을 다음 계획으로 넘길 수 있음' : ' · 넘기기는 임무 종료 뒤 가능') + ' · 자동 연구·점수·판정 없음';
    drawRecMap();
  }
  function alertLive() {
    const tb = $('#fp-alerts'); if (!tb) return;
    $('#fp-buddy').textContent = st.buddyAway ? '버디 이탈 해제 (모의)' : '버디 이탈 시작 (모의)'; $('#fp-comm').textContent = st.comm.up ? '교신 두절 시작 (모의)' : '교신 복구 (모의)';
    tb.innerHTML = '<tr><th>#</th><th>경보</th><th>출처</th><th>발생/전송</th><th>HUD 수신</th><th>대원 확인</th><th>선택</th><th>실행(복귀 개시)</th></tr>' + (st.alerts.length ? st.alerts.map((a) => `<tr data-kind="${a.kind}"><td>${a.id}</td><td>${ALERT_KINDS[a.kind].title}</td><td>${a.source}</td><td>${f(a.sentAt ?? a.raisedAt)}</td><td>${f(a.receivedAt)}</td><td>${f(a.ackAt)}</td><td>${a.choice ? (a.choice === 'return' ? '복귀 ' : '지속 ') + f(a.choiceAt) : a.ackAt !== null && !a.choosable ? '해당 없음' : '—'}</td><td>${a.executedAt !== null ? f(a.executedAt) : a.held ? '보류' : '—'}</td></tr>`).join('') : '<tr><td colspan="8" class="dim">경보 없음</td></tr>');
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
      { id: 'HiRISE DTM 1 m (JEZ_hirise_soc_006)', kind: '실측 · 궤도', usedFor: '근거리 지형 높이 · 경로 경사 계산', source: m.near.source, localFile: m.near.dtm.file, localSha256: (m.files[m.near.dtm.file] || {}).sha256 || null, processing: '640 m 창 잘라냄 · 16비트 양자화(최대 오차 0.7 mm)' },
      { id: 'HiRISE 정사영상 25 cm', kind: '실측 · 궤도', usedFor: '지도 바탕 · 지형 착색(연출)', source: m.near.ortho_source, localFile: 'hirise_ortho_25cm_2560.jpg', localSha256: (m.files['hirise_ortho_25cm_2560.jpg'] || {}).sha256 || null },
      { id: 'CTX DTM 20 m (JEZ_ctx_B_soc_008)', kind: '실측 · 궤도', usedFor: '광역 지형', source: m.far.source, localFile: m.far.dtm.file, localSha256: (m.files[m.far.dtm.file] || {}).sha256 || null },
      { id: 'M20 traverse (MMGIS M20_traverse.json)', kind: '실측 · 로버 위치', usedFor: '고정 경로(주행선)', source: route ? route.source : null, sourceSha256: route ? route.sha256 : null, localFile: 'route.json' },
      { id: 'M20 waypoints (MMGIS M20_waypoints.json)', kind: '실측 · 로버 위치', usedFor: '정지점 · 목적지 56_0', source: m.waypoints_source },
      { id: hz.product_id || (ws ? ws.source_id : REFERENCE.id), kind: '실측 · 전방 Hazcam 메시 (sol 1215)', usedFor: '계획 영상 · 대조 패키지의 선 · 현장 대조 대상', source: hz.urls || hz.canonical || null, localFile: hz.local || 'fhaz_1215_workspace.*', localSha256: hz.local_sha256 || (ws ? ws.sha256 : null), limits: hz.limits || null, presentation: '메시 높이 이동 · 가장자리 변형 · 착색은 연출' },
      { id: nv.product_id || 'NLG_1176 Navcam mesh', kind: '실측 · Navcam 메시 (sol 1176)', usedFor: '경로 옆 지형 조각(표시만)', source: nv.urls || null, localSha256: nv.local_sha256 || null, presentation: '높이 이동 · 가장자리 변형 · 착색은 연출' },
      { id: 'PIA26368', kind: '실측 영상 · WATSON (sol 1212)', usedFor: '관찰 대조 ① 원본 영상', source: w.page || null, originalSha256: w.original_sha256 || null, credit: w.credit || null },
      { id: 'PIA26640', kind: '장비 분석 · PIXL 광물 지도', usedFor: '관찰 대조 ② 공개 분석 자료 (①과의 위치 정합 미확인)', source: px.page || null, originalSha256: px.original_sha256 || null, credit: px.credit || null },
    ];
  }
  async function exportTrace() { return mission.exportTrace(await traceInputs()); }
  return { ui, panel, show, setOpen, extract, exportTrace, get ready() { return load(); }, ANSWERS };
}
