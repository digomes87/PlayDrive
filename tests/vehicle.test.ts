/** The combination as a dynamical system: traction, tracking, braking, jackknife, determinism. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUCK_SPEC } from '../src/truckSpec';
import { INITIAL_DRIVETRAIN, type DrivetrainState } from '../src/physics/engine';
import {
  type VehicleCommand,
  type VehicleState,
  articulationOf,
  createVehicle,
  stepVehicle,
  tractorBox,
  trailerBox,
} from '../src/physics/vehicle';
import { FIXED_STEP, degToRad } from '../src/physics/units';
import { vec2 } from '../src/physics/vec2';

const spec = DEFAULT_TRUCK_SPEC;

const idle: VehicleCommand = { throttle: 0, brake: 0, steer: 0, fine: false, handbrake: true, selector: 'N' };
const drive: VehicleCommand = { ...idle, selector: 'D', handbrake: false, throttle: 1 };
const reverse: VehicleCommand = { ...idle, selector: 'R', handbrake: false, throttle: 0.4 };

interface Run {
  readonly state: VehicleState;
  readonly drivetrain: DrivetrainState;
}

const start = (x = 0, z = 0, heading = 0): VehicleState => createVehicle(spec, { position: vec2(x, z), heading });

function run(command: VehicleCommand, seconds: number, from: VehicleState = start()): Run {
  let state = from;
  let drivetrain = INITIAL_DRIVETRAIN;
  for (let index = 0; index < Math.round(seconds / FIXED_STEP); index += 1) {
    const step = stepVehicle(state, command, spec, drivetrain, FIXED_STEP);
    state = step.state;
    drivetrain = step.drivetrain;
  }
  return { state, drivetrain };
}

describe('traction', () => {
  it('moves off in first gear', () => {
    const { state } = run(drive, 5);
    expect(state.tractor.forwardSpeed).toBeGreaterThan(1);
  });

  it('keeps the acceleration within the friction budget', () => {
    let previous = start();
    let drivetrain = INITIAL_DRIVETRAIN;
    let worst = 0;
    for (let index = 0; index < Math.round(4 / FIXED_STEP); index += 1) {
      const step = stepVehicle(previous, drive, spec, drivetrain, FIXED_STEP);
      const acceleration = (step.state.tractor.forwardSpeed - previous.tractor.forwardSpeed) / FIXED_STEP;
      worst = Math.max(worst, acceleration);
      previous = step.state;
      drivetrain = step.drivetrain;
    }
    expect(worst).toBeLessThan(spec.tyres.mu * 9.81 + 0.5);
  });

  it('creeps forward in gear with the brakes off', () => {
    const { state } = run({ ...idle, selector: 'D', handbrake: false }, 3);
    expect(state.tractor.forwardSpeed).toBeGreaterThan(0.02);
  });

  it('holds still with the parking brake on', () => {
    const { state } = run({ ...idle, selector: 'D', handbrake: true }, 3);
    expect(Math.abs(state.tractor.forwardSpeed)).toBeLessThan(0.02);
  });
});

describe('tracking', () => {
  it('reverses straight when the wheels are straight', () => {
    let state = start(0, 0, Math.PI / 2);
    let drivetrain = INITIAL_DRIVETRAIN;
    for (let index = 0; index < Math.round(14 / FIXED_STEP); index += 1) {
      const step = stepVehicle(state, reverse, spec, drivetrain, FIXED_STEP);
      state = step.state;
      drivetrain = step.drivetrain;
    }
    expect(state.tractor.forwardSpeed).toBeLessThan(-0.5);
    expect(Math.abs(state.tractor.position.x)).toBeLessThan(0.25);
    expect(Math.abs(articulationOf(state))).toBeLessThan(degToRad(1.5));
  });

  it('follows the tractor around a constant turn', () => {
    const { state } = run({ ...drive, steer: 0.5 }, 12);
    const articulation = articulationOf(state);
    expect(Math.abs(articulation)).toBeGreaterThan(degToRad(2));
    expect(Math.abs(articulation)).toBeLessThan(degToRad(35));
    expect(Math.abs(state.tractor.yawRate)).toBeGreaterThan(0.2);
  });

  it('keeps the fifth wheel joint tight', () => {
    const { state } = run({ ...drive, steer: 0.7 }, 10);
    const step = stepVehicle(state, { ...drive, steer: 0.7 }, spec, INITIAL_DRIVETRAIN, FIXED_STEP);
    expect(step.telemetry.hitchStretch).toBeLessThan(0.01);
  });

  it('steering left forward turns the tractor left', () => {
    const left = run({ ...drive, steer: 1 }, 6);
    const right = run({ ...drive, steer: -1 }, 6);
    expect(left.state.tractor.heading).toBeGreaterThan(right.state.tractor.heading);
  });
});

describe('braking', () => {
  it('stops from walking pace inside a few metres and stays stopped', () => {
    const moving = run(drive, 4);
    const stopped = run({ ...idle, selector: 'D', brake: 1 }, 6, moving.state);
    expect(Math.abs(stopped.state.tractor.forwardSpeed)).toBeLessThan(0.01);
    expect(stopped.state.tractor.position.x).toBeLessThan(moving.state.tractor.position.x + 6);
    const held = run({ ...idle, selector: 'D', brake: 1, handbrake: true }, 3, stopped.state);
    expect(Math.abs(held.state.tractor.forwardSpeed)).toBeLessThan(0.01);
  });
});

describe('jackknife', () => {
  it('folds when reversing with the wheel hard over', () => {
    const { state } = run({ ...reverse, steer: 1 }, 8);
    expect(Math.abs(articulationOf(state))).toBeGreaterThan(degToRad(40));
  });

  it('stays manageable when the driver corrects', () => {
    let state = start();
    let drivetrain = INITIAL_DRIVETRAIN;
    for (let index = 0; index < Math.round(16 / FIXED_STEP); index += 1) {
      const correction = -Math.sign(articulationOf(state)) * Math.min(Math.abs(articulationOf(state)) * 3, 1);
      const command: VehicleCommand = { ...reverse, steer: correction };
      const step = stepVehicle(state, command, spec, drivetrain, FIXED_STEP);
      state = step.state;
      drivetrain = step.drivetrain;
    }
    expect(Math.abs(articulationOf(state))).toBeLessThan(degToRad(25));
  });
});

describe('determinism', () => {
  it('reaches the identical state twice from the same start', () => {
    const first = run({ ...drive, steer: 0.3 }, 10);
    const second = run({ ...drive, steer: 0.3 }, 10);
    expect(second.state.tractor.position).toEqual(first.state.tractor.position);
    expect(second.state.trailer.heading).toEqual(first.state.trailer.heading);
  });
});

describe('collision boxes', () => {
  it('places the trailer box behind the tractor box', () => {
    const state = start(0, 0, Math.PI / 2);
    const tractor = tractorBox(state, spec);
    const trailer = trailerBox(state, spec);
    expect(tractor.center.z).toBeGreaterThan(trailer.center.z);
    expect(trailer.halfLength).toBeCloseTo(spec.geometry.trailerLength / 2, 6);
  });
});
