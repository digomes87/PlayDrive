/** Frame-time budgeting for the fixed-step simulation, decoupled from the render rate. */

export interface FrameBudget {
  readonly steps: number;
  readonly remainder: number;
  /** Blend of the last two states for rendering, 0 to 1. */
  readonly alpha: number;
}

/**
 * Splits the frame time into whole physics steps. Beyond the per-frame cap the simulation
 * slows down instead of spiralling after a long stall.
 */
export function consumeFrame(leftover: number, frameSeconds: number, step: number, maxSteps: number): FrameBudget {
  const total = leftover + frameSeconds;
  const steps = Math.min(Math.floor(total / step), maxSteps);
  const remainder = total - steps * step;
  return { steps, remainder, alpha: remainder / step };
}
