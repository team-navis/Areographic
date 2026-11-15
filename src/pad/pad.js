/**
 * PAD UI: persistent DOM shown over the focused 3D monitor for detailed input.
 * Stage 1 implements 홈 and ① 지점 고르기 as working examples; other pages are listed but disabled.
 */
import { fmtT } from '../state/mission.js';
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const NAV = [['home', '홈', true], ['site', '① 지점 고르기', true], ['plan', '② 계획 세우기', false], ['route', '③ 경로 미리보기', false], ['go', '④ 출발 확인', false], ['ctl', '⑤ 관제', false], ['alert', '⑥ 경보 대응', false], ['report', '⑦ 리포트', false], ['set', '설정', false]];
const MAP_PX = 600, VIEW = { cx: -72, cz: -66, half: 165 }; // world metres shown on the PAD map (x east, z = -north)

export function createPad(mission, terrain) {
  const root = h('div', 'pad'); root.id = 'pad-root';
  root.innerHTML = `
    <div class="pad-top"><span class="pad-brand">Areographic <i>PAD</i></span><span class="pad-crumb" id="pad-crumb"></span>
      <span class="pad-status" id="pad-status"></span></div>
    <div class="pad-body"><nav class="pad-nav" id="pad-nav"></nav><main class="pad-main" id="pad-main"></main></div>
    <div class="pad-foot">로버: 가상 · 속도 모의 &nbsp;|&nbsp; 실측: HiRISE DTM 1 m · 정사영상 25 cm (NASA/JPL-Caltech/UArizona/USGS), 로버 위치 M20 waypoints (NASA/JPL-Caltech) &nbsp;|&nbsp; 모의: 대원 위치·산소·시간 &nbsp;|&nbsp; 기지: 가상 &nbsp;|&nbsp; 연출: 흩어진 바위 약 850개(4종 · 고정 시드) · 지면 색</div>`;
  const nav = root.querySelector('#pad-nav'), main = root.querySelector('#pad-main');
  const ui = { page: 'home', layers: { ortho: true, shade: false, slope: false, stops: true, route: true }, weights: { sci: 60, dist: 20, slope: 20 }, ranking: [] };

  NAV.forEach(([id, label, on]) => { const b = h('button', 'pad-navbtn', label + (on ? '' : '<small>다음 단계</small>')); b.dataset.page = id; b.disabled = !on; b.addEventListener('click', () => show(id)); nav.appendChild(b); });

  // ---------- derived rasters from the real DTM (computed once in the browser) ----------
  const n = terrain.near.n, z = terrain.near.z, k = terrain.k;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
  const shade = mk(), slopeC = mk();
  { const gs = shade.getContext('2d'), gl = slopeC.getContext('2d'), ds = gs.createImageData(n, n), dl = gl.createImageData(n, n);
    const L = [-0.62, 0.62, 0.48]; // light from the north-west, 45 deg (cartographic convention)
    for (let r = 1; r < n - 1; r++) for (let c = 1; c < n - 1; c++) {
      const i = r * n + c, dzdx = (z[i + 1] - z[i - 1]) / (2 * k), dzdy = (z[i - n] - z[i + n]) / 2; // east, north gradients (m/m)
      const nl = Math.hypot(dzdx, dzdy, 1), v = Math.max(0, (-dzdx * L[0] - dzdy * L[1] + L[2] * 1.6) / nl / 1.75), g8 = Math.min(255, 40 + v * 215);
      ds.data[i * 4] = g8; ds.data[i * 4 + 1] = g8 * 0.95; ds.data[i * 4 + 2] = g8 * 0.88; ds.data[i * 4 + 3] = 255;
      const sl = Math.atan(Math.hypot(dzdx, dzdy)) * 57.2958; let col = null;
      if (sl >= 25) col = [214, 60, 40, 200]; else if (sl >= 15) col = [230, 150, 40, 170]; else if (sl >= 8) col = [230, 210, 90, 110];
      if (col) { dl.data[i * 4] = col[0]; dl.data[i * 4 + 1] = col[1]; dl.data[i * 4 + 2] = col[2]; dl.data[i * 4 + 3] = col[3]; }
    }
    gs.putImageData(ds, 0, 0); gl.putImageData(dl, 0, 0); }

  const toMap = (x, zz) => [((x - (VIEW.cx - VIEW.half)) / (2 * VIEW.half)) * MAP_PX, ((zz - (VIEW.cz - VIEW.half)) / (2 * VIEW.half)) * MAP_PX];
  function drawMap(cv) {
    const g = cv.getContext('2d'); g.fillStyle = '#0b0d10'; g.fillRect(0, 0, MAP_PX, MAP_PX);
    const B = terrain.bounds, sx = (v) => ((v - B.x0) / (B.x1 - B.x0)), sz = (v) => ((v - B.z0) / (B.z1 - B.z0));
    const crop = (img) => { const w = img.width, u0 = sx(VIEW.cx - VIEW.half) * w, u1 = sx(VIEW.cx + VIEW.half) * w, v0 = sz(VIEW.cz - VIEW.half) * w, v1 = sz(VIEW.cz + VIEW.half) * w; g.drawImage(img, u0, v0, u1 - u0, v1 - v0, 0, 0, MAP_PX, MAP_PX); };
    g.imageSmoothingQuality = 'high';
    if (ui.layers.ortho) crop(terrain.nearImg);
    if (ui.layers.shade) { g.globalAlpha = ui.layers.ortho ? 0.6 : 1; crop(shade); g.globalAlpha = 1; }
    if (!ui.layers.ortho && !ui.layers.shade) { g.fillStyle = '#6b7178'; g.font = '14px sans-serif'; g.fillText('바탕 레이어가 꺼져 있습니다', 20, 30); }
    if (ui.layers.slope) crop(slopeC);
    const st = mission.st;
    if (ui.layers.stops) { g.fillStyle = 'rgba(120,220,255,.9)'; for (const w of terrain.meta.waypoints) { const p = terrain.toWorld(w.x_eqc, w.y_eqc), [mx, my] = toMap(p.x, p.z); g.beginPath(); g.arc(mx, my, 2.6, 0, 6.283); g.fill(); } }
    if (ui.layers.route) {
      g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.55)'; path(g, st.route.pts); g.stroke(); g.lineWidth = 2.5; g.strokeStyle = '#ffb84a'; path(g, st.route.pts); g.stroke();
    }
    for (const c of mission.candidates) { const p = mission.worldOf(c.key), [mx, my] = toMap(p.x, p.z), sel = c.key === st.destKey;
      g.lineWidth = sel ? 3 : 2; g.strokeStyle = sel ? '#ffffff' : '#e8e2d4'; g.fillStyle = sel ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(mx, my, sel ? 11 : 8, 0, 6.283); g.fill(); g.stroke();
      g.font = '600 13px system-ui, sans-serif'; g.fillStyle = '#000'; g.fillText(c.name, mx + 15, my + 5); g.fillStyle = sel ? '#ffffff' : '#f1ece0'; g.fillText(c.name, mx + 14, my + 4); }
    { const [bx, by] = toMap(0, 0); g.fillStyle = '#e8e2d4'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.fillRect(bx - 7, by - 5, 14, 10); g.strokeRect(bx - 7, by - 5, 14, 10); g.font = '600 13px system-ui, sans-serif'; g.fillStyle = '#000'; g.fillText('기지 (가상)', bx + 12, by + 5); g.fillStyle = '#f1ece0'; g.fillText('기지 (가상)', bx + 11, by + 4); }
    { const rp = mission.roverWorld(), [rx, ry] = toMap(rp.x, rp.z); g.save(); g.translate(rx, ry); g.rotate(-rp.yaw); g.fillStyle = st.transport === 'rover' ? '#ffb84a' : '#e8e2d4'; g.strokeStyle = '#111'; g.lineWidth = 1.5; g.fillRect(-4, -6, 8, 12); g.strokeRect(-4, -6, 8, 12); g.restore(); }
    { const p = st.comm.up ? mission.currentPose() : mission.poseAt(st.padView.s), [mx, my] = toMap(p.x, p.z); /* comm down: the base only knows the last received position */ g.fillStyle = '#4fd0ff'; g.strokeStyle = '#04222e'; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, 5.5, 0, 6.283); g.fill(); g.stroke(); }
    if (ui.mapExtras) ui.mapExtras(g, toMap); // v0.2 hook (src/pad/field-pad.js): received field records on the existing map
    // scale bar + north
    const m100 = (100 / (2 * VIEW.half)) * MAP_PX; g.fillStyle = '#f1ece0'; g.fillRect(18, MAP_PX - 22, m100, 3); g.font = '12px system-ui, sans-serif'; g.fillText('100 m', 18, MAP_PX - 28); g.fillText('N ↑', MAP_PX - 44, 24);
  }
  function path(g, pts) { g.beginPath(); pts.forEach((p, i) => { const [mx, my] = toMap(p.x, p.z); if (i) g.lineTo(mx, my); else g.moveTo(mx, my); }); }

  // ---------- ranking: weights re-order candidates; missing evidence stays "미확인", never 0 or "absent" ----------
  function rank() {
    const W = ui.weights, rows = mission.candidates.map((c) => {
      const s = mission.routes[c.key].stats, dTerm = 1 - Math.min(1, s.oneWayM / 400), sTerm = 1 - Math.min(1, s.maxSlopeDeg / 30);
      const parts = [{ id: 'sci', w: c.evidence.known ? W.sci : 0, v: c.evidence.known ? 1 : null }, { id: 'dist', w: W.dist, v: dTerm }, { id: 'slope', w: W.slope, v: sTerm }];
      const wsum = parts.reduce((a, p) => a + p.w, 0), score = wsum > 0 ? parts.reduce((a, p) => a + p.w * (p.v ?? 0), 0) / wsum : null;
      return { c, s, parts, score, complete: c.evidence.known };
    });
    rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)); ui.ranking = rows.map((r) => r.c.key); return rows;
  }

  const pages = {
    home() {
      const st = mission.st, c = mission.candidates.find((x) => x.key === st.destKey), rs = st.route.stats;
      main.innerHTML = `<div class="pad-grid2">
        <section class="pad-card"><h3>오늘 선외활동</h3>
          <dl><dt>목적지</dt><dd id="home-dest">${c.name}</dd><dt>계획</dt><dd>v${st.planVersion} · ${st.planStatus}</dd>
          <dt>편도 / 왕복</dt><dd>${rs.oneWayM.toFixed(0)} m / ${(rs.oneWayM * 2).toFixed(0)} m <small>(1 m DTM 위 3D 길이)</small></dd>
          <dt>이동 수단</dt><dd id="home-transport"></dd><dt>경로 최대 경사</dt><dd>${rs.maxSlopeDeg.toFixed(1)}° <small>(5 m 구간 기준, DTM 계산)</small></dd>
          <dt>경로 근거</dt><dd>${rs.traverseM.toFixed(0)} m는 Perseverance 실제 주행선 <small>(sol 1175~1185, M20 traverse)</small> · 연결 구간 ${rs.connectorM.toFixed(1)} m</dd></dl>
          <p class="pad-note">로버가 실제로 지나간 땅이지만 사람 보행·유인 로버 주행 안전성을 검증한 경로는 아닙니다. 목적지는 시료 25 "Sapphire Canyon" 채취 기간의 로버 위치입니다(암석 좌표 아님).</p>
          <button class="pad-primary" id="home-start">계획 시작 → ① 지점 고르기</button></section>
        <section class="pad-card"><h3>대원 2인 상태 <span class="pad-tag sim">모의</span></h3>
          <table class="pad-table"><tr><th>대원</th><th>상태</th><th>산소</th><th>위치</th></tr>
          <caption id="home-rx" style="caption-side:bottom;text-align:left;font-size:12px;color:#8b949c;padding-top:6px"></caption>
          <tr><td>현장 대원 1</td><td id="home-ctl"></td><td id="home-o2"></td><td id="home-s"></td></tr>
          <tr><td>현장 대원 2 (버디)</td><td>대기</td><td>—</td><td>미구현</td></tr></table>
</section></div>
        <section class="pad-card" style="margin-top:14px"><h3>임무 진행 · 현장 기록 <span class="pad-tag sim">모의 임무 시계</span> <span class="pad-tag" id="home-phase"></span></h3>
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><button class="pad-pick" id="home-remote" style="margin:0">HUD로 복귀 지시 전송</button><span id="home-remote-state" style="font-size:13px;color:#cfd6dc"></span><span class="sp" style="flex:1"></span><span id="home-nexteva"></span></div>
          <table class="pad-table" id="home-records"></table>
          <p class="pad-note">기지 원격 지시는 HUD에 카드로 전달될 뿐이며, 대원이 버튼으로 확인하고 직접 복귀를 실행해야 합니다. 기록은 기지가 수신한 것만 보입니다. 기록 내용의 분석·생명 판정은 하지 않습니다.</p></section>`;
      main.querySelector('#home-remote').addEventListener('click', () => { mission.sendRemote(); live(); });
      main.querySelector('#home-nexteva').addEventListener('click', (ev) => { if (ev.target.closest('button') && ui.onNextEva) ui.onNextEva(); }); // set by plan-pad.js
      main.querySelector('#home-start').addEventListener('click', () => show('site'));
    },
    site() {
      // ① 지점 고르기 as a science workbench (design guide §3/§4): map in the centre, 선택 근거 rows with sources, three key values and the next action.
      // The composite score and its weights sit behind "자세히" so they are not read as a verdict.
      const c0 = mission.candidates.find((x) => x.key === mission.st.destKey), isCF = c0.key === '56_0', rs0 = mission.st.route.stats;
      const EV = { have: ['공개 자료 있음', 'ok'], none: ['자료 미수집', 'unk'], unseen: ['관측 안 됨', 'unseen'] }, tag = (k) => `<span class="pad-tag ${EV[k][1]}" style="margin:0">${EV[k][0]}</span>`;
      const rows = isCF ? [
        ['로버 영상', '암석 근접 사진 PIA26368 · WATSON · sol 1212', 'NASA/JPL-Caltech/MSSS', 'have'],
        ['로버 영상', '전방 Hazcam 작업 구역 메시 · sol 1215', 'NASA/JPL-Caltech (PDS) · 단일 시점이라 암석 뒤쪽은 자료 없음', 'have'],
        ['장비 분석', 'PIXL 광물 지도 PIA26640 · 1 mm 축척', '공개 2025-09-10 · NASA/JPL-Caltech', 'have'],
        ['공식 해석', '잠재적 생명 흔적 · 생명 확인 아님', '비생물학적 설명이 배제되지 않음 · NASA 2025-09-10 발표', 'have'],
        ['위치 한계', '로버 정지점 좌표는 실측 · 채취 지점 A·B는 추정', 'M20 waypoint 56_0 · A·B는 raw 메타데이터 기반 추정(공식 좌표 아님)', 'have'],
        ['궤도 광물', '이 지점의 궤도 광물 자료', '이 데모에서 수집하지 않음 (없다는 뜻이 아님)', 'none'],
        ['암석 뒷면', '실측 메시의 가려진 면', '카메라에서 보이지 않은 영역', 'unseen'],
      ] : [['로버 영상', '이 정지점의 지점 영상', '이 데모에서 수집하지 않음', 'none'], ['장비 분석', '이 정지점의 장비 분석', '이 데모에서 수집하지 않음', 'none'], ['공식 해석', '이 정지점에 대한 공식 설명', '이 데모에서 수집하지 않음', 'none'], ['위치', '로버 정지점 좌표', 'M20 waypoints (NASA/JPL-Caltech) · 실측', 'have']];
      main.innerHTML = `<div class="pad-site"><div class="pad-mapwrap"><canvas id="pad-map" width="${MAP_PX}" height="${MAP_PX}"></canvas></div>
        <div class="pad-side site-bench">
          <div class="site-title"><b id="site-name">${c0.key} ${c0.name}</b><div class="pad-layers" id="pad-layers"></div></div>
          <section class="pad-card tight"><h3>선택 근거 <small>자료가 있는지 · 수집하지 않았는지 · 관측되지 않았는지를 나눠 적음</small></h3>
            <table class="pad-table site-ev" id="site-ev">${rows.map((r) => `<tr><th>${r[0]}</th><td><b>${r[1]}</b><small>${r[2]}</small></td><td>${tag(r[3])}</td></tr>`).join('')}</table></section>
          <div class="site-keys"><div><b>${rs0.oneWayM.toFixed(0)}<i>m</i></b><span>편도 <em class="pad-tag" style="margin:0">계산 · DTM</em></span></div><div><b>${rs0.maxSlopeDeg.toFixed(1)}<i>°</i></b><span>경로 최대 경사 <em class="pad-tag" style="margin:0">계산</em></span></div><div><b>${rs0.traverseM.toFixed(0)}<i>m</i></b><span>실제 로버 주행선 구간 <em class="pad-tag ok" style="margin:0">실측</em></span></div></div>
          <div style="display:flex;gap:8px;align-items:center"><button class="pad-pick" id="site-prev" style="margin:0">← 홈</button><button class="pad-primary" id="site-next" style="margin:0">이 지점·경로로 최종 검토 →</button></div>
          <section class="pad-card tight"><h3>후보 <small>가중치 순 · 자료가 없는 후보는 0점이 아니라 미수집</small></h3><table class="pad-table" id="site-cands"></table></section>
          <details class="site-more"><summary>가중치와 종합 점수 자세히 <small>순서만 바꾸는 값 · 판정 아님</small></summary>
            <section class="pad-card tight"><h3>가중치 3종</h3><div id="pad-weights"></div></section>
            <section class="pad-card tight"><h3>후보 순위</h3><ol class="pad-rank" id="pad-rank"></ol><p class="pad-note" id="pad-rank-note"></p></section></details>
</div></div>`;
      main.querySelector('#site-prev').addEventListener('click', () => show('home')); main.querySelector('#site-next').addEventListener('click', () => { show(pages.go ? 'go' : 'plan'); }); // default path: destination + route here, then the final review (② ③ stay as optional detail pages)
      const LAY = [['ortho', '궤도 영상 · HiRISE 25 cm'], ['shade', '음영기복 · DTM 1 m 계산'], ['slope', '경사 8°/15°/25° · DTM 계산'], ['stops', '로버 정지점 · M20'], ['route', '계획 경로']];
      const lw = main.querySelector('#pad-layers');
      LAY.forEach(([id, label]) => { const l = h('label', 'pad-check', `<input type="checkbox" data-layer="${id}" ${ui.layers[id] ? 'checked' : ''}/> ${label}`); l.querySelector('input').addEventListener('change', (e) => { ui.layers[id] = e.target.checked; refresh(); }); lw.appendChild(l); });
      const ww = main.querySelector('#pad-weights');
      [['sci', '과학 근거'], ['dist', '이동 거리'], ['slope', '경사 부담']].forEach(([id, label]) => {
        const r = h('div', 'pad-slider', `<span>${label}</span><input type="range" min="0" max="100" step="5" value="${ui.weights[id]}" data-weight="${id}"/><b>${ui.weights[id]}</b>`);
        r.querySelector('input').addEventListener('input', (e) => { ui.weights[id] = +e.target.value; r.querySelector('b').textContent = e.target.value; renderRank(); }); ww.appendChild(r); });
      refresh();
    },
  };
  function renderRank() {
    const ol = main.querySelector('#pad-rank'); if (!ol) return; const rows = rank(), st = mission.st; ol.innerHTML = '';
    rows.forEach((r, i) => {
      const sel = r.c.key === st.destKey, li = h('li', 'pad-cand' + (sel ? ' sel' : '')); li.dataset.key = r.c.key;
      const bar = r.parts.map((p) => `<i class="b-${p.id}" style="width:${p.v === null ? 0 : (p.w * p.v) / Math.max(1, r.parts.reduce((a, q) => a + q.w, 0)) * 100}%"></i>`).join('');
      li.innerHTML = `<div class="pad-cand-h"><span class="rk">${i + 1}</span><b>${r.c.name}</b><span class="pad-tag ${r.c.evidence.known ? 'ok' : 'unk'}">${r.c.evidence.label}</span><button class="pad-pick" ${sel ? 'disabled' : ''}>${sel ? '선택됨' : '목적지로 선택'}</button></div>
        <div class="pad-bar">${bar}</div>
        <div class="pad-cand-m">점수 <b>${r.score === null ? '—' : (r.score * 100).toFixed(0)}</b>${r.complete ? '' : ' <em>(과학 근거 미확인 · 비교 불완전)</em>'} · 편도 ${r.s.oneWayM.toFixed(0)} m · 최대 경사 ${r.s.maxSlopeDeg.toFixed(1)}°</div>
        <div class="pad-cand-n">${r.c.evidence.ref ? r.c.evidence.ref + ' · ' : ''}${r.c.note}</div>`;
      li.querySelector('.pad-pick').addEventListener('click', () => { if (!mission.setDestination(r.c.key)) note('이미 출발한 뒤에는 목적지를 바꿀 수 없습니다 (경로 고정).'); });
      ol.appendChild(li);
    });
    { const tb = main.querySelector('#site-cands'); if (tb) { tb.innerHTML = '<tr><th>후보</th><th>과학 자료</th><th>편도</th><th>최대 경사</th><th></th></tr>' + rows.map((r, i) => { const sel = r.c.key === st.destKey; return `<tr class="${sel ? 'sel' : ''}"><td>${i + 1} · ${r.c.key} ${r.c.name}</td><td><span class="pad-tag ${r.c.evidence.known ? 'ok' : 'unk'}" style="margin:0">${r.c.evidence.known ? '공개 자료 있음' : '자료 미수집'}</span></td><td>${r.s.oneWayM.toFixed(0)} m</td><td>${r.s.maxSlopeDeg.toFixed(1)}°</td><td><button class="pad-pick" data-cand="${r.c.key}" ${sel ? 'disabled' : ''} style="margin:0">${sel ? '선택됨' : '선택'}</button></td></tr>`; }).join(''); tb.querySelectorAll('[data-cand]').forEach((b) => b.addEventListener('click', () => { if (!mission.setDestination(b.dataset.cand)) note('이미 출발한 뒤에는 목적지를 바꿀 수 없습니다 (경로 고정).'); })); } }
    note('점수 = 가중 평균(과학 근거·거리·경사). 근거를 수집하지 않은 후보는 과학 항을 0이 아니라 미확인으로 두고 나머지 항만 계산합니다. 생명 존재 확률이 아닙니다.');
  }
  const note = (t) => { const e = main.querySelector('#pad-rank-note'); if (e) e.textContent = t; };
  function refresh() { const cv = main.querySelector('#pad-map'); if (cv) drawMap(cv); renderRank(); status(); }
  function status() {
    const st = mission.st, c = mission.candidates.find((x) => x.key === st.destKey);
    root.querySelector('#pad-status').textContent = `목적지 ${c.key} ${c.name} · 편도 ${st.route.stats.oneWayM.toFixed(0)} m · 계획 v${st.planVersion}`;
    root.querySelector('#pad-crumb').textContent = NAV.find((x) => x[0] === ui.page)[1];
  }
  function show(id) { ui.page = id; nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.page === id)); pages[id](); status(); live(); }
  function live() { // light periodic refresh of shared mission values
    const st = mission.st, e = (id) => main.querySelector(id);
    if (e('#home-ctl')) { const inHabitat = !!st.habitatPose, hp = mission.currentPose(); // before departure the crew walks freely inside the habitat (EVA clock stopped)
      e('#home-ctl').textContent = inHabitat ? '기지 내부 · EVA 출발 전' : (st.transport === 'rover' ? '[로버] ' : '[도보] ') + (st.control === 'hud-manual' ? (st.moving ? '수동 전진 중 (HUD · W)' : '수동 대기 (HUD)') : (st.s > 0.5 ? '정지 · 제어 없음' : '기지 내 대기')); const pv = st.comm.up ? st : st.padView; e('#home-o2').textContent = pv.o2.toFixed(1) + ' %'; e('#home-s').textContent = inHabitat ? `기지 기준 E ${hp.x.toFixed(1)} / N ${(-hp.z).toFixed(1)} m` : `${pv.s.toFixed(1)} / ${st.route.length.toFixed(0)} m`;
      const PH = { outbound: '이동 중(가는 길)', arrived: '목적지 도착 · 대원 확인 전', onsite: '현장 작업 중', returning: '복귀 중', atBase: '기지 도착 · 임무 종료 전', ended: '임무 종료' };
      e('#home-phase').textContent = st.s < 0.5 && st.phase === 'outbound' ? '출발 전' : PH[st.phase];
      const r = st.remote, f = (v) => (v === null ? '—' : 'T+' + fmtT(v)); e('#home-remote').disabled = ['returning', 'atBase', 'ended'].includes(st.phase);
      { const ne = e('#home-nexteva'), h = st.phase === 'ended' ? `<button class="pad-primary" style="margin:0">다음 탐사 계획 시작 → EVA ${st.evaNo + 1}</button>` : ''; if (ne.dataset.h !== h) { ne.dataset.h = h; ne.innerHTML = h; } }
      e('#home-remote-state').textContent = r ? `"${r.text}" · 전송 ${f(r.sentAt)} · HUD 수신 ${f(r.receivedAt)} · 대원 확인 ${f(r.ackAt)} · 실행 ${r.declined ? '보류' : f(r.executedAt)}` : '원격 지시 없음';
      const TY = { observe: '관찰', photo: '촬영 마킹', memo: '메모' }, recs = st.records.filter((x) => x.sent), sig = recs.length + '/' + st.records.length;
      const tb = e('#home-records'); if (tb.dataset.sig !== sig) { tb.dataset.sig = sig; tb.innerHTML = '<tr><th>#</th><th>시각</th><th>종류</th><th>경로 위치</th><th>좌표 (모의 위치)</th><th>내용</th></tr>' + (recs.length ? recs.map((x) => `<tr><td>${x.id}</td><td>T+${fmtT(x.simT)}</td><td>${TY[x.type] || x.type}</td><td>${x.s.toFixed(0)} m</td><td>${x.lonE.toFixed(5)}°E ${x.latN.toFixed(5)}°N</td><td>${String(x.text).replace(/[<>&]/g, '')}${x.input ? ` <small>(${x.input})</small>` : ''}</td></tr>`).join('') : '<tr><td colspan="6" style="color:#8b949c">수신한 기록 없음</td></tr>'); }
      e('#home-rx').textContent = (st.comm.up ? '교신 양호' : '교신 끊김 — 아래 값은 마지막 수신 기준') + ` · 마지막 수신 T+${fmtT(st.comm.lastRx)} (모의 임무 시계)`;
      e('#home-transport').innerHTML = inHabitat ? '기지 내 보행 <small>· EVA 출발 전 · 산소·임무 시간 정지</small>' : st.transport === 'rover' ? `로버 탑승 중 <small>(모의 ${mission.speed().toFixed(1)} m/s)</small>` : `도보 <small>(모의 ${mission.speed().toFixed(1)} m/s) · 로버는 경로 ${st.roverS.toFixed(0)} m 지점에 대기</small>`; }
    const cv = e('#pad-map'); if (cv) drawMap(cv);
  }
  mission.on((type) => { if (type === 'plan') { if (ui.page === 'home') pages.home(); else if (ui.page === 'site') pages.site(); refresh(); } });
  const lives = []; // v0.2 hook: pages added by other modules (src/pad/plan-pad.js)
  function addPage(id, render, liveFn) { pages[id] = () => render(main); const b = nav.querySelector(`[data-page="${id}"]`); if (b) { b.disabled = false; const s = b.querySelector('small'); if (s) s.remove(); } if (liveFn) lives.push([id, liveFn]); }
  setInterval(() => { live(); lives.forEach(([id, f]) => { if (ui.page === id) f(main); }); }, 500);
  show('home');
  return { root, ui, show, refresh, drawMap, toMap, shadeCanvas: shade, addPage };
}

/** Side monitors: canvases driven by the same real data (not interactive in stage 1). */
export function drawOverviewScreen(cv, terrain, farImg) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.fillStyle = '#07090c'; g.fillRect(0, 0, W, H);
  const S = H - 70, ox = 28, oy = 46; g.drawImage(farImg, ox, oy, S, S);
  const F = terrain.far, span = F.n * F.gsd, tl = terrain.toEqc(terrain.bounds.x0, terrain.bounds.z0), br = terrain.toEqc(terrain.bounds.x1, terrain.bounds.z1);
  const mx = (X) => ox + ((X - F.x0) / span) * S, my = (Y) => oy + ((F.y1 - Y) / span) * S;
  g.strokeStyle = '#ffb84a'; g.lineWidth = 2; g.strokeRect(mx(tl.X), my(tl.Y), mx(br.X) - mx(tl.X), my(br.Y) - my(tl.Y));
  g.fillStyle = '#e9e4d8'; g.font = '600 20px system-ui, sans-serif'; g.fillText('광역 맥락 · CTX 정사영상 6 m', ox, 30);
  g.font = '15px system-ui, sans-serif'; g.fillStyle = '#9aa3ab'; const tx = ox + S + 26; let ty = 80;
  for (const l of ['범위 8 km × 8 km', 'Jezero 서쪽 · Neretva Vallis', '', '노란 상자 = 1 m DTM 구간', '(640 m × 640 m)', '', 'DTM: CTX 20 m / HiRISE 1 m', '수직 기준: MOLA areoid', '', '출처: NASA/JPL-Caltech/', 'MSSS/UArizona/USGS', '', '기지 위치는 데모용 가상 배치']) { g.fillText(l, tx, ty); ty += 24; }
}
export function drawProfileScreen(cv, mission) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, st = mission.st; g.fillStyle = '#07090c'; g.fillRect(0, 0, W, H);
  const pts = st.route.pts.filter((p) => p.kind === 'terrain'), s0 = pts[0].s, s1 = pts[pts.length - 1].s; let lo = 1e9, hi = -1e9; pts.forEach((p) => { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); });
  const L = 80, R = W - 30, T = 70, B = H - 70, X = (s) => L + ((s - s0) / (s1 - s0)) * (R - L), Y = (y) => B - ((y - lo) / Math.max(1, hi - lo)) * (B - T);
  g.fillStyle = '#e9e4d8'; g.font = '600 20px system-ui, sans-serif'; g.fillText('경로 고도 단면 · HiRISE DTM 1 m', 28, 34);
  g.strokeStyle = '#263038'; g.lineWidth = 1; g.font = '14px system-ui, sans-serif'; g.fillStyle = '#8b949c';
  for (let i = 0; i <= 4; i++) { const y = lo + ((hi - lo) * i) / 4; g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(R, Y(y)); g.stroke(); g.fillText((y >= 0 ? '+' : '') + y.toFixed(1) + ' m', 14, Y(y) + 5); }
  for (let s = 0; s <= s1; s += 50) if (s >= s0) { g.beginPath(); g.moveTo(X(s), T); g.lineTo(X(s), B); g.stroke(); g.fillText(s + ' m', X(s) - 14, B + 22); }
  g.strokeStyle = '#ffb84a'; g.lineWidth = 2.5; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p.s), Y(p.y)) : g.moveTo(X(p.s), Y(p.y)))); g.stroke();
  const here = mission.currentPose(); if (!st.habitatPose && st.s >= s0) { g.fillStyle = '#4fd0ff'; g.beginPath(); g.arc(X(st.s), Y(here.y), 6, 0, 6.283); g.fill(); }
  g.fillStyle = '#9aa3ab'; g.font = '15px system-ui, sans-serif';
  g.fillText(`편도 ${st.route.stats.oneWayM.toFixed(0)} m · 누적 상승 ${st.route.stats.gainM.toFixed(1)} m · 최대 경사 ${st.route.stats.maxSlopeDeg.toFixed(1)}° · 평균 ${st.route.stats.meanSlopeDeg.toFixed(1)}°`, 28, H - 22);
  g.fillText('고도는 기지 원점 대비(m). 세로 과장 있음.', W - 330, 34);
}
