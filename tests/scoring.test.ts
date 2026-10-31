/** Score arithmetic and the persistence layer. */
import { describe, expect, it } from 'vitest';
import { missionById } from '../src/sim/missions';
import { INITIAL_PROGRESS, type Progress } from '../src/sim/progress';
import { SCORING, scoreLines, scoreOf } from '../src/sim/scoring';
import { degToRad } from '../src/physics/units';

describe('scoring', () => {
  const mission = missionById('dock');

  const withProgress = (patch: Partial<Progress>): Progress => ({ ...INITIAL_PROGRESS, ...patch });

  it('gives a clean run within par almost everything', () => {
    const clean = withProgress({ outcome: 'success', elapsed: 60, finalHeadingError: degToRad(1) });
    expect(scoreOf(clean, mission)).toBeGreaterThanOrEqual(SCORING.maximum - 20);
  });

  it('never rewards a failed run', () => {
    expect(scoreOf(withProgress({ outcome: 'failed' }), mission)).toBe(0);
    expect(scoreOf(withProgress({ outcome: 'running' }), mission)).toBe(0);
  });

  it('charges overtime by the second', () => {
    const fast = withProgress({ outcome: 'success', elapsed: mission.parSeconds, finalHeadingError: 0 });
    const slow = withProgress({ outcome: 'success', elapsed: mission.parSeconds + 10, finalHeadingError: 0 });
    expect(scoreOf(fast, mission) - scoreOf(slow, mission)).toBeCloseTo(10 * SCORING.perSecondOverPar, 0);
  });

  it('charges collisions one by one', () => {
    const hit = withProgress({ outcome: 'success', collisions: 2, finalHeadingError: 0 });
    expect(scoreOf(hit, mission)).toBeLessThan(SCORING.maximum - 2 * SCORING.perCollision + 1);
  });

  it('leaves ordinary manoeuvring articulation free', () => {
    const lines = scoreLines(withProgress({ outcome: 'success', maxArticulation: degToRad(20) }), mission);
    expect(lines.find((line) => line.criterion === 'articulation')!.penalty).toBe(0);
  });

  it('is floored at zero', () => {
    const disaster = withProgress({ outcome: 'success', elapsed: 3000, collisions: 9 });
    expect(scoreOf(disaster, mission)).toBe(0);
  });
});
