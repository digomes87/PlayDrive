/** Planar vector algebra on the yard (x east, z north). The physics world is flat; height is rendering only. */

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export const ZERO: Vec2 = { x: 0, z: 0 };

export const vec2 = (x: number, z: number): Vec2 => ({ x, z });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });

export const subtract = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });

export const scale = (a: Vec2, factor: number): Vec2 => ({ x: a.x * factor, z: a.z * factor });

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;

/** Quarter turn counter-clockwise: the left direction of a heading given as a forward vector. */
export const perp = (a: Vec2): Vec2 => ({ x: -a.z, z: a.x });

export const length = (a: Vec2): number => Math.hypot(a.x, a.z);

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

export const normalize = (a: Vec2): Vec2 => {
  const size = length(a);
  return size < 1e-9 ? ZERO : scale(a, 1 / size);
};

export const fromAngle = (heading: number): Vec2 => ({ x: Math.cos(heading), z: Math.sin(heading) });

/** Unit vector rotated by the angle: positive turns counter-clockwise (to the left). */
export const rotate = (a: Vec2, angle: number): Vec2 => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: a.x * cosine - a.z * sine, z: a.x * sine + a.z * cosine };
};

export const lerp = (from: Vec2, to: Vec2, alpha: number): Vec2 => ({
  x: from.x + (to.x - from.x) * alpha,
  z: from.z + (to.z - from.z) * alpha,
});
