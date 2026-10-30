/** SI constants and unit conversions. Everything inside the physics core is SI. */

export const GRAVITY = 9.80665;
export const AIR_DENSITY = 1.225;

export const PHYSICS_RATE_HZ = 120;
export const FIXED_STEP = 1 / PHYSICS_RATE_HZ;

const SECONDS_PER_MINUTE = 60;
const KMH_PER_MS = 3.6;
const DEGREES_PER_HALF_TURN = 180;

export const rpmToRadPerSecond = (rpm: number): number => (rpm * 2 * Math.PI) / SECONDS_PER_MINUTE;
export const radPerSecondToRpm = (rate: number): number => (rate * SECONDS_PER_MINUTE) / (2 * Math.PI);
export const kmhToMs = (kmh: number): number => kmh / KMH_PER_MS;
export const msToKmh = (ms: number): number => ms * KMH_PER_MS;
export const degToRad = (degrees: number): number => (degrees * Math.PI) / DEGREES_PER_HALF_TURN;
export const radToDeg = (radians: number): number => (radians * DEGREES_PER_HALF_TURN) / Math.PI;

/** Wraps an angle into (-π, π]. */
export const wrapAngle = (angle: number): number => {
  const wrapped = (angle + Math.PI) % (2 * Math.PI);
  return (wrapped <= 0 ? wrapped + 2 * Math.PI : wrapped) - Math.PI;
};
