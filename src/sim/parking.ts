/** Is the trailer parked: inside the target rectangle, aligned, stopped, brake applied. */
import type { TruckSpec } from '../truckSpec';
import type { Box, VehicleState } from '../physics/vehicle';
import { trailerBox } from '../physics/vehicle';
import { wrapAngle } from '../physics/units';
import { type Vec2, dot, fromAngle, perp, subtract } from '../physics/vec2';
import { cornersOf } from './collisions';

export interface ParkGoal {
  readonly zone: Box;
  /** How long the truck must stand parked before the mission counts as done, s. */
  readonly holdSeconds: number;
}

export interface ParkingCheck {
  /** Every corner of the trailer inside the zone. */
  readonly inside: boolean;
  /** Trailer heading minus zone heading, rad. */
  readonly headingError: number;
  /** Trailer box centre along the zone axis, + past the centre, m. */
  readonly longitudinal: number;
  /** Trailer box centre to the left of the zone axis, m. */
  readonly lateral: number;
  readonly stopped: boolean;
}

/** Point coordinates in the zone's own frame: x along the zone, z to its left. */
const inZoneFrame = (point: Vec2, zone: Box): Vec2 => {
  const offset = subtract(point, zone.center);
  return { x: dot(offset, fromAngle(zone.heading)), z: dot(offset, perp(fromAngle(zone.heading))) };
};

export const boxInside = (zone: Box, box: Box): boolean =>
  cornersOf(box).every((corner) => {
    const local = inZoneFrame(corner, zone);
    return Math.abs(local.x) <= zone.halfLength && Math.abs(local.z) <= zone.halfWidth;
  });

/** Wheels chocked: no translation on either body and no tractor rotation. */
export const isStopped = (state: VehicleState): boolean =>
  Math.abs(state.tractor.forwardSpeed) < 0.05 &&
  Math.abs(state.tractor.leftSpeed) < 0.05 &&
  Math.abs(state.tractor.yawRate) < 0.02 &&
  Math.abs(state.trailer.forwardSpeed) < 0.05 &&
  Math.abs(state.trailer.leftSpeed) < 0.05;

export function checkParking(state: VehicleState, goal: ParkGoal, spec: TruckSpec): ParkingCheck {
  const box = trailerBox(state, spec);
  const centre = inZoneFrame(box.center, goal.zone);
  return {
    inside: boxInside(goal.zone, box),
    headingError: wrapAngle(box.heading - goal.zone.heading),
    longitudinal: centre.x,
    lateral: centre.z,
    stopped: isStopped(state),
  };
}
