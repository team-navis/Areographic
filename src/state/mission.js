import * as THREE from 'three';

/**
 * One shared mission state for both roles (PAD and HUD read/write the same object).
 * Real inputs: HiRISE 1 m DTM heights, Perseverance's published drive polyline (route) and stops (nodes).
 * Simulated (모의) values: crew position/speed, mission clock, oxygen, radiation, buddy, comm link,
 * and every plan number in PLAN. They are labelled as such wherever they are displayed.
 */
export const WALK_SPEED = 1.4;   // m/s, demo setting (not a validated EVA walking speed)
export const ROVER_SPEED = 3.5;  // m/s (12.6 km/h), simulated demo value; not a specification of any real crewed Mars rover
export const BACK_FACTOR = 0.6;  // S (back up along the route) moves at 60% of the forward speed; demo setting
export const BOARD_RANGE = 3;    // m along the route within which boarding is allowed
export const EYE_HEIGHT = 1.68;  // m above ground, matches the helmet centre of the 1.92 m suit model
export const WARP = 4;           // Shift while driving: demo time compression. Clock, oxygen, dose and distance all advance x4; vehicle speed stays 3.5 m/s
export const PLAN = {            // simulated plan values for the demo (not a validated EVA plan)
  turnaroundSec: 25 * 60,        // "복귀 개시 기한": mission-elapsed time by which the return must start
  staySec: 20 * 60,              // planned stay at the destination (v0.2: long enough for the "10분 전 경보" design number to occur)
  o2PctPerMin: 0.35,             // oxygen model
  doseMsvPerDay: 0.67,           // assumed from Curiosity RAD at Gale (Hassler et al. 2013, as quoted by SwRI); NOT a Jezero measurement
  offRouteWarnM: 5,              // off-route warning threshold (assumption)
  hazardSlopeDeg: 12, hazardLateralM: 6, hazardAheadM: 25, // avoidance cue: DTM slope beside the route (assumption)
  buddyGapM: 4.5,
};

// Route = Perseverance's actual drive polyline, in drive order (see public/data/jezero/route.json).
const SEGMENTS = ['52_7624>53_0', '53_0>53_130', '53_130>54_0', '54_0>54_702', '54_702>54_866', '54_866>54_1010'];
export const CANDIDATES = [
  { key: '56_0', lastSeg: '54_866>54_1010', name: 'Cheyava Falls 시료 채취 지점', note: '로버 정지점 site 56 / drive 0 (sol 1210~1218). 시료 25 "Sapphire Canyon" 밀봉 sol 1215가 이 정지 기간 안. 암석 좌표가 아니라 로버 위치(암석은 로봇 팔이 닿는 수 m 안).', evidence: { known: true, label: '공식 설명 있음', ref: 'NASA 시료 25 Sapphire Canyon (sol 1215) · PIA26368 (WATSON, sol 1212)' } },
  { key: '54_702', lastSeg: '54_0>54_702', name: '로버 정지점', note: 'sol 1182 정지점. 이름·과학 근거는 이 데모에서 수집하지 않음.', evidence: { known: false, label: '근거 미수집' } },
  { key: '54_0', lastSeg: '53_130>54_0', name: '로버 정지점', note: 'sol 1177 정지점. 이름·과학 근거는 이 데모에서 수집하지 않음.', evidence: { known: false, label: '근거 미수집' } },
];
export const fmtT = (sec) => { const s = Math.max(0, Math.floor(sec)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function createMission(terrain, indoorPath, routeData) {
  const wp = new Map(terrain.meta.waypoints.map((w) => [`${w.site}_${w.drive}`, w]));
  const listeners = new Set();
  const worldOf = (key) => { const w = wp.get(key), p = terrain.toWorld(w.x_eqc, w.y_eqc); return { x: p.x, z: p.z, w }; };
  const segByKey = new Map(routeData.segments.map((s) => [s.key, s]));
  const slopeAt = (x, z) => { const d = 1.5, gx = (terrain.groundY(x + d, z) - terrain.groundY(x - d, z)) / (2 * d), gz = (terrain.groundY(x, z + d) - terrain.groundY(x, z - d)) / (2 * d); return THREE.MathUtils.radToDeg(Math.atan(Math.hypot(gx, gz))); };

  function buildRoute(cand) {
    const pts = indoorPath.map((p) => ({ x: p.x, y: p.y, z: p.z, kind: p.kind, src: 'base' }));
    const nodes = []; let traverseVerts = 0;
    const push = (x, z, src) => { // subdivide so consecutive points are <= 1 m apart; original vertices are always kept
      const a = pts[pts.length - 1], d = Math.hypot(x - a.x, z - a.z), n = Math.max(1, Math.ceil(d)); if (d < 0.01) { if (src === 'traverse') a.vertex = true; return; } // shared vertex between consecutive drives
      for (let i = 1; i <= n; i++) { const px = a.x + (x - a.x) * (i / n), pz = a.z + (z - a.z) * (i / n); pts.push({ x: px, y: terrain.groundY(px, pz), z: pz, kind: 'terrain', src, vertex: i === n && src === 'traverse' }); }
    };
    const rampEnd = pts[pts.length - 1]; let joined = false;
    for (const key of SEGMENTS) {
      const seg = segByKey.get(key);
      for (const [X, Y] of seg.xy_eqc) {
        const w = terrain.toWorld(X, Y);
        if (!joined) { if (w.x > rampEnd.x - 6) continue; push(w.x, w.z, 'connector-base'); pts[pts.length - 1].vertex = true; joined = true; traverseVerts++; continue; } // the drive line starts under the fictional base; join it just past the ramp
        push(w.x, w.z, 'traverse'); traverseVerts++;
      }
      nodes.push({ key: seg.toRMC, index: pts.length - 1, sol: seg.sol });
      if (key === cand.lastSeg) break;
    }
    const t = worldOf(cand.key), e = pts[pts.length - 1], gap = Math.hypot(t.x - e.x, t.z - e.z);
    if (gap > 0.05) { push(t.x, t.z, 'connector-stop'); nodes.push({ key: cand.key, index: pts.length - 1 }); } // e.g. 0.9 m from the sol 1185 stop to the sol 1210 stop
    let s = 0; pts[0].s = 0;
    for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z); pts[i].s = s; }
    nodes.forEach((n) => { n.s = pts[n.index].s; });
    const out = pts.filter((p) => p.kind === 'terrain');
    // statistics on the 1 m DTM: slope over a 5 m along-track baseline (same definition as tools/terrain/extract_route.py)
    let maxSlope = 0, sum = 0, cnt = 0, gain = 0, j = 0; const cum = [0];
    for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z));
    for (let i = 0; i < out.length; i++) { while (cum[i] - cum[j] > 5) j++; if (j > 0 && cum[i] - cum[j - 1] >= 5) { const a = out[j - 1], run = Math.hypot(out[i].x - a.x, out[i].z - a.z); if (run > 2.5) { const sl = THREE.MathUtils.radToDeg(Math.atan(Math.abs(out[i].y - a.y) / run)); maxSlope = Math.max(maxSlope, sl); sum += sl; cnt++; } } }
    for (let i = 1; i < out.length; i++) gain += Math.max(0, out[i].y - out[i - 1].y);
    const lenOf = (src) => { let l = 0; for (let i = 1; i < pts.length; i++) if (pts[i].src === src) l += pts[i].s - pts[i - 1].s; return l; };
    // avoidance cue zones: steep DTM slope a few metres beside the route (presentation of real slope data; threshold is an assumption)
    const hazards = []; let cur = null;
    for (let i = 1; i < out.length - 1; i++) {
      const p = out[i], dx = out[i + 1].x - out[i - 1].x, dz = out[i + 1].z - out[i - 1].z, l = Math.hypot(dx, dz) || 1, rx = -dz / l, rz = dx / l, L = PLAN.hazardLateralM; // right of travel
      const sr = slopeAt(p.x + rx * L, p.z + rz * L), sl = slopeAt(p.x - rx * L, p.z - rz * L), side = sr >= PLAN.hazardSlopeDeg && sr >= sl ? '우측' : sl >= PLAN.hazardSlopeDeg ? '좌측' : null;
      if (side) { if (cur && cur.side === side && p.s - cur.s1 < 4) { cur.s1 = p.s; cur.max = Math.max(cur.max, sr, sl); } else { cur = { s0: p.s, s1: p.s, side, max: Math.max(side === '우측' ? sr : sl) }; hazards.push(cur); } }
    }
    return { destKey: cand.key, pts, nodes, length: s, hazards: hazards.filter((h) => h.s1 - h.s0 >= 3), traverseVerts,
      stats: { oneWayM: s, maxSlopeDeg: maxSlope, meanSlopeDeg: cnt ? sum / cnt : 0, gainM: gain, indoorM: pts.filter((p) => p.kind !== 'terrain').slice(-1)[0].s, traverseM: lenOf('traverse'), connectorM: lenOf('connector-base') + lenOf('connector-stop'), traversePlanM: (() => { let l = 0; for (let i = 1; i < pts.length; i++) if (pts[i].src === 'traverse') l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return l; })() } };
  }
  const routes = Object.fromEntries(CANDIDATES.map((c) => [c.key, buildRoute(c)]));
  const base = { x: indoorPath[indoorPath.length - 1].x, z: indoorPath[indoorPath.length - 1].z }; // foot of the base ramp

  const st = {
    planVersion: 1, planStatus: '데모 기본 계획 (미확정)', destKey: '56_0', route: routes['56_0'],
    s: 0, control: 'idle', // 'idle' | 'hud-manual' (stage 2 adds 'pad-auto')
    transport: 'foot', // 'foot' | 'rover' (riding the fictional open rover)
    roverS: routes['56_0'].stats.indoorM + 7, // where the rover is parked / was left, as distance along the same route
    wHeld: false, shiftHeld: false, warp: 1, moving: false, arrived: false,
    // 'outbound' -> 'arrived' (prompt, not yet confirmed) -> 'onsite' (confirmed; stay timer, records) -> 'returning' (crew started the return)
    // -> 'atBase' (reached the base ramp; mission NOT yet closed) -> 'ended' (crew closed the mission)
    phase: 'outbound', records: [], returnStartedAt: null, endedAt: null,
    simSeconds: 0, o2: 100, doseUsv: 0, onsiteSince: null,
    buddyGap: PLAN.buddyGapM, lateralDebug: 0, // lateralDebug: test hook only; the product has no input that leaves the route
    comm: { up: true, lastRx: 0 }, padView: { s: 0, o2: 100, transport: 'foot', sim: 0 }, // what the base last received (AC-09)
    minimap: false,
    remote: null, // instruction pushed from the PAD (base remote control): sent -> received -> acknowledged -> executed are distinct
    departed: false, autoWarp: 1, // departed: the EVA has started (airlock exit or 관제 시작); before that nothing moves and no clock runs
    habitatPose: null, // Free movement inside the habitat (before departure only) is separate from EVA route distance.
  };
  const active = () => st.control === 'hud-manual' || st.control === 'pad-auto'; // a crew member (person or simulated) is acting
  const emit = (type) => listeners.forEach((f) => f(type, st));

  function poseAt(s) {
    const p = st.route.pts; let lo = 0, hi = p.length - 1; s = Math.min(Math.max(s, 0), st.route.length);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].s <= s) lo = m; else hi = m; }
    const a = p[lo], b = p[hi], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    const q0 = rawAt(Math.max(0, s - 2)), q1 = rawAt(Math.min(st.route.length, s + 2)); // heading smoothed over +-2 m so vertex jitter does not snap the view
    const back = st && st.phase === 'returning' || st && st.phase === 'atBase' || st && st.phase === 'ended' ? Math.PI : 0; // travel direction flips on the way back
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, kind: t < 0.5 ? a.kind : b.kind, src: t < 0.5 ? a.src : b.src, yaw: Math.atan2(-(q1.x - q0.x), -(q1.z - q0.z)) + back, outYaw: Math.atan2(-(q1.x - q0.x), -(q1.z - q0.z)) };
  }
  function rawAt(s) { const p = st.route.pts; let lo = 0, hi = p.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].s <= s) lo = m; else hi = m; } const a = p[lo], b = p[hi], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0; return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }
  /** Distance from a world point to the confirmed route polyline (off-route logic; AC for 이탈 경고). */
  function offRouteM(x, z) { let best = 1e9; const p = st.route.pts; for (let i = 1; i < p.length; i++) { const ax = p[i - 1].x, az = p[i - 1].z, dx = p[i].x - ax, dz = p[i].z - az, l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return best; }

  const api = {
    st, routes, candidates: CANDIDATES, poseAt, worldOf, offRouteM, base, PLAN, emit, ext: null, entry: null, // emit/ext: hooks for src/state/field-ops.js
    // ---- habitat (teammate's indoor walk): a free indoor pose exists only before departure; the airlock exit joins the fixed route once ----
    currentPose: () => st.habitatPose ?? poseAt(st.s),
    setHabitatPose(pose) {
      if (st.s > .5 || st.transport !== 'foot' || !pose || ![pose.x, pose.y, pose.z].every(Number.isFinite)) return false;
      st.habitatPose = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw ?? 0, kind: 'indoor' };
      return true;
    },
    departHabitat() {
      if (!st.habitatPose || st.transport !== 'foot' || st.s > .5) return false;
      const ramp = st.route.pts.find(p => p.kind === 'ramp');
      if (!ramp) return false;
      st.s = ramp.s; st.habitatPose = null; st.departed = true;
      st.wHeld = false; st.shiftHeld = false; st.warp = 1; st.moving = false; emit('departure');
      return true;
    },
    on: (f) => { listeners.add(f); return () => listeners.delete(f); },
    departed: () => st.s > 0.5,
    setDestination(key) { // only before departure; a confirmed route is not re-planned from the HUD
      if (st.s > 0.5 || !routes[key]) return false;
      st.destKey = key; st.route = routes[key]; st.planVersion += 1; st.arrived = false; st.phase = 'outbound'; emit('plan'); return true;
    },
    /** Who should own the crew when no person is in the HUD: the simulated crew after departure, nobody before it or after the end. */
    autoControl: () => (st.departed && st.phase !== 'ended' && !st.holdAuto ? 'pad-auto' : 'idle'), // st.holdAuto: test hook that keeps the simulated crew idle so a check can isolate the person-in-the-HUD path
    setPadShift(down) { st.padShift = !!down && st.control === 'pad-auto'; }, // controller-view fast-forward; never moves the crew by itself
    setControl(c) { if (c === 'hud-manual' && !st.habitatPose) st.departed = true; st.padShift = false; st.control = c; st.wHeld = false; st.sHeld = false; st.shiftHeld = false; st.warp = 1; st.moving = false; emit('control'); },
    setW(down) { const was = st.wHeld; st.wHeld = !!down && st.control === 'hud-manual'; if (st.wHeld && !was && api.autoSteer) api.autoSteer(1); }, // riding: a fresh W keeps / turns the 시연 자동 진행 forward (it never switches it off)
    /** S: step back along the same fixed route (no free movement). Slower than forward; W wins if both are held. */
    setS(down) { const was = st.sHeld; st.sHeld = !!down && st.control === 'hud-manual'; if (st.sHeld && !was && api.autoSteer) api.autoSteer(-1); }, // riding: a fresh S turns the 시연 자동 진행 backward along the route
    setShift(down) { st.shiftHeld = !!down && st.control === 'hud-manual'; },
    toggleMinimap() { st.minimap = !st.minimap; emit('minimap'); return st.minimap; },
    /** Integrate exactly one controller per frame. `dt` is real seconds; everything time-based uses dt * warp. */
    tick(dt) {
      st.moving = false; st.warp = 1;
      // One owner per frame: 'hud-manual' (a person in the HUD, W) or 'pad-auto' (simulated crew while the controller watches).
      // The clock, consumables, comm and receipts run for either owner; 'idle' (before departure) integrates nothing.
      if (st.control === 'pad-auto' && st.phase === 'ended') return; // nothing left to simulate once the mission is closed
      if (st.control === 'hud-manual' || st.control === 'pad-auto') {
        const auto = st.control === 'pad-auto', canMove = st.phase === 'outbound' || st.phase === 'returning';
        if (st.shiftHeld && (st.wHeld || st.sHeld) && st.transport === 'rover' && canMove) st.warp = WARP; // time compression only while actually driving the rover (forward W or reverse S)
        if (auto) st.warp = st.padShift ? WARP : (st.autoWarp || 1); // demo time compression for the simulated crew: hold Shift in the controller view, or the ×4 toggle
        const autoManual = !auto && !!(api.ext && api.ext.autoMoveManual && api.ext.autoMoveManual()), autoBack = autoManual && st.autoDir === -1; // 시연 자동 진행 for a person in the suit (field-ops.js); autoDir -1 = backward
        if (autoManual && st.transport === 'rover' && canMove) st.warp = WARP; // the automatic rover leg runs at the same ×4 demo compression as Shift (clock, oxygen and dose follow)
        const d = dt * st.warp;
        st.simSeconds += d; st.o2 = Math.max(0, 100 - (st.simSeconds / 60) * PLAN.o2PctPerMin); st.doseUsv = (PLAN.doseMsvPerDay * 1000 * st.simSeconds) / 86400;
        const fwd = auto ? !!(api.ext && api.ext.autoMove()) : (st.wHeld && !st.sHeld) || (autoManual && !autoBack && !st.sHeld);
        if (fwd && canMove) {
          const v = (st.transport === 'rover' ? ROVER_SPEED : WALK_SPEED) * d, baseS = st.route.stats.indoorM;
          if (st.phase === 'outbound') st.s = Math.min(st.route.length, st.s + v); else st.s = Math.max(baseS, st.s - v); // W always means "forward along the current leg"
          st.moving = true;
          if (st.transport === 'rover') st.roverS = st.s; // crew and vehicle are one position while riding
          if (st.phase === 'outbound' && st.s >= st.route.length) { st.arrived = true; st.moving = false; st.warp = 1; st.phase = 'arrived'; emit('arrived'); }
          else if (st.phase === 'returning' && st.s <= baseS) { st.moving = false; st.warp = 1; st.phase = 'atBase'; emit('phase'); }
        } else if ((st.sHeld || autoBack) && canMove) { // back up along the current leg. Outbound on foot: up the ramp and through the airlock, back into the base (1 m short of the route start); the rover stops at the foot of the ramp. On the way back: stops at the destination
          const v = (st.transport === 'rover' ? ROVER_SPEED : WALK_SPEED) * BACK_FACTOR * d, baseS = st.route.stats.indoorM, before = st.s, floorS = st.transport === 'rover' ? baseS : Math.min(1, baseS);
          if (st.phase === 'outbound') st.s = Math.max(Math.min(floorS, st.s), st.s - v); else st.s = Math.min(st.route.length, st.s + v);
          st.moving = st.s !== before; st.backing = st.moving;
          if (st.transport === 'rover') st.roverS = st.s;
        }
        if (fwd || !(st.sHeld || autoBack)) st.backing = false;
        // Re-entry (docs/stage3-v02-field.md §10): after 기지 도착 (ramp) W keeps going along the same fixed indoor leg in reverse: ramp -> outer door -> airlock -> inner door -> standing spot.
        // api.entry (set by main.js) holds the door interlock gate and the route distance of the inner door. Passing the inner door closes the mission if the crew has not closed it already.
        if (!auto && st.wHeld && (st.phase === 'atBase' || st.phase === 'ended') && st.transport === 'foot' && st.s > 0 && api.entry) {
          const next = Math.max(0, st.s - WALK_SPEED * 0.8 * dt);
          if (api.entry.canPass(poseAt(st.s), poseAt(next))) { st.s = next; st.moving = true; }
          if (st.phase === 'atBase' && st.s <= api.entry.innerS) { st.phase = 'ended'; st.endedAt = st.simSeconds; st.endedBy = st.control; st.endedHow = 'inner-door'; emit('phase'); }
          if (st.s <= 0) { st.moving = false; st.wHeld = false; emit('inside'); }
        }
        st.buddyGap = st.transport === 'rover' ? 0.72 : PLAN.buddyGapM + 1.2 * Math.sin(st.simSeconds / 9); // simulated buddy: second station on the rover, or trailing on foot
        if (api.ext) api.ext.tick(d); // v0.2 field operations (src/state/field-ops.js): package reception, alert detection, buddy incident
        if (st.comm.up && st.remote && st.remote.receivedAt === null) st.remote.receivedAt = st.simSeconds; // HUD receives only while the link is up
        if (st.comm.up) { st.comm.lastRx = st.simSeconds; for (const r of st.records) if (!r.sent) { r.sent = true; r.sentAt = st.simSeconds; } Object.assign(st.padView, { s: st.s, o2: st.o2, transport: st.transport, sim: st.simSeconds }); }
      }
    },
    /** Arrival is proposed automatically; the crew confirms it (27.15 personal choice, used as a layout hint). */
    confirmArrival() { if (st.phase !== 'arrived' || !active()) return false; st.phase = 'onsite'; st.onsiteSince = st.simSeconds; emit('phase'); return true; },
    /** H3: a record gets its metadata automatically (sim clock, route distance, map coordinates of the SIMULATED position, heading, transport). */
    addRecord(type, text = '', extra = {}) {
      if (!active() || st.phase === 'ended') return null;
      const p = extra.pos || poseAt(st.s), e = terrain.toEqc(p.x, p.z), R = 3396190; extra = { ...extra }; delete extra.pos; // v0.2: a record may carry its own ground position (interest point); dose is attached to every record
      const rec = { id: st.records.length + 1, type, text, control: st.control, simT: st.simSeconds, s: st.s, x: p.x, z: p.z, doseUsv: st.doseUsv, lonE: (e.X / R) * 180 / Math.PI, latN: (e.Y / R) * 180 / Math.PI, phase: st.phase, transport: st.transport, sent: false, sentAt: null, ...extra };
      st.records.push(rec); emit('record'); return rec;
    },
    /** H5: the return starts only when the crew chooses it; acknowledging anything else never starts it. */
    startReturn() {
      const early = (st.phase === 'outbound' && st.s > st.route.stats.indoorM && st.remote && st.remote.ackAt !== null) || (api.ext && api.ext.canReturnEarly()); // early return only on an acknowledged base instruction, or (v0.2) an alert for which the crew chose to return
      if (!(st.phase === 'onsite' || early) || !active()) return false;
      st.phase = 'returning'; st.returnStartedAt = st.simSeconds; st.returnBy = st.control; st.arrived = false; if (st.remote && st.remote.ackAt !== null && st.remote.executedAt === null && !st.remote.declined) { st.remote.executedAt = st.simSeconds; st.remote.executedBy = st.control; } if (api.ext) api.ext.onReturnStart(); emit('phase'); return true;
    },
    /** Base remote control (PAD -> HUD). Sending never moves the crew; the crew acknowledges, then decides. */
    sendRemote(text = '복귀 개시 지시') { if (st.phase === 'returning' || st.phase === 'atBase' || st.phase === 'ended') return false; st.remote = { text, sentAt: st.simSeconds, receivedAt: null, ackAt: null, executedAt: null, declined: false }; emit('remote'); return true; },
    ackRemote() { const r = st.remote; if (!r || r.receivedAt === null || r.ackAt !== null || !active()) return false; r.ackAt = st.simSeconds; r.ackBy = st.control; emit('remote'); return true; },
    declineRemote() { const r = st.remote; if (!r || r.ackAt === null) return false; r.declined = true; r.declinedAt = st.simSeconds; r.declinedBy = st.control; emit('remote'); return true; },
    endMission() { if (st.phase !== 'atBase' || !active()) return false; st.phase = 'ended'; st.endedAt = st.simSeconds; st.endedBy = st.control; st.endedHow = 'confirm'; emit('phase'); return true; },
    returnLeft: () => Math.max(0, st.s - st.route.stats.indoorM),
    // ---- derived, read-only values for the HUD ----
    turnaroundLeft: () => PLAN.turnaroundSec - st.simSeconds,
    stayLeft: () => (st.phase === 'onsite' ? PLAN.staySec - (st.simSeconds - st.onsiteSince) : null),
    baseBearing() { const p = poseAt(st.s); return { yaw: Math.atan2(-(base.x - p.x), -(base.z - p.z)), dist: Math.hypot(base.x - p.x, base.z - p.z) }; },
    nextHazard() { const back = st.phase === 'returning', h = back ? [...st.route.hazards].reverse().find((z) => z.s0 <= st.s && st.s - z.s1 <= PLAN.hazardAheadM) : st.route.hazards.find((z) => z.s1 >= st.s && z.s0 - st.s <= PLAN.hazardAheadM); if (!h || !(st.phase === 'outbound' || back)) return null; const side = back ? (h.side === '우측' ? '좌측' : '우측') : h.side; return { ...h, side, ahead: Math.max(0, back ? st.s - h.s1 : h.s0 - st.s), inside: back ? st.s <= h.s1 : st.s >= h.s0 }; },
    offRouteNow() { const p = poseAt(st.s), r = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) }, d = offRouteM(p.x + r.x * st.lateralDebug, p.z + r.z * st.lateralDebug); return { m: d, warn: d > PLAN.offRouteWarnM }; },
    setComm(up) { st.comm.up = !!up; emit('comm'); }, // test hook / future incident stage
    /** Rover track runs parallel to the route, `lateral` metres to its right, so walkers never pass through it. */
    roverWorld(lateral = 2.2) { const p = poseAt(st.roverS); return { x: p.x + Math.cos(p.outYaw) * lateral, z: p.z - Math.sin(p.outYaw) * lateral, yaw: p.yaw }; }, // same physical track both ways; heading follows the travel direction
    speed: () => (st.transport === 'rover' ? ROVER_SPEED : WALK_SPEED),
    canBoard: () => st.transport === 'foot' && st.control === 'hud-manual' && !st.wHeld && Math.abs(st.s - st.roverS) <= BOARD_RANGE && st.roverS <= st.route.length,
    canDismount: () => st.transport === 'rover' && st.control === 'hud-manual' && !st.wHeld && !st.sHeld, // E also works while the 시연 자동 진행 drives: the vehicle stops and the crew steps off
    /** Boarding/dismounting are discrete interactions; they never move the crew freely. */
    board() { if (!api.canBoard()) return false; st.transport = 'rover'; st.s = st.roverS; st.leftRoverAt = null; if (st.phase === 'outbound' && st.s >= st.route.length) { st.arrived = true; st.phase = 'arrived'; } emit('transport'); return true; },
    dismount() { if (!api.canDismount()) return false; st.transport = 'foot'; st.roverS = st.s; st.leftRoverAt = st.s; emit('transport'); return true; }, // leftRoverAt: no automatic re-boarding until the crew has walked away from the rover (or presses E)
    nextNode() { if (st.phase === 'returning' || st.phase === 'atBase' || st.phase === 'ended') return [...st.route.nodes].reverse().find((n) => n.s < st.s - 0.01) || { key: 'base', s: st.route.stats.indoorM }; return st.route.nodes.find((n) => n.s > st.s + 0.01) || st.route.nodes[st.route.nodes.length - 1]; },
    debugSetS(s) { if (s > .5) { st.habitatPose = null; st.departed = true; } st.s = Math.min(Math.max(0, s), st.route.length); if (st.transport === 'rover') st.roverS = st.s; if (st.phase !== 'outbound' && st.phase !== 'arrived') return; if (st.s >= st.route.length) { st.arrived = true; if (st.phase === 'outbound') st.phase = 'arrived'; } else { st.arrived = false; st.phase = 'outbound'; } },
  };
  return api;
}
