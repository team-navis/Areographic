import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHudTelemetry, formatClock } from '../src/hud/telemetry.js';

const fixture = (changes = {}) => ({ st: { route: { length: 350 }, s: 70, o2: 99, simSeconds: 61, moving: false, arrived: false, ...changes }, next: { s: 100 }, lookYaw: 0, routeYaw: 0, speed: 3.5 });
test('HUD reports zero speed at rest while retaining a labeled continuous-route estimate', () => {
  const input = fixture(), before = structuredClone(input);
  const stopped = deriveHudTelemetry(input);
  assert.equal(stopped.actualSpeed, 0); assert.equal(stopped.routeEta, 80); assert.equal(stopped.progress, 20); assert.equal(stopped.nextDistance, 30);
  assert.deepEqual(input, before, 'presentation must not mutate mission state');
  assert.equal(deriveHudTelemetry(fixture({ moving: true })).actualSpeed, 3.5);
});
test('arrival stops speed and route estimates do not divide by zero', () => {
  const arrived = deriveHudTelemetry(fixture({ s: 350, moving: true, arrived: true }));
  assert.equal(arrived.actualSpeed, 0); assert.equal(arrived.routeEta, 0); assert.equal(arrived.nextDistance, 0); assert.equal(arrived.progress, 100);
  const input = fixture(); input.speed = 0;
  assert.equal(deriveHudTelemetry(input).routeEta, null);
});
test('compass bearing follows the camera yaw convention and wraps across north', () => {
  const input = fixture(); input.lookYaw = 10 * Math.PI / 180; input.routeYaw = -10 * Math.PI / 180;
  const result = deriveHudTelemetry(input);
  assert.ok(Math.abs(result.heading - 350) < 1e-8); assert.ok(Math.abs(result.routeHeading - 10) < 1e-8); assert.ok(Math.abs(result.relativeBearing - 20) < 1e-8);
});
test('elapsed display preserves minutes over one hour and rejects unavailable time', () => {
  assert.equal(formatClock(61.9), '01:01'); assert.equal(formatClock(3661), '61:01'); assert.equal(formatClock(null), '—');
});
