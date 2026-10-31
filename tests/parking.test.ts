/** Zone containment and the parked-vehicle checks. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUCK_SPEC } from '../src/truckSpec';
import { type VehicleState, createVehicle, trailerBox } from '../src/physics/vehicle';
import { checkParking, isStopped } from '../src/sim/parking';
import { missionById } from '../src/sim/missions';
import { parkedCentre, parkZone } from '../src/sim/site';
import { vec2 } from '../src/physics/vec2';
import { degToRad } from '../src/physics/units';

const spec = DEFAULT_TRUCK_SPEC;

/** A vehicle state whose trailer sits exactly at a pose, still. */
function parkedAt(rear: { x: number; z: number }, headingDegrees: number): VehicleState {
  const heading = degToRad(headingDegrees);
  const centre = parkedCentre(vec2(rear.x, rear.z), headingDegrees);
  const base = createVehicle(spec, { position: vec2(centre.x, centre.z), heading });
  return {
    ...base,
    trailer: { ...base.trailer, position: vec2(centre.x, centre.z), heading },
  };
}

describe('parking check', () => {
  const mission = missionById('dock');
  const goal = mission.goal!;

  it('accepts a trailer parked dead centre', () => {
    const parked = parkedAt({ x: 0, z: -1.6 }, 90);
    const check = checkParking(parked, goal, spec);
    expect(check.inside).toBe(true);
    expect(Math.abs(check.headingError)).toBeLessThan(degToRad(0.5));
    expect(Math.abs(check.lateral)).toBeLessThan(0.1);
    expect(check.stopped).toBe(true);
  });

  it('rejects a crooked trailer', () => {
    const crooked = parkedAt({ x: 0, z: -1.6 }, 96);
    expect(checkParking(crooked, goal, spec).inside).toBe(false);
  });

  it('rejects a trailer stopped short', () => {
    const short = parkedAt({ x: 0, z: 1.4 }, 90);
    expect(checkParking(short, goal, spec).inside).toBe(false);
  });

  it('rejects a moving trailer even when centred', () => {
    const parked = parkedAt({ x: 0, z: -1.6 }, 90);
    const moving: VehicleState = {
      ...parked,
      tractor: { ...parked.tractor, forwardSpeed: 0.4 },
      trailer: { ...parked.trailer, forwardSpeed: 0.4 },
    };
    expect(checkParking(moving, goal, spec).stopped).toBe(false);
    expect(isStopped(moving)).toBe(false);
  });
});

describe('zones', () => {
  it('gives every goal mission a zone that fits a parked trailer', () => {
    ['dock', 'alley', 'parallel', 'slalom', 'gate'].forEach((id) => {
      const goal = missionById(id as never).goal!;
      const zone = goal.zone;
      const parked = createVehicle(spec, { position: zone.center, heading: zone.heading });
      const box = trailerBox(parked, spec);
      expect(box.halfLength).toBeLessThanOrEqual(zone.halfLength);
      expect(box.halfWidth).toBeLessThanOrEqual(zone.halfWidth);
    });
  });

  it('matches the dock zone to its parked neighbours', () => {
    const zone = parkZone(vec2(0, -1.6), 90);
    expect(zone.center.z).toBeCloseTo(3.3, 1);
    expect(zone.halfLength).toBeCloseTo(spec.geometry.trailerLength / 2 + 0.35, 6);
  });
});
