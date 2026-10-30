/**
 * Single source of truth for the truck. Every reference value of the simulator lives here.
 * All quantities are SI (m, kg, s, N, rad) unless the name says otherwise.
 * A Brazilian 3-axle tractor (6×4) pulling a two-axle dry box semi-trailer.
 */
import { degToRad } from './physics/units';

export interface TorquePoint {
  readonly rpm: number;
  readonly newtonMeters: number;
}

export interface TruckSpec {
  readonly geometry: {
    /** Front axle to rear tandem centre, m. */
    readonly wheelbase: number;
    readonly cgToFrontAxle: number;
    readonly cgToRearAxle: number;
    /** Fifth wheel, slightly ahead of the tandem centre, m behind the tractor CG. */
    readonly cgToFifthWheel: number;
    readonly trackWidth: number;
    readonly wheelRadius: number;
    /** Collision box of the tractor, m. */
    readonly tractorLength: number;
    readonly tractorWidth: number;
    /** Longitudinal offset of the box centre ahead of the tractor CG, m. */
    readonly tractorBoxOffset: number;
    readonly trailerLength: number;
    readonly trailerWidth: number;
    /** Longitudinal offset of the box centre ahead of the trailer CG, m. */
    readonly trailerBoxOffset: number;
    /** Kingpin to trailer CG and trailer CG to axle centre, m. */
    readonly kingpinToTrailerCg: number;
    readonly trailerCgToAxle: number;
    /** CG heights, used only for longitudinal load transfer, m. */
    readonly tractorCgHeight: number;
    readonly trailerCgHeight: number;
  };
  readonly masses: {
    readonly tractor: number;
    readonly trailer: number;
    /** Yaw inertias about the respective CG, kg·m². */
    readonly tractorYawInertia: number;
    readonly trailerYawInertia: number;
  };
  readonly steering: {
    readonly maxAngle: number;
    /** Steering rate towards full lock, rad/s, and the faster return to centre. */
    readonly lockRate: number;
    readonly returnFactor: number;
  };
  readonly tyres: {
    /** Friction coefficient on dry asphalt. */
    readonly mu: number;
    /** Lateral slip speed at which an axle reaches full friction, m/s. */
    readonly saturationSpeed: number;
  };
  readonly engine: {
    readonly idleRpm: number;
    readonly governorRpm: number;
    readonly torqueCurve: readonly TorquePoint[];
    /** Forward gear ratios, low to high, final drive and the (positive) reverse ratio. */
    readonly forwardRatios: readonly number[];
    readonly finalDrive: number;
    readonly reverseRatio: number;
    readonly efficiency: number;
    /** Clutch engagement band and how much torque a slipping clutch passes. */
    readonly launchSpeed: number;
    readonly launchFactor: number;
    /** Creep force in gear with the brakes released, N (the truck wants to walk in 1st). */
    readonly creepForce: number;
    readonly engineBrakeTorque: number;
    readonly shiftSeconds: number;
    readonly shiftUpRpm: number;
    readonly shiftDownRpm: number;
  };
  readonly brakes: {
    /** Total service brake force at full pedal, N; split across the axles below. */
    readonly serviceForce: number;
    readonly frontShare: number;
    readonly tractorRearShare: number;
    readonly trailerShare: number;
    /** Parking brake force on the tractor rear axle, N. */
    readonly parkingForce: number;
  };
  readonly hitch: {
    /** Fifth wheel as a stiff, near-critical spring-damper joint. */
    readonly stiffness: number;
    readonly damping: number;
    /** Hard clamp of the articulation angle to keep free play finite, rad. */
    readonly contactAngle: number;
  };
  readonly articulation: {
    readonly warning: number;
    readonly fail: number;
  };
  readonly drag: {
    readonly rollingCoefficient: number;
    /** Cd·A of the combination, m². */
    readonly dragArea: number;
  };
  readonly fineControlFactor: number;
}

export const DEFAULT_TRUCK_SPEC: TruckSpec = {
  geometry: {
    wheelbase: 3.8,
    cgToFrontAxle: 2.0,
    cgToRearAxle: 1.8,
    cgToFifthWheel: 1.65,
    trackWidth: 2.4,
    wheelRadius: 0.55,
    tractorLength: 6.4,
    tractorWidth: 2.55,
    tractorBoxOffset: 0.1,
    trailerLength: 9.8,
    trailerWidth: 2.6,
    trailerBoxOffset: -0.2,
    kingpinToTrailerCg: 3.2,
    trailerCgToAxle: 3.8,
    tractorCgHeight: 1.0,
    trailerCgHeight: 1.8,
  },
  masses: { tractor: 7500, trailer: 8000, tractorYawInertia: 28_000, trailerYawInertia: 60_000 },
  steering: { maxAngle: degToRad(45), lockRate: degToRad(25), returnFactor: 1.6 },
  tyres: { mu: 0.85, saturationSpeed: 0.6 },
  engine: {
    idleRpm: 600,
    governorRpm: 1900,
    torqueCurve: [
      { rpm: 600, newtonMeters: 1150 },
      { rpm: 1000, newtonMeters: 1750 },
      { rpm: 1100, newtonMeters: 2100 },
      { rpm: 1400, newtonMeters: 2100 },
      { rpm: 1700, newtonMeters: 1700 },
      { rpm: 1900, newtonMeters: 300 },
      { rpm: 2000, newtonMeters: 0 },
    ],
    forwardRatios: [9.0, 6.7, 5.0, 3.75, 2.8, 2.1, 1.55, 1.15],
    finalDrive: 3.9,
    reverseRatio: 8.0,
    efficiency: 0.95,
    launchSpeed: 1.5,
    launchFactor: 0.6,
    creepForce: 2500,
    engineBrakeTorque: 350,
    shiftSeconds: 0.5,
    shiftUpRpm: 1600,
    shiftDownRpm: 950,
  },
  brakes: {
    serviceForce: 95_000,
    frontShare: 0.3,
    tractorRearShare: 0.45,
    trailerShare: 0.25,
    parkingForce: 45_000,
  },
  hitch: { stiffness: 5.0e7, damping: 8.8e5, contactAngle: degToRad(88) },
  articulation: { warning: degToRad(55), fail: degToRad(80) },
  drag: { rollingCoefficient: 0.008, dragArea: 6.0 },
  fineControlFactor: 0.25,
};
