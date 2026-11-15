/**
 * v0.2 field operations added on top of the shared mission state (team feature definition 2026-11-15).
 * Kept in its own module so src/state/mission.js only needs a few hooks (api.ext, api.emit, addRecord position/dose).
 *
 *  - POV match package (PAD -> HUD): line drawing + sampling target(s) + source/credit + plan version; send / receive / acknowledge are separate.
 *  - POV match result, observation checklist answers, points of interest, sample records with automatic position / time / dose (all simulated values).
 *  - Alerts: turnaround time near, 10 min stay left, partner separation, comm loss, space weather. Receive / acknowledge / choose / execute are separate (AC-06, AC-08).
 * Nothing here detects, analyses or judges. Answers are the crew's own visual answers.
 */
import { PLAN, fmtT, WALK_SPEED, ROVER_SPEED } from './mission.js';
import { assetUrl } from '../util/asset-url.js';

/** Travel assumption of the plan (both speeds are simulated demo values from mission.js, not validated EVA figures). */
export const TRANSPORT = { foot: { label: 'On foot', speed: WALK_SPEED }, rover: { label: 'Rover', speed: ROVER_SPEED } };

export const FIELD = { // design numbers and assumptions used only by this module
  stayWarnSec: 10 * 60,   // "10 min alert": the team's design number (feature definition v0.2). Not a NASA threshold.
  turnWarnSec: 2 * 60,    // turnaround-time-near lead (assumption; same 2 min as the existing HUD caution colour)
  buddyWarnM: 15,         // buddy separation alert threshold (assumption)
  commLossSec: 10,        // the link must stay down this long before Comm loss is raised (assumption)
  interestCostSec: 3 * 60, // time budgeted per added interest point (assumption)
};
/** Answer enum shared with the design proposal's observation check view. */
export const ANSWERS = { seen: 'Seen', not_seen: 'Not seen', undetermined: "Can't tell" };
export const OBS_ITEMS = [ // v0.2 HUD #3 (layering, grains, sorting, veins, non-biological explanation) + the reference-photo item spots from the design proposal
  { id: 'bedding', name: 'Layering', q: 'Are thin stacked layers visible' },
  { id: 'grain', name: 'Grains', q: 'Can you tell grains apart by eye' },
  { id: 'sorting', name: 'Sorting', q: 'Do the grains look similar in size' },
  { id: 'vein', name: 'Veins', q: 'Are white veins visible · compare with ①' },
  { id: 'spots', name: 'Spots', q: 'Are spots with dark rims visible · compare with ①' },
  { id: 'alt', name: 'Non-biological explanation', q: 'Could a non-biological process explain this' },
];
export const REFERENCE = { key: '56_0', file: assetUrl('/data/reference/pia26368_cheyava_falls.jpg'), id: 'PIA26368', source: 'PIA26368 · WATSON · sol 1212 (2024-07-18)', credit: 'NASA/JPL-Caltech/MSSS' };
/** Planning image for POV match: the texture of the measured sol 1215 front-Hazcam workspace mesh (the lines are traced from it and projected back through the mesh's own texture coordinates). */
export const PLAN_IMAGE = { key: '56_0', file: assetUrl('/data/workspace/fhaz_1215_workspace.jpg'), id: 'FLF_1215_0774815107M492RAS', source: 'Front Hazcam workspace mesh texture · sol 1215 (2024-07-21)', credit: 'NASA/JPL-Caltech' };
export const ALERT_KINDS = {
  turnaround: { title: 'Turnaround time near', level: 'caution', source: 'HUD calculation · simulated plan value' },
  stay10: { title: '10 min stay time left', level: 'caution', source: 'HUD calculation · 10 min is a team design number' },
  buddy: { title: 'Partner separation', level: 'caution', source: 'HUD calculation · partner position simulated' },
  comm: { title: 'Comm loss', level: 'caution', source: 'HUD detection · simulated' },
  weather: { title: 'Space weather alert', level: 'warning', source: 'Sent by habitat · simulated event (not a real observation)' },
};

export function installFieldOps(mission) {
  const st = mission.st, emit = mission.emit;
  Object.assign(st, {
    pkg: null,       // { rev, planVersion, lines, lineHash, targets, source, credit, sentAt, receivedAt, ackAt }
    compare: { result: null, at: null, by: null, gazeErrDeg: null }, // crew's own comparison result: 'match' | 'mismatch'
    observations: {}, // id -> { answer, simT, by }
    alerts: [], buddyAway: false, commDownSince: null,
    planDraft: { todos: [['compare', 'POV match', 4], ['observe', 'Observation check · checklist', 6], ['sample', 'Sample record', 5], ['photo', 'Photo mark', 2], ['memo', 'Voice memo', 3]].map(([id, name, min]) => ({ id, name, min, on: true })), decider: 'Alex Kim', transport: 'rover' }, // transport: travel assumption of the plan. Rover by default (2026-11-15): the demo route walks out, then auto-boards the rover, so the budget uses the rover speed
    script: { nextAt: 0, log: [] }, // demo response · simulated astronaut: what the simulated crew did while the controller was watching
    planTx: null, // plan sent from ④ departure check: confirmedAt / sentAt / receivedAt / ackAt are separate (AC-03)
    autoGo: false, autoOff: false, autoNote: '', autoDir: 1, leftRoverAt: null, // demo auto-advance (HUD, person in the suit): W out of the base, then the route continues by itself; autoOff = the person switched to direct control
    followMarks: {}, carried: [], evaNo: 1, archive: [], // follow-up tasks (team proposal, not adopted): planner marks -> carried into the next EVA of this session
  });
  const acting = () => st.control === 'hud-manual' || st.control === 'pad-auto';
  const preReturn = () => ['outbound', 'arrived', 'onsite'].includes(st.phase);
  function raiseAlert(kind, text, opt = {}) {
    const K = ALERT_KINDS[kind]; if (!K || st.phase === 'ended' || st.alerts.some((a) => a.kind === kind && (a.ackAt === null || !a.resolvedAt))) return null; // one open alert per kind
    const a = { id: st.alerts.length + 1, kind, title: K.title, level: K.level, source: K.source, text, choosable: preReturn(), raisedAt: st.simSeconds, sentAt: opt.fromBase ? st.simSeconds : null, receivedAt: opt.fromBase ? null : st.simSeconds, ackAt: null, choice: null, choiceAt: null, executedAt: null, held: false, resolvedAt: opt.fromBase ? st.simSeconds : null };
    st.alerts.push(a); emit('alert'); return a;
  }
  function detect() { // HUD-local detection on simulated values
    const out = st.s > st.route.stats.indoorM, open = (k) => st.alerts.find((a) => a.kind === k && !a.resolvedAt), ever = (k) => st.alerts.some((a) => a.kind === k);
    const tl = PLAN.turnaroundSec - st.simSeconds;
    if (preReturn() && out && st.returnStartedAt === null && tl <= FIELD.turnWarnSec && !ever('turnaround')) raiseAlert('turnaround', `${fmtT(Math.max(0, tl))} to turnaround time (latest return start) T+${fmtT(PLAN.turnaroundSec)} (simulated plan value)`);
    if (st.phase === 'onsite' && PLAN.staySec > FIELD.stayWarnSec && mission.stayLeft() <= FIELD.stayWarnSec && !ever('stay10')) raiseAlert('stay10', '10 min of planned stay time left (design number). Decide whether to continue the tasks.');
    if (out && st.buddyGap > FIELD.buddyWarnM) raiseAlert('buddy', `Partner is more than ${FIELD.buddyWarnM} m away (simulated threshold).`); else if (open('buddy') && st.buddyGap <= FIELD.buddyWarnM) open('buddy').resolvedAt = st.simSeconds;
    if (!st.comm.up) { if (st.commDownSince === null) st.commDownSince = st.simSeconds; if (st.simSeconds - st.commDownSince >= FIELD.commLossSec) raiseAlert('comm', `Habitat comm link down for over ${FIELD.commLossSec} s. Last received T+${fmtT(st.comm.lastRx)}.`); }
    else { st.commDownSince = null; const c = open('comm'); if (c) c.resolvedAt = st.simSeconds; }
    for (const k of ['turnaround', 'stay10']) { const a = open(k); if (a && (st.returnStartedAt !== null || (k === 'stay10' && st.phase !== 'onsite'))) a.resolvedAt = st.simSeconds; }
  }
  /**
   * Demo response · simulated astronaut (user decision 'A'). A fixed demo script for the simulated crew, one step at a time with a small delay,
   * driven only by the current state so it resumes from the next unfinished step after a person hands the HUD back.
   * It acknowledges, then chooses, then starts the return as separate timestamped steps; it never judges anything.
   */
  const SCRIPT = 'Demo response · simulated astronaut';
  function script() {
    const sc = st.script, T = st.simSeconds; if (T < sc.nextAt || st.phase === 'ended') return;
    const did = (text, gap = 2.5) => { sc.log.push({ t: T, text }); sc.nextAt = T + gap; emit('script'); return true; }, x = { input: SCRIPT };
    const p = st.planTx, k = st.pkg, r = st.remote, al = mission.activeAlert();
    if (p && p.receivedAt !== null && p.ackAt === null && T - p.receivedAt >= 2) { mission.ackPlan(); return did(`Plan v${p.planVersion} receipt acknowledged${k && k.ackAt !== null ? ' · POV match package acknowledged too' : ''}`); }
    if (k && k.receivedAt !== null && k.ackAt === null && T - k.receivedAt >= 2) { mission.ackPackage(); return did(`POV match package r${k.rev} receipt acknowledged`); }
    if (al && al.ackAt === null) { if (T - al.receivedAt < 2) return; mission.ackAlert(al.id); return did(`Alert acknowledged: ${al.title}`); }
    if (al && mission.alertChoosable(al)) { mission.chooseAlert(al.id, 'return'); return did(`Alert choice: return (${al.title})`); }
    if (r && r.receivedAt !== null && r.ackAt === null) { if (T - r.receivedAt < 2) return; mission.ackRemote(); return did(`Habitat instruction acknowledged: ${r.text}`); }
    const wantReturn = (r && r.ackAt !== null && r.executedAt === null && !r.declined) || !!mission.pendingReturn();
    if (wantReturn && ['outbound', 'arrived', 'onsite'].includes(st.phase) && st.s > st.route.stats.indoorM) { if (mission.startReturn()) return did('Start return (choice executed)'); }
    if ((p ? p.transport : st.planDraft.transport) === 'rover' && st.phase === 'outbound' && st.transport === 'foot' && Math.abs(st.s - st.roverS) <= 3 && st.roverS <= st.route.length && st.s >= st.roverS - 3) { st.transport = 'rover'; st.s = st.roverS; emit('transport'); return did('Boarded rover', 1.5); }
    if (st.phase === 'arrived') { mission.confirmArrival(); return did('Arrival confirmed → tasks start'); }
    if (st.phase === 'onsite') {
      if (k && k.ackAt !== null && st.compare.result === null) { mission.setCompare('match', 'script', { aligned: true, gazeErrDeg: 0 }, x); return did('POV match: Match (planned site)', 3); }
      if (!st.observations.vein) { mission.answerObservation('vein', 'seen', 'script', x); return did('Observation answer: Veins Seen'); }
      if (!st.observations.spots) { mission.answerObservation('spots', 'undetermined', 'script', x); return did("Observation answer: Spots Can't tell"); }
      if (!st.records.some((q) => q.type === 'photo')) { mission.addRecord('photo', 'Photo mark (simulated: no real camera frame stored)', x); return did('Photo mark'); }
      if (!st.records.some((q) => q.type === 'sample')) { mission.addSample('script', 'Demo response: sample record at the planned site', x); return did('Sample record', 3); }
      if (mission.startReturn()) return did('Start return (planned tasks done)');
    }
    if (st.phase === 'atBase') { mission.endMission(); return did('End Marswalk'); }
  }
  /**
   * Demo auto-advance (joint demo feedback 2026-11-15) for a PERSON in the suit: after W has taken the crew out of the base to the parked rover,
   * the crew boards it (when the plan assumes the rover) and the route continues by itself. It stops for the key scenes: arrival (work
   * starts only after the crew confirms), any alert, and the base ramp. On the way back it resumes once the crew has started the return.
   * W or S hands control back to the person (autoOff) for the rest of this EVA; "auto" (voice/menu) turns it on again. Nothing is decided for the crew.
   */
  const AUTO_FROM = 4; // m past the ramp foot before the automatic part takes over (the rover is parked 7 m out, boarded at 3 m)
  function autoDrive() {
    const planRover = (st.planTx ? st.planTx.transport : st.planDraft.transport) === 'rover', baseS = st.route.stats.indoorM, movable = st.phase === 'outbound' || st.phase === 'returning';
    // Rover auto-boarding (2026-11-15): going out AND coming back, also under direct control. Whenever the person reaches the parked rover on the
    // route it is boarded without E; on the way back a rover left at the destination is boarded as soon as the return starts. Only a plan
    // that explicitly assumes on foot keeps the crew on foot. At the base ramp the crew steps off so W walks in through the airlock.
    // After stepping off on purpose (E), the rover is boarded again only by E or once the crew has walked more than 3.5 m away and comes back.
    if (st.leftRoverAt !== null && Math.abs(st.s - st.leftRoverAt) > 3.5) st.leftRoverAt = null;
    if (planRover && st.transport === 'foot' && st.leftRoverAt === null && st.roverS <= st.route.length && Math.abs(st.s - st.roverS) <= 3 && ((st.phase === 'outbound' && st.s >= baseS) || st.phase === 'returning')) { st.transport = 'rover'; st.s = st.roverS; emit('transport'); st.autoNote = 'Rover auto-boarded'; }
    if (st.phase === 'atBase' && st.transport === 'rover') { st.transport = 'foot'; st.roverS = st.s; emit('transport'); }
    if (st.phase === 'arrived' && st.transport === 'rover' && !st.arriveStepOff) { st.arriveStepOff = true; st.transport = 'foot'; st.roverS = st.s; emit('transport'); st.autoNote = 'Arrived · auto get off rover'; } // auto get off at arrival (2026-11-15): the crew steps off at the destination; the rover is boarded again automatically when the return starts
    if (st.autoGo) { // the automatic route stops only for the key scenes, a dismount, or the end of a backward run
      const stop = (note) => { st.autoGo = false; st.autoNote = note; emit('auto'); };
      if (mission.activeAlert()) stop('Alert · auto-advance stopped (resumes after the alert)');
      else if (!movable) stop(st.phase === 'arrived' ? 'At destination · auto-advance stopped' : st.phase === 'atBase' ? 'At habitat · auto-advance stopped' : '');
      else if (planRover && st.transport !== 'rover' && st.roverS <= st.route.length) stop('Got off rover · board again to auto-advance');
      else if (st.autoDir === -1 && ((st.phase === 'outbound' && st.s <= baseS + 0.01) || (st.phase === 'returning' && st.s >= st.route.length - 0.01))) { stop('Reached the end backwards · W to go forward'); st.autoDir = 1; }
      return;
    }
    if (st.autoOff || !movable || mission.activeAlert()) return; // autoOff only by the voice word "manual"; W/S turn it on again
    if (planRover && st.transport !== 'rover' && st.roverS <= st.route.length) return; // riding is what runs by itself
    if ((st.phase === 'outbound' && st.s >= baseS + AUTO_FROM) || (st.phase === 'returning' && st.s > baseS)) { st.autoGo = true; st.autoDir = 1; st.autoNote = st.phase === 'returning' ? 'Return · auto-advance' : st.transport === 'rover' ? 'Rover auto-boarded · auto-advance' : 'Auto-advance'; emit('auto'); }
  }
  mission.ext = {
    tick(d) {
      if (st.buddyAway) { st.awayGap = Math.min(32, Math.max(st.awayGap || 0, st.buddyGap) + 2.5 * d); st.buddyGap = st.awayGap; } else st.awayGap = 0; // simulated incident: the buddy drifts away at 2.5 m/s up to 32 m
      if (st.pkg && st.comm.up && st.pkg.receivedAt === null && !st.pkg.stale) st.pkg.receivedAt = st.simSeconds; // a package from an older plan version is never delivered
      if (st.planTx && st.comm.up && st.planTx.receivedAt === null) st.planTx.receivedAt = st.simSeconds; // the HUD receives only over a live link, while the HUD role is running
      for (const a of st.alerts) if (a.receivedAt === null && st.comm.up) a.receivedAt = st.simSeconds;
      detect();
      if (st.control === 'pad-auto') script(); else if (st.control === 'hud-manual') autoDrive();
    },
    /** hud-manual: true while the demo auto-advance moves the person along the route (mission.tick treats it like a held W). */
    autoMoveManual: () => st.autoGo && (st.phase === 'outbound' || st.phase === 'returning'),
    /** pad-auto only: the simulated crew walks/drives whenever the phase allows movement. */
    autoMove: () => st.phase === 'outbound' || st.phase === 'returning',
    // A return chosen on an alert can be started from every pre-return phase, on site included (mission.startReturn already allowed it there; the HUD card used to be hidden while on site).
    canReturnEarly: () => preReturn() && st.s > st.route.stats.indoorM && st.alerts.some((a) => a.choice === 'return' && a.executedAt === null),
    onReturnStart() { st.leftRoverAt = null; st.autoDir = 1; st.arriveStepOff = false; for (const a of st.alerts) if (a.choice === 'return' && a.executedAt === null) { a.executedAt = st.simSeconds; a.executedBy = st.control; } },
  };
  Object.assign(mission, {
    FIELD,
    /** Voice word "manual": stop the automatic route until W/S or "auto". */
    takeManual() { const was = st.autoGo; st.autoGo = false; st.autoOff = true; st.autoNote = 'Auto-advance stopped · W/S or "auto" to resume'; emit('auto'); return was; },
    /** Fresh W (dir 1) / S (dir -1) while riding: the automatic route runs in that direction. Returns false when it cannot run now (on foot, alert, stopped phase). */
    autoSteer(dir) {
      const planRover = (st.planTx ? st.planTx.transport : st.planDraft.transport) === 'rover', movable = st.phase === 'outbound' || st.phase === 'returning';
      if (st.control !== 'hud-manual' || !movable || mission.activeAlert() || (planRover && st.transport !== 'rover' && st.roverS <= st.route.length)) return false;
      if (dir < 0 && st.phase === 'outbound' && st.s <= st.route.stats.indoorM + 0.01) return false;
      st.autoOff = false; st.autoDir = dir < 0 ? -1 : 1; if (!st.autoGo) { st.autoGo = true; emit('auto'); } st.autoNote = st.autoDir < 0 ? 'Auto-advance backwards' : 'Auto-advance'; return true;
    },
    /** Turn demo auto-advance back on (voice "auto" / HUD). It starts at the next point where it may move. */
    resumeAuto() { if (st.control !== 'hud-manual' || st.phase === 'ended') return false; st.autoOff = false; st.autoNote = 'Auto-advance waiting'; emit('auto'); return true; },
    // ---- ② plan / ④ departure check (minimal planning flow; every number is simulated or an assumption) ----
    /** Budget from the route length, the speed of the plan's travel assumption (on foot 1.4 m/s or rover 3.5 m/s, both simulated) and the TODO minutes. Not a validated consumables model. */
    planBudget() {
      const d = st.planDraft, outM = st.route.length - st.route.stats.indoorM, transport = TRANSPORT[d.transport] ? d.transport : 'foot', speed = TRANSPORT[transport].speed, travelSec = outM / speed, staySec = d.todos.filter((t) => t.on).reduce((a, t) => a + t.min, 0) * 60, marginSec = 180;
      const turnaroundSec = Math.ceil((travelSec + staySec + marginSec) / 60) * 60, totalSec = turnaroundSec + travelSec, o2Use = (totalSec / 60) * PLAN.o2PctPerMin;
      return { outM, transport, transportLabel: `${TRANSPORT[transport].label} ${speed} m/s (simulated)`, speed, travelSec, staySec, marginSec, turnaroundSec, totalSec, o2Use, o2AtReturn: 100 - o2Use };
    },
    setPlanTransport(t) { if (!TRANSPORT[t]) return false; st.planDraft.transport = t; emit('plandraft'); return true; },
    setPlanTodo(id, patch) { const t = st.planDraft.todos.find((x) => x.id === id); if (!t) return false; if (patch.min !== undefined) t.min = Math.max(0, Math.min(60, Math.round(+patch.min || 0))); if (patch.on !== undefined) t.on = !!patch.on; emit('plandraft'); return true; },
    /** Confirm plan · send to HUD. Applies the planned stay and turnaround time to the shared plan values; sending never moves the crew. */
    sendPlan(decider, opts = {}) {
      if (!String(decider || '').trim() || ['returning', 'atBase', 'ended'].includes(st.phase)) return false; const b = mission.planBudget();
      PLAN.staySec = b.staySec; PLAN.turnaroundSec = b.turnaroundSec; st.planVersion += 1; if (st.pkg && st.pkg.ackAt === null) st.pkg.stale = true; // an unconfirmed package made for the previous plan version must be re-sent
      st.planTx = { missionId: mission.missionId(), rev: (st.planTx ? st.planTx.rev : 0) + 1, planVersion: st.planVersion, decider: String(decider).trim(), todos: st.planDraft.todos.filter((t) => t.on).map((t) => ({ ...t })), budget: b, transport: b.transport, destKey: st.destKey, confirmedAt: st.simSeconds, sentAt: st.simSeconds, receivedAt: null, ackAt: null, auto: !!opts.auto }; // auto: demo auto-prepared (no person confirmed or sent it)
      emit('plantx'); return true;
    },
    ackPlan() { const p = st.planTx; if (!p || p.receivedAt === null || p.ackAt !== null || !acting()) return false; p.ackAt = st.simSeconds; p.ackBy = st.control; if (st.pkg && st.pkg.receivedAt !== null && st.pkg.ackAt === null && st.pkg.planVersion === p.planVersion) { st.pkg.ackAt = st.simSeconds; st.pkg.ackBy = st.control; } emit('plantx'); return true; }, // the bundled POV match package is acknowledged with the plan only when it was made for the same plan version
    /** Habitat start (simulated astronaut departs): the EVA starts from the PAD; the simulated crew stands at the airlock exit. The explorer role's walk-out path is unchanged. */
    padStart() { if (st.departed || !st.planTx) return false; const ramp = st.route.pts.find((q) => q.kind === 'ramp'); if (!ramp) return false; st.s = ramp.s; st.habitatPose = null; st.departed = true; st.script.nextAt = st.simSeconds + 1; mission.setControl('pad-auto'); emit('departure'); return true; },
    /** What the base may show: live values while the link is up, the last received snapshot while it is down. */
    baseView: () => (st.comm.up ? { s: st.s, o2: st.o2, transport: st.transport, sim: st.simSeconds, stale: false } : { ...st.padView, stale: true }),
    // ---- POV match package ----
    sendPackage(draft) {
      if (!draft || !draft.lines || !draft.lines.length || !draft.targets || !draft.targets.length || st.destKey !== PLAN_IMAGE.key) return false;
      st.pkg = { rev: (st.pkg ? st.pkg.rev : 0) + 1, planVersion: st.planVersion, lines: draft.lines, lineHash: draft.hash, detail: draft.detail, targets: draft.targets.map((t, i) => ({ id: i + 1, u: t.u, v: t.v })), imageId: PLAN_IMAGE.id, source: PLAN_IMAGE.source, credit: PLAN_IMAGE.credit, sentAt: st.simSeconds, receivedAt: null, ackAt: null, auto: !!draft.auto };
      st.compare = { result: null, at: null, by: null, gazeErrDeg: null }; emit('pkg'); return true;
    },
    ackPackage() { const p = st.pkg; if (!p || p.receivedAt === null || p.ackAt !== null || !acting()) return false; p.ackAt = st.simSeconds; p.ackBy = st.control; emit('pkg'); return true; },
    /** The crew states the result of their own comparison. The product detects nothing. */
    setCompare(result, by, metrics = {}, extra = {}) {
      const p = st.pkg; if (st.phase !== 'onsite' || !acting() || !(p && p.ackAt !== null) || !['match', 'mismatch'].includes(result)) return null;
      if (result === 'match' && !metrics.aligned) return null; // needs the gaze inside tolerance
      st.compare = { result, at: st.simSeconds, by, gazeErrDeg: metrics.gazeErrDeg ?? null };
      return mission.addRecord('compare', result === 'match' ? `POV match: astronaut confirmed Match (plan v${p.planVersion} package r${p.rev}, gaze error ${metrics.gazeErrDeg.toFixed(1)}°). Not automatic recognition.` : 'POV match: astronaut reported No match. No judgement.', { result, by, ...extra });
    },
    answerObservation(id, answer, by, extra = {}) {
      const it = OBS_ITEMS.find((x) => x.id === id); if (st.phase !== 'onsite' || !acting() || !ANSWERS[answer] || !it) return null;
      st.observations[id] = { answer, simT: st.simSeconds, by };
      return mission.addRecord('obs', `${it.name}: ${ANSWERS[answer]}`, { item: id, answer, by, grade: 'visual', ...extra });
    },
    /** Point of interest: `pos` is the ground point the crew is looking at (or the crew position when there is none). */
    addInterest(by, pos = null, note = '', extra = {}) { if (st.phase !== 'onsite') return null; const n = mission.interestCount() + 1; return mission.addRecord('interest', note || `Point of interest ${n}`, { by, pos: pos || undefined, n, costSec: FIELD.interestCostSec, atGaze: !!pos, grade: 'visual', ...extra }); },
    interestCount: () => st.records.filter((r) => r.type === 'interest').length,
    /** One id for the same mission on the planning display, the HUD and the records (destination + EVA number of this session). */
    missionId: () => `AREO-${st.destKey}-EVA${String(st.evaNo).padStart(2, '0')}`,
    /** Remaining stay once the time budgeted for the added interest points is taken out (v0.2 HUD #4). */
    stayLeftAfterInterest: () => (st.phase === 'onsite' ? mission.stayLeft() - FIELD.interestCostSec * mission.interestCount() : null),
    /** Sample record: video time mark + dictated note. Coordinates, time and dose are attached by addRecord (all simulated). */
    addSample(by, note = '', extra = {}) {
      if (st.phase !== 'onsite') return null; const m = st.compare.result === 'match' && st.pkg ? st.pkg.targets[0] : null;
      return mission.addRecord('sample', note, { by, videoT: st.simSeconds, target: m ? { id: m.id, u: m.u, v: m.v, planVersion: st.pkg.planVersion, rev: st.pkg.rev } : null, ...extra });
    },
    // ---- alerts ----
    raiseAlert,
    /** The alert that needs the crew now: not yet acknowledged, or acknowledged and waiting for the continue/return choice. */
    activeAlert: () => st.alerts.find((a) => a.receivedAt !== null && (a.ackAt === null || mission.alertChoosable(a))) || null,
    alertChoosable: (a) => a.ackAt !== null && a.choice === null && a.choosable && preReturn(),
    ackAlert(id) { const a = st.alerts.find((x) => x.id === id); if (!a || a.receivedAt === null || a.ackAt !== null || !acting()) return false; a.ackAt = st.simSeconds; a.ackBy = st.control; emit('alert'); return true; },
    /** Choosing 'return' only records the choice. The return itself starts when the crew runs Start return. */
    chooseAlert(id, choice) { const a = st.alerts.find((x) => x.id === id); if (!a || !mission.alertChoosable(a) || !['continue', 'return'].includes(choice)) return false; a.choice = choice; a.choiceAt = st.simSeconds; a.choiceBy = st.control; emit('alert'); return true; },
    holdReturn() { let any = false; for (const a of st.alerts) if (a.choice === 'return' && a.executedAt === null && !a.held) { a.held = true; a.heldAt = st.simSeconds; a.heldBy = st.control; any = true; } if (any) emit('alert'); return any; },
    pendingReturn: () => st.alerts.find((a) => a.choice === 'return' && a.executedAt === null && !a.held) || null,
    /** Simulated incidents for the demo (PAD buttons / tests). */
    sendWeatherAlert(text = 'Space weather worsening notice (simulated event). Decide whether to continue.') { return raiseAlert('weather', text, { fromBase: true }); },
    setBuddyAway(v) { st.buddyAway = !!v; emit('alert'); },
    debugAdvance(sec) { st.simSeconds += Math.max(0, sec); }, // test hook: moves the simulated clock forward (oxygen and dose follow on the next tick)
    /** Evidence level update: field records accumulated as input for the next plan. Grades name the KIND of evidence, never a verdict. */
    // ---- Follow-up tasks: team proposal (demo of a proposal not adopted). Gathered from records the base has received; nothing is researched, scored or judged here. ----
    followUps() {
      const rx = st.records.filter((r) => r.sent), out = [], add = (r, kind, title, note) => out.push({ key: `e${st.evaNo}-${r.type}-${r.id}`, kind, title, note, recId: r.id, simT: r.simT, lonE: r.lonE, latN: r.latN, marked: !!st.followMarks[`e${st.evaNo}-${r.type}-${r.id}`] });
      for (const it of OBS_ITEMS) { const r = [...rx].reverse().find((x) => x.type === 'obs' && x.item === it.id); if (r && r.answer !== 'seen') add(r, 'Observation answer', `${it.name}: ${ANSWERS[r.answer]}`, r.answer === 'not_seen' ? 'Not seen on site · decide whether to look again' : "Can't tell on site · needs another check"); }
      for (const r of rx) { if (r.type === 'compare' && r.result === 'mismatch') add(r, 'POV match', 'No match reported', 'Astronaut reports the site differs from the planning image · cause unknown'); if (r.type === 'interest') add(r, 'Point of interest', r.text, 'Not in the plan · unclassified'); if (r.type === 'sample') add(r, 'Sample record', r.text || `Sample record #${r.id}`, 'Awaiting analysis · no biosignature judgement'); }
      return out;
    },
    markFollowUp(key, v) { if (v) st.followMarks[key] = true; else delete st.followMarks[key]; emit('followup'); return !!v; },
    /** Next EVA in the same browser session (demo reset): marked items are carried over; the finished EVA's records are archived. */
    beginNextEva() {
      if (st.phase !== 'ended') return false;
      st.carried = mission.followUps().filter((f) => f.marked).map((f) => ({ ...f, fromEva: st.evaNo, doneAt: null }));
      st.archive.push({ eva: st.evaNo, endedAt: st.endedAt, records: st.records, planTx: st.planTx, pkg: st.pkg, alerts: st.alerts, remote: st.remote, observations: st.observations, compare: st.compare, scriptLog: st.script.log }); st.evaNo += 1; // the finished EVA is kept as it was
      Object.assign(st, { records: [], observations: {}, compare: { result: null, at: null, by: null, gazeErrDeg: null }, alerts: [], pkg: null, planTx: null, script: { nextAt: 0, log: [] }, departed: false, control: 'idle', followMarks: {}, remote: null, phase: 'outbound', arrived: false, returnStartedAt: null, endedAt: null, endedBy: null, endedHow: null, returnBy: null, onsiteSince: null, simSeconds: 0, o2: 100, doseUsv: 0, buddyAway: false, commDownSince: null,
        transport: 'foot', roverS: st.route.stats.indoorM + 7, moving: false, wHeld: false, sHeld: false, shiftHeld: false, padShift: false, warp: 1, backing: false, autoGo: false, autoOff: false, autoNote: '', autoDir: 1, leftRoverAt: null, arriveStepOff: false, planStatus: `EVA ${st.evaNo} plan (not confirmed)` }); // time, consumables, alerts, plan and package all start over; the rover is parked at the ramp again
      if (!st.habitatPose) st.s = Math.min(st.s, st.route.stats.indoorM); // a crew still outside is handled by main.js (taken back inside)
      st.comm.up = true; st.comm.lastRx = 0; st.padView = { s: st.s, o2: 100, transport: 'foot', sim: 0 }; st.planVersion += 1; emit('nextEva'); emit('plan'); return true;
    },
    checkCarried(key, by, extra = {}) { const c = st.carried.find((x) => x.key === key); if (!c || c.doneAt !== null || st.phase !== 'onsite') return null; c.doneAt = st.simSeconds; return mission.addRecord('followup', `Carry-over task checked: [${c.kind}] ${c.title} (EVA ${c.fromEva} record #${c.recId})`, { by, carriedKey: key, ...extra }); },
    /**
     * Mission record export: one JSON trace of the current EVA that links input data -> plan/package versions -> transmission states -> the
     * crew's own responses -> records the base received -> follow-up items. `inputs` (data identifiers) is supplied by the PAD, which holds
     * the terrain metadata. Every response says who acted: a person in the HUD, or the fixed demo script (demo response · simulated astronaut).
     * Nothing is analysed or judged here; times are the simulated mission clock (seconds).
     */
    exportTrace(inputs = []) {
      const who = (c) => (c === 'hud-manual' ? { actor: 'human', label: 'Human astronaut · HUD manual control' } : c === 'pad-auto' ? { actor: 'scripted', label: SCRIPT } : { actor: 'unknown', label: 'No record' });
      const recWho = (r) => (r.by === 'script' || r.input === SCRIPT ? who('pad-auto') : who(r.control === 'pad-auto' ? 'pad-auto' : 'hud-manual'));
      const t = st.planTx, k = st.pkg, rm = st.remote, rs = st.route.stats;
      const records = st.records.map((r) => ({ id: r.id, type: r.type, text: r.text, ...recWho(r), input: r.input || null, createdAt: r.simT, receivedAtPad: r.sent ? r.sentAt : null, phase: r.phase, transport: r.transport,
        position: { lonE: r.lonE, latN: r.latN, routeS_m: r.s, kind: 'simulated position converted to map coordinates' }, doseUsv_simulated: r.doseUsv, item: r.item || undefined, answer: r.answer || undefined, result: r.result || undefined, target: r.target || undefined, hasCapture: !!r.frame, captureNote: r.frame ? 'Simulated view · not a real observation (not included in this file)' : undefined }));
      return {
        schema: 'areographic-trace/1', exportedAt: new Date().toISOString(), eva: st.evaNo,
        notice: 'Simulated mission record. Time, position, oxygen, dose and comm link are simulated values; responses are the astronaut\'s visual records, not analysis or judgement. actor=scripted items are fixed demo responses, not human decisions.',
        clock: { unit: 'simulated mission clock seconds', now: st.simSeconds }, phase: st.phase,
        inputs,
        plan: { planVersion: st.planVersion, destKey: st.destKey, route: { oneWayM: rs.oneWayM, traverseM: rs.traverseM, maxSlopeDeg: rs.maxSlopeDeg, basis: 'M20 traverse + HiRISE 1 m DTM heights (computed)' },
          sent: t ? { rev: t.rev, planVersion: t.planVersion, decider: t.decider, demoPrepared: !!t.auto, transport: t.transport, todos: t.todos.map((x) => ({ id: x.id, name: x.name, min: x.min })), budget: { ...t.budget, note: 'simulated · not a validated consumables model' } } : null },
        package: k ? { rev: k.rev, planVersion: k.planVersion, demoPrepared: !!k.auto, matchesPlanVersion: !!t && k.planVersion === t.planVersion, stale: !!k.stale, imageId: k.imageId, source: k.source, credit: k.credit, lineFingerprint: k.lineHash, lineCount: k.lines.length, detail: k.detail, targets: k.targets } : null,
        transmissions: {
          plan: t ? { confirmedAt: t.confirmedAt, sentAt: t.sentAt, receivedAt: t.receivedAt, ackAt: t.ackAt, ack: t.ackAt !== null ? who(t.ackBy) : null } : null,
          package: k ? { sentAt: k.sentAt, receivedAt: k.receivedAt, ackAt: k.ackAt, ack: k.ackAt !== null ? who(k.ackBy) : null } : null,
          remoteReturn: rm ? { text: rm.text, sentAt: rm.sentAt, receivedAt: rm.receivedAt, ackAt: rm.ackAt, ack: rm.ackAt !== null ? who(rm.ackBy) : null, declined: !!rm.declined, declinedAt: rm.declinedAt ?? null, executedAt: rm.executedAt, executed: rm.executedAt !== null ? who(rm.executedBy) : null } : null,
          alerts: st.alerts.map((a) => ({ id: a.id, kind: a.kind, title: a.title, level: a.level, source: a.source, raisedAt: a.raisedAt, sentAt: a.sentAt, receivedAt: a.receivedAt, ackAt: a.ackAt, ack: a.ackAt !== null ? who(a.ackBy) : null,
            choice: a.choice, choiceAt: a.choiceAt, chosen: a.choice ? who(a.choiceBy) : null, held: !!a.held, heldAt: a.heldAt ?? null, executedAt: a.executedAt, executed: a.executedAt !== null ? who(a.executedBy) : null, resolvedAt: a.resolvedAt })),
        },
        responses: {
          compare: st.compare.result ? { result: st.compare.result, at: st.compare.at, gazeErrDeg: st.compare.gazeErrDeg, ...(st.compare.by === 'script' ? who('pad-auto') : who('hud-manual')), input: st.compare.by, againstPackage: k ? { rev: k.rev, planVersion: k.planVersion } : null, note: 'chosen by the astronaut · not automatic recognition' } : null,
          observations: OBS_ITEMS.map((it) => { const o = st.observations[it.id]; return { id: it.id, name: it.name, question: it.q, answer: o ? o.answer : null, answerLabel: o ? ANSWERS[o.answer] : 'No answer', at: o ? o.simT : null, ...(o ? (o.by === 'script' ? who('pad-auto') : who('hud-manual')) : {}), input: o ? o.by : null }; }),
          memos: records.filter((r) => r.type === 'memo'),
          returnStart: st.returnStartedAt !== null ? { at: st.returnStartedAt, ...who(st.returnBy) } : null,
          missionEnd: st.endedAt !== null ? { at: st.endedAt, how: st.endedHow === 'inner-door' ? 'Passed inner airlock door' : 'Confirmed after reaching habitat', ...who(st.endedBy) } : null,
        },
        records, recordsReceivedAtPad: records.filter((r) => r.receivedAtPad !== null).length,
        followUps: mission.followUps().map((f) => ({ key: f.key, kind: f.kind, title: f.title, note: f.note, fromRecordId: f.recId, recordedAt: f.simT, markedForNextEva: f.marked })),
        carriedFromPreviousEva: (st.carried || []).map((c) => ({ key: c.key, kind: c.kind, title: c.title, fromEva: c.fromEva, checkedAt: c.doneAt })),
        scriptedCrewLog: st.script.log.map((l) => ({ at: l.t, text: l.text, actor: 'scripted', label: SCRIPT })),
      };
    },
    evidence() {
      const rx = st.records.filter((r) => r.sent), rows = [
        { feature: 'White calcium sulfate veins', grade: 'measured', basis: 'Rover measurement (team kit research notes)', field: false },
        { feature: 'Leopard spots · dark rims', grade: 'measured', basis: 'Rover measurement · PIXL mineral map PIA26640', field: false },
        { feature: 'Orbital evidence', grade: 'unverified', basis: 'Not collected in this demo', field: false },
      ];
      for (const it of OBS_ITEMS) { const r = [...rx].reverse().find((x) => x.type === 'obs' && x.item === it.id); rows.push({ feature: `On-site ${it.name}`, grade: r ? 'visual' : 'unverified', basis: r ? `Astronaut answer "${ANSWERS[r.answer]}" · T+${fmtT(r.simT)}` : 'No on-site answer received', field: !!r, answer: r ? r.answer : null }); }
      const cnt = (t) => rx.filter((r) => r.type === t).length;
      return { rows, samples: cnt('sample'), interests: cnt('interest'), compare: rx.filter((r) => r.type === 'compare').map((r) => r.result).pop() || null, updated: rows.filter((r) => r.field).length };
    },
  });
  return mission;
}
