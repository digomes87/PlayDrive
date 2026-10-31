/** One deterministic world step: drivetrain, chassis and trailer dynamics, then collisions. */
import type { TruckSpec } from '../truckSpec';
import {
  type BodyState,
  type StartPose,
  type VehicleCommand,
  type VehicleState,
  type VehicleTelemetry,
  createVehicle,
  stepVehicle,
  tractorBox,
  trailerBox,
} from '../physics/vehicle';
import { INITIAL_DRIVETRAIN, type DrivetrainState } from '../physics/engine';
import { type Vec2, add, fromAngle, perp, scale } from '../physics/vec2';
import { type Impact, type BodyMotion, contactBetween, resolveContact } from './collisions';
import type { Site } from './site';

export interface SimulationConfig {
  readonly spec: TruckSpec;
  readonly site: Site;
}

export interface SimulationState {
  readonly time: number;
  readonly vehicle: VehicleState;
  readonly drivetrain: DrivetrainState;
}

export interface SimulationStep {
  readonly state: SimulationState;
  readonly events: { readonly impacts: readonly Impact[] };
  readonly telemetry: VehicleTelemetry;
}

export function createSimulation(config: SimulationConfig, start: StartPose): SimulationState {
  return {
    time: 0,
    vehicle: createVehicle(config.spec, start),
    drivetrain: INITIAL_DRIVETRAIN,
  };
}

/** World velocity of a body's centre. */
const velocityOf = (body: BodyState): Vec2 =>
  add(scale(fromAngle(body.heading), body.forwardSpeed), scale(perp(fromAngle(body.heading)), body.leftSpeed));

/** Body velocity expressed in world components back into the body frame. */
const bodySpeeds = (world: Vec2, heading: number): { forward: number; left: number } => {
  const forward = fromAngle(heading);
  const left = perp(forward);
  return { forward: world.x * forward.x + world.z * forward.z, left: world.x * left.x + world.z * left.z };
};

const motionOf = (state: VehicleState, body: 'tractor' | 'trailer', spec: TruckSpec): BodyMotion =>
  body === 'tractor'
    ? {
        centre: state.tractor.position,
        heading: state.tractor.heading,
        velocity: velocityOf(state.tractor),
        yawRate: state.tractor.yawRate,
        mass: spec.masses.tractor,
        yawInertia: spec.masses.tractorYawInertia,
      }
    : {
        centre: state.trailer.position,
        heading: state.trailer.heading,
        velocity: velocityOf(state.trailer),
        yawRate: state.trailer.yawRate,
        mass: spec.masses.trailer,
        yawInertia: spec.masses.trailerYawInertia,
      };

const withMotion = (state: VehicleState, body: 'tractor' | 'trailer', motion: BodyMotion): VehicleState => {
  const speeds = bodySpeeds(motion.velocity, motion.heading);
  const updated: BodyState = {
    position: motion.centre,
    heading: motion.heading,
    forwardSpeed: speeds.forward,
    leftSpeed: speeds.left,
    yawRate: motion.yawRate,
  };
  return body === 'tractor' ? { ...state, tractor: updated } : { ...state, trailer: updated };
};

/** Pushes both bodies out of every obstacle they overlap and kills the closing speeds. */
function resolveCollisions(vehicle: VehicleState, config: SimulationConfig): { vehicle: VehicleState; impacts: readonly Impact[] } {
  const impacts: Impact[] = [];
  let state = vehicle;
  (['tractor', 'trailer'] as const).forEach((body) => {
    for (let pass = 0; pass < 3; pass += 1) {
      const box = body === 'tractor' ? tractorBox(state, config.spec) : trailerBox(state, config.spec);
      const contact = config.site.obstacles
        .map((obstacle) => ({ obstacle, contact: contactBetween(box, obstacle.box) }))
        .find((entry) => entry.contact !== null);
      if (contact === undefined || contact.contact === null) break;
      const resolved = resolveContact(motionOf(state, body, config.spec), contact.contact);
      state = withMotion(state, body, resolved.motion);
      impacts.push({ body, speed: resolved.impact });
    }
  });
  return { vehicle: state, impacts };
}

export function stepSimulation(
  state: SimulationState,
  command: VehicleCommand,
  config: SimulationConfig,
  step: number,
): SimulationStep {
  const moved = stepVehicle(state.vehicle, command, config.spec, state.drivetrain, step);
  const settled = resolveCollisions(moved.state, config);
  return {
    state: { time: state.time + step, vehicle: settled.vehicle, drivetrain: moved.drivetrain },
    events: { impacts: settled.impacts },
    telemetry: moved.telemetry,
  };
}
