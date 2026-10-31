/** Replay: a fresh session driven by the recorded commands, faster than real time. */
import type { TruckSpec } from '../truckSpec';
import { FIXED_STEP } from '../physics/units';
import type { Mission } from './missions';
import { type Recording, commandAt } from './recording';
import { Session } from './session';

/** A replay runs this many times faster than the operation it shows. */
export const REPLAY_SPEED = 4;

export class Replay {
  readonly session: Session;
  private stepIndex = 0;

  constructor(
    mission: Mission,
    spec: TruckSpec,
    private readonly recording: Recording,
  ) {
    this.session = new Session(mission, spec);
  }

  /** Share of the recording already replayed, 0 to 1. */
  get progress(): number {
    return this.recording.commands.length === 0 ? 1 : this.stepIndex / this.recording.commands.length;
  }

  get isFinished(): boolean {
    return this.progress >= 1 || this.session.progress.outcome !== 'running';
  }

  advance(steps: number): void {
    for (let index = 0; index < steps && !this.isFinished; index += 1) {
      const command = commandAt(this.recording, this.stepIndex);
      if (command === null) break;
      this.session.advance(FIXED_STEP, command);
      this.stepIndex += 1;
    }
  }
}
