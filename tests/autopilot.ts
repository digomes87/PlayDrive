/** A reverse-docking driver used by the playthrough tests: holds the line, stops, pulls the brake. */
import { DEFAULT_TRUCK_SPEC } from '../src/truckSpec';
import type { Box, VehicleCommand, VehicleState } from '../src/physics/vehicle';
import { trailerBox } from '../src/physics/vehicle';
import { wrapAngle, FIXED_STEP } from '../src/physics/units';
import { dot, fromAngle, perp, subtract } from '../src/physics/vec2';
import type { Mission, MissionId } from '../src/sim/missions';
import { missionById } from '../src/sim/missions';
import { Session } from '../src/sim/session';

const LINE_GAIN = 0.05;
const LINE_CLAMP = 0.35;
const STEER_GAIN = 2.6;
const YAW_DAMPING = 1.1;
const SETTLE_DISTANCE = 0.38;
const CRAWL_SPEED = 0.28;

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/** How far the trailer box centre still is from the zone centre, measured backwards along the zone axis. */
function distanceBehind(state: VehicleState, zone: Box): number {
  const box = trailerBox(state, DEFAULT_TRUCK_SPEC);
  const toZone = subtract(zone.center, box.center);
  return -dot(toZone, fromAngle(zone.heading));
}

/** Lateral offset of the trailer from the zone axis, positive to the axis's left. */
function lateralError(state: VehicleState, zone: Box): number {
  const box = trailerBox(state, DEFAULT_TRUCK_SPEC);
  return dot(subtract(zone.center, box.center), perp(fromAngle(zone.heading)));
}

/** Pure-pursuit in reverse: line up from afar, then hold the heading and crawl in. */
export function autopilotCommand(state: VehicleState, mission: Mission, settled: boolean): VehicleCommand {
  const goal = mission.goal;
  if (goal === null) return { throttle: 0, brake: 0, steer: 0, fine: false, handbrake: false, selector: 'N' };
  const distance = distanceBehind(state, goal.zone);
  if (settled || distance < SETTLE_DISTANCE) {
    const stopped = Math.abs(state.tractor.forwardSpeed) < 0.06;
    return { throttle: 0, brake: stopped ? 0 : 1, steer: 0, fine: false, handbrake: stopped, selector: 'R' };
  }
  const lineShare = clamp((distance - 10) / 8, 0, 1);
  const desiredHeading = goal.zone.heading - clamp(LINE_GAIN * lateralError(state, goal.zone), -LINE_CLAMP, LINE_CLAMP) * lineShare;
  const headingError = wrapAngle(desiredHeading - state.trailer.heading);
  /** Reversing: steering left rotates the trailer left through the hitch, so the law keeps its sign. */
  const articulation = wrapAngle(state.trailer.heading - state.tractor.heading);
  const runaway = Math.abs(articulation) > 0.5 ? 1.5 * (articulation - 0.5 * Math.sign(articulation)) : 0;
  const steer = clamp(STEER_GAIN * headingError - YAW_DAMPING * state.trailer.yawRate - runaway, -1, 1);
  const speed = Math.abs(state.tractor.forwardSpeed);
  const target = clamp(0.14 * distance, CRAWL_SPEED, 2.0);
  return {
    throttle: clamp((target - speed) * 1.5, 0, 0.6),
    brake: speed > target * 1.6 ? 0.7 : 0,
    steer,
    fine: false,
    handbrake: false,
    selector: 'R',
  };
}

/** Pulls straight ahead for a moment when reversing gets stuck against an obstacle. */
export function pullForwardCommand(state: VehicleState): VehicleCommand {
  return {
    throttle: 0.3,
    brake: 0,
    steer: clamp(-wrapAngle(state.trailer.heading - state.tractor.heading) * 2, -1, 1),
    fine: false,
    handbrake: false,
    selector: 'D',
  };
}

/** Drives one mission from start to outcome; returns the session when it closes. */
export function drive(mission: MissionId, maxSeconds: number): Session {
  const session = new Session(missionById(mission), DEFAULT_TRUCK_SPEC);
  let settled = false;
  let stuckFor = 0;
  let pullingUntil = -1;
  for (let index = 0; index < Math.round(maxSeconds / FIXED_STEP); index += 1) {
    const now = index * FIXED_STEP;
    const command = autopilotCommand(session.state.vehicle, session.mission, settled);
    /** Wedged: pushing in reverse but going nowhere. Then, like a real driver, pull ahead. */
    const wedged = !settled && command.throttle > 0.2 && Math.abs(session.state.vehicle.tractor.forwardSpeed) < 0.04;
    stuckFor = wedged ? stuckFor + FIXED_STEP : 0;
    session.advance(FIXED_STEP, now < pullingUntil ? pullForwardCommand(session.state.vehicle) : command);
    if (stuckFor > 1.2 && now >= pullingUntil) {
      pullingUntil = now + 1.6;
      stuckFor = 0;
    }
    const goal = session.mission.goal;
    const distance = goal === null ? 0 : distanceBehind(session.state.vehicle, goal.zone);
    if (distance < SETTLE_DISTANCE) settled = true;
    if (session.progress.outcome !== 'running') break;
  }
  return session;
}

