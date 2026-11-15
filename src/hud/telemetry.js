const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export const headingDegrees = (yaw) => ((-finite(yaw) * 180 / Math.PI) % 360 + 360) % 360;
export const formatClock = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const whole = Math.floor(seconds), minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

/** Presentation only: never changes the shared mission or claims sensor data. */
export function deriveHudTelemetry({ st, next, lookYaw, routeYaw, speed }) {
  const length = Math.max(0, finite(st.route?.length)), s = clamp(finite(st.s), 0, length);
  const remaining = Math.max(0, length - s), nominalSpeed = Math.max(0, finite(speed));
  const heading = headingDegrees(lookYaw), routeHeading = headingDegrees(routeYaw);
  return {
    heading, routeHeading, relativeBearing: ((routeHeading - heading + 540) % 360) - 180,
    oxygen: clamp(finite(st.o2), 0, 100), elapsed: Math.max(0, finite(st.simSeconds)),
    remaining, progress: length > 0 ? s / length * 100 : 0,
    nextDistance: st.arrived ? 0 : Math.max(0, finite(next?.s, s) - s),
    actualSpeed: st.moving && !st.arrived ? nominalSpeed : 0,
    // A route-length / configured-speed calculation. Stops, tasks, slope and
    // return travel are excluded; a stopped explorer can still see this estimate.
    routeEta: remaining === 0 ? 0 : nominalSpeed > 0 ? remaining / nominalSpeed : null,
  };
}
