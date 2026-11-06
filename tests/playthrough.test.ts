/** Whole missions driven from start to finish by the test autopilot, and the replay behind them. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUCK_SPEC } from '../src/truckSpec';
import { missionById } from '../src/sim/missions';
import { scoreOf } from '../src/sim/scoring';
import { Replay } from '../src/sim/replay';
import { Session } from '../src/sim/session';
import { articulationOf } from '../src/physics/vehicle';
import { FIXED_STEP } from '../src/physics/units';
import { drive } from './autopilot';

const foldHard = (missionId: 'free' | 'dock', seconds: number): Session => {
  const session = new Session(missionById(missionId), DEFAULT_TRUCK_SPEC);
  for (let index = 0; index < Math.round(seconds / FIXED_STEP); index += 1) {
    session.advance(FIXED_STEP, { throttle: 0.4, brake: 0, steer: 1, fine: false, handbrake: false, selector: 'R' });
    if (Math.abs(articulationOf(session.state.vehicle)) > DEFAULT_TRUCK_SPEC.articulation.fail) break;
  }
  return session;
};

describe('jackknife ruling', () => {
  it('fails a mission with a goal when the trailer folds past the limit', () => {
    const session = foldHard('dock', 20);
    expect(Math.abs(articulationOf(session.state.vehicle))).toBeGreaterThan(DEFAULT_TRUCK_SPEC.articulation.fail);
    expect(session.progress.outcome).toBe('failed');
    expect(session.progress.message).toBe('jackknifed');
  });

  it('never raises the failure screen in free training', () => {
    const session = foldHard('free', 20);
    expect(Math.abs(articulationOf(session.state.vehicle))).toBeGreaterThan(DEFAULT_TRUCK_SPEC.articulation.fail);
    expect(session.progress.outcome).toBe('running');
  });
});

describe('dock mission', () => {
  it('is parked by the autopilot without a single collision', () => {
    const session = drive('dock', 240);
    expect(session.progress.outcome).toBe('success');
    expect(session.progress.collisions).toBe(0);
    expect(session.progress.elapsed).toBeLessThan(missionById('dock').parSeconds);
    expect(session.progress.maxArticulation).toBeLessThan(0.2);
    expect(scoreOf(session.progress, session.mission)).toBeGreaterThan(900);
  });

  it('replays to the same outcome from the recorded commands', () => {
    const session = drive('dock', 240);
    const replay = new Replay(session.mission, DEFAULT_TRUCK_SPEC, session.recording);
    for (let guard = 0; guard < 2000 && !replay.isFinished; guard += 1) replay.advance(120);
    expect(replay.isFinished).toBe(true);
    expect(replay.session.progress.outcome).toBe('success');
    expect(replay.session.progress.elapsed).toBeCloseTo(session.progress.elapsed, 6);
    expect(replay.session.progress.collisions).toBe(session.progress.collisions);
    expect(scoreOf(replay.session.progress, replay.session.mission)).toBe(scoreOf(session.progress, session.mission));
  });

  it('records one command per simulated step', () => {
    const session = drive('dock', 240);
    expect(session.recording.commands.length).toBe(Math.round(session.progress.elapsed * 120));
  });
});
