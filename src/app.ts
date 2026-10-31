/** Application shell: wires input, simulation, 3D view, instrument panel and menus. */
import { DEFAULT_TRUCK_SPEC } from './truckSpec';
import { messagesFor } from './i18n/catalogue';
import type { Language } from './i18n/language';
import type { AlarmText, Messages } from './i18n/messages';
import { type Action, type DeviceInput, mergeInputs } from './input/actions';
import { DRIVER_LAYOUT, GamepadReader } from './input/gamepad';
import { Keyboard } from './input/keyboard';
import { nextSelector, type Selector } from './physics/engine';
import type { VehicleCommand } from './physics/vehicle';
import { PHYSICS_RATE_HZ } from './physics/units';
import { SceneView } from './render/view';
import { type MissionId, missionById } from './sim/missions';
import { checkParking } from './sim/parking';
import { Replay, REPLAY_SPEED } from './sim/replay';
import { scoreOf } from './sim/scoring';
import { Session } from './sim/session';
import {
  type BestResults,
  type Settings,
  browserStore,
  loadBestResults,
  loadLanguage,
  loadSettings,
  recordResult,
  saveLanguage,
  saveSettings,
} from './sim/storage';
import { CabAudio } from './ui/audio';
import { requireElement } from './ui/dom';
import { type Alarm, Hud } from './ui/hud';
import { type Instruments, readInstruments } from './ui/instruments';
import { Menu } from './ui/menu';
import { translatePage } from './ui/page';

const MAX_FRAME_SECONDS = 0.25;
const MILLISECONDS = 1000;
const COLLISION_ALARM_SECONDS = 1.2;

interface Latches {
  readonly parkingBrake: boolean;
  readonly selector: Selector;
}

const PARKED: Latches = { parkingBrake: false, selector: 'N' };

function alarmsFor(instruments: Instruments, collisionAt: number, now: number, text: AlarmText): readonly Alarm[] {
  const candidates: readonly (Alarm | false)[] = [
    instruments.articulationLevel === 'danger' && { text: text.jackknife, severity: 'danger', steady: true },
    now - collisionAt < COLLISION_ALARM_SECONDS && { text: text.collision, severity: 'danger', steady: false },
    instruments.isShifting && { text: text.shifting, severity: 'warning', steady: true },
  ];
  return candidates.filter((alarm): alarm is Alarm => alarm !== false);
}

export class App {
  private readonly store = browserStore();
  private readonly view: SceneView;
  private hud: Hud;
  private readonly menu: Menu;
  private readonly keyboard = new Keyboard(window);
  private readonly gamepad = new GamepadReader(DRIVER_LAYOUT);
  private readonly audio = new CabAudio();
  private session: Session;
  private settings: Settings;
  private best: BestResults;
  private text: Messages;
  private latches = PARKED;
  private lastFrame = 0;
  private isReported = false;
  private isBackdropDrawn = false;
  private collisionAt = -COLLISION_ALARM_SECONDS;
  private collisionsSeen = 0;
  private replay: Replay | null = null;

  constructor() {
    const canvas = requireElement('scene', HTMLCanvasElement);
    this.settings = loadSettings(this.store);
    this.best = loadBestResults(this.store);
    this.text = messagesFor(loadLanguage(this.store));
    translatePage(this.text);
    this.view = new SceneView(canvas, DEFAULT_TRUCK_SPEC);
    this.hud = new Hud(requireElement('hud', HTMLElement), this.text);
    this.menu = new Menu(
      requireElement('overlay', HTMLElement),
      {
        onStart: (mission) => this.start(mission),
        onResume: () => this.resume(),
        onSettings: (settings) => this.applySettings(settings),
        onReplay: () => this.startReplay(),
        onLanguage: (language) => this.applyLanguage(language),
      },
      this.text,
    );
    this.session = this.load('free');
    window.addEventListener('resize', () => {
      this.view.resize();
      this.isBackdropDrawn = false;
    });
    window.addEventListener('pointerdown', () => this.audio.unlock());
    window.addEventListener('keydown', () => this.audio.unlock());
    this.openMenu(false);
  }

  run(): void {
    requestAnimationFrame((time) => this.frame(time));
  }

  private frame(time: number): void {
    const elapsed = Math.min((time - this.lastFrame) / MILLISECONDS, MAX_FRAME_SECONDS);
    this.lastFrame = time;
    const input = mergeInputs(this.keyboard.read(), this.gamepad.read(this.settings));
    input.actions.forEach((action) => this.perform(action));
    if (!this.menu.isOpen) this.advance(elapsed, input);
    this.draw(time);
    this.refresh(input);
    requestAnimationFrame((next) => this.frame(next));
  }

  /** Behind the menu the scene is a still backdrop: it is drawn once, not sixty times a second. */
  private draw(time: number): void {
    if (this.menu.isOpen && this.isBackdropDrawn) return;
    this.isBackdropDrawn = this.menu.isOpen;
    this.view.render(this.shown, time);
  }

  /** The session on screen: the replay while one runs, the live operation otherwise. */
  private get shown(): Session {
    return this.replay?.session ?? this.session;
  }

  private advance(elapsed: number, input: DeviceInput): void {
    if (this.replay === null) {
      this.session.advance(elapsed, this.commandFrom(input));
      if (this.session.progress.collisions > this.collisionsSeen) {
        this.collisionsSeen = this.session.progress.collisions;
        this.collisionAt = this.session.state.time;
      }
      if (this.session.progress.outcome === 'running' || this.isReported) return;
      this.isReported = true;
      return void this.report();
    }
    this.replay.advance(Math.round(elapsed * PHYSICS_RATE_HZ * REPLAY_SPEED));
    if (this.replay.isFinished) this.endReplay();
  }

  private startReplay(): void {
    const { mission, recording } = this.session;
    this.replay = new Replay(mission, DEFAULT_TRUCK_SPEC, recording);
    this.isBackdropDrawn = false;
    this.menu.hide();
    this.hud.visible = true;
  }

  private endReplay(): void {
    this.replay = null;
    this.isBackdropDrawn = false;
    this.report();
  }

  private commandFrom(input: DeviceInput): VehicleCommand {
    return {
      throttle: input.axes.throttle,
      brake: input.axes.brake,
      steer: input.axes.steer,
      fine: input.fine,
      handbrake: this.latches.parkingBrake,
      selector: this.latches.selector,
    };
  }

  private refresh(input: DeviceInput): void {
    const shown = this.shown;
    const instruments = readInstruments(shown, this.commandFrom(input));
    const wasPulled = this.parkBrakePulled;
    this.parkBrakePulled = instruments.parkingBrake;
    this.audio.update({
      rpm: instruments.rpm,
      throttle: input.axes.throttle,
      muted: this.settings.muted,
      horn: input.horn,
      reversing: instruments.reversing && !this.menu.isOpen,
      impact: shown.progress.hardestImpact,
      parkingBrakePulled: instruments.parkingBrake && !wasPulled,
    });
    this.hud.update({
      instruments,
      alarms: alarmsFor(instruments, this.collisionAt, shown.state.time, this.text.alarms),
      elapsed: shown.progress.elapsed,
      hint: this.hint(),
      cameraLabel: this.text.cameras[this.view.cameraMode],
    });
  }

  private parkBrakePulled = false;

  private hint(): string {
    const { hints, progress } = this.text;
    if (this.replay !== null) return hints.replay(REPLAY_SPEED, Math.round(this.replay.progress * 100));
    const session = this.session;
    if (session.state.drivetrain.selector === 'N' && this.latches.selector === 'N') return hints.gear;
    const goal = session.mission.goal;
    if (goal !== null && this.latches.selector !== 'N') {
      const parking = checkParking(session.state.vehicle, goal, session.config.spec);
      if (parking.inside && parking.stopped && !this.latches.parkingBrake) return hints.parkingBrake;
    }
    return progress[session.progress.message];
  }

  private perform(action: Action): void {
    if (action === 'menu' && this.replay !== null) return this.endReplay();
    if (action === 'menu') return this.toggleMenu();
    if (this.replay !== null && action !== 'camera') return;
    if (this.menu.isOpen) return;
    if (action === 'camera') return void this.view.nextCamera();
    if (action === 'restart') return this.start(this.session.mission.id);
    if (action === 'gear') this.latches = { ...this.latches, selector: nextSelector(this.latches.selector) };
    if (action === 'parkingBrake') this.latches = { ...this.latches, parkingBrake: !this.latches.parkingBrake };
  }

  private load(mission: MissionId): Session {
    const session = new Session(missionById(mission), DEFAULT_TRUCK_SPEC);
    this.view.showMission(session.mission);
    this.hud.showMission(session.mission);
    this.latches = PARKED;
    this.isReported = false;
    this.isBackdropDrawn = false;
    this.collisionAt = -COLLISION_ALARM_SECONDS;
    this.collisionsSeen = 0;
    return session;
  }

  private start(mission: MissionId): void {
    this.session = this.load(mission);
    this.resume();
  }

  private resume(): void {
    if (this.isReported) return this.openMenu(false);
    this.menu.hide();
    this.hud.visible = true;
  }

  private toggleMenu(): void {
    if (this.menu.isOpen && !this.isReported) return this.resume();
    this.openMenu(!this.isReported);
  }

  private openMenu(canResume: boolean): void {
    this.hud.visible = false;
    this.menu.showMissions({ best: this.best, settings: this.settings, canResume });
  }

  private report(): void {
    const { mission, progress } = this.session;
    if (progress.outcome === 'success') {
      this.best = recordResult(this.store, mission.id, { score: scoreOf(progress, mission), seconds: progress.elapsed });
    }
    this.hud.visible = false;
    this.menu.showResult(mission, progress, this.best);
  }

  private applySettings(settings: Settings): void {
    this.settings = settings;
    saveSettings(this.store, settings);
  }

  /** The instrument panel is rebuilt in the new language; the menu redraws the screen it is showing. */
  private applyLanguage(language: Language): void {
    if (language === this.text.language) return;
    saveLanguage(this.store, language);
    this.text = messagesFor(language);
    translatePage(this.text);
    this.hud = new Hud(requireElement('hud', HTMLElement), this.text);
    this.hud.showMission(this.session.mission);
    this.menu.translate(this.text);
  }
}
