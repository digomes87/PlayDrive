/** Steering actuator: rate-limited towards the commanded angle, with the faster return to centre. */
import type { TruckSpec } from '../truckSpec';

/**
 * One fixed step of the steering column. The command is unitless, positive to the left;
 * the returned angle follows the same convention.
 */
export function stepSteering(
  angle: number,
  command: number,
  isFine: boolean,
  spec: TruckSpec,
  step: number,
): number {
  const clamp = (value: number): number => Math.min(Math.max(value, -1), 1);
  const target = clamp(command) * spec.steering.maxAngle;
  const rate = (Math.abs(target) > Math.abs(angle) ? spec.steering.lockRate : spec.steering.lockRate * spec.steering.returnFactor) *
    (isFine ? spec.fineControlFactor : 1);
  if (rate === 0) return angle;
  const stepChange = rate * step;
  const gap = target - angle;
  const change = Math.min(Math.abs(gap), stepChange) * Math.sign(gap);
  return Math.min(Math.max(angle + change, -spec.steering.maxAngle), spec.steering.maxAngle);
}

/** Wheel angles of the Ackermann geometry; left turn (positive angle) puts the left wheel inside. */
export function ackermann(
  angle: number,
  wheelbase: number,
  trackWidth: number,
): { readonly left: number; readonly right: number } {
  const size = Math.abs(angle);
  if (size < 1e-4) return { left: angle, right: angle };
  const radius = wheelbase / Math.tan(size);
  const inner = Math.atan(wheelbase / Math.max(radius - trackWidth / 2, 0.1));
  const outer = Math.atan(wheelbase / (radius + trackWidth / 2));
  return angle > 0 ? { left: inner, right: outer } : { left: -outer, right: -inner };
}
