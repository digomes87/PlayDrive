/** Mission score from the telemetry: time, articulation, alignment, collisions, harsh stops. */
import { degToRad, radToDeg } from '../physics/units';
import type { Mission } from './missions';
import type { Progress } from './progress';

export const SCORING = {
  maximum: 1000,
  perSecondOverPar: 2,
  /** Articulation below this is ordinary manoeuvring and costs nothing, rad. */
  freeArticulation: degToRad(25),
  perArticulationDegree: 8,
  perAlignmentDegree: 5,
  perCollision: 150,
  perHarshStop: 20,
} as const;

export type ScoreCriterion = 'time' | 'articulation' | 'alignment' | 'collisions' | 'harshStops';

export interface ScoreLine {
  readonly criterion: ScoreCriterion;
  readonly value: string;
  readonly penalty: number;
}

export function scoreLines(progress: Progress, mission: Mission): readonly ScoreLine[] {
  const overtime = Math.max(0, progress.elapsed - mission.parSeconds);
  const articulationDegrees = Math.max(0, radToDeg(progress.maxArticulation) - radToDeg(SCORING.freeArticulation));
  const alignmentDegrees = radToDeg(progress.outcome === 'success' ? progress.finalHeadingError : 0);
  return [
    { criterion: 'time', value: `${progress.elapsed.toFixed(0)} s`, penalty: overtime * SCORING.perSecondOverPar },
    { criterion: 'articulation', value: `${radToDeg(progress.maxArticulation).toFixed(0)}°`, penalty: articulationDegrees * SCORING.perArticulationDegree },
    { criterion: 'alignment', value: `${alignmentDegrees.toFixed(1)}°`, penalty: alignmentDegrees * SCORING.perAlignmentDegree },
    { criterion: 'collisions', value: `${progress.collisions}`, penalty: progress.collisions * SCORING.perCollision },
    { criterion: 'harshStops', value: `${progress.harshStops}`, penalty: progress.harshStops * SCORING.perHarshStop },
  ];
}

export function scoreOf(progress: Progress, mission: Mission): number {
  if (progress.outcome !== 'success') return 0;
  const penalties = scoreLines(progress, mission).reduce((total, line) => total + line.penalty, 0);
  return Math.round(Math.min(Math.max(SCORING.maximum - penalties, 0), SCORING.maximum));
}
