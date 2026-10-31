/**
 * The whole combination as one deterministic dynamical system: tractor and trailer are rigid
 * bodies on the yard plane, joined at the fifth wheel by a stiff near-critical spring-damper.
 * Integrated together by RK4; the tyre model saturates, so understeer, trailer swing and
 * jackknife come out of the physics instead of being scripted.
 */
import type { TruckSpec } from '../truckSpec';
import { type DrivetrainState, type Selector, stepDrivetrain, tractiveForce } from './engine';
import { stepSteering } from './steering';
import { axleForces } from './tyres';
import { AIR_DENSITY, GRAVITY, wrapAngle } from './units';
import { type Vec2, add, fromAngle, perp, scale, subtract } from './vec2';

/** Position and velocity of one rigid body. Leftward speed is positive to the body's left. */
export interface BodyState {
  readonly position: Vec2;
  readonly heading: number;
  readonly forwardSpeed: number;
  readonly leftSpeed: number;
  readonly yawRate: number;
}

/** Quasi-static longitudinal load transfer, evaluated once per step and frozen inside RK4. */
export interface Transfer {
  readonly tractor: number;
  readonly trailer: number;
}

export const STILL: Transfer = { tractor: 0, trailer: 0 };

export interface VehicleState {
  readonly tractor: BodyState;
  readonly trailer: BodyState;
  /** Steering angle, positive to the left, rad. */
  readonly steering: number;
  readonly transfer: Transfer;
}

export interface VehicleCommand {
  /** 0 to 1. */
  readonly throttle: number;
  /** 0 to 1, service brake pedal. */
  readonly brake: number;
  /** -1 to 1, positive steers left. */
  readonly steer: number;
  readonly fine: boolean;
  readonly handbrake: boolean;
  readonly selector: Selector;
}

export interface AxleLoads {
  readonly front: number;
  readonly tractorRear: number;
  readonly trailer: number;
  readonly kingpin: number;
}

export interface VehicleTelemetry {
  readonly rpm: number;
  /** Dashboard gear: -1 reverse, 0 neutral, 1…8 forward. */
  readonly gear: number;
  readonly clutch: number;
  readonly isShifting: boolean;
  readonly articulation: number;
  readonly hitchStretch: number;
  readonly hitchForce: number;
  readonly loads: AxleLoads;
  readonly driveForce: number;
}

export interface VehicleStep {
  readonly state: VehicleState;
  readonly drivetrain: DrivetrainState;
  readonly telemetry: VehicleTelemetry;
}

/** Oriented rectangle on the yard. */
export interface Box {
  readonly center: Vec2;
  readonly heading: number;
  readonly halfLength: number;
  readonly halfWidth: number;
}

export interface StartPose {
  readonly position: Vec2;
  readonly heading: number;
  /** Trailer heading; straight behind the tractor when omitted. */
  readonly trailerHeading?: number;
}

const bodyOf = (position: Vec2, heading: number): BodyState => ({
  position,
  heading,
  forwardSpeed: 0,
  leftSpeed: 0,
  yawRate: 0,
});

export function createVehicle(spec: TruckSpec, start: StartPose): VehicleState {
  const tractor = bodyOf(start.position, start.heading);
  const trailerHeading = start.trailerHeading ?? start.heading;
  const fifthWheel = hitchOnTractor(tractor, spec);
  const trailerPosition = add(fifthWheel, scale(fromAngle(trailerHeading), -spec.geometry.kingpinToTrailerCg));
  return { tractor, trailer: bodyOf(trailerPosition, trailerHeading), steering: 0, transfer: STILL };
}

/** Fifth wheel point on the tractor, where the trailer's kingpin should sit. */
export const hitchOnTractor = (tractor: BodyState, spec: TruckSpec): Vec2 =>
  add(tractor.position, scale(fromAngle(tractor.heading), -spec.geometry.cgToFifthWheel));

/** Kingpin point on the trailer nose. */
export const kingpinOf = (trailer: BodyState, spec: TruckSpec): Vec2 =>
  add(trailer.position, scale(fromAngle(trailer.heading), spec.geometry.kingpinToTrailerCg));

/** Trailer articulation relative to the tractor, positive when the trailer tail is to the left. */
export const articulationOf = (state: VehicleState): number => wrapAngle(state.trailer.heading - state.tractor.heading);

export const tractorBox = (state: VehicleState, spec: TruckSpec): Box => ({
  center: add(state.tractor.position, scale(fromAngle(state.tractor.heading), spec.geometry.tractorBoxOffset)),
  heading: state.tractor.heading,
  halfLength: spec.geometry.tractorLength / 2,
  halfWidth: spec.geometry.tractorWidth / 2,
});

export const trailerBox = (state: VehicleState, spec: TruckSpec): Box => ({
  center: add(state.trailer.position, scale(fromAngle(state.trailer.heading), spec.geometry.trailerBoxOffset)),
  heading: state.trailer.heading,
  halfLength: spec.geometry.trailerLength / 2,
  halfWidth: spec.geometry.trailerWidth / 2,
});

/** World velocity of a body's centre. */
const worldVelocity = (body: BodyState): Vec2 => {
  const forward = fromAngle(body.heading);
  return add(scale(forward, body.forwardSpeed), scale(perp(forward), body.leftSpeed));
};

/** The 12 numbers RK4 chews on: x, z, heading, u, v, r per body. The steering column steps separately. */
type Packed = readonly number[];

const pack = (state: VehicleState): Packed => [
  state.tractor.position.x,
  state.tractor.position.z,
  state.tractor.heading,
  state.tractor.forwardSpeed,
  state.tractor.leftSpeed,
  state.tractor.yawRate,
  state.trailer.position.x,
  state.trailer.position.z,
  state.trailer.heading,
  state.trailer.forwardSpeed,
  state.trailer.leftSpeed,
  state.trailer.yawRate,
];

const unpack = (values: Packed, transfer: Transfer): VehicleState => ({
  tractor: {
    position: { x: values[0]!, z: values[1]! },
    heading: values[2]!,
    forwardSpeed: values[3]!,
    leftSpeed: values[4]!,
    yawRate: values[5]!,
  },
  trailer: {
    position: { x: values[6]!, z: values[7]! },
    heading: values[8]!,
    forwardSpeed: values[9]!,
    leftSpeed: values[10]!,
    yawRate: values[11]!,
  },
  steering: 0,
  transfer,
});

/** Everything that survives a whole fixed step unchanged. */
interface StepInputs {
  readonly command: VehicleCommand;
  readonly spec: TruckSpec;
  readonly drivetrain: DrivetrainState;
  readonly allowCreep: boolean;
  readonly steering: number;
  readonly transfer: Transfer;
}

/** Static and transferred vertical loads on the axles, N. */
function axleLoads(spec: TruckSpec, transfer: Transfer): AxleLoads {
  const g = spec.geometry;
  const kingpinSpan = g.kingpinToTrailerCg + g.trailerCgToAxle;
  const kingpin =
    (spec.masses.trailer * (GRAVITY * (kingpinSpan - g.kingpinToTrailerCg) - transfer.trailer * g.trailerCgHeight)) / kingpinSpan;
  const front =
    (spec.masses.tractor * (GRAVITY * g.cgToRearAxle - transfer.tractor * g.tractorCgHeight) +
      kingpin * (g.cgToRearAxle - g.cgToFifthWheel)) /
    (g.cgToFrontAxle + g.cgToRearAxle);
  return {
    front,
    tractorRear: spec.masses.tractor * GRAVITY + kingpin - front,
    trailer: (spec.masses.trailer * (GRAVITY * g.kingpinToTrailerCg + transfer.trailer * g.trailerCgHeight)) / kingpinSpan,
    kingpin,
  };
}

/**
 * A demand that opposes motion, capped so it can at most stop the body's share carried by this
 * axle within the substep; without the cap a held brake makes the truck shiver around zero speed.
 */
function resisting(demand: number, speed: number, loadShare: number, substep: number): number {
  if (speed === 0 || demand === 0) return 0;
  const capacity = ((loadShare / GRAVITY) * Math.abs(speed)) / substep;
  return Math.max(-Math.sign(speed) * demand, -capacity);
}

interface BodyForces {
  readonly forward: number;
  readonly left: number;
  readonly torque: number;
}

/** Everything that pushes and turns the tractor, in its own frame. */function tractorForces(tractor: BodyState, inputs: StepInputs, loads: AxleLoads, hitch: Vec2, substep: number): BodyForces {
  const { spec, command } = inputs;
  const g = spec.geometry;
  const drive = tractiveForce(spec.engine, g.wheelRadius, tractor.forwardSpeed, command.throttle, inputs.drivetrain);
  const creep = inputs.allowCreep ? drive.creep : 0;
  const pedal = command.brake * spec.brakes.serviceForce;
  const brakeFront = pedal * spec.brakes.frontShare;
  const brakeRear = pedal * spec.brakes.tractorRearShare + (command.handbrake ? spec.brakes.parkingForce : 0);
  const rolling = spec.drag.rollingCoefficient * (loads.front + loads.tractorRear);
  const drag = 0.5 * AIR_DENSITY * spec.drag.dragArea * tractor.forwardSpeed * tractor.forwardSpeed;
  const stopShare = loads.front + loads.tractorRear;
  const frontDemand = resisting(brakeFront, tractor.forwardSpeed, stopShare, substep);
  const rearDemand =
    resisting(brakeRear, tractor.forwardSpeed, stopShare, substep) +
    resisting(drive.engineBrake, tractor.forwardSpeed, stopShare, substep) -
    Math.sign(tractor.forwardSpeed) * (rolling + drag);

  const steerCos = Math.cos(inputs.steering);
  const steerSin = Math.sin(inputs.steering);
  const frontSlip = (tractor.leftSpeed + g.cgToFrontAxle * tractor.yawRate) * steerCos - tractor.forwardSpeed * steerSin;
  const rearSlip = tractor.leftSpeed - g.cgToRearAxle * tractor.yawRate;
  const front = axleForces(loads.front, frontSlip, frontDemand, spec.tyres.mu, spec.tyres.saturationSpeed);
  const rear = axleForces(loads.tractorRear, rearSlip, rearDemand + drive.force + creep, spec.tyres.mu, spec.tyres.saturationSpeed);

  const frontForward = front.forward * steerCos - front.left * steerSin;
  const frontLeft = front.forward * steerSin + front.left * steerCos;
  return {
    forward: frontForward + rear.forward + hitch.x,
    left: frontLeft + rear.left + hitch.z,
    torque: g.cgToFrontAxle * frontLeft - g.cgToRearAxle * rear.left - g.cgToFifthWheel * hitch.z,
  };
}

/** Everything that pushes and turns the trailer, in its own frame. */
function trailerForces(trailer: BodyState, inputs: StepInputs, loads: AxleLoads, hitch: Vec2, substep: number): BodyForces {
  const { spec, command } = inputs;
  const pedal = command.brake * spec.brakes.serviceForce * spec.brakes.trailerShare;
  const rolling = spec.drag.rollingCoefficient * loads.trailer;
  const demand = resisting(pedal, trailer.forwardSpeed, loads.trailer, substep) - Math.sign(trailer.forwardSpeed) * rolling;
  const slip = trailer.leftSpeed - spec.geometry.trailerCgToAxle * trailer.yawRate;
  const tyres = axleForces(loads.trailer, slip, demand, spec.tyres.mu, spec.tyres.saturationSpeed);
  return {
    forward: tyres.forward + hitch.x,
    left: tyres.left + hitch.z,
    torque: -spec.geometry.trailerCgToAxle * tyres.left + spec.geometry.kingpinToTrailerCg * hitch.z,
  };
}

/** Hitch force in each body's own frame, plus how far the joint has stretched. */
function hitchForces(
  tractor: BodyState,
  trailer: BodyState,
  spec: TruckSpec,
): { readonly onTractor: Vec2; readonly onTrailer: Vec2; readonly stretch: number } {
  const error = subtract(kingpinOf(trailer, spec), hitchOnTractor(tractor, spec));
  const relative = subtract(
    add(worldVelocity(trailer), scale(perp(fromAngle(trailer.heading)), spec.geometry.kingpinToTrailerCg * trailer.yawRate)),
    add(worldVelocity(tractor), scale(perp(fromAngle(tractor.heading)), -spec.geometry.cgToFifthWheel * tractor.yawRate)),
  );
  const force = {
    x: -spec.hitch.stiffness * error.x - spec.hitch.damping * relative.x,
    z: -spec.hitch.stiffness * error.z - spec.hitch.damping * relative.z,
  };
  const toFrame = (vector: Vec2, heading: number): Vec2 => {
    const cosine = Math.cos(-heading);
    const sine = Math.sin(-heading);
    return { x: vector.x * cosine - vector.z * sine, z: vector.x * sine + vector.z * cosine };
  };
  return {
    onTractor: toFrame({ x: -force.x, z: -force.z }, tractor.heading),
    onTrailer: toFrame(force, trailer.heading),
    stretch: Math.hypot(error.x, error.z),
  };
}

/** Time derivative of the packed state. */
function derivative(values: Packed, inputs: StepInputs, substep: number): Packed {
  const { tractor, trailer } = unpack(values, inputs.transfer);
  const loads = axleLoads(inputs.spec, inputs.transfer);
  const hitch = hitchForces(tractor, trailer, inputs.spec);
  const forces = tractorForces(tractor, inputs, loads, hitch.onTractor, substep);
  const behind = trailerForces(trailer, inputs, loads, hitch.onTrailer, substep);
  const m1 = inputs.spec.masses.tractor;
  const m2 = inputs.spec.masses.trailer;
  const forward = fromAngle(tractor.heading);
  return [
    tractor.forwardSpeed * forward.x - tractor.leftSpeed * forward.z,
    tractor.forwardSpeed * forward.z + tractor.leftSpeed * forward.x,
    tractor.yawRate,
    forces.forward / m1 + tractor.leftSpeed * tractor.yawRate,
    forces.left / m1 - tractor.forwardSpeed * tractor.yawRate,
    forces.torque / inputs.spec.masses.tractorYawInertia,
    trailer.forwardSpeed * Math.cos(trailer.heading) - trailer.leftSpeed * Math.sin(trailer.heading),
    trailer.forwardSpeed * Math.sin(trailer.heading) + trailer.leftSpeed * Math.cos(trailer.heading),
    trailer.yawRate,
    behind.forward / m2 + trailer.leftSpeed * trailer.yawRate,
    behind.left / m2 - trailer.forwardSpeed * trailer.yawRate,
    behind.torque / inputs.spec.masses.trailerYawInertia,
  ];
}

const addScaled = (state: Packed, slope: Packed, factor: number): Packed =>
  state.map((value, index) => value + slope[index]! * factor);

function rungeKutta(values: Packed, inputs: StepInputs, step: number): Packed {
  const k1 = derivative(values, inputs, step);
  const k2 = derivative(addScaled(values, k1, step / 2), inputs, step / 2);
  const k3 = derivative(addScaled(values, k2, step / 2), inputs, step / 2);
  const k4 = derivative(addScaled(values, k3, step), inputs, step);
  return values.map((value, index) => value + (step / 6) * (k1[index]! + 2 * k2[index]! + 2 * k3[index]! + k4[index]!));
}

/** Articulation beyond the mechanical limit is held, not integrated, so free play stays finite. */
function clampArticulation(state: VehicleState, spec: TruckSpec): VehicleState {
  const angle = articulationOf(state);
  const limit = spec.hitch.contactAngle;
  if (Math.abs(angle) <= limit) return state;
  const overshoot = Math.abs(angle) - limit;
  return {
    ...state,
    trailer: {
      ...state.trailer,
      heading: state.trailer.heading - Math.sign(angle) * overshoot,
      yawRate: state.tractor.yawRate,
    },
  };
}

/** Longitudinal accelerations of a state, frozen for the load transfer of the next step. */
function accelerationsOf(state: VehicleState, inputs: StepInputs): Transfer {
  const loads = axleLoads(inputs.spec, state.transfer);
  const hitch = hitchForces(state.tractor, state.trailer, inputs.spec);
  const tractor = tractorForces(state.tractor, inputs, loads, hitch.onTractor, 1);
  const trailer = trailerForces(state.trailer, inputs, loads, hitch.onTrailer, 1);
  return {
    tractor: tractor.forward / inputs.spec.masses.tractor,
    trailer: trailer.forward / inputs.spec.masses.trailer,
  };
}

export function telemetryOf(state: VehicleState, spec: TruckSpec, drivetrain: DrivetrainState): VehicleTelemetry {
  const loads = axleLoads(spec, state.transfer);
  const drive = tractiveForce(spec.engine, spec.geometry.wheelRadius, state.tractor.forwardSpeed, 0, drivetrain);
  const hitch = hitchForces(state.tractor, state.trailer, spec);
  return {
    rpm: drive.rpm,
    gear: drivetrain.selector === 'R' ? -1 : drivetrain.selector === 'N' ? 0 : drivetrain.gear,
    clutch: drive.clutch,
    isShifting: drivetrain.shiftTimer > 0,
    articulation: articulationOf(state),
    hitchStretch: hitch.stretch,
    hitchForce: Math.hypot(hitch.onTractor.x, hitch.onTractor.z),
    loads,
    driveForce: drive.force,
  };
}

export function stepVehicle(
  state: VehicleState,
  command: VehicleCommand,
  spec: TruckSpec,
  drivetrain: DrivetrainState,
  step: number,
): VehicleStep {
  const engaged = { ...drivetrain, selector: command.selector };
  const shifted = stepDrivetrain(spec.engine, spec.geometry.wheelRadius, state.tractor.forwardSpeed, command.throttle, engaged, step);
  const inputs: StepInputs = {
    command,
    spec,
    drivetrain: shifted,
    allowCreep: command.brake === 0 && !command.handbrake && command.selector !== 'N',
    steering: stepSteering(state.steering, command.steer, command.fine, spec, step),
    transfer: state.transfer,
  };
  const integrated = {
    ...unpack(rungeKutta(pack(state), inputs, step), state.transfer),
    steering: inputs.steering,
  };
  const next = clampArticulation(integrated, spec);
  const transfer = accelerationsOf(next, inputs);
  const settled = { ...next, transfer };
  return { state: settled, drivetrain: shifted, telemetry: telemetryOf(settled, spec, shifted) };
}
