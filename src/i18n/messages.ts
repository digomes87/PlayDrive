/** The shape of every translated string in the interface. */
import type { Language } from './language';
import type { MissionId } from '../sim/missions';
import type { ProgressMessage } from '../sim/progress';
import type { ScoreCriterion } from '../sim/scoring';
import type { CameraMode } from '../render/cameras';

export interface AlarmText {
  readonly jackknife: string;
  readonly collision: string;
  readonly shifting: string;
}

export interface HudText {
  readonly speed: string;
  readonly gear: string;
  readonly rpm: string;
  readonly articulation: string;
  readonly parkingBrake: string;
  readonly target: string;
  readonly camera: string;
}

export interface Messages {
  readonly language: Language;
  readonly page: {
    readonly title: string;
    readonly description: string;
    readonly stage: string;
    readonly scene: string;
    readonly hud: string;
    readonly menu: string;
  };
  readonly tagline: string;
  readonly languageSwitch: string;
  readonly missions: Record<MissionId, { readonly title: string; readonly briefing: string }>;
  readonly progress: Record<ProgressMessage, string>;
  readonly score: Record<ScoreCriterion, string>;
  readonly cameras: Record<CameraMode, string>;
  readonly alarms: AlarmText;
  readonly hints: {
    readonly replay: (speed: number, percent: number) => string;
    readonly gear: string;
    readonly parkingBrake: string;
  };
  readonly hud: HudText;
  readonly menu: {
    readonly resume: string;
    readonly retry: string;
    readonly replay: string;
    readonly missions: string;
    readonly best: string;
    readonly controls: string;
    readonly joystick: string;
    readonly expo: string;
    readonly deadzone: string;
    readonly mute: string;
    readonly succeeded: string;
    readonly failed: string;
    readonly keys: readonly (readonly [string, string])[];
  };
}
