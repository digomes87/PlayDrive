/** SAT contacts, impulse response and mission-level collision events. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUCK_SPEC } from '../src/truckSpec';
import { createVehicle, stepVehicle } from '../src/physics/vehicle';
import { INITIAL_DRIVETRAIN } from '../src/physics/engine';
import { contactBetween, cornersOf } from '../src/sim/collisions';
import { createSimulation, stepSimulation } from '../src/sim/simulation';
import { siteById } from '../src/sim/site';
import { missionById } from '../src/sim/missions';
import { FIXED_STEP } from '../src/physics/units';
import { vec2 } from '../src/physics/vec2';

const spec = DEFAULT_TRUCK_SPEC;

const box = (x: number, z: number, heading: number, halfLength: number, halfWidth: number) => ({
  center: vec2(x, z),
  heading,
  halfLength,
  halfWidth,
});

describe('SAT overlap', () => {
  it('finds head-on overlap and the push-out axis', () => {
    const wall = box(0, 5, 0, 4, 0.4);
    const truck = box(0, 2, Math.PI / 2, 3, 1.3);
    const contact = contactBetween(truck, wall);
    expect(contact).not.toBeNull();
    expect(contact!.depth).toBeCloseTo(0.4, 3);
    expect(Math.abs(contact!.normal.z)).toBeCloseTo(1, 3);
    expect(contact!.normal.z).toBeLessThan(0);
  });

  it('separates boxes with a clear gap', () => {
    expect(contactBetween(box(0, 0, 0.3, 3, 1.3), box(0, 0, 0.3, 3, 1.3))).not.toBeNull();
    expect(contactBetween(box(0, 0, 0, 3, 1.3), box(6.1, 0, 0, 3, 1.3))).toBeNull();
  });

  it('handles rotated boxes', () => {
    const diagonal = box(6, 6, Math.PI / 4, 4, 0.4);
    const near = box(6, 4.5, 0, 3, 1.3);
    expect(contactBetween(near, diagonal)).not.toBeNull();
  });
});

describe('collision resolution in the simulation', () => {
  it('stops the truck against the dock wall and counts the impact', () => {
    const mission = missionById('free');
    const config = { spec, site: mission.site };
    let state = createSimulation(config, { position: vec2(0, 6), heading: -Math.PI / 2 });
    let collisions = 0;
    for (let index = 0; index < Math.round(6 / FIXED_STEP); index += 1) {
      const step = stepSimulation(state, { throttle: 0.4, brake: 0, steer: 0, fine: false, handbrake: false, selector: 'D' }, config, FIXED_STEP);
      state = step.state;
      collisions += step.events.impacts.filter((impact) => impact.speed > 0.3).length;
    }
    expect(collisions).toBeGreaterThan(0);
    /** The truck ends standing in front of the wall, not inside it. */
    expect(state.vehicle.tractor.position.z).toBeGreaterThan(-2);
    expect(Math.abs(state.vehicle.tractor.forwardSpeed)).toBeLessThan(0.5);
  });

  it('never tunnels through a parked trailer at walking pace', () => {
    const mission = missionById('dock');
    const config = { spec, site: mission.site };
    let state = createSimulation(config, { position: vec2(-3.1, 30), heading: -Math.PI / 2 });
    for (let index = 0; index < Math.round(10 / FIXED_STEP); index += 1) {
      state = stepSimulation(
        state,
        { throttle: 0.5, brake: 0, steer: 0, fine: false, handbrake: false, selector: 'D' },
        config,
        FIXED_STEP,
      ).state;
    }
    const boxState = state.vehicle;
    const trailerCorners = cornersOf({
      center: vec2(
        boxState.trailer.position.x,
        boxState.trailer.position.z,
      ),
      heading: boxState.trailer.heading,
      halfLength: spec.geometry.trailerLength / 2,
      halfWidth: spec.geometry.trailerWidth / 2,
    });
    const parked = mission.site.obstacles.filter((obstacle) => obstacle.kind === 'trailer');
    trailerCorners.forEach((corner) => {
      parked.forEach((obstacle) => {
        expect(contactBetween({ center: vec2(corner.x, corner.z), heading: 0, halfLength: 0.01, halfWidth: 0.01 }, obstacle.box)).toBeNull();
      });
    });
  });
});

describe('sites', () => {
  it('exposes an obstacle list per site', () => {
    ['yard', 'dock', 'alley', 'street', 'gates', 'slalom'].forEach((id) => {
      expect(siteById(id as never).obstacles.length).toBeGreaterThan(0);
    });
  });

  it('starts every mission clear of obstacles', () => {
    ['free', 'dock', 'alley', 'parallel', 'slalom', 'gate'].forEach((id) => {
      const mission = missionById(id as never);
      const state = createVehicle(spec, mission.start);
      const boxes = [
        { center: state.tractor.position, heading: state.tractor.heading, halfLength: spec.geometry.tractorLength / 2, halfWidth: spec.geometry.tractorWidth / 2 },
        { center: state.trailer.position, heading: state.trailer.heading, halfLength: spec.geometry.trailerLength / 2, halfWidth: spec.geometry.trailerWidth / 2 },
      ];
      mission.site.obstacles.forEach((obstacle) => {
        boxes.forEach((body) => expect(contactBetween(body, obstacle.box)).toBeNull());
      });
    });
  });
});

describe('vehicle step wiring', () => {
  it('exposes telemetry that follows the state', () => {
    const state = createVehicle(spec, { position: vec2(0, 0), heading: 0 });
    const step = stepVehicle(state, { throttle: 1, brake: 0, steer: 0.4, fine: false, handbrake: false, selector: 'D' }, spec, INITIAL_DRIVETRAIN, FIXED_STEP);
    expect(step.telemetry.rpm).toBeGreaterThan(0);
    expect(step.drivetrain.selector).toBe('D');
  });
});
