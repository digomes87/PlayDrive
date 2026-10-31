/** Keyboard: W/↑ throttle, S/↓ brake, A/D and arrows steer, Shift fine steering, plus the action keys. */
import type { Action, DeviceInput } from './actions';

const ACTION_KEYS: Readonly<Record<string, Action>> = {
  Space: 'parkingBrake',
  KeyG: 'gear',
  KeyC: 'camera',
  Escape: 'menu',
  KeyR: 'restart',
};

/** Keys whose default browser behaviour (scrolling, focus moves) would fight the simulator. */
const CAPTURED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Keyboard {
  private readonly held = new Set<string>();
  private pending: Action[] = [];

  constructor(target: Window) {
    target.addEventListener('keydown', (event) => this.press(event));
    target.addEventListener('keyup', (event) => this.held.delete(event.code));
    target.addEventListener('blur', () => this.held.clear());
  }

  /** Current demand; the queued key presses are handed over once. */
  read(): DeviceInput {
    const actions = this.pending;
    this.pending = [];
    return {
      axes: {
        throttle: this.pedal('KeyW', 'ArrowUp'),
        brake: this.pedal('KeyS', 'ArrowDown'),
        steer: (this.held.has('KeyA') || this.held.has('ArrowLeft') ? 1 : 0) - (this.held.has('KeyD') || this.held.has('ArrowRight') ? 1 : 0),
      },
      fine: this.held.has('ShiftLeft') || this.held.has('ShiftRight'),
      horn: this.held.has('KeyH'),
      actions,
    };
  }

  private press(event: KeyboardEvent): void {
    if (isTyping(event)) return;
    if (CAPTURED.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    this.held.add(event.code);
    const action = ACTION_KEYS[event.code];
    if (action !== undefined) this.pending.push(action);
  }

  private pedal(primary: string, secondary: string): number {
    return this.held.has(primary) || this.held.has(secondary) ? 1 : 0;
  }
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement;
}
