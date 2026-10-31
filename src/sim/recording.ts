/** One command per fixed step, so a replay runs the same deterministic simulation again. */
import type { VehicleCommand } from '../physics/vehicle';

export interface Recording {
  readonly commands: readonly VehicleCommand[];
}

export const EMPTY_RECORDING: Recording = { commands: [] };

export const recordStep = (recording: Recording, command: VehicleCommand): Recording => ({
  commands: [...recording.commands, command],
});

export const commandAt = (recording: Recording, step: number): VehicleCommand | null =>
  step < recording.commands.length ? (recording.commands[step] ?? null) : null;
