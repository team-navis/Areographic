/**
 * Horizontal capsule movement for the fictional habitat. No renderer, DOM or
 * mission state is involved: the existing outdoor route controller stays separate.
 * Coordinates match base.js: x east, z south, y at the habitat floor.
 */
export const HABITAT_WALK_DEFAULTS = Object.freeze({ speed: 1.4, radius: 0.22, maxDt: 0.05 });

const DEFAULT_ROOM = Object.freeze({ x0: -4.5, x1: 4.5, z0: -3, z1: 3 });
const DEFAULT_AIRLOCK = Object.freeze({ x0: -7.1, x1: -4.62, z0: -0.25, z1: 2.25, doorZ: 1, doorW: 1.15 });
// Standalone defaults; the renderer should pass base.obstacles so changes to the
// furnished room and its collision footprints remain in one place.
const DEFAULT_OBSTACLES = [
  { id: 'main-bench', x0: -3.55, x1: 3.55, z0: -2.97, z1: -2.02 },
  { id: 'operator-chair', x0: -0.35, x1: 0.35, z0: -1.97, z1: -1.27 },
  { id: 'west-storage', x0: -4.45, x1: -3.88, z0: -2.4, z1: -0.7 },
  { id: 'southeast-bench', x0: 1.9, x1: 3.9, z0: 2.43, z1: 2.97 },
  { id: 'airlock-bench', x0: -6.68, x1: -5.08, z0: -0.19, z1: 0.17 },
  { id: 'rear-worktop', x0: -1.6, x1: 1.3, z0: 2.43, z1: 2.97 },
];
const EPS = 1e-9;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const inRect = (x, z, r) => x >= r.x0 - EPS && x <= r.x1 + EPS && z >= r.z0 - EPS && z <= r.z1 + EPS;
const boxDistanceSq = (x, z, r) => (x - clamp(x, r.x0, r.x1)) ** 2 + (z - clamp(z, r.z0, r.z1)) ** 2;
function segmentDistanceSq(x, z, [ax, az, bx, bz]) {
  const dx = bx - ax, dz = bz - az, lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / lengthSq, 0, 1) : 0;
  return (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
}
function validRect(r) {
  return ['x0', 'x1', 'z0', 'z1'].every((key) => Number.isFinite(r[key])) && r.x0 < r.x1 && r.z0 < r.z1;
}

/**
 * createHabitatWalk({floorY, spawn, room, airlock, obstacles, speed, radius})
 *
 * - state is a stable mutable object: {x,y,z,yaw,moving,exited,exit}.
 * - step(dt, {forward,strafe}, yaw) returns that same state. Positive forward is
 *   (-sin(yaw), -cos(yaw)); positive strafe is (cos(yaw), -sin(yaw)).
 * - diagonal input is normalized; dt is capped at 50 ms. Walls/furniture slide.
 * - exited/exit:'airlock' latch once the capsule clears the west opening. The
 *   caller hands control to the outdoor route; subsequent steps do not move it.
 * - setPose({x,z,yaw?}) returns false for invalid/occupied coordinates; success
 *   clears the exit latch. reset() restores the initial spawn.
 *
 * Collision is horizontal only. Sliding doors are visual and opened by the
 * caller; no pressure/safety procedure is implied by crossing this opening.
 */
export function createHabitatWalk({
  floorY = 0, spawn = { x: 0, z: 0.6, yaw: 0 }, room = DEFAULT_ROOM,
  airlock = DEFAULT_AIRLOCK, obstacles = DEFAULT_OBSTACLES,
  speed = HABITAT_WALK_DEFAULTS.speed, radius = HABITAT_WALK_DEFAULTS.radius,
} = {}) {
  const R = { ...DEFAULT_ROOM, ...room }, A = { ...DEFAULT_AIRLOCK, ...airlock };
  const blocks = obstacles.map((obstacle) => ({ ...obstacle }));
  if (!validRect(R) || !validRect(A) || blocks.some((r) => !validRect(r))) throw new RangeError('Habitat collision bounds must be finite, ordered rectangles.');
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(floorY)) throw new RangeError('Habitat radius/speed must be positive and floorY must be finite.');
  if (!Number.isFinite(A.doorZ) || !Number.isFinite(A.doorW) || A.doorW <= radius * 2) throw new RangeError('The airlock opening must be wider than the walking capsule.');
  const door0 = A.doorZ - A.doorW / 2, door1 = A.doorZ + A.doorW / 2;
  if (door0 < Math.max(R.z0, A.z0) || door1 > Math.min(R.z1, A.z1) || A.x0 >= R.x0 || A.x1 > R.x0) throw new RangeError('The airlock must connect to the room west wall at its doorway.');

  // The rendered 12 cm gap between A.x1 and R.x0 belongs to the doorway throat.
  const lockVolume = { ...A, x1: R.x0 };
  const exitX = A.x0 - radius;
  // Leave at least one collision substep past the threshold; otherwise a frame
  // landing just short of exitX could reject its next step and never hand off.
  const exitVolume = { x0: exitX - radius, x1: A.x0, z0: door0, z1: door1 };
  const walls = [
    [R.x0, R.z0, R.x1, R.z0], [R.x0, R.z1, R.x1, R.z1], [R.x1, R.z0, R.x1, R.z1],
    [R.x0, R.z0, R.x0, door0], [R.x0, door1, R.x0, R.z1],
    [A.x0, A.z0, R.x0, A.z0], [A.x0, A.z1, R.x0, A.z1],
    [A.x0, A.z0, A.x0, door0], [A.x0, door1, A.x0, A.z1],
    // Keep the tiny handoff corridor inside the actual outer doorway width.
    [exitVolume.x0, door0, A.x0, door0], [exitVolume.x0, door1, A.x0, door1],
  ];
  const radiusSq = radius * radius;
  const canOccupy = (x, z) => Number.isFinite(x) && Number.isFinite(z)
    && (inRect(x, z, R) || inRect(x, z, lockVolume) || inRect(x, z, exitVolume))
    && walls.every((wall) => segmentDistanceSq(x, z, wall) >= radiusSq - EPS)
    && blocks.every((box) => boxDistanceSq(x, z, box) >= radiusSq - EPS);

  const initial = { x: spawn.x, z: spawn.z, yaw: finite(spawn.yaw) };
  if (!canOccupy(initial.x, initial.z)) throw new RangeError('Habitat spawn is outside the walkable floor or inside an obstacle.');
  const state = { x: initial.x, y: floorY, z: initial.z, yaw: initial.yaw, moving: false, exited: false, exit: null };

  function setPose({ x, z, yaw = state.yaw } = {}) {
    if (!canOccupy(x, z) || !Number.isFinite(yaw)) return false;
    Object.assign(state, { x, y: floorY, z, yaw, moving: false, exited: false, exit: null });
    return true;
  }
  function step(dt, input = {}, yaw = state.yaw) {
    state.moving = false; state.yaw = finite(yaw, state.yaw);
    if (state.exited) return state;
    const elapsed = clamp(finite(dt), 0, HABITAT_WALK_DEFAULTS.maxDt);
    let f = clamp(finite(input.forward), -1, 1), s = clamp(finite(input.strafe), -1, 1);
    const magnitude = Math.hypot(f, s);
    if (magnitude > 1) { f /= magnitude; s /= magnitude; }
    const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
    const dx = (-sin * f + cos * s) * speed * elapsed;
    const dz = (-cos * f - sin * s) * speed * elapsed;
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.5)));
    const sx = dx / count, sz = dz / count, beforeX = state.x, beforeZ = state.z;
    for (let i = 0; i < count; i++) {
      if (canOccupy(state.x + sx, state.z + sz)) { state.x += sx; state.z += sz; }
      else {
        // Resolve each axis independently so held input slides along a wall.
        // Larger displacement first avoids a fixed diagonal bias around boxes.
        const slideX = () => { if (canOccupy(state.x + sx, state.z)) state.x += sx; };
        const slideZ = () => { if (canOccupy(state.x, state.z + sz)) state.z += sz; };
        if (Math.abs(sx) >= Math.abs(sz)) { slideX(); slideZ(); } else { slideZ(); slideX(); }
      }
      if (state.x <= exitX + EPS) { state.exited = true; state.exit = 'airlock'; break; }
    }
    state.moving = Math.hypot(state.x - beforeX, state.z - beforeZ) > EPS;
    return state;
  }
  return { state, step, setPose, reset: () => setPose(initial) };
}
