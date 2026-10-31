/** Mission outcome tracking: time, collisions, articulation peaks and the parking hold. */
import type { TruckSpec } from '../truckSpec';
import type { VehicleCommand, VehicleState, VehicleTelemetry } from '../physics/vehicle';
import { wrapAngle } from '../physics/units';
import type { Mission } from './missions';
import { checkParking } from './parking';
import type { Impact } from './collisions';

export type Outcome = 'running' | 'success' | 'failed';

export type ProgressMessage = 'none' | 'parked' | 'jackknifed';

export interface Progress {
  readonly outcome: Outcome;
  readonly message: ProgressMessage;
  readonly elapsed: number;
  readonly collisions: number;
  /** Worst articulation reached, rad, as an absolute value. */
  readonly maxArticulation: number;
  readonly hardestImpact: number;
  readonly harshStops: number;
  /** Consecutive seconds standing correctly parked. */
  readonly holdTime: number;
  /** Heading error at the moment the mission closed, rad. */
  readonly finalHeadingError: number;
  /** Elapsed time of the last harsh stop counted, for the cooldown, s. */
  readonly lastHarshAt: number;
}

const IMPACT_THRESHOLD = 0.3;
const HARSH_DECELERATION = 4.5;
const HARSH_COOLDOWN = 1;

export const INITIAL_PROGRESS: Progress = {
  outcome: 'running',
  message: 'none',
  elapsed: 0,
  collisions: 0,
  maxArticulation: 0,
  hardestImpact: 0,
  harshStops: 0,
  holdTime: 0,
  finalHeadingError: 0,
  lastHarshAt: -HARSH_COOLDOWN,
};

export interface StepInputs {
  readonly mission: Mission;
  readonly spec: TruckSpec;
  readonly state: VehicleState;
  readonly telemetry: VehicleTelemetry;
  readonly command: VehicleCommand;
  readonly impacts: readonly Impact[];
  readonly step: number;
}

export function track(progress: Progress, inputs: StepInputs): Progress {
  if (progress.outcome !== 'running') return progress;
  const { mission, spec, state, telemetry, command, impacts } = inputs;
  const step = inputs.step;
  const counted = impacts.filter((impact) => impact.speed > IMPACT_THRESHOLD);
  const articulation = Math.abs(telemetry.articulation);
  const next: Progress = {
    ...progress,
    elapsed: progress.elapsed + step,
    collisions: progress.collisions + counted.length,
    maxArticulation: Math.max(progress.maxArticulation, articulation),
    hardestImpact: Math.max(progress.hardestImpact, ...counted.map((impact) => impact.speed), 0),
    harshStops:
      progress.elapsed - progress.lastHarshAt > HARSH_COOLDOWN && -state.transfer.tractor > HARSH_DECELERATION
        ? progress.harshStops + 1
        : progress.harshStops,
    lastHarshAt: -state.transfer.tractor > HARSH_DECELERATION ? progress.elapsed : progress.lastHarshAt,
  };
  if (articulation >= spec.articulation.fail) {
    return { ...next, outcome: 'failed', message: 'jackknifed' };
  }
  const goal = mission.goal;
  if (goal === null) return next;
  const parking = checkParking(state, goal, spec);
  const holding = parking.inside && parking.stopped && command.handbrake;
  const holdTime = holding ? progress.holdTime + step : 0;
  if (!holding || holdTime < goal.holdSeconds) return { ...next, holdTime };
  return {
    ...next,
    holdTime,
    outcome: 'success',
    message: 'parked',
    finalHeadingError: Math.abs(wrapAngle(parking.headingError)),
  };
}
