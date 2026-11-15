import './stations.css';
import { WALK_SPEED, ROVER_SPEED, BOARD_RANGE } from '../state/mission.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const TABS = {
  science: [['terrain', '01', '지형 단면'], ['waypoints', '02', '관측 정지점'], ['sources', '03', '자료 출처']],
  systems: [['crew', '01', '대원 상태'], ['rover', '02', '로버'], ['habitat', '03', '기지·모의 범위']],
};

/** A real DOM terminal for either side monitor. All live values share stage 1 mission state. */
export function createStations(mission, terrain) {
  const root = el('section', 'station-console');
  root.innerHTML = `<header class="sc-top"><span class="sc-brand">Areographic <span>가상 기지</span></span><span class="sc-signal">● LOCAL MISSION</span></header>
    <div class="sc-heading"><div><p class="sc-eyebrow"></p><h2></h2></div><div class="sc-revision"></div></div>
    <nav class="sc-tabs" aria-label="모니터 세부 항목"></nav><main class="sc-main"></main>
    <footer class="sc-footer"><span>관측: 보관 지형 · 대원·로버: 모의</span><span class="sc-footer-route"></span></footer>`;
  const title = root.querySelector('h2'), eyebrow = root.querySelector('.sc-eyebrow');
  const nav = root.querySelector('.sc-tabs'), main = root.querySelector('.sc-main');
  const state = { station: 'science', pages: { science: 'terrain', systems: 'crew' }, route: mission.st.route, sampleS: null, waypoint: null };
  let updaters = [];
  const live = (fn) => { updaters.push(fn); fn(); };
  const candidate = () => mission.candidates.find((c) => c.key === mission.st.destKey);
  const add = (parent, ...nodes) => { parent.append(...nodes); return parent; };
  const note = (text) => el('p', 'sc-note', text);
  const panel = (heading, kicker) => {
    const box = el('section', 'sc-panel');
    if (kicker) box.append(el('p', 'sc-eyebrow', kicker));
    if (heading) box.append(el('h3', '', heading));
    return box;
  };
  const metric = (label, value, unit = '') => {
    const box = el('div', 'sc-metric');
    add(box, el('span', '', label), add(el('strong'), el('b', '', value), el('small', '', unit)));
    return box;
  };
  const facts = (rows) => {
    const dl = el('dl', 'sc-facts');
    for (const [label, value] of rows) add(dl, el('dt', '', label), el('dd', '', value));
    return dl;
  };
  const meter = (label, get, unit = '%') => {
    const box = el('div', 'sc-meter');
    const value = el('b'), bar = el('i'), track = add(el('div', 'sc-track'), bar);
    add(box, add(el('div', 'sc-meter-label'), el('span', '', label), value), track);
    live(() => { const n = clamp(get(), 0, 100); value.textContent = `${fmt(n)} ${unit}`; bar.style.width = `${n}%`; });
    return box;
  };
  const button = (label, action, cls = '') => {
    const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', action); return b;
  };

  function terrainPage() {
    const route = mission.st.route, stats = route.stats;
    const grid = el('div', 'sc-grid');
    const graph = panel('경로를 따라 지형 읽기', 'HiRISE / ELEVATION PROFILE');
    const cv = el('canvas', 'sc-profile'); cv.width = 760; cv.height = 290;
    cv.setAttribute('aria-label', '기지 원점 대비 경로 고도 단면. 아래 슬라이더로 지점을 선택하세요.');
    const sliderLabel = el('label', 'sc-scrubber');
    const range = el('input'); range.type = 'range'; range.min = '0'; range.max = String(route.length); range.step = '0.5';
    state.sampleS = clamp(state.sampleS ?? route.length * .5, 0, route.length); range.value = String(state.sampleS);
    const sampleText = el('span'); add(sliderLabel, el('span', '', '단면 지점 선택'), range, sampleText);
    const details = facts([['원점 대비 고도', ''], ['지형 자료', ''], ['5 m 구간 경사', '']]);
    const ds = details.querySelectorAll('dd');
    function draw() {
      const s = Number(range.value), here = mission.poseAt(s), pts = route.pts.filter((p) => p.kind === 'terrain');
      const g = cv.getContext('2d'), ys = pts.map((p) => p.y), lo = Math.floor(Math.min(...ys)) - 1, hi = Math.ceil(Math.max(...ys)) + 1;
      const X = (v) => 54 + v / route.length * 684, Y = (v) => 246 - (v - lo) / Math.max(1, hi - lo) * 210;
      g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, 760, 290); g.font = '14px monospace';
      for (let i = 0; i <= 4; i++) { const y = lo + (hi - lo) * i / 4; g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(54, Y(y)); g.lineTo(738, Y(y)); g.stroke(); g.fillStyle = '#8e8e8a'; g.fillText(`${fmt(y, 0)} m`, 5, Y(y) + 5); }
      g.fillStyle = '#8e8e8a'; g.fillText('0 m', 54, 274); g.fillText(`${fmt(route.length, 0)} m`, 675, 274);
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p.s), Y(p.y)) : g.moveTo(X(p.s), Y(p.y)));
      g.lineTo(X(pts.at(-1).s), 246); g.lineTo(X(pts[0].s), 246); g.closePath(); g.fillStyle = 'rgba(255,255,255,.07)'; g.fill();
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p.s), Y(p.y)) : g.moveTo(X(p.s), Y(p.y))); g.strokeStyle = '#f5f5f3'; g.lineWidth = 2.5; g.stroke();
      g.strokeStyle = '#ffd23f'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(s), 25); g.lineTo(X(s), 246); g.stroke();
      if (here.kind === 'terrain') { g.beginPath(); g.arc(X(s), Y(here.y), 5, 0, Math.PI * 2); g.fillStyle = '#ffd23f'; g.fill(); }
      state.sampleS = s; sampleText.textContent = `${fmt(s)} m`;
      ds[0].textContent = `${fmt(here.y, 2)} m${here.kind === 'terrain' ? '' : ' · 가상 기지/경사로'}`;
      ds[1].textContent = here.kind === 'terrain' ? terrain.ground(here.x, here.z).source : '가상 구조물';
      const a = mission.poseAt(Math.max(stats.indoorM, s - 2.5)), b = mission.poseAt(Math.min(route.length, s + 2.5));
      const run = Math.hypot(b.x - a.x, b.z - a.z);
      ds[2].textContent = here.kind === 'terrain' && run > .1 ? `${fmt(Math.atan2(Math.abs(b.y - a.y), run) * 180 / Math.PI)}° · 지형 계산` : '—';
    }
    range.addEventListener('input', draw);
    add(graph, cv, sliderLabel, note('가로: 출발점부터 거리 · 세로: 기지 원점 대비 고도. 세로 과장 있음.'));
    const summary = panel(candidate().name, 'SELECTED EXPEDITION');
    const metrics = el('div', 'sc-metrics');
    add(metrics, metric('편도 거리', fmt(stats.oneWayM, 0), 'm'), metric('최대 경사', fmt(stats.maxSlopeDeg), '°'), metric('누적 상승', fmt(stats.gainM), 'm'), metric('평균 경사', fmt(stats.meanSlopeDeg), '°'));
    add(summary, metrics, details, note('경사는 1 m DTM의 5 m 구간 계산값입니다. 미세 바위·발판·지반 강도를 판정하지 않습니다.'));
    add(grid, graph, summary); main.append(grid); draw();
  }

  function waypointsPage() {
    const layout = el('div', 'sc-grid sc-waypoint-grid');
    const list = panel('관측 정지점', 'PERSEVERANCE / ARCHIVE');
    const buttons = el('div', 'sc-waypoint-list');
    const detail = panel('정지점 상세', 'OBSERVATION RECORD');
    const wp = terrain.meta.waypoints;
    let current = wp.find((w) => `${w.site}_${w.drive}` === state.waypoint) || wp.find((w) => `${w.site}_${w.drive}` === mission.st.destKey) || wp[0];
    function inspect(w) {
      current = w; state.waypoint = `${w.site}_${w.drive}`;
      buttons.querySelectorAll('button').forEach((b) => { const selected = b.dataset.key === state.waypoint; b.classList.toggle('is-active', selected); b.setAttribute('aria-pressed', String(selected)); });
      detail.replaceChildren(el('p', 'sc-eyebrow', `PERSEVERANCE · SOL ${w.sol}`), el('h3', '', `Site ${w.site} / Drive ${w.drive}`));
      const node = mission.st.route.nodes.find((n) => n.key === state.waypoint);
      add(detail, facts([['위도 · 행성중심', `${fmt(w.lat, 6)}° N`], ['경도 · 동경', `${fmt(w.lon, 6)}° E`], ['HiRISE DTM 고도', `${fmt(w.hirise_dtm_elev, 2)} m`], ['M20 기록 고도', `${fmt(w.elev_geoid_m20, 2)} m`], ['현재 경로', node ? `${fmt(node.s)} m 지점 · 경로 노드` : '경로 노드 아님']]), note('고도 기준: MOLA areoid. 로버의 정지 위치이며 암석 자체의 좌표가 아닙니다.'));
      const c = mission.candidates.find((v) => v.key === state.waypoint);
      if (c) add(detail, el('div', 'sc-evidence', c.evidence.label), note(c.note), ...(c.evidence.ref ? [note(c.evidence.ref)] : []));
    }
    wp.forEach((w) => {
      const key = `${w.site}_${w.drive}`;
      const b = button('', () => inspect(w), 'sc-waypoint'); b.dataset.key = key;
      add(b, el('span', '', `SOL ${w.sol}`), el('b', '', `${w.site} / ${w.drive}`), el('small', '', key === mission.st.destKey ? '현재 목적지' : '관측 정지점'));
      buttons.append(b);
    });
    add(list, buttons, note('보관된 21개 정지점 · Sol 1171–1220')); add(layout, list, detail); main.append(layout); inspect(current);
  }

  function sourcesPage() {
    const grid = el('div', 'sc-source-grid');
    const entries = [
      ['HiRISE', '근거리 지형', 'DTM 1 m · 정사영상 25 cm', '640 × 640 격자. 영상은 단색 관측을 화면에서 착색했습니다.', terrain.meta.near.source, terrain.meta.near.ortho_source],
      ['CTX', '광역 지형', 'DTM 20 m · 정사영상 6 m', '8 km × 8 km 투영 창. 상세 지형 바깥의 광역 맥락입니다.', terrain.meta.far.source, terrain.meta.far.ortho_source],
      ['M20', '로버 위치 기록', 'Perseverance · 21개 정지점', '정지점 21개는 표식. 데모 경로는 Perseverance 실제 주행선(M20 traverse, sol 1175~1185)을 따르며 유인 안전 경로가 아닙니다.', terrain.meta.waypoints_source],
    ];
    for (const [code, name, resolution, desc, ...urls] of entries) {
      const p = panel(name, code); add(p, el('strong', 'sc-resolution', resolution), note(desc));
      urls.forEach((url, i) => { const a = el('a', 'sc-source-link', urls.length === 1 ? '원본 위치 자료 ↗' : `${i === 0 ? '원본 수치 지형' : '원본 정사영상'} ↗`); if (/^https:\/\//.test(url)) a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; p.append(a); });
      grid.append(p);
    }
    const provenance = panel('관측과 시뮬레이션의 경계', 'READING THE EVIDENCE');
    add(provenance, facts([['실측 입력', '고도 격자 · 정사영상 · 로버 정지점'], ['계산 결과', '경로 길이 · 고도 단면 · 5 m 구간 경사'], ['가상 연출', '기지 · 인물 · 로버 · 바위 배치 · 하늘'], ['미연결', '실시간 기상 · 우주복 센서 · 버디 위치']]), note('1 m는 격자 간격이며 정확도 보장이 아닙니다. 화면의 기지는 실제 시설 또는 후보 부지가 아닙니다.'));
    add(main, grid, provenance);
  }

  function crewPage() {
    const grid = el('div', 'sc-grid');
    const crew = panel('현장 대원 01', 'EVA / SIMULATED TELEMETRY');
    const status = el('p', 'sc-large-status');
    const metrics = el('div', 'sc-metrics');
    const elapsed = metric('경과 시간', '', 'min'), remaining = metric('남은 편도', '', 'm'); add(metrics, elapsed, remaining);
    add(crew, status, meter('산소 잔량', () => mission.st.o2), metrics, note('산소는 HUD 진입 중 분당 0.35% 감소하는 모의값입니다. 생체·우주복 센서와 연결되어 있지 않습니다.'));
    const route = panel('현재 임무', 'SHARED MISSION STATE');
    const dest = el('h4', '', candidate().name), progress = meter('EVA 경로 진행', () => mission.st.s / mission.st.route.length * 100);
    const info = facts([['위치', ''], ['이동 수단', ''], ['다음 노드', ''], ['계획', '']]);
    const fields = info.querySelectorAll('dd');
    add(route, dest, progress, info, note('대원 02 / 버디: 독립 위치·산소 모델 미구현. 이 모니터는 대원 01의 공유 상태를 보여 줍니다.'));
    live(() => {
      const st = mission.st, p = mission.currentPose();
      status.textContent = st.habitatPose ? '기지 내부 · EVA 출발 전' : st.arrived ? '목적지 도착' : st.moving ? '탐사 경로 이동 중' : st.control === 'hud-manual' ? '현장 대기' : st.s > .5 ? '관제 확인 · 이동 정지' : '기지 출발 대기';
      elapsed.querySelector('b').textContent = fmt(st.simSeconds / 60); remaining.querySelector('b').textContent = fmt(Math.max(0, st.route.length - st.s), 0);
      fields[0].textContent = st.habitatPose ? `기지 기준 E ${fmt(p.x)} / N ${fmt(-p.z)} m` : `${fmt(st.s)} / ${fmt(st.route.length, 0)} m`;
      fields[1].textContent = st.habitatPose ? '기지 내 보행 · 임무 시간 정지' : st.transport === 'rover' ? '유인 로버 탑승' : '도보';
      fields[2].textContent = st.habitatPose ? '에어록에서 EVA 경로 시작' : mission.nextNode()?.key.replace('_', ' / ') || '—';
      fields[3].textContent = `v${st.planVersion} · ${st.planStatus}`;
    });
    add(grid, crew, route); main.append(grid);
  }

  function roverPage() {
    const grid = el('div', 'sc-grid');
    const vehicle = panel('유인 로버 / R-01', 'SURFACE MOBILITY');
    const silhouette = el('div', 'sc-rover-art');
    silhouette.innerHTML = `<svg viewBox="0 0 640 190" aria-label="가상 개방형 로버 개념도" role="img"><path d="M105 120H525L490 88H196L175 58H145L128 120M214 88V36H370L402 88M220 42H365M205 89L218 124M395 91L409 124M156 65H174M230 57H285V86H230Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M120 124H520" stroke="currentColor" stroke-width="12"/><circle cx="172" cy="130" r="28"/><circle cx="462" cy="130" r="28"/><circle cx="172" cy="130" r="11" fill="#102326"/><circle cx="462" cy="130" r="11" fill="#102326"/><path d="M83 164H556" stroke="currentColor" stroke-width="1" opacity=".4"/></svg>`;
    const status = el('p', 'sc-large-status');
    const info = facts([['차량 위치', ''], ['대원과 경로상 간격', ''], ['조작 상태', '']]);
    add(vehicle, silhouette, status, info);
    const instructions = panel('탑승에서 현장까지', 'ROVER OPERATIONS');
    const list = el('ol', 'sc-steps');
    for (const [head, body] of [['접근', `HUD에서 로버의 경로상 ${BOARD_RANGE} m 이내까지 이동합니다.`], ['탑승', 'W를 놓고 E 또는 HUD의 로버 탑승 버튼을 누릅니다.'], ['주행', 'W를 누르는 동안 계획 경로를 따라 전진합니다.'], ['하차', 'W를 놓고 E를 누르면 차량 옆으로 내립니다.']]) add(list, add(el('li'), el('b', '', head), el('span', '', body)));
    const speeds = el('div', 'sc-metrics'); add(speeds, metric('도보 · 모의', fmt(WALK_SPEED), 'm/s'), metric('로버 · 모의', fmt(ROVER_SPEED), 'm/s'));
    add(instructions, list, speeds, note('가상 개방형 로버입니다. 전력·주행 가능성·충돌·감압 절차는 모델링하지 않았습니다.'));
    live(() => { const st = mission.st, fields = info.querySelectorAll('dd'); status.textContent = st.habitatPose ? '대원 기지 내부 · 차량 외부 대기' : st.transport === 'rover' ? '대원 탑승 중' : '대원 하차 · 차량 대기'; fields[0].textContent = `경로 ${fmt(st.roverS)} m`; fields[1].textContent = st.habitatPose ? 'EVA 출발 후 표시' : `${fmt(Math.abs(st.s - st.roverS))} m`; fields[2].textContent = st.habitatPose ? '에어록을 나와 로버에 접근' : st.control !== 'hud-manual' ? '탐사자 시점에서 조작 가능' : st.moving ? '주행 / 이동 중 · 정지 후 승하차' : mission.canBoard() ? '탑승 가능한 거리' : mission.canDismount() ? '하차 가능' : '도보로 차량에 접근'; });
    add(grid, vehicle, instructions); main.append(grid);
  }

  function habitatPage() {
    const grid = el('div', 'sc-grid');
    const habitat = panel('가상 기지', 'FICTIONAL MARS BASE');
    add(habitat, el('p', 'sc-large-status', '임무를 연결하는 작업실'), facts([['관측 모니터', '지형 단면 · 정지점 · 원본 출처'], ['중앙 관제 모니터', '탐사 후보 비교 · 목적지 선택'], ['대원 모니터', '공유 임무 · 산소 · 로버 상태'], ['에어록', '문 교대 개폐 · 감압 모의 없음']]), note('기지는 제제로의 로버 정지점 근처에 배치한 가상 시설입니다. 지형은 관측 자료를 사용하고 구조물은 절차적 모델입니다.'));
    const limits = panel('연결 범위', 'SIMULATION SCOPE');
    const rows = [['연결됨', '관제 PAD ↔ 탐사 HUD', '같은 브라우저의 목적지·위치·산소·로버 상태를 공유합니다.'], ['모의', '보행 · 차량 · 대원 산소', '데모 속도와 단순 산소 감소식을 적용합니다.'], ['미연결', '전력 · 생명유지 · 통신 지연', '실제 시설 센서, 기상, 기지 압력과 전력값은 제공하지 않습니다.']];
    for (const [tag, head, body] of rows) { const row = el('div', 'sc-scope-row'); add(row, el('span', 'sc-evidence', tag), add(el('div'), el('h4', '', head), note(body))); limits.append(row); }
    add(grid, habitat, limits); main.append(grid);
  }

  const pages = { terrain: terrainPage, waypoints: waypointsPage, sources: sourcesPage, crew: crewPage, rover: roverPage, habitat: habitatPage };
  function show(page) {
    state.pages[state.station] = page; updaters = []; main.replaceChildren();
    nav.querySelectorAll('button').forEach((b) => { const active = b.dataset.page === page; b.classList.toggle('is-active', active); b.setAttribute('aria-current', active ? 'page' : 'false'); });
    pages[page](); main.scrollTop = 0;
  }
  function select(id) {
    if (!TABS[id]) return;
    state.station = id; root.dataset.station = id; root.setAttribute('aria-label', id === 'science' ? '과학·관측 자료 모니터' : '대원·기지 운영 모니터');
    title.textContent = id === 'science' ? '과학 · 관측 자료' : '대원 · 기지 운영';
    eyebrow.textContent = id === 'science' ? '01 / OBSERVATION ARCHIVE' : '03 / CREW & SYSTEMS';
    nav.replaceChildren();
    TABS[id].forEach(([page, number, label]) => { const b = button('', () => show(page)); b.dataset.page = page; add(b, el('small', '', number), el('span', '', label)); nav.append(b); });
    show(state.pages[id]); update();
  }
  function update() {
    if (state.route !== mission.st.route) { state.route = mission.st.route; show(state.pages[state.station]); }
    root.querySelector('.sc-revision').textContent = `PLAN v${mission.st.planVersion} / ${mission.st.transport === 'rover' ? 'ROVER' : 'ON FOOT'}`;
    root.querySelector('.sc-footer-route').textContent = mission.st.habitatPose ? '기지 내부 · EVA 출발 전' : `${fmt(mission.st.s, 0)} / ${fmt(mission.st.route.length, 0)} m · ${mission.st.arrived ? 'ARRIVED' : 'EXPEDITION'}`;
    updaters.forEach((fn) => fn());
  }
  select('science');
  return { root, select, update, destroy() { updaters = []; root.remove(); } };
}
