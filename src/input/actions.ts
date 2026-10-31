/** Discrete driver actions and the analogue demand, independent of the device that produced them. */

export type Action = 'camera' | 'gear' | 'parkingBrake' | 'menu' | 'restart';

export interface Axes {
  /** 0 to 1, right pedal. */
  readonly throttle: number;
  /** 0 to 1, service brake. */
  readonly brake: number;
  /** -1 to 1, positive steers left. */
  readonly steer: number;
}

export interface DeviceInput {
  readonly axes: Axes;
  readonly fine: boolean;
  readonly horn: boolean;
  readonly actions: readonly Action[];
}

export const NO_INPUT: DeviceInput = {
  axes: { throttle: 0, brake: 0, steer: 0 },
  fine: false,
  horn: false,
  actions: [],
};

const clampUnit = (value: number): number => Math.min(Math.max(value, -1), 1);
const clampPedal = (value: number): number => Math.min(Math.max(value, 0), 1);

/** Keyboard and gamepad act together: demands add up, saturating at full scale. */
export const mergeInputs = (first: DeviceInput, second: DeviceInput): DeviceInput => ({
  axes: {
    throttle: clampPedal(first.axes.throttle + second.axes.throttle),
    brake: clampPedal(first.axes.brake + second.axes.brake),
    steer: clampUnit(first.axes.steer + second.axes.steer),
  },
  fine: first.fine || second.fine,
  horn: first.horn || second.horn,
  actions: [...first.actions, ...second.actions],
});
