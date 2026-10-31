/** Mission catalogue for v1. The daily round of a delivery driver, from warm-up to tight docks. */
import type { StartPose } from '../physics/vehicle';
import { degToRad } from '../physics/units';
import { vec2 } from '../physics/vec2';
import type { ParkGoal } from './parking';
import { type Site, parkZone, siteById } from './site';

export type MissionId = 'free' | 'dock' | 'alley' | 'parallel' | 'slalom' | 'gate';

export interface Mission {
  readonly id: MissionId;
  readonly site: Site;
  readonly start: StartPose;
  readonly goal: ParkGoal | null;
  /** Reference time for scoring, seconds. */
  readonly parSeconds: number;
}

export const MISSIONS: readonly Mission[] = [
  {
    id: 'free',
    site: siteById('yard'),
    start: { position: vec2(0, -10), heading: degToRad(90) },
    goal: null,
    parSeconds: 0,
  },
  {
    id: 'dock',
    site: siteById('dock'),
    start: { position: vec2(1.2, 30), heading: degToRad(90) },
    goal: { zone: parkZone(vec2(0, -1.6), 90, 0.4), holdSeconds: 1.5 },
    parSeconds: 120,
  },
  {
    id: 'alley',
    site: siteById('alley'),
    start: { position: vec2(0, -6), heading: degToRad(90) },
    goal: { zone: parkZone(vec2(21.1, 23.4), 180, 0.3), holdSeconds: 1.5 },
    parSeconds: 240,
  },
  {
    id: 'parallel',
    site: siteById('street'),
    start: { position: vec2(-26, 2), heading: 0 },
    goal: { zone: parkZone(vec2(-4.9, 5.7), 0, 0.3), holdSeconds: 1.5 },
    parSeconds: 200,
  },
  {
    id: 'slalom',
    site: siteById('slalom'),
    start: { position: vec2(0, 26), heading: degToRad(90) },
    goal: { zone: parkZone(vec2(0, -22), 90, 0.35), holdSeconds: 1.5 },
    parSeconds: 240,
  },
  {
    id: 'gate',
    site: siteById('gates'),
    start: { position: vec2(-35, 0), heading: 0 },
    goal: { zone: parkZone(vec2(17, 0), 180, 0.35), holdSeconds: 1.5 },
    parSeconds: 300,
  },
];

export const missionById = (id: MissionId): Mission => MISSIONS.find((mission) => mission.id === id) ?? MISSIONS[0]!;
