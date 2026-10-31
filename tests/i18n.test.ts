/** Both languages carry the same interface, and the catalogue covers every mission. */
import { describe, expect, it } from 'vitest';
import { ENGLISH } from '../src/i18n/english';
import { PORTUGUESE } from '../src/i18n/portuguese';
import { MISSIONS } from '../src/sim/missions';
import type { ScoreCriterion } from '../src/sim/scoring';

const keysOf = (value: unknown): string[] => {
  if (typeof value !== 'object' || value === null) return [];
  /** Translated rows differ by design, so a table only has to have the same shape. */
  if (Array.isArray(value)) return value.map((_, index) => `${index}`);
  return Object.entries(value)
    .sort()
    .flatMap(([key, nested]) => [key, ...keysOf(nested).map((child) => `${key}.${child}`)]);
};

describe('catalogue', () => {
  it('has the same keys in both languages', () => {
    expect(keysOf(PORTUGUESE)).toEqual(keysOf(ENGLISH));
  });

  it('covers every mission', () => {
    MISSIONS.forEach((mission) => {
      expect(ENGLISH.missions[mission.id].title.length).toBeGreaterThan(0);
      expect(PORTUGUESE.missions[mission.id].briefing.length).toBeGreaterThan(0);
    });
  });

  it('covers every score line', () => {
    (['time', 'articulation', 'alignment', 'collisions', 'harshStops'] as const).forEach((criterion: ScoreCriterion) => {
      expect(ENGLISH.score[criterion].length).toBeGreaterThan(0);
      expect(PORTUGUESE.score[criterion].length).toBeGreaterThan(0);
    });
  });

  it('formats the replay hint with speed and progress', () => {
    expect(ENGLISH.hints.replay(4, 62)).toContain('4×');
    expect(PORTUGUESE.hints.replay(4, 62)).toContain('62 %');
  });
});
