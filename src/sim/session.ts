/** A running mission: owns the fixed-step loop and the only mutable simulation state. */
import type { TruckSpec } from '../truckSpec';
import { type VehicleCommand, type VehicleTelemetry, telemetryOf } from '../physics/vehicle';
import { consumeFrame } from '../physics/integrator';
import { FIXED_STEP, wrapAngle } from '../physics/units';
import { type Vec2, lerp } from '../physics/vec2';
import type { Mission } from './missions';
import { INITIAL_PROGRESS, type Progress, track } from './progress';
import { EMPTY_RECORDING, type Recording, recordStep } from './recording';
import {
  type SimulationConfig,
  type SimulationState,
  createSimulation,
  stepSimulation,
} from './simulation';

/** Largest catch-up per frame; beyond this the simulation slows down instead of spiralling. */
const MAX_STEPS_PER_FRAME = 12;

/** Interpolated pose for rendering between two physics steps. */
export interface RenderPose {
  readonly tractor: { readonly position: Vec2; readonly heading: number };
  readonly trailer: { readonly position: Vec2; readonly heading: number };
  readonly steering: number;
}

interface Timeline {
  readonly previous: SimulationState;
  readonly current: SimulationState;
  readonly leftover: number;
  readonly alpha: number;
  readonly progress: Progress;
  readonly recording: Recording;
  readonly telemetry: VehicleTelemetry;
}

const blendAngle = (from: number, to: number, alpha: number): number => from + wrapAngle(to - from) * alpha;

export class Session {
  readonly config: SimulationConfig;
  private timeline: Timeline;

  constructor(
    readonly mission: Mission,
    spec: TruckSpec,
  ) {
    this.config = { spec, site: mission.site };
    const start = createSimulation(this.config, mission.start);
    this.timeline = {
      previous: start,
      current: start,
      leftover: 0,
      alpha: 0,
      progress: INITIAL_PROGRESS,
      recording: EMPTY_RECORDING,
      telemetry: telemetryOfState(start, this.config.spec),
    };
  }

  get state(): SimulationState {
    return this.timeline.current;
  }

  get progress(): Progress {
    return this.timeline.progress;
  }

  /** Everything needed to play this operation again. */
  get recording(): Recording {
    return this.timeline.recording;
  }

  /** Instruments of the latest step. */
  get telemetry(): VehicleTelemetry {
    return this.timeline.telemetry;
  }

  /** Runs as many fixed steps as the frame time allows. */
  advance(frameSeconds: number, command: VehicleCommand): void {
    const budget = consumeFrame(this.timeline.leftover, frameSeconds, FIXED_STEP, MAX_STEPS_PER_FRAME);
    for (let index = 0; index < budget.steps; index += 1) this.step(command);
    this.timeline = { ...this.timeline, leftover: budget.remainder, alpha: budget.alpha };
  }

  pose(): RenderPose {
    const { previous, current, alpha } = this.timeline;
    return {
      tractor: {
        position: lerp(previous.vehicle.tractor.position, current.vehicle.tractor.position, alpha),
        heading: blendAngle(previous.vehicle.tractor.heading, current.vehicle.tractor.heading, alpha),
      },
      trailer: {
        position: lerp(previous.vehicle.trailer.position, current.vehicle.trailer.position, alpha),
        heading: blendAngle(previous.vehicle.trailer.heading, current.vehicle.trailer.heading, alpha),
      },
      steering: previous.vehicle.steering + (current.vehicle.steering - previous.vehicle.steering) * alpha,
    };
  }

  private step(command: VehicleCommand): void {
    const { current, progress } = this.timeline;
    const result = stepSimulation(current, command, this.config, FIXED_STEP);
    const tracked = track(progress, {
      mission: this.mission,
      spec: this.config.spec,
      state: result.state.vehicle,
      telemetry: result.telemetry,
      command,
      impacts: result.events.impacts,
      step: FIXED_STEP,
    });
    this.timeline = {
      ...this.timeline,
      previous: current,
      current: result.state,
      progress: tracked,
      recording: recordStep(this.timeline.recording, command),
      telemetry: result.telemetry,
    };
  }
}

const telemetryOfState = (state: SimulationState, spec: TruckSpec): VehicleTelemetry =>
  telemetryOf(state.vehicle, spec, state.drivetrain);
