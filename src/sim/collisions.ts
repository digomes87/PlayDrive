/** Oriented-box collisions: SAT overlap, push-out and impulse response against static obstacles. */
import type { Box } from '../physics/vehicle';
import { type Vec2, add, dot, fromAngle, perp, scale, subtract } from '../physics/vec2';

export type BodyName = 'tractor' | 'trailer';

export interface Impact {
  readonly body: BodyName;
  /** Closing speed against the obstacle at the contact point, m/s. */
  readonly speed: number;
}

export interface Contact {
  readonly normal: Vec2;
  readonly depth: number;
  /** Deepest corner of the moving box inside the obstacle. */
  readonly corner: Vec2;
}

export const cornersOf = (box: Box): readonly Vec2[] => {
  const forward = fromAngle(box.heading);
  const left = perp(forward);
  const centre = box.center;
  return [
    add(centre, add(scale(forward, box.halfLength), scale(left, box.halfWidth))),
    add(centre, add(scale(forward, box.halfLength), scale(left, -box.halfWidth))),
    add(centre, add(scale(forward, -box.halfLength), scale(left, -box.halfWidth))),
    add(centre, add(scale(forward, -box.halfLength), scale(left, box.halfWidth))),
  ];
};

const project = (points: readonly Vec2[], axis: Vec2): { min: number; max: number } => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  points.forEach((point) => {
    const along = dot(point, axis);
    min = Math.min(min, along);
    max = Math.max(max, along);
  });
  return { min, max };
};

/**
 * Smallest translation that separates the two boxes, in the direction that pushes the first
 * box out of the second. Null when they do not overlap.
 */
export function contactBetween(moving: Box, fixed: Box): Contact | null {
  const movingCorners = cornersOf(moving);
  const fixedCorners = cornersOf(fixed);
  const axes = [
    { x: Math.cos(moving.heading), z: Math.sin(moving.heading) },
    perp({ x: Math.cos(moving.heading), z: Math.sin(moving.heading) }),
    { x: Math.cos(fixed.heading), z: Math.sin(fixed.heading) },
    perp({ x: Math.cos(fixed.heading), z: Math.sin(fixed.heading) }),
  ];
  let best: { normal: Vec2; depth: number } | null = null;
  for (const axis of axes) {
    const a = project(movingCorners, axis);
    const b = project(fixedCorners, axis);
    const overlap = Math.min(a.max - b.min, b.max - a.min);
    if (overlap < 0) return null;
    if (best === null || overlap < best.depth) best = { normal: axis, depth: overlap };
  }
  const sign = dot(subtract(moving.center, fixed.center), best!.normal) >= 0 ? 1 : -1;
  const normal = scale(best!.normal, sign);
  const corner = movingCorners.reduce((deepest, point) => {
    const into = (fixed.center.x - point.x) * normal.x + (fixed.center.z - point.z) * normal.z;
    return into > (fixed.center.x - deepest.x) * normal.x + (fixed.center.z - deepest.z) * normal.z ? point : deepest;
  });
  return { normal, depth: best!.depth, corner };
}

/** Nearly inelastic: just enough bounce to avoid a dead stop feeling stiff. */
const RESTITUTION = 0.05;
/** Impacts below this closing speed are scrapes, not counted collisions. */
export const IMPACT_THRESHOLD = 0.3;

export interface BodyMotion {
  readonly centre: Vec2;
  readonly heading: number;
  /** World velocity of the centre. */
  readonly velocity: Vec2;
  readonly yawRate: number;
  readonly mass: number;
  readonly yawInertia: number;
}

/** Resolves one contact against an immovable obstacle: pushes out and kills the closing velocity. */
export function resolveContact(motion: BodyMotion, contact: Contact): { motion: BodyMotion; impact: number } {
  const arm = {
    x: contact.corner.x - motion.centre.x,
    z: contact.corner.z - motion.centre.z,
  };
  const spin = -motion.yawRate * arm.z;
  const spinZ = motion.yawRate * arm.x;
  const closing = (motion.velocity.x + spin) * contact.normal.x + (motion.velocity.z + spinZ) * contact.normal.z;
  const armCrossNormal = arm.x * contact.normal.z - arm.z * contact.normal.x;
  let velocity = { x: motion.velocity.x, z: motion.velocity.z };
  let yawRate = motion.yawRate;
  if (closing < 0) {
    const impulse = (-(1 + RESTITUTION) * closing) / (1 / motion.mass + (armCrossNormal * armCrossNormal) / motion.yawInertia);
    velocity = {
      x: velocity.x + (impulse * contact.normal.x) / motion.mass,
      z: velocity.z + (impulse * contact.normal.z) / motion.mass,
    };
    yawRate = yawRate + (impulse * armCrossNormal) / motion.yawInertia;
  }
  return {
    motion: {
      ...motion,
      centre: { x: motion.centre.x + contact.normal.x * contact.depth, z: motion.centre.z + contact.normal.z * contact.depth },
      velocity,
      yawRate,
    },
    impact: Math.max(0, -closing),
  };
}
