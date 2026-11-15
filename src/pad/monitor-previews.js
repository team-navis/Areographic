/** Readable previews for the habitat's physical 3D monitor surfaces.
 * Uses the already-loaded observation image and the same mission as PAD / HUD.
 * No synthetic weather, biomedical signals, or second crew member are displayed.
 */
const C = { bg: '#0b0b0c', panel: '#141416', line: '#2a2a2c', ink: '#f5f5f3', muted: '#8e8e8a', sage: '#ffd23f', amber: '#ffd23f' }; // console theme v3 palette (black editorial, warm yellow accent)
const number = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const WIDTH = 1024, HEIGHT = 480;

function text(g, value, x, y, size = 22, color = C.ink, width = Infinity, weight = 400) {
  g.font = `${weight} ${size}px system-ui, sans-serif`; g.fillStyle = color;
  let label = String(value ?? '—');
  if (g.measureText(label).width > width) {
    while (label.length && g.measureText(label + '…').width > width) label = label.slice(0, -1);
    label += '…';
  }
  g.fillText(label, x, y);
}

function line(g, x0, y0, x1, y1, color = C.line, width = 1) {
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = color; g.lineWidth = width; g.stroke();
}

function frame(g, id, revision) {
  g.fillStyle = C.bg; g.fillRect(0, 0, WIDTH, HEIGHT);
  const titles = { science: '01 / OBSERVATION ARCHIVE', planner: '02 / MISSION PLANNING', systems: '03 / CREW & SYSTEMS' };
  text(g, titles[id], 32, 42, 22, C.sage, 770, 500);
  text(g, `PLAN ${revision}`, 850, 42, 18, C.muted, 145);
  line(g, 30, 64, 994, 64);
  line(g, 30, 414, 994, 414);
  const footers = { science: 'Terrain profile · rover stops · sources', planner: 'Open map · candidate sites · plan', systems: 'Open astronaut · rover · habitat' };
  text(g, footers[id], 32, 456, 25, C.sage, 850);
  text(g, '↗', 950, 456, 31, C.sage);
}

function drawMap(g, mission, terrain) {
  const rect = { x: 448, y: 91, w: 546, h: 306 }, pts = mission.st.route.pts;
  const B = terrain.bounds, img = terrain.nearImg;
  const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), zmin = Math.min(...zs), zmax = Math.max(...zs);
  const aspect = rect.w / rect.h, hz = Math.max((zmax - zmin) / 2 + 28, ((xmax - xmin) / 2 + 28) / aspect, 65), hx = hz * aspect;
  const cx = (xmin + xmax) / 2, cz = (zmin + zmax) / 2;
  const x0 = cx - hx, z0 = cz - hz;
  const X = x => rect.x + (x - x0) / (2 * hx) * rect.w;
  const Y = z => rect.y + (z - z0) / (2 * hz) * rect.h;
  g.save(); g.beginPath(); g.rect(rect.x, rect.y, rect.w, rect.h); g.clip();
  g.fillStyle = C.panel; g.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (img && img.width && img.height) {
    g.drawImage(img,
      (x0 - B.x0) / (B.x1 - B.x0) * img.width, (z0 - B.z0) / (B.z1 - B.z0) * img.height,
      (2 * hx) / (B.x1 - B.x0) * img.width, (2 * hz) / (B.z1 - B.z0) * img.height,
      rect.x, rect.y, rect.w, rect.h);
    g.fillStyle = '#09171936'; g.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  const path = () => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p.x), Y(p.z)) : g.moveTo(X(p.x), Y(p.z))); };
  g.lineJoin = 'round'; path(); g.strokeStyle = '#081218'; g.lineWidth = 8; g.stroke();
  path(); g.strokeStyle = C.sage; g.lineWidth = 3; g.stroke();
  const start = pts[0], end = pts.at(-1), current = mission.currentPose();
  g.fillStyle = C.ink; g.fillRect(X(start.x) - 5, Y(start.z) - 5, 10, 10);
  g.strokeStyle = C.amber; g.lineWidth = 3; g.beginPath(); g.arc(X(end.x), Y(end.z), 9, 0, Math.PI * 2); g.stroke();
  g.fillStyle = C.amber; g.beginPath(); g.arc(X(current.x), Y(current.z), 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#081218c9'; g.fillRect(rect.x, rect.y, rect.w, 32); g.fillRect(rect.x, rect.y + rect.h - 32, rect.w, 32);
  text(g, 'HiRISE / ORTHOMOSAIC', rect.x + 14, rect.y + 23, 17, C.ink);
  text(g, 'N ↑', rect.x + rect.w - 55, rect.y + 23, 17, C.ink);
  text(g, 'Real orbital image · route is a simulated plan', rect.x + 14, rect.y + rect.h - 10, 16, C.ink);
  g.restore();
}

function planner(g, mission, terrain) {
  const st = mission.st, route = st.route, name = mission.candidates.find(c => c.key === st.destKey)?.name;
  text(g, 'NEXT EXPEDITION', 32, 118, 28, C.ink, 390, 600);
  text(g, name, 32, 163, 24, C.sage, 385);
  text(g, 'Planned one-way distance', 32, 222, 21, C.muted);
  text(g, `${number(route.length)} m`, 32, 281, 55, C.ink, 385, 500);
  text(g, `Route max slope  ${number(route.stats.maxSlopeDeg, 1)}°`, 32, 334, 22, C.muted, 390);
  text(g, st.habitatPose ? 'In habitat · before EVA departure' : st.s > .5 ? 'On Marswalk · shared plan kept' : 'Before departure · destination open', 32, 378, 21, C.amber, 390);
  drawMap(g, mission, terrain);
}

function science(g, mission, terrain) {
  const route = mission.st.route, pts = route.pts.filter(p => p.kind === 'terrain');
  text(g, 'READ THE TERRAIN', 32, 119, 28, C.ink, 940, 600);
  text(g, `HiRISE DTM ${number(terrain.meta.near.gsd_m)} m`, 32, 167, 26, C.sage, 300);
  text(g, `${terrain.meta.waypoints.length} rover stops`, 32, 208, 23, C.muted, 310);
  text(g, 'Route total climb', 32, 271, 20, C.muted);
  text(g, `${number(route.stats.gainM, 1)} m`, 32, 318, 43, C.ink, 300, 500);
  text(g, 'From terrain · vertical exaggeration', 32, 378, 19, C.muted, 300);
  if (!pts.length) { text(g, 'Preparing terrain route', 394, 270, 28, C.muted); return; }
  const ys = pts.map(p => p.y), min = Math.floor(Math.min(...ys)) - 1, max = Math.ceil(Math.max(...ys)) + 1;
  const graph = { x: 396, y: 181, w: 594, h: 166 }, first = pts[0].s, last = pts.at(-1).s;
  const X = s => graph.x + (s - first) / Math.max(1, last - first) * graph.w;
  const Y = y => graph.y + graph.h - (y - min) / Math.max(1, max - min) * graph.h;
  text(g, 'Elevation vs. origin / m', graph.x, 151, 19, C.muted);
  for (let i = 0; i <= 3; i++) {
    const value = min + (max - min) * i / 3, y = Y(value);
    line(g, graph.x, y, graph.x + graph.w, y);
    text(g, number(value), 337, y + 6, 17, C.muted, 55);
  }
  const path = () => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p.s), Y(p.y)) : g.moveTo(X(p.s), Y(p.y))); };
  path(); g.lineTo(X(last), graph.y + graph.h); g.lineTo(X(first), graph.y + graph.h); g.closePath(); g.fillStyle = 'rgba(255,210,63,.1)'; g.fill();
  path(); g.strokeStyle = C.sage; g.lineWidth = 3; g.stroke();
  if (!mission.st.habitatPose && mission.st.s >= first) { const p = mission.currentPose(); line(g, X(mission.st.s), graph.y, X(mission.st.s), graph.y + graph.h, C.amber); g.beginPath(); g.arc(X(mission.st.s), Y(p.y), 5, 0, Math.PI * 2); g.fillStyle = C.amber; g.fill(); }
  text(g, `${number(first)} m`, graph.x, 381, 18, C.muted);
  text(g, `${number(last)} m`, graph.x + graph.w - 90, 381, 18, C.muted, 90);
}

function systems(g, mission) {
  const st = mission.st, progress = clamp(st.s / Math.max(1, st.route.length) * 100, 0, 100);
  text(g, 'EVA / CREW 01', 32, 119, 28, C.ink, 940, 600);
  text(g, 'Oxygen left · simulated', 32, 170, 23, C.muted);
  text(g, `${number(st.o2, 1)}%`, 32, 244, 70, C.ink, 400, 500);
  g.fillStyle = C.panel; g.fillRect(32, 270, 365, 10);
  g.fillStyle = C.sage; g.fillRect(32, 270, 365 * clamp(st.o2, 0, 100) / 100, 10);
  text(g, `Elapsed ${number(st.simSeconds / 60, 1)} min`, 32, 332, 27, C.muted, 400);
  text(g, 'Shared browser state / simulated astronaut', 32, 378, 19, C.muted, 400);
  line(g, 442, 104, 442, 391);
  text(g, st.habitatPose ? 'HABITAT / walking inside' : st.transport === 'rover' ? 'ROVER / on board' : 'ON FOOT', 480, 169, 29, C.sage, 510, 500);
  text(g, st.habitatPose ? 'In habitat · before EVA departure' : st.arrived ? 'At destination' : st.moving ? 'Moving on route' : st.s > .5 ? 'Holding position' : 'Waiting to leave habitat', 480, 217, 26, C.ink, 510);
  const current = mission.currentPose();
  text(g, st.habitatPose ? `E ${number(current.x, 1)} / N ${number(-current.z, 1)} m` : `${number(st.s)} / ${number(st.route.length)} m`, 480, 276, st.habitatPose ? 29 : 39, C.ink, 510, 500);
  g.fillStyle = C.panel; g.fillRect(480, 300, 510, 8);
  g.fillStyle = C.amber; g.fillRect(480, 300, 510 * progress / 100, 8);
  text(g, `Rover route position  ${number(st.roverS)} m`, 480, 354, 21, C.muted, 510);
  text(g, 'Astronaut 02 / partner state not implemented', 480, 388, 18, C.muted, 510);
}

/** Paints synchronously. terrain.nearImg is already loaded by loadTerrain(). */
export function drawMonitorPreview(canvas, id, { mission, terrain }) {
  if (!canvas || !mission?.st?.route || !terrain || !['science', 'planner', 'systems'].includes(id)) return;
  const g = canvas.getContext('2d'); if (!g) return;
  g.save(); g.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  frame(g, id, mission.st.planVersion);
  if (id === 'planner') planner(g, mission, terrain);
  else if (id === 'science') science(g, mission, terrain);
  else systems(g, mission);
  g.restore();
}
