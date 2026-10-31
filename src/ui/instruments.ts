/** Values shown on the instrument panel, derived from the simulation state. */
import { type Selector } from '../physics/engine';
import type { VehicleCommand } from '../physics/vehicle';
import { msToKmh, radToDeg } from '../physics/units';
import type { Session } from '../sim/session';
import { checkParking } from '../sim/parking';

export type ArticulationLevel = 'normal' | 'warning' | 'danger';

export interface TargetReadout {
  /** Metres left for the trailer rear to reach the zone centre, along the yard. */
  readonly distance: number;
  readonly alignmentDegrees: number;
}

export interface Instruments {
  readonly speedKmh: number;
  /** Dashboard gear: -1 reverse, 0 neutral, 1…8 forward. */
  readonly gear: number;
  readonly selector: Selector;
  readonly rpm: number;
  readonly rpmFraction: number;
  readonly isShifting: boolean;
  readonly reversing: boolean;
  readonly articulationDegrees: number;
  readonly articulationLevel: ArticulationLevel;
  readonly parkingBrake: boolean;
  readonly target: TargetReadout | null;
}

/** Distance between two points, for the target readout. */
const flatDistance = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(bx - ax, bz - az);

export function readInstruments(session: Session, command: VehicleCommand): Instruments {
  const { config, state, mission } = session;
  const telemetry = session.telemetry;
  const goal = mission.goal;
  const target =
    goal === null
      ? null
      : (() => {
          const parking = checkParking(state.vehicle, goal, config.spec);
          return {
            distance: flatDistance(
              state.vehicle.trailer.position.x,
              state.vehicle.trailer.position.z,
              goal.zone.center.x,
              goal.zone.center.z,
            ),
            alignmentDegrees: radToDeg(parking.headingError),
          };
        })();
  const articulation = Math.abs(telemetry.articulation);
  return {
    speedKmh: msToKmh(Math.abs(state.vehicle.tractor.forwardSpeed)),
    gear: telemetry.gear,
    selector: state.drivetrain.selector,
    rpm: telemetry.rpm,
    rpmFraction: telemetry.rpm / config.spec.engine.governorRpm,
    isShifting: telemetry.isShifting,
    reversing: state.drivetrain.selector === 'R' && Math.abs(state.vehicle.tractor.forwardSpeed) > 0.05,
    articulationDegrees: radToDeg(telemetry.articulation),
    articulationLevel:
      articulation >= config.spec.articulation.warning
        ? 'danger'
        : articulation >= config.spec.articulation.warning * 0.7
          ? 'warning'
          : 'normal',
    parkingBrake: command.handbrake,
    target,
  };
}
