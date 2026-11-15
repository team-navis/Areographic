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
  science: [['terrain', '01', 'Terrain profile'], ['waypoints', '02', 'Rover stops'], ['sources', '03', 'Data sources']],
  systems: [['crew', '01', 'Astronaut status'], ['rover', '02', 'Rover'], ['habitat', '03', 'Habitat · sim scope']],
};

/** A real DOM terminal for either side monitor. All live values share stage 1 mission state. */
export function createStations(mission, terrain) {
  const root = el('section', 'station-console');
  root.innerHTML = `<header class="sc-top"><span class="sc-brand">Areographic <span>fictional habitat</span></span><span class="sc-signal">● LOCAL MISSION</span></header>
    <div class="sc-heading"><div><p class="sc-eyebrow"></p><h2></h2></div><div class="sc-revision"></div></div>
    <nav class="sc-tabs" aria-label="Display sections"></nav><main class="sc-main"></main>
    <footer class="sc-footer"><span>Observed: archived terrain · astronaut/rover: simulated</span><span class="sc-footer-route"></span></footer>`;
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
    const graph = panel('Terrain along the route', 'HiRISE / ELEVATION PROFILE');
    const cv = el('canvas', 'sc-profile'); cv.width = 760; cv.height = 290;
    cv.setAttribute('aria-label', 'Route elevation profile relative to the habitat origin. Use the slider below to pick a point.');
    const sliderLabel = el('label', 'sc-scrubber');
    const range = el('input'); range.type = 'range'; range.min = '0'; range.max = String(route.length); range.step = '0.5';
    state.sampleS = clamp(state.sampleS ?? route.length * .5, 0, route.length); range.value = String(state.sampleS);
    const sampleText = el('span'); add(sliderLabel, el('span', '', 'Pick profile point'), range, sampleText);
    const details = facts([['Elevation vs. origin', ''], ['Terrain data', ''], ['Slope per 5 m', '']]);
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
      ds[0].textContent = `${fmt(here.y, 2)} m${here.kind === 'terrain' ? '' : ' · fictional habitat/ramp'}`;
      ds[1].textContent = here.kind === 'terrain' ? terrain.ground(here.x, here.z).source : 'fictional structure';
      const a = mission.poseAt(Math.max(stats.indoorM, s - 2.5)), b = mission.poseAt(Math.min(route.length, s + 2.5));
      const run = Math.hypot(b.x - a.x, b.z - a.z);
      ds[2].textContent = here.kind === 'terrain' && run > .1 ? `${fmt(Math.atan2(Math.abs(b.y - a.y), run) * 180 / Math.PI)}° · from terrain` : '—';
    }
    range.addEventListener('input', draw);
    add(graph, cv, sliderLabel, note('Horizontal: distance from start · vertical: elevation vs. habitat origin. Vertically exaggerated.'));
    const summary = panel(candidate().name, 'SELECTED EXPEDITION');
    const metrics = el('div', 'sc-metrics');
    add(metrics, metric('One way', fmt(stats.oneWayM, 0), 'm'), metric('Max slope', fmt(stats.maxSlopeDeg), '°'), metric('Total climb', fmt(stats.gainM), 'm'), metric('Mean slope', fmt(stats.meanSlopeDeg), '°'));
    add(summary, metrics, details, note('Slope is computed per 5 m segment on the 1 m DTM. Small rocks, footing and ground strength are not assessed.'));
    add(grid, graph, summary); main.append(grid); draw();
  }

  function waypointsPage() {
    const layout = el('div', 'sc-grid sc-waypoint-grid');
    const list = panel('Rover stops', 'PERSEVERANCE / ARCHIVE');
    const buttons = el('div', 'sc-waypoint-list');
    const detail = panel('Stop details', 'OBSERVATION RECORD');
    const wp = terrain.meta.waypoints;
    let current = wp.find((w) => `${w.site}_${w.drive}` === state.waypoint) || wp.find((w) => `${w.site}_${w.drive}` === mission.st.destKey) || wp[0];
    function inspect(w) {
      current = w; state.waypoint = `${w.site}_${w.drive}`;
      buttons.querySelectorAll('button').forEach((b) => { const selected = b.dataset.key === state.waypoint; b.classList.toggle('is-active', selected); b.setAttribute('aria-pressed', String(selected)); });
      detail.replaceChildren(el('p', 'sc-eyebrow', `PERSEVERANCE · SOL ${w.sol}`), el('h3', '', `Site ${w.site} / Drive ${w.drive}`));
      const node = mission.st.route.nodes.find((n) => n.key === state.waypoint);
      add(detail, facts([['Latitude · planetocentric', `${fmt(w.lat, 6)}° N`], ['Longitude · east', `${fmt(w.lon, 6)}° E`], ['HiRISE DTM elevation', `${fmt(w.hirise_dtm_elev, 2)} m`], ['M20 recorded elevation', `${fmt(w.elev_geoid_m20, 2)} m`], ['Current route', node ? `at ${fmt(node.s)} m · route node` : 'not a route node']]), note('Elevation datum: MOLA areoid. This is where the rover stopped, not the coordinates of a rock.'));
      const c = mission.candidates.find((v) => v.key === state.waypoint);
      if (c) add(detail, el('div', 'sc-evidence', c.evidence.label), note(c.note), ...(c.evidence.ref ? [note(c.evidence.ref)] : []));
    }
    wp.forEach((w) => {
      const key = `${w.site}_${w.drive}`;
      const b = button('', () => inspect(w), 'sc-waypoint'); b.dataset.key = key;
      add(b, el('span', '', `SOL ${w.sol}`), el('b', '', `${w.site} / ${w.drive}`), el('small', '', key === mission.st.destKey ? 'Current destination' : 'Rover stop'));
      buttons.append(b);
    });
    add(list, buttons, note('21 archived stops · Sol 1171–1220')); add(layout, list, detail); main.append(layout); inspect(current);
  }

  function sourcesPage() {
    const grid = el('div', 'sc-source-grid');
    const entries = [
      ['HiRISE', 'Local terrain', 'DTM 1 m · orthoimage 25 cm', '640 × 640 grid. The single-band image is tinted on screen.', terrain.meta.near.source, terrain.meta.near.ortho_source],
      ['CTX', 'Regional terrain', 'DTM 20 m · orthoimage 6 m', '8 km × 8 km projected window. Regional context outside the detailed terrain.', terrain.meta.far.source, terrain.meta.far.ortho_source],
      ['M20', 'Rover position record', 'Perseverance · 21 stops', 'The 21 stops are markers. The demo route follows the real Perseverance drive path (M20 traverse, sol 1175–1185); it is not verified for crew safety.', terrain.meta.waypoints_source],
    ];
    for (const [code, name, resolution, desc, ...urls] of entries) {
      const p = panel(name, code); add(p, el('strong', 'sc-resolution', resolution), note(desc));
      urls.forEach((url, i) => { const a = el('a', 'sc-source-link', urls.length === 1 ? 'Original position data ↗' : `${i === 0 ? 'Original elevation model' : 'Original orthoimage'} ↗`); if (/^https:\/\//.test(url)) a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; p.append(a); });
      grid.append(p);
    }
    const provenance = panel('Where observation ends and simulation begins', 'READING THE EVIDENCE');
    add(provenance, facts([['Measured input', 'Elevation grid · orthoimage · rover stops'], ['Computed', 'Route length · elevation profile · slope per 5 m'], ['Fictional presentation', 'Habitat · people · rover · rock placement · sky'], ['Not connected', 'Live weather · spacesuit sensors · partner position']]), note('1 m is the grid spacing, not a guaranteed accuracy. The habitat shown is not a real facility or candidate site.'));
    add(main, grid, provenance);
  }

  function crewPage() {
    const grid = el('div', 'sc-grid');
    const crew = panel('Surface Astronaut 01', 'EVA / SIMULATED TELEMETRY');
    const status = el('p', 'sc-large-status');
    const metrics = el('div', 'sc-metrics');
    const elapsed = metric('Elapsed', '', 'min'), remaining = metric('One way left', '', 'm'); add(metrics, elapsed, remaining);
    add(crew, status, meter('Oxygen left', () => mission.st.o2), metrics, note('Oxygen is a simulated value that drops 0.35% per minute while in the HUD. Not connected to body or spacesuit sensors.'));
    const route = panel('Current Marswalk', 'SHARED MISSION STATE');
    const dest = el('h4', '', candidate().name), progress = meter('EVA route progress', () => mission.st.s / mission.st.route.length * 100);
    const info = facts([['Position', ''], ['Transport', ''], ['Next node', ''], ['Plan', '']]);
    const fields = info.querySelectorAll('dd');
    add(route, dest, progress, info, note('Astronaut 02 / Partner: separate position and oxygen model not implemented. This display shows the shared state of astronaut 01.'));
    live(() => {
      const st = mission.st, p = mission.currentPose();
      status.textContent = st.habitatPose ? 'In habitat · before EVA departure' : st.arrived ? 'At destination' : st.moving ? 'Moving on Marswalk route' : st.control === 'hud-manual' ? 'Holding in the field' : st.s > .5 ? 'Habitat check · stopped' : 'Waiting to leave habitat';
      elapsed.querySelector('b').textContent = fmt(st.simSeconds / 60); remaining.querySelector('b').textContent = fmt(Math.max(0, st.route.length - st.s), 0);
      fields[0].textContent = st.habitatPose ? `Habitat frame E ${fmt(p.x)} / N ${fmt(-p.z)} m` : `${fmt(st.s)} / ${fmt(st.route.length, 0)} m`;
      fields[1].textContent = st.habitatPose ? 'Walking in habitat · mission time paused' : st.transport === 'rover' ? 'On crewed rover' : 'On foot';
      fields[2].textContent = st.habitatPose ? 'EVA route starts at the airlock' : mission.nextNode()?.key.replace('_', ' / ') || '—';
      fields[3].textContent = `v${st.planVersion} · ${st.planStatus}`;
    });
    add(grid, crew, route); main.append(grid);
  }

  function roverPage() {
    const grid = el('div', 'sc-grid');
    const vehicle = panel('Crewed rover / R-01', 'SURFACE MOBILITY');
    const silhouette = el('div', 'sc-rover-art');
    silhouette.innerHTML = `<svg viewBox="0 0 640 190" aria-label="Concept sketch of the fictional open rover" role="img"><path d="M105 120H525L490 88H196L175 58H145L128 120M214 88V36H370L402 88M220 42H365M205 89L218 124M395 91L409 124M156 65H174M230 57H285V86H230Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M120 124H520" stroke="currentColor" stroke-width="12"/><circle cx="172" cy="130" r="28"/><circle cx="462" cy="130" r="28"/><circle cx="172" cy="130" r="11" fill="#102326"/><circle cx="462" cy="130" r="11" fill="#102326"/><path d="M83 164H556" stroke="currentColor" stroke-width="1" opacity=".4"/></svg>`;
    const status = el('p', 'sc-large-status');
    const info = facts([['Rover position', ''], ['Gap to astronaut on route', ''], ['Control state', '']]);
    add(vehicle, silhouette, status, info);
    const instructions = panel('From boarding to the site', 'ROVER OPERATIONS');
    const list = el('ol', 'sc-steps');
    for (const [head, body] of [['Approach', `In the HUD, move within ${BOARD_RANGE} m of the rover along the route.`], ['Board', 'Release W, then press E or the HUD board button.'], ['Drive', 'Hold W to move along the planned route.'], ['Get off', 'Release W and press E to step off beside the rover.']]) add(list, add(el('li'), el('b', '', head), el('span', '', body)));
    const speeds = el('div', 'sc-metrics'); add(speeds, metric('On foot · simulated', fmt(WALK_SPEED), 'm/s'), metric('Rover · simulated', fmt(ROVER_SPEED), 'm/s'));
    add(instructions, list, speeds, note('Fictional open rover. Power, trafficability, collisions and depressurisation are not modelled.'));
    live(() => { const st = mission.st, fields = info.querySelectorAll('dd'); status.textContent = st.habitatPose ? 'Astronaut in habitat · rover waits outside' : st.transport === 'rover' ? 'Astronaut on board' : 'Astronaut off · rover waiting'; fields[0].textContent = `Route ${fmt(st.roverS)} m`; fields[1].textContent = st.habitatPose ? 'Shown after EVA departure' : `${fmt(Math.abs(st.s - st.roverS))} m`; fields[2].textContent = st.habitatPose ? 'Leave the airlock, approach rover' : st.control !== 'hud-manual' ? 'Controllable from astronaut view' : st.moving ? 'Moving · stop to board or get off' : mission.canBoard() ? 'Within boarding range' : mission.canDismount() ? 'Can get off' : 'Walk to the rover'; });
    add(grid, vehicle, instructions); main.append(grid);
  }

  function habitatPage() {
    const grid = el('div', 'sc-grid');
    const habitat = panel('Fictional habitat', 'FICTIONAL MARS BASE');
    add(habitat, el('p', 'sc-large-status', 'The room that links the Marswalk'), facts([['Science display', 'Terrain profile · stops · original sources'], ['Central Planning Display', 'Compare candidate sites · choose destination'], ['Astronaut display', 'Shared Marswalk · oxygen · rover state'], ['Airlock', 'Doors open alternately · no depressurisation sim']]), note('The habitat is a fictional facility placed near a rover stop in Jezero. The terrain uses observed data; the structures are procedural models.'));
    const limits = panel('Connection scope', 'SIMULATION SCOPE');
    const rows = [['Connected', 'Planning Display ↔ helmet HUD', 'Shares destination, position, oxygen and rover state in the same browser.'], ['Simulated', 'Walking · rover · astronaut oxygen', 'Uses demo speeds and a simple oxygen drop rate.'], ['Not connected', 'Power · life support · comm delay', 'No real facility sensors, weather, habitat pressure or power values.']];
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
    state.station = id; root.dataset.station = id; root.setAttribute('aria-label', id === 'science' ? 'Science and observation display' : 'Astronaut and habitat operations display');
    title.textContent = id === 'science' ? 'Science · observation data' : 'Astronaut · habitat operations';
    eyebrow.textContent = id === 'science' ? '01 / OBSERVATION ARCHIVE' : '03 / CREW & SYSTEMS';
    nav.replaceChildren();
    TABS[id].forEach(([page, number, label]) => { const b = button('', () => show(page)); b.dataset.page = page; add(b, el('small', '', number), el('span', '', label)); nav.append(b); });
    show(state.pages[id]); update();
  }
  function update() {
    if (state.route !== mission.st.route) { state.route = mission.st.route; show(state.pages[state.station]); }
    root.querySelector('.sc-revision').textContent = `PLAN v${mission.st.planVersion} / ${mission.st.transport === 'rover' ? 'ROVER' : 'ON FOOT'}`;
    root.querySelector('.sc-footer-route').textContent = mission.st.habitatPose ? 'In habitat · before EVA departure' : `${fmt(mission.st.s, 0)} / ${fmt(mission.st.route.length, 0)} m · ${mission.st.arrived ? 'ARRIVED' : 'EXPEDITION'}`;
    updaters.forEach((fn) => fn());
  }
  select('science');
  return { root, select, update, destroy() { updaters = []; root.remove(); } };
}
