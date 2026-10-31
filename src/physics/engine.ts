/** Diesel engine and automated manual transmission: torque curve, clutch launch, creep, gear logic. */
import type { TorquePoint } from '../truckSpec';

export type Selector = 'R' | 'N' | 'D';

export interface EngineSpecLike {
  readonly idleRpm: number;
  readonly governorRpm: number;
  readonly torqueCurve: readonly TorquePoint[];
  readonly forwardRatios: readonly number[];
  readonly finalDrive: number;
  readonly reverseRatio: number;
  readonly efficiency: number;
  readonly launchSpeed: number;
  readonly launchFactor: number;
  readonly creepForce: number;
  readonly engineBrakeTorque: number;
  readonly shiftSeconds: number;
  readonly shiftUpRpm: number;
  readonly shiftDownRpm: number;
}

/** Gear number in the dashboard sense: -1 reverse, 0 neutral, 1…8 forward. */
export type GearNumber = number;

export interface DrivetrainState {
  readonly selector: Selector;
  /** Index into forwardRatios, 1-based, meaningful while the selector is D. */
  readonly gear: number;
  /** Seconds of torque interrupt left in the current shift, 0 when engaged. */
  readonly shiftTimer: number;
}

export const INITIAL_DRIVETRAIN: DrivetrainState = { selector: 'N', gear: 1, shiftTimer: 0 };

export const topGear = (engine: EngineSpecLike): number => engine.forwardRatios.length;

/** Torque the engine delivers at a shaft speed, N·m, linear between curve points. */
export function torqueAtRpm(curve: readonly TorquePoint[], rpm: number): number {
  if (rpm <= curve[0]!.rpm) return curve[0]!.newtonMeters;
  const last = curve[curve.length - 1]!;
  if (rpm >= last.rpm) return last.newtonMeters;
  for (let index = 1; index < curve.length; index += 1) {
    const point = curve[index]!;
    if (rpm <= point.rpm) {
      const before = curve[index - 1]!;
      const share = (rpm - before.rpm) / (point.rpm - before.rpm);
      return before.newtonMeters + share * (point.newtonMeters - before.newtonMeters);
    }
  }
  return last.newtonMeters;
}

/** Overall gear ratio including the final drive; negative in reverse, 0 in neutral. */
export function overallRatio(engine: EngineSpecLike, drivetrain: DrivetrainState): number {
  if (drivetrain.selector === 'R') return -engine.reverseRatio * engine.finalDrive;
  if (drivetrain.selector === 'N') return 0;
  return engine.forwardRatios[Math.min(drivetrain.gear, topGear(engine)) - 1]! * engine.finalDrive;
}

/** 0 with the clutch open at a standstill, 1 once the truck reaches the launch speed. */
export const clutchEngagement = (engine: EngineSpecLike, forwardSpeed: number): number => {
  const from = engine.launchSpeed * 0.3;
  const share = (Math.abs(forwardSpeed) - from) / (engine.launchSpeed - from);
  return share <= 0 ? 0 : share >= 1 ? 1 : share * share * (3 - 2 * share);
};

export interface Tractive {
  /** Signed tractive force at the driven wheels, N; zero in neutral and during shifts. */
  readonly force: number;
  /** Creep force in gear with the brakes off, N; the caller applies it only then. */
  readonly creep: number;
  /** Engine brake force with a closed throttle and the clutch engaged, N. */
  readonly engineBrake: number;
  readonly rpm: number;
  readonly clutch: number;
}

const SECONDS_PER_MINUTE = 60;
const TWO_PI = 2 * Math.PI;
/** Free engine speed with the clutch slipping: the driver can raise it, but not to the governor. */
const LAUNCH_RPM_FACTOR = 0.65;

/** Tractive force of the whole drivetrain at one vehicle speed. Pure: no state is touched. */
export function tractiveForce(
  engine: EngineSpecLike,
  wheelRadius: number,
  forwardSpeed: number,
  throttle: number,
  drivetrain: DrivetrainState,
): Tractive {
  const ratio = Math.abs(overallRatio(engine, drivetrain));
  const clutch = clutchEngagement(engine, forwardSpeed);
  const isShifting = drivetrain.shiftTimer > 0;
  const wheelRpm = (Math.abs(forwardSpeed) / (TWO_PI * wheelRadius)) * ratio * SECONDS_PER_MINUTE;
  const slipping = engine.idleRpm + throttle * (engine.governorRpm - engine.idleRpm) * LAUNCH_RPM_FACTOR;
  const rpm = Math.max(engine.idleRpm, clutch * wheelRpm + (1 - clutch) * slipping);
  if (drivetrain.selector === 'N' || isShifting || ratio === 0) {
    return { force: 0, creep: 0, engineBrake: 0, rpm, clutch };
  }
  const direction = drivetrain.selector === 'R' ? -1 : 1;
  const torque = torqueAtRpm(engine.torqueCurve, rpm) * throttle;
  const force = (torque * ratio * engine.efficiency / wheelRadius) * (clutch + (1 - clutch) * engine.launchFactor);
  const creep = engine.creepForce * (1 - clutch);
  const brakeTorque = (rpm / engine.governorRpm) * engine.engineBrakeTorque * clutch;
  return {
    force: force * direction,
    creep: creep * direction,
    engineBrake: (brakeTorque * ratio * engine.efficiency / wheelRadius) * direction,
    rpm,
    clutch,
  };
}

/** Gearbox decisions for one fixed step; the ratios themselves never change mid-step. */
export function stepDrivetrain(
  engine: EngineSpecLike,
  wheelRadius: number,
  forwardSpeed: number,
  throttle: number,
  state: DrivetrainState,
  step: number,
): DrivetrainState {
  if (state.shiftTimer > 0) {
    const remaining = state.shiftTimer - step;
    return remaining <= 0 ? { ...state, shiftTimer: 0 } : { ...state, shiftTimer: remaining };
  }
  if (state.selector !== 'D') return state.gear === 1 ? state : { ...state, gear: 1 };
  const drive = tractiveForce(engine, wheelRadius, forwardSpeed, throttle, state);
  const maxGear = topGear(engine);
  if (drive.rpm >= engine.shiftUpRpm && state.gear < maxGear) {
    return { ...state, gear: state.gear + 1, shiftTimer: engine.shiftSeconds };
  }
  if (drive.rpm <= engine.shiftDownRpm && state.gear > 1) {
    return { ...state, gear: state.gear - 1, shiftTimer: engine.shiftSeconds };
  }
  return state;
}

/** Selector order R → N → D → R, as the rotary switch on the dashboard. */
export const nextSelector = (selector: Selector): Selector => (selector === 'R' ? 'N' : selector === 'N' ? 'D' : 'R');
