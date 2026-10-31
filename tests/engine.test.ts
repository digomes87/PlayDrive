/** Engine, gearbox and steering actuator. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUCK_SPEC } from '../src/truckSpec';
import {
  INITIAL_DRIVETRAIN,
  type DrivetrainState,
  clutchEngagement,
  nextSelector,
  overallRatio,
  stepDrivetrain,
  topGear,
  torqueAtRpm,
  tractiveForce,
} from '../src/physics/engine';
import { ackermann, stepSteering } from '../src/physics/steering';
import { FIXED_STEP, degToRad } from '../src/physics/units';

const spec = DEFAULT_TRUCK_SPEC;

describe('torque curve', () => {
  it('hits the table values at the knots', () => {
    const curve = spec.engine.torqueCurve;
    curve.forEach((point) => expect(torqueAtRpm(curve, point.rpm)).toBeCloseTo(point.newtonMeters, 6));
  });

  it('is monotonic between idle and peak', () => {
    for (let rpm = spec.engine.idleRpm; rpm < 1400; rpm += 50) {
      expect(torqueAtRpm(spec.engine.torqueCurve, rpm + 50)).toBeGreaterThanOrEqual(torqueAtRpm(spec.engine.torqueCurve, rpm) - 1e-6);
    }
  });

  it('cuts off at the governor', () => {
    expect(torqueAtRpm(spec.engine.torqueCurve, spec.engine.governorRpm)).toBeLessThan(400);
  });
});

describe('drivetrain', () => {
  it('is neutral without a gear and negative in reverse', () => {
    expect(overallRatio(spec.engine, { ...INITIAL_DRIVETRAIN, selector: 'N' })).toBe(0);
    expect(overallRatio(spec.engine, { ...INITIAL_DRIVETRAIN, selector: 'R' })).toBeLessThan(0);
    expect(overallRatio(spec.engine, { ...INITIAL_DRIVETRAIN, selector: 'D', gear: 1 })).toBeGreaterThan(0);
  });

  it('engages the clutch through the launch band', () => {
    expect(clutchEngagement(spec.engine, 0)).toBe(0);
    expect(clutchEngagement(spec.engine, spec.engine.launchSpeed)).toBe(1);
    expect(clutchEngagement(spec.engine, spec.engine.launchSpeed / 2)).toBeGreaterThan(0);
    expect(clutchEngagement(spec.engine, spec.engine.launchSpeed * 2)).toBe(1);
  });

  it('delivers no force in neutral and during a shift', () => {
    const neutral = tractiveForce(spec.engine, spec.geometry.wheelRadius, 0, 1, { ...INITIAL_DRIVETRAIN, selector: 'N' });
    expect(neutral.force).toBe(0);
    const shifting: DrivetrainState = { selector: 'D', gear: 2, shiftTimer: 0.2 };
    expect(tractiveForce(spec.engine, spec.geometry.wheelRadius, 2, 1, shifting).force).toBe(0);
  });

  it('pushes backwards in reverse gear', () => {
    const reverse = tractiveForce(spec.engine, spec.geometry.wheelRadius, 0, 1, { ...INITIAL_DRIVETRAIN, selector: 'R' });
    expect(reverse.force).toBeLessThan(0);
    expect(reverse.creep).toBeLessThan(0);
  });

  it('shifts up at the upshift rpm and holds the gear through the interrupt', () => {
    const firstRatio = spec.engine.forwardRatios[0]! * spec.engine.finalDrive;
    const speedForUpshift = (spec.engine.shiftUpRpm * 2 * Math.PI * spec.geometry.wheelRadius) / 60 / firstRatio;
    let drive: DrivetrainState = { selector: 'D', gear: 1, shiftTimer: 0 };
    drive = stepDrivetrain(spec.engine, spec.geometry.wheelRadius, speedForUpshift * 1.02, 1, drive, FIXED_STEP);
    expect(drive.gear).toBe(2);
    expect(drive.shiftTimer).toBeGreaterThan(0);
    const during = stepDrivetrain(spec.engine, spec.geometry.wheelRadius, speedForUpshift * 1.5, 1, drive, FIXED_STEP);
    expect(during.shiftTimer).toBeLessThan(drive.shiftTimer);
  });

  it('cycles the selector R → N → D → R', () => {
    expect(nextSelector('R')).toBe('N');
    expect(nextSelector('N')).toBe('D');
    expect(nextSelector('D')).toBe('R');
  });

  it('never leaves the gear range', () => {
    expect(topGear(spec.engine)).toBe(spec.engine.forwardRatios.length);
  });
});

describe('steering actuator', () => {
  it('reaches full lock no faster than the column rate', () => {
    const seconds = spec.steering.maxAngle / spec.steering.lockRate;
    let angle = 0;
    for (let index = 0; index < Math.ceil(seconds / FIXED_STEP); index += 1) {
      angle = stepSteering(angle, 1, false, spec, FIXED_STEP);
    }
    expect(angle).toBeGreaterThan(spec.steering.maxAngle * 0.98);
    expect(angle).toBeLessThanOrEqual(spec.steering.maxAngle);
  });

  it('returns to centre faster than it locks', () => {
    const half = spec.steering.maxAngle / 2;
    let holding = half;
    let returning = half;
    for (let index = 0; index < 12; index += 1) {
      holding = stepSteering(holding, 1, false, spec, FIXED_STEP);
      returning = stepSteering(returning, 0, false, spec, FIXED_STEP);
    }
    expect(Math.abs(returning - half)).toBeGreaterThan(Math.abs(holding - half));
  });

  it('slows down in fine mode', () => {
    let coarse = 0;
    let fine = 0;
    for (let index = 0; index < 12; index += 1) {
      coarse = stepSteering(coarse, 1, false, spec, FIXED_STEP);
      fine = stepSteering(fine, 1, true, spec, FIXED_STEP);
    }
    expect(fine).toBeLessThan(coarse * spec.fineControlFactor * 1.05);
  });
});

describe('Ackermann geometry', () => {
  it('steers the inner wheel harder on a left turn', () => {
    const angles = ackermann(degToRad(20), spec.geometry.wheelbase, spec.geometry.trackWidth);
    expect(angles.left).toBeGreaterThan(angles.right);
    expect(angles.right).toBeGreaterThan(0);
  });

  it('mirrors on a right turn', () => {
    const angles = ackermann(degToRad(-20), spec.geometry.wheelbase, spec.geometry.trackWidth);
    expect(angles.right).toBeLessThan(angles.left);
    expect(angles.right).toBeLessThan(0);
    expect(angles.left).toBeLessThan(0);
  });
});
