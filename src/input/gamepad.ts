/**
 * Gamepad in the driver layout: left stick steers, right trigger is the throttle and left
 * trigger the brake (analog triggers). Standard-mapping button indices.
 */
import { type Action, type DeviceInput, NO_INPUT } from './actions';
import { type ResponseCurve, shapeAxis } from './curves';

export interface PadLayout {
  readonly steerAxis: number;
  readonly throttleButton: number;
  readonly brakeButton: number;
  readonly fineButton: number;
  readonly hornButton: number;
  readonly actionButtons: Readonly<Record<number, Action>>;
}

export const DRIVER_LAYOUT: PadLayout = {
  steerAxis: 0,
  throttleButton: 7,
  brakeButton: 6,
  fineButton: 4,
  hornButton: 2,
  actionButtons: { 0: 'gear', 1: 'parkingBrake', 3: 'camera', 8: 'restart', 9: 'menu' },
};

/** The slice of the Gamepad API the mapping needs. */
export interface PadState {
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

const isDown = (pad: PadState, index: number): boolean => pad.buttons[index]?.pressed ?? false;

/** Buttons that went down since the previous snapshot, as actions. */
export function pressedActions(pad: PadState, previous: readonly boolean[], layout: PadLayout): readonly Action[] {
  return Object.entries(layout.actionButtons)
    .filter(([index]) => isDown(pad, Number(index)) && !(previous[Number(index)] ?? false))
    .map(([, action]) => action);
}

export function readPad(
  pad: PadState,
  previous: readonly boolean[],
  layout: PadLayout,
  curve: ResponseCurve,
): DeviceInput {
  const steer = shapeAxis(pad.axes[layout.steerAxis] ?? 0, curve);
  return {
    axes: {
      throttle: pad.buttons[layout.throttleButton]?.value ?? 0,
      brake: pad.buttons[layout.brakeButton]?.value ?? 0,
      /** Stick right is positive on the pad, but a right turn is a negative steer command. */
      steer: -steer,
    },
    fine: isDown(pad, layout.fineButton),
    horn: isDown(pad, layout.hornButton),
    actions: pressedActions(pad, previous, layout),
  };
}

export class GamepadReader {
  private previous: readonly boolean[] = [];

  constructor(private readonly layout: PadLayout) {}

  read(curve: ResponseCurve): DeviceInput {
    const pad = firstConnected();
    if (pad === null) return NO_INPUT;
    const input = readPad(pad, this.previous, this.layout, curve);
    this.previous = pad.buttons.map((button) => button.pressed);
    return input;
  }
}

function firstConnected(): Gamepad | null {
  if (typeof navigator.getGamepads !== 'function') return null;
  return navigator.getGamepads().find((pad) => pad !== null && pad.connected) ?? null;
}
