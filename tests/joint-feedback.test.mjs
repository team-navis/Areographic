// Joint demo feedback (2026-11-15): 시연 자동 진행 for a person in the suit, and the next EVA after a closed one.
// Same flat-surface fixture as mission-regression.test.mjs (real route, no terrain model).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMission } from '../src/state/mission.js';
import { installFieldOps } from '../src/state/field-ops.js';

const meta = JSON.parse(readFileSync(new URL('../public/data/jezero/terrain.json', import.meta.url), 'utf8'));
const routeData = JSON.parse(readFileSync(new URL('../public/data/jezero/route.json', import.meta.url), 'utf8'));
function fixture() {
  const frame = meta.local_frame;
  const terrain = { meta, toWorld: (x, y) => ({ x: (x - frame.origin_x_eqc) * frame.cos_lat0, z: -(y - frame.origin_y_eqc) }), groundY: () => 0, toEqc: (x, z) => ({ X: frame.origin_x_eqc + x / frame.cos_lat0, Y: frame.origin_y_eqc - z }) };
  const m = createMission(terrain, [{ x: 0, y: 0, z: 0, kind: 'indoor' }, { x: -5, y: 0, z: 0, kind: 'ramp' }], routeData); installFieldOps(m); return m;
}
const run = (m, sec, step = 0.05) => { for (let t = 0; t < sec; t += step) m.tick(step); };

test('W out of the base, then the rover is boarded and the route runs by itself until arrival', () => {
  const m = fixture(), st = m.st; m.sendPlan('test'); m.setControl('hud-manual');
  assert.equal(st.planDraft.transport, 'rover', 'the default plan assumes the rover the demo boards');
  m.setW(true); run(m, 8); m.setW(false); // walk past the ramp foot
  run(m, 0.2); assert.equal(st.transport, 'rover'); assert.equal(st.autoGo, true);
  const s0 = st.s; run(m, 2); assert.ok(st.s > s0 + 5, 'moves without W');
  run(m, 120); assert.equal(st.phase, 'arrived'); assert.equal(st.autoGo, false, 'stops at arrival for the crew to confirm');
  run(m, 0.1); assert.equal(st.transport, 'foot', 'steps off the rover at the destination'); m.confirmArrival(); assert.equal(m.startReturn(), true); run(m, 0.2); assert.equal(st.transport, 'rover', 'boards again when the return starts');
});

test('W/S never switch the automatic route off: S runs it backward, W forward again', () => {
  const m = fixture(), st = m.st; m.sendPlan('test'); m.setControl('hud-manual');
  m.setW(true); run(m, 8); m.setW(false); run(m, 1); assert.equal(st.autoGo, true);
  m.setW(true); m.setW(false); assert.equal(st.autoGo, true, 'W keeps it running');
  const s0 = st.s; m.setS(true); m.setS(false); assert.equal(st.autoDir, -1); run(m, 1); assert.ok(st.s < s0, 'runs backward by itself'); assert.equal(st.autoGo, true);
  const s1 = st.s; m.setW(true); m.setW(false); run(m, 1); assert.ok(st.s > s1, 'forward again');
  m.takeManual(); const s2 = st.s; run(m, 1); assert.equal(st.s, s2, 'voice "수동" stops it'); m.setW(true); m.setW(false); run(m, 0.5); assert.ok(st.s > s2, 'W starts it again');
});

test('stepping off stops it; boarding again (E) resumes it', () => {
  const m = fixture(), st = m.st; m.sendPlan('test'); m.setControl('hud-manual');
  m.setW(true); run(m, 8); m.setW(false); run(m, 2); assert.equal(st.autoGo, true);
  assert.equal(m.dismount(), true); run(m, 0.5); assert.equal(st.transport, 'foot', 'no instant re-boarding'); assert.equal(st.autoGo, false);
  assert.equal(m.board(), true); run(m, 0.3); assert.equal(st.autoGo, true); const s0 = st.s; run(m, 1); assert.ok(st.s > s0);
});

test('an alert stops the automatic route', () => {
  const m = fixture(), st = m.st; m.sendPlan('test'); m.setControl('hud-manual');
  m.setW(true); run(m, 8); m.setW(false); run(m, 0.5); assert.equal(st.autoGo, true);
  m.sendWeatherAlert(); run(m, 0.2); assert.equal(st.autoGo, false); const s0 = st.s; run(m, 1); assert.equal(st.s, s0);
});

test('next EVA keeps the finished one in the archive and starts time, consumables, alerts, plan and package over', () => {
  const m = fixture(), st = m.st; m.sendPlan('test'); const v = st.planVersion; m.padStart(); st.autoWarp = 4;
  for (let i = 0; i < 20000 && st.phase !== 'ended'; i++) m.tick(0.05);
  assert.equal(st.phase, 'ended'); const recs = st.records.length; assert.ok(recs > 0);
  assert.equal(m.beginNextEva(), true);
  assert.equal(st.evaNo, 2); assert.equal(st.archive.length, 1); assert.equal(st.archive[0].records.length, recs); assert.equal(st.archive[0].planTx.planVersion, v);
  assert.deepEqual({ phase: st.phase, sim: st.simSeconds, o2: st.o2, dose: st.doseUsv, alerts: st.alerts.length, plan: st.planTx, pkg: st.pkg, departed: st.departed, transport: st.transport, ctl: st.control },
    { phase: 'outbound', sim: 0, o2: 100, dose: 0, alerts: 0, plan: null, pkg: null, departed: false, transport: 'foot', ctl: 'idle' });
  assert.ok(st.planVersion > v); assert.equal(st.roverS, st.route.stats.indoorM + 7);
  assert.equal(m.sendPlan('test'), true); assert.equal(m.padStart(), true, 'the next EVA can depart');
});

test('the rover is boarded automatically on the way back too, also under direct control, and left at the ramp', () => {
  const m = fixture(), st = m.st; m.sendPlan('test'); m.setControl('hud-manual');
  m.setW(true); run(m, 8); m.setW(false); run(m, 0.2); assert.equal(st.transport, 'rover');
  m.takeManual(); // voice "수동": direct control from here on
  m.setW(true); run(m, 150); m.setW(false); assert.equal(st.phase, 'arrived');
  m.confirmArrival(); m.dismount(); assert.equal(st.transport, 'foot'); // leave the rover at the destination
  assert.equal(m.startReturn(), true); run(m, 0.2); assert.equal(st.transport, 'rover', 'boarded again when the return starts');
  m.setW(true); run(m, 150); m.setW(false); run(m, 0.2); assert.equal(st.phase, 'atBase'); assert.equal(st.transport, 'foot', 'steps off at the ramp');
});
