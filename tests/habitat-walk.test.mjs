import test from 'node:test';
import assert from 'node:assert/strict';
import { createHabitatWalk, HABITAT_WALK_DEFAULTS } from '../src/state/habitat-walk.js';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const advance = (walk, frames, input, yaw = walk.state.yaw) => { for (let i = 0; i < frames; i++) walk.step(0.05, input, yaw); return walk.state; };
const empty = (options = {}) => createHabitatWalk({ obstacles: [], ...options });

test('forward and strafe use the shared camera yaw convention', () => {
  const walk = empty({ floorY: 4, spawn: { x: 0, z: 0, yaw: 0 } });
  const ref = walk.state;
  assert.equal(walk.step(0.05, { forward: 1 }, 0), ref);
  close(walk.state.x, 0); close(walk.state.z, -0.07); close(walk.state.y, 4);
  walk.reset(); walk.step(0.05, { forward: 1 }, Math.PI / 2);
  close(walk.state.x, -0.07); close(walk.state.z, 0);
  walk.reset(); walk.step(0.05, { strafe: 1 }, Math.PI / 2);
  close(walk.state.x, 0); close(walk.state.z, -0.07);
});

test('diagonal input has the same speed as forward and frame stalls are capped', () => {
  const walk = empty({ spawn: { x: 0, z: 0 } });
  walk.step(100, { forward: 1, strafe: 1 });
  close(Math.hypot(walk.state.x, walk.state.z), HABITAT_WALK_DEFAULTS.speed * HABITAT_WALK_DEFAULTS.maxDt);
  const before = { ...walk.state };
  walk.step(-1, { forward: 1 });
  close(walk.state.x, before.x); close(walk.state.z, before.z); assert.equal(walk.state.moving, false);
  walk.step(NaN, { forward: Infinity, strafe: NaN }, NaN);
  assert.ok(Number.isFinite(walk.state.x + walk.state.z + walk.state.yaw));
});

test('room walls keep the whole capsule inside and movement stops at a wall', () => {
  const walk = empty({ spawn: { x: 0, z: 0 } });
  advance(walk, 150, { strafe: 1 });
  assert.ok(walk.state.x <= 4.5 - 0.22 + 1e-8); assert.ok(walk.state.x > 4.15);
  assert.equal(walk.state.moving, false);
  walk.reset(); advance(walk, 150, { forward: -1 });
  assert.ok(walk.state.z <= 3 - 0.22 + 1e-8); assert.ok(walk.state.z > 2.65);
  walk.reset(); advance(walk, 150, { forward: 1 });
  assert.ok(walk.state.z >= -3 + 0.22 - 1e-8); assert.ok(walk.state.z < -2.65);
});

test('main desk and chair block walking while the capsule can slide along the desk', () => {
  const walk = createHabitatWalk({ spawn: { x: 1, z: 0 } });
  advance(walk, 80, { forward: 1 });
  assert.ok(walk.state.z >= -2.02 + 0.22 - 1e-8); assert.ok(walk.state.z < -1.7);
  const stoppedZ = walk.state.z, beforeX = walk.state.x;
  advance(walk, 12, { forward: 1, strafe: 1 });
  assert.ok(walk.state.x > beforeX + 0.4); assert.ok(walk.state.z >= -1.8 - 1e-8);
  assert.ok(Math.abs(walk.state.z - stoppedZ) < 0.08);
  assert.equal(walk.setPose({ x: 0, z: -1.6 }), false, 'chair footprint is blocked');
  assert.equal(walk.setPose({ x: 1, z: -2.5 }), false, 'desk footprint is blocked');
});

test('west wall permits only the doorway, including capsule clearance at jambs', () => {
  const walk = empty({ spawn: { x: -3, z: -0.5 } });
  advance(walk, 100, { strafe: -1 });
  assert.ok(walk.state.x >= -4.5 + 0.22 - 1e-8); assert.equal(walk.state.exited, false);
  assert.equal(walk.setPose({ x: -4.5, z: 0.5 }), false, 'center in opening still collides if body overlaps a jamb');
  assert.equal(walk.setPose({ x: -4.5, z: 1 }), true, 'centered capsule can pass the opening');
  advance(walk, 10, { strafe: -1 });
  assert.ok(walk.state.x < -4.9); assert.equal(walk.state.exited, false);
});

test('a centered walk crosses both doors and hands off only outside the airlock', () => {
  const walk = createHabitatWalk({ spawn: { x: -3, z: 1 } });
  let trigger;
  for (let frame = 0; frame < 100; frame++) {
    const beforeX = walk.state.x;
    walk.step(0.05, { strafe: -1 });
    if (walk.state.exited) { trigger = { beforeX, x: walk.state.x }; break; }
  }
  assert.ok(trigger, 'walking must reach the handoff');
  assert.ok(trigger.beforeX > -7.1 - 0.22);
  assert.ok(trigger.x <= -7.1 - 0.22 + 1e-8);
  assert.equal(walk.state.exit, 'airlock');
  const exitedX = walk.state.x;
  advance(walk, 5, { strafe: 1 });
  close(walk.state.x, exitedX); assert.equal(walk.state.moving, false);
  assert.equal(walk.reset(), true); close(walk.state.x, -3); close(walk.state.z, 1);
  assert.equal(walk.state.exited, false); assert.equal(walk.state.exit, null);
});

test('airlock side walls and outer wall cannot be used as another exit', () => {
  const walk = empty({ spawn: { x: -5.8, z: 1.8 } });
  advance(walk, 100, { strafe: -1 });
  assert.ok(walk.state.x >= -7.1 + 0.22 - 1e-8); assert.equal(walk.state.exited, false);
  walk.reset(); advance(walk, 100, { forward: -1 });
  assert.ok(walk.state.z <= 2.25 - 0.22 + 1e-8); assert.equal(walk.state.exited, false);
});

test('the exit threshold cannot strand a capsule between different frame steps', () => {
  for (const offset of [0, .005, .013, .025, .047, .065]) {
    const walk = empty({ spawn: { x: -7.2 + offset, z: 1 } });
    advance(walk, 10, { strafe: -1 });
    assert.equal(walk.state.exited, true, `exit with ${offset} m frame offset`);
  }
});

test('substeps stop a fast capsule tunneling through a thin obstacle', () => {
  const walk = createHabitatWalk({ speed: 100, spawn: { x: -2, z: 0 }, obstacles: [{ x0: 0, x1: 0.01, z0: -2, z1: 2 }] });
  walk.step(0.05, { strafe: 1 });
  assert.ok(walk.state.x <= -0.22 + 1e-8); assert.ok(walk.state.x > -0.34);
});

test('setPose validates occupancy and clears motion without changing the floor', () => {
  const walk = empty({ floorY: 8 });
  walk.step(0.05, { forward: 1 }); const before = { ...walk.state };
  for (const pose of [{ x: 20, z: 0 }, { x: NaN, z: 0 }, { x: 0, z: 0, yaw: Infinity }]) assert.equal(walk.setPose(pose), false);
  assert.deepEqual(walk.state, before);
  assert.equal(walk.setPose({ x: 2, z: 2, yaw: 1 }), true);
  assert.deepEqual(walk.state, { x: 2, y: 8, z: 2, yaw: 1, moving: false, exited: false, exit: null });
});
