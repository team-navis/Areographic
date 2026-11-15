import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMission } from '../src/state/mission.js';

const meta = JSON.parse(readFileSync(new URL('../public/data/jezero/terrain.json', import.meta.url), 'utf8'));
// Integration: the merged mission builds its route from Perseverance's published drive polyline, so the fixture passes the same file the app fetches.
const routeData = JSON.parse(readFileSync(new URL('../public/data/jezero/route.json', import.meta.url), 'utf8'));

// Keep the real route waypoints, but use a flat surface to isolate controller and
// transport behavior. These tests do not validate the terrain model or rendering.
function fixture() {
  const frame = meta.local_frame;
  const terrain = {
    meta,
    toWorld: (x, y) => ({ x: (x - frame.origin_x_eqc) * frame.cos_lat0, z: -(y - frame.origin_y_eqc) }),
    groundY: () => 0,
  };
  return createMission(terrain, [
    { x: 0, y: 0, z: 0, kind: 'indoor' },
    { x: -5, y: 0, z: 0, kind: 'ramp' },
  ], routeData);
}

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} vs ${expected}`);
}

test('control-room input cannot advance or consume the shared mission', () => {
  const mission = fixture();
  const before = { s: mission.st.s, time: mission.st.simSeconds, oxygen: mission.st.o2 };
  mission.setW(true);
  mission.tick(10);
  assert.deepEqual({ s: mission.st.s, time: mission.st.simSeconds, oxygen: mission.st.o2 }, before);
  assert.equal(mission.st.wHeld, false);
  assert.equal(mission.st.moving, false);
  assert.equal(mission.board(), false);
});

test('boarding requires a stopped explorer within the 3 m route range', () => {
  const mission = fixture();
  mission.setControl('hud-manual');
  const parked = mission.st.roverS;
  for (const offset of [-3.001, 3.001]) {
    mission.debugSetS(parked + offset);
    assert.equal(mission.board(), false, `must reject ${offset} m separation`);
    assert.equal(mission.st.transport, 'foot');
  }
  mission.debugSetS(parked - 3);
  mission.setW(true);
  assert.equal(mission.board(), false, 'must stop before boarding');
  mission.setW(false);
  assert.equal(mission.board(), true, 'the 3 m boundary is included');
  assert.equal(mission.st.s, parked);
  assert.equal(mission.st.transport, 'rover');
});

test('the rover travels faster while its position remains synchronized with the rider', () => {
  const walker = fixture(), rider = fixture();
  for (const mission of [walker, rider]) {
    mission.setControl('hud-manual');
    mission.debugSetS(mission.st.roverS);
  }
  assert.equal(rider.board(), true);
  const start = walker.st.s;
  walker.setW(true); rider.setW(true);
  walker.tick(4); rider.tick(4);
  near(walker.st.s - start, 1.4 * 4, 'walking distance');
  near(rider.st.s - start, 3.5 * 4, 'rover distance');
  assert.ok(rider.st.s > walker.st.s);
  assert.equal(rider.st.roverS, rider.st.s);
  assert.equal(walker.st.roverS, start, 'walking leaves the parked rover behind');
});

test('moving rider cannot dismount; walking after dismount leaves the rover parked', () => {
  const mission = fixture();
  mission.setControl('hud-manual');
  mission.debugSetS(mission.st.roverS);
  assert.equal(mission.board(), true);
  mission.setW(true); mission.tick(2);
  assert.equal(mission.canDismount(), false);
  assert.equal(mission.dismount(), false);
  mission.setW(false); mission.tick(0);
  const stoppedAt = mission.st.s;
  assert.equal(mission.dismount(), true);
  assert.equal(mission.st.transport, 'foot');
  assert.equal(mission.st.roverS, stoppedAt);
  mission.setW(true); mission.tick(1); mission.setW(false);
  assert.equal(mission.st.roverS, stoppedAt);
  assert.ok(mission.st.s > stoppedAt);
  assert.equal(mission.board(), true, 'can reboard after a short walk within range');
  assert.equal(mission.st.s, stoppedAt);
});

test('switching from HUD to control room releases W and preserves mission progress', () => {
  const mission = fixture();
  const stateIdentity = mission.st;
  mission.setDestination('54_702');
  mission.setControl('hud-manual');
  mission.debugSetS(mission.st.roverS);
  mission.board(); mission.setW(true); mission.tick(5);
  const snapshot = {
    s: mission.st.s, roverS: mission.st.roverS, transport: mission.st.transport,
    o2: mission.st.o2, simSeconds: mission.st.simSeconds,
    planVersion: mission.st.planVersion, destKey: mission.st.destKey, route: mission.st.route,
  };
  // New contract (scenario review): after departure the mission clock and consumables keep running while the controller
  // watches ('pad-auto'); the controller's keyboard still cannot move the crew.
  assert.equal(mission.autoControl(), 'pad-auto');
  mission.setControl(mission.autoControl());
  assert.equal(mission.st.wHeld, false);
  assert.equal(mission.st.moving, false);
  mission.setW(true); assert.equal(mission.st.wHeld, false, 'controller keyboard cannot hold W for the crew');
  mission.tick(30);
  for (const [key, value] of Object.entries(snapshot)) { if (key === 'o2' || key === 'simSeconds') continue; assert.equal(mission.st[key], value, key); } // no script module in this fixture: position stays
  assert.ok(Math.abs(mission.st.simSeconds - (snapshot.simSeconds + 30)) < 1e-9, 'clock runs independent of the screen');
  assert.ok(mission.st.o2 < snapshot.o2, 'consumables follow the clock');
  assert.equal(mission.st, stateIdentity, 'all monitors retain the same mission object');
  mission.setControl('hud-manual'); mission.tick(1);
  assert.equal(mission.st.s, snapshot.s, 'HUD re-entry must not resume a previously held W');
  assert.equal(mission.st.transport, 'rover');
  assert.equal(mission.setDestination('54_0'), false, 'route remains fixed after departure');
});

test('arrival clamps to the destination and still permits stopped dismount', () => {
  const mission = fixture();
  mission.setControl('hud-manual');
  mission.debugSetS(mission.st.roverS); mission.board();
  mission.debugSetS(mission.st.route.length - 1);
  mission.setW(true); mission.tick(1);
  assert.equal(mission.st.arrived, true);
  assert.equal(mission.st.moving, false);
  assert.equal(mission.st.s, mission.st.route.length);
  assert.equal(mission.st.roverS, mission.st.route.length);
  mission.setW(false);
  assert.equal(mission.dismount(), true);
  assert.equal(mission.st.arrived, true);
});

test('habitat walking updates the visible position without starting the EVA budget or route', () => {
  const mission = fixture();
  const route = mission.st.route, roverS = mission.st.roverS;
  const poses = [
    { x: 1.5, y: 2, z: 1, yaw: .2 },
    { x: -1.2, y: 2, z: -.4, yaw: -.8 },
    { x: -3.5, y: 2, z: 1.1, yaw: 1.5 },
  ];
  for (const pose of poses) {
    assert.equal(mission.setHabitatPose(pose), true);
    assert.deepEqual(mission.currentPose(), { ...pose, kind: 'indoor' });
    mission.setW(true); mission.tick(10);
  }
  assert.equal(mission.st.s, 0);
  assert.equal(mission.st.route, route);
  assert.equal(mission.st.planVersion, 1);
  assert.equal(mission.st.roverS, roverS);
  assert.equal(mission.st.simSeconds, 0);
  assert.equal(mission.st.o2, 100);
  assert.equal(mission.departed(), false);
  assert.equal(mission.setDestination('54_0'), true, 'walking around the room must not lock destination selection');
  assert.deepEqual(mission.currentPose(), { ...poses.at(-1), kind: 'indoor' });
});

test('airlock departure joins the ramp once without resetting the selected plan or parked rover', () => {
  const mission = fixture();
  mission.setDestination('54_702');
  mission.setHabitatPose({ x: -4.6, y: 0, z: 0, yaw: Math.PI / 2 });
  const preserved = {
    route: mission.st.route, destKey: mission.st.destKey, planVersion: mission.st.planVersion,
    roverS: mission.st.roverS, transport: mission.st.transport, simSeconds: mission.st.simSeconds, o2: mission.st.o2,
  };
  let departureEvents = 0;
  mission.on((type) => { if (type === 'departure') departureEvents++; });
  assert.equal(mission.departHabitat(), true);
  assert.equal(mission.st.habitatPose, null);
  assert.equal(mission.st.s, 5, 'fixture ramp starts 5 m along the route');
  assert.equal(mission.currentPose().kind, 'ramp');
  near(mission.currentPose().x, -5, 'joins ramp position');
  for (const [key, value] of Object.entries(preserved)) assert.equal(mission.st[key], value, key);
  assert.equal(mission.st.wHeld, false);
  assert.equal(mission.st.moving, false);
  assert.equal(mission.departHabitat(), false);
  assert.equal(departureEvents, 1, 'repeated action must not emit another departure');
  assert.equal(mission.st.s, 5);
});

test('habitat position cannot replace an EVA explorer after departure', () => {
  const mission = fixture();
  mission.setHabitatPose({ x: -4.6, y: 0, z: 0, yaw: 0 });
  mission.departHabitat();
  mission.setControl('hud-manual'); mission.setW(true); mission.tick(3); mission.setW(false);
  const s = mission.st.s, pose = mission.currentPose();
  assert.equal(mission.setHabitatPose({ x: 2, y: 0, z: 1, yaw: 0 }), false);
  assert.equal(mission.st.habitatPose, null);
  assert.equal(mission.st.s, s);
  assert.deepEqual(mission.currentPose(), pose);
  assert.equal(mission.setDestination('54_0'), false);
});
