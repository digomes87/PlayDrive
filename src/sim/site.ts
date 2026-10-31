/** The static world of each mission: walls, dock buildings, parked trailers and cones. */
import { DEFAULT_TRUCK_SPEC } from '../truckSpec';
import type { Box } from '../physics/vehicle';
import { type Vec2, fromAngle, scale, vec2 } from '../physics/vec2';
import { degToRad } from '../physics/units';

export type ObstacleKind = 'building' | 'wall' | 'trailer' | 'cone';

export interface Obstacle {
  readonly box: Box;
  readonly kind: ObstacleKind;
  /** For the 3D view, m. */
  readonly height: number;
}

export type SiteId = 'yard' | 'dock' | 'alley' | 'street' | 'gates' | 'slalom';

export interface Site {
  readonly id: SiteId;
  readonly obstacles: readonly Obstacle[];
}

const TRAILER = DEFAULT_TRUCK_SPEC.geometry;
/** Distance from a trailer's rear edge to its box centre, and to its centre of gravity. */
const REAR_TO_BOX = TRAILER.trailerLength / 2;
const REAR_TO_CG = TRAILER.trailerLength / 2 - TRAILER.trailerBoxOffset;

export function wall(x1: number, z1: number, x2: number, z2: number, height = 2.6): Obstacle {
  const run = Math.hypot(x2 - x1, z2 - z1);
  return {
    box: {
      center: vec2((x1 + x2) / 2, (z1 + z2) / 2),
      heading: Math.atan2(z2 - z1, x2 - x1),
      halfLength: run / 2,
      halfWidth: 0.4,
    },
    kind: 'wall',
    height,
  };
}

/** A dock building: a thick block whose long face is the loading wall. */
function building(x1: number, z1: number, x2: number, z2: number): Obstacle {
  return { ...wall(x1, z1, x2, z2, 7), kind: 'building', box: { ...wall(x1, z1, x2, z2).box, halfWidth: 3 } };
}

const cone = (x: number, z: number): Obstacle => ({
  box: { center: vec2(x, z), heading: 0, halfLength: 0.28, halfWidth: 0.28 },
  kind: 'cone',
  height: 0.7,
});

/** A dry box trailer parked with its rear edge at `rear`, nose pointing `headingDegrees`. */
export function parkedTrailer(rear: Vec2, headingDegrees: number): Obstacle {
  const heading = degToRad(headingDegrees);
  const offset = scale(fromAngle(heading), REAR_TO_BOX);
  return {
    box: {
      center: { x: rear.x + offset.x, z: rear.z + offset.z },
      heading,
      halfLength: TRAILER.trailerLength / 2,
      halfWidth: TRAILER.trailerWidth / 2,
    },
    kind: 'trailer',
    height: 3.8,
  };
}

/** Where a trailer parked with its rear at `rear` has its centre of gravity. */
export function parkedCentre(rear: Vec2, headingDegrees: number): Vec2 {
  const heading = degToRad(headingDegrees);
  const offset = scale(fromAngle(heading), REAR_TO_CG);
  return { x: rear.x + offset.x, z: rear.z + offset.z };
}

/** Target rectangle for a trailer parked with its rear at `rear`, with the given slack. */
export function parkZone(rear: Vec2, headingDegrees: number, slack = 0.35): Box {
  const heading = degToRad(headingDegrees);
  const offset = scale(fromAngle(heading), REAR_TO_BOX);
  return {
    center: { x: rear.x + offset.x, z: rear.z + offset.z },
    heading,
    halfLength: TRAILER.trailerLength / 2 + slack,
    halfWidth: TRAILER.trailerWidth / 2 + slack,
  };
}

/** Open training yard: a dock to the south, cones, nothing to lose. */
const YARD: Site = {
  id: 'yard',
  obstacles: [
    building(-26, -5, 26, -5),
    parkedTrailer(vec2(-8.6, -1.6), 90),
    parkedTrailer(vec2(8.6, -1.6), 90),
    cone(-4, 6),
    cone(4, 10),
    cone(-2, 16),
    cone(10, 20),
    wall(-30, 26, 30, 26),
    wall(30, -4, 30, 26),
    wall(-30, -4, -30, 26),
  ],
};

/** Loading dock with two parked neighbours and one free bay in the middle. */
const DOCK: Site = {
  id: 'dock',
  obstacles: [
    building(-24, -5, 24, -5),
    parkedTrailer(vec2(-3.1, -1.6), 90),
    parkedTrailer(vec2(3.1, -1.6), 90),
    parkedTrailer(vec2(-9.3, -1.6), 90),
    parkedTrailer(vec2(9.3, -1.6), 90),
    wall(-28, 34, 28, 34),
    wall(28, -4, 28, 34),
    wall(-28, -4, -28, 34),
  ],
};

/** Alley dock: drive north up the lane, then back east into the alley between the walls. */
const ALLEY: Site = {
  id: 'alley',
  obstacles: [
    wall(6, 26, 44, 26),
    wall(6, 18, 30, 18),
    wall(-6, -22, -6, 26),
    wall(6, -22, 6, 12),
    parkedTrailer(vec2(36, 23.4), 180),
    parkedTrailer(vec2(36, 20.6), 180),
  ],
};

/** Loading street: parallel park in the gap between two trailers along the wall. */
const STREET: Site = {
  id: 'street',
  obstacles: [
    building(-32, 10, 32, 10),
    parkedTrailer(vec2(-17.05, 5.7), 0),
    parkedTrailer(vec2(7.25, 5.7), 0),
    wall(-32, -8, 32, -8, 0.9),
    wall(34, -8, 34, 10),
  ],
};

/** Reverse slalom: offset cone gates on the way south. */
const SLALOM: Site = {
  id: 'slalom',
  obstacles: [
    ...[-2.5, 2.5, -2.5].flatMap((offset, index) => {
      const z = 12 - index * 10;
      return [cone(offset - 2.7, z), cone(offset + 2.7, z)];
    }),
    wall(-16, 30, 16, 30),
    wall(-16, -26, 16, -26),
  ],
};

/** The gate: thread the opening, then back east into the courtyard door. */
const GATES: Site = {
  id: 'gates',
  obstacles: [
    wall(-16, -40, -16, -1.7, 3),
    wall(-16, 1.7, -16, 40, 3),
    wall(-16, -40, 30, -40),
    wall(30, -40, 30, 40),
    wall(-16, 40, 30, 40),
    building(20, -8, 20, 8),
    parkedTrailer(vec2(17, -3.1), 180),
    parkedTrailer(vec2(17, 3.1), 180),
  ],
};

export const SITES: Readonly<Record<SiteId, Site>> = {
  yard: YARD,
  dock: DOCK,
  alley: ALLEY,
  street: STREET,
  gates: GATES,
  slalom: SLALOM,
};

export const siteById = (id: SiteId): Site => SITES[id];
