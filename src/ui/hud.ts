/** Instrument panel drawn in HTML over the canvas. */
import type { Messages } from '../i18n/messages';
import type { Mission } from '../sim/missions';
import { element, setData, setText } from './dom';
import type { Instruments } from './instruments';

export interface Alarm {
  readonly text: string;
  readonly severity: 'warning' | 'danger';
  readonly steady: boolean;
}

export interface HudFrame {
  readonly instruments: Instruments;
  readonly alarms: readonly Alarm[];
  readonly elapsed: number;
  readonly hint: string;
  readonly cameraLabel: string;
}

const RPM_SCALE = 1.1;
/** The articulation needle sweeps this many degrees end to end. */
const ARTICULATION_RANGE = 90;

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

const gearLabel = (instruments: Instruments): string =>
  instruments.selector === 'N' ? 'N' : instruments.selector === 'R' ? 'R' : String(instruments.gear);

export class Hud {
  private readonly title = element('h1', 'mission__title');
  private readonly brief = element('p', 'mission__brief');
  private readonly clock = element('div', 'mission__clock figure');
  private readonly hint = element('p', 'mission__hint');
  private readonly alarms = element('ul', 'alarms');
  private readonly camera = element('div', 'camera__mode');
  private readonly speed = element('span');
  private readonly gear = element('span', 'drivetrain__gear figure');
  private readonly rpmFill = element('div', 'bar__fill');
  private readonly articulation = element('span');
  private readonly articulationNeedle = element('div', 'gauge__needle');
  private readonly articulationPanel = element('section', 'articulation panel');
  private readonly brakeLamp = element('span', 'lamp');
  private readonly targetDistance = element('span');
  private readonly targetAlignment = element('span');
  private alarmKey = '';

  /** Builds the panel in one language; a change of language builds a new panel over the old one. */
  constructor(
    private readonly root: HTMLElement,
    private readonly text: Messages,
  ) {
    root.replaceChildren(this.buildMission(), this.alarms, this.buildCamera(), this.buildDrivetrain(), this.buildArticulation(), this.buildTarget());
    this.alarms.setAttribute('role', 'alert');
  }

  set visible(isVisible: boolean) {
    this.root.hidden = !isVisible;
  }

  showMission(mission: Mission): void {
    const { title, briefing } = this.text.missions[mission.id];
    setText(this.title, title);
    setText(this.brief, briefing);
    this.clock.hidden = mission.goal === null;
  }

  update(frame: HudFrame): void {
    const { instruments } = frame;
    setText(this.clock, formatClock(frame.elapsed));
    setText(this.hint, frame.hint);
    setText(this.camera, frame.cameraLabel);
    setText(this.speed, instruments.speedKmh.toFixed(0));
    setText(this.gear, gearLabel(instruments));
    this.rpmFill.style.transform = `scaleX(${Math.min(instruments.rpmFraction / RPM_SCALE, 1).toFixed(3)})`;
    setData(this.root, 'rpm', instruments.rpmFraction > 0.92 ? 'redline' : 'normal');
    setText(this.articulation, instruments.articulationDegrees.toFixed(0));
    const sweep = Math.min(Math.max(instruments.articulationDegrees / ARTICULATION_RANGE, -1), 1);
    this.articulationNeedle.style.left = `${(50 + sweep * 50).toFixed(2)}%`;
    setData(this.articulationPanel, 'level', instruments.articulationLevel);
    setData(this.brakeLamp, 'on', String(instruments.parkingBrake));
    if (instruments.target === null) {
      setText(this.targetDistance, '—');
      setText(this.targetAlignment, '—');
    } else {
      setText(this.targetDistance, instruments.target.distance.toFixed(1));
      setText(this.targetAlignment, Math.abs(instruments.target.alignmentDegrees).toFixed(1));
    }
    this.updateAlarms(frame.alarms);
  }

  /** Rebuilds the list only when the set of alarms changes, so the blink is not restarted. */
  private updateAlarms(alarms: readonly Alarm[]): void {
    const key = alarms.map((alarm) => alarm.text).join('|');
    if (key === this.alarmKey) return;
    this.alarmKey = key;
    const items = alarms.map((alarm) => {
      const steady = alarm.steady ? ' alarm--steady' : '';
      const danger = alarm.severity === 'danger' ? ' alarm--danger' : '';
      return element('li', `alarm${danger}${steady}`, alarm.text);
    });
    this.alarms.replaceChildren(...items);
  }

  private buildMission(): HTMLElement {
    const panel = element('header', 'mission panel');
    panel.append(this.title, this.brief, this.clock, this.hint);
    this.hint.setAttribute('role', 'status');
    return panel;
  }

  private buildCamera(): HTMLElement {
    const panel = element('div', 'camera panel');
    panel.append(element('div', 'label', this.text.hud.camera), this.camera);
    return panel;
  }

  private buildDrivetrain(): HTMLElement {
    const panel = element('section', 'drivetrain panel');
    const speedFigure = element('dd', 'figure drivetrain__speed');
    speedFigure.append(this.speed, element('small', '', 'km/h'));
    const pair = element('dl', 'drivetrain__pair');
    const gearBlock = element('div');
    gearBlock.append(element('dt', 'label', this.text.hud.gear), this.gear);
    const speedBlock = element('div');
    speedBlock.append(element('dt', 'label', this.text.hud.speed), speedFigure);
    pair.append(gearBlock, speedBlock);
    const bar = element('div', 'bar');
    bar.append(this.rpmFill, this.mark(0.85));
    panel.append(pair, element('div', 'label', this.text.hud.rpm), bar);
    return panel;
  }

  private buildArticulation(): HTMLElement {
    const figure = element('span', 'figure');
    figure.append(this.articulation, element('small', '', '°'));
    const gauge = element('div', 'gauge');
    gauge.append(this.articulationNeedle);
    const labels = element('dl', 'articulation__ends');
    labels.append(element('dt', '', '−90°'), element('dd', '', '+90°'));
    this.articulationPanel.append(element('div', 'label', this.text.hud.articulation), figure, gauge, labels);
    return this.articulationPanel;
  }

  private buildTarget(): HTMLElement {
    const panel = element('section', 'target panel');
    const distance = element('dd', 'figure');
    distance.append(this.targetDistance, element('small', '', 'm'));
    const alignment = element('dd', 'figure');
    alignment.append(this.targetAlignment, element('small', '', '°'));
    const pair = element('dl', 'target__pair');
    const distanceBlock = element('div');
    distanceBlock.append(element('dt', 'label', this.text.hud.target), distance);
    const alignmentBlock = element('div');
    alignmentBlock.append(element('dt', 'label', this.text.score.alignment), alignment);
    pair.append(distanceBlock, alignmentBlock);
    const brakeRow = element('div', 'target__brake');
    brakeRow.append(this.brakeLamp, element('span', '', this.text.hud.parkingBrake));
    panel.append(pair, brakeRow);
    return panel;
  }

  private mark(fraction: number): HTMLElement {
    const mark = element('div', 'bar__mark');
    mark.style.left = `${(fraction * 100).toFixed(2)}%`;
    return mark;
  }
}
