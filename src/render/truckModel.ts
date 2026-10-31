/** Procedural tractor and dry box trailer: boxes, cylinders and wheels that steer and roll. */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import type { TruckSpec } from '../truckSpec';
import { ackermann } from '../physics/steering';
import { PALETTE } from './palette';

const material = (colour: number, rough = 0.7): MeshStandardMaterial => new MeshStandardMaterial({ color: colour, roughness: rough });

const box = (length: number, width: number, height: number): BoxGeometry => new BoxGeometry(length, height, width);

interface Wheel {
  readonly pivot: Object3D;
  readonly mesh: Mesh;
}

/** One wheel: a faceted tyre and hub so the rolling shows, on a pivot that steers. */
function buildWheel(spec: TruckSpec): Wheel {
  const tyre = new CylinderGeometry(spec.geometry.wheelRadius, spec.geometry.wheelRadius, 0.42, 14);
  tyre.rotateX(Math.PI / 2);
  const hubRadius = spec.geometry.wheelRadius * 0.55;
  const hub = new CylinderGeometry(hubRadius, hubRadius, 0.46, 6);
  hub.rotateX(Math.PI / 2);
  const mesh = new Mesh(tyre, material(PALETTE.wheels, 0.9));
  const cap = new Mesh(hub, material(PALETTE.hub, 0.4));
  mesh.add(cap);
  mesh.castShadow = true;
  const pivot = new Group();
  pivot.add(mesh);
  return { pivot, mesh };
}

export interface TruckPose {
  readonly tractor: { readonly position: { readonly x: number; readonly z: number }; readonly heading: number };
  readonly trailer: { readonly position: { readonly x: number; readonly z: number }; readonly heading: number };
  readonly steering: number;
}

export interface TruckModel {
  readonly root: Group;
  update(pose: TruckPose, forwardSpeed: number, deltaSeconds: number): void;
}

const TRAILER_AXLE_GAP = 1.3;
const TRACTOR_TANDEM_GAP = 1.3;
const WHEEL_INSET = 1.1;
const GROUND_TO_CHASSIS = 0.95;

export function buildTruck(spec: TruckSpec): TruckModel {
  const root = new Group();
  const g = spec.geometry;
  const frontWheels: Wheel[] = [];
  const rearWheels: Wheel[] = [];
  const trailerWheels: Wheel[] = [];

  const tractor = new Group();
  const chassis = new Mesh(box(g.tractorLength - 0.5, 1.0, 0.4), material(PALETTE.tractorChassis, 0.8));
  chassis.position.y = GROUND_TO_CHASSIS;
  const deck = new Mesh(box(g.tractorLength - 2.6, 2.3, 0.25), material(PALETTE.tractorChassis, 0.8));
  deck.position.set(-1.1, 1.12, 0);
  const cab = new Mesh(box(2.3, 2.44, 2.35), material(PALETTE.tractorCab, 0.5));
  cab.position.set(2.0, 2.25, 0);
  const windshield = new Mesh(box(0.1, 2.2, 2.0), material(PALETTE.glass, 0.15));
  windshield.position.set(3.16, 2.5, 0);
  const roof = new Mesh(box(2.44, 0.12, 2.5), material(PALETTE.tractorChassis, 0.6));
  roof.position.set(2.0, 3.48, 0);
  const bumper = new Mesh(box(0.35, 2.4, 0.55), material(PALETTE.chrome, 0.35));
  bumper.position.set(3.35, 0.75, 0);
  const grille = new Mesh(box(0.12, 2.2, 1.7), material(PALETTE.tractorChassis, 0.5));
  grille.position.set(3.18, 1.35, 0);
  const fifthWheelPlate = new Mesh(box(0.9, 2.0, 0.12), material(PALETTE.tractorChassis, 0.6));
  fifthWheelPlate.position.set(-g.cgToFifthWheel, 1.24, 0);
  const exhaust = new Mesh(new CylinderGeometry(0.09, 0.09, 2.6, 10), material(PALETTE.chrome, 0.3));
  exhaust.position.set(0.9, 2.6, -1.25);
  const fuelLeft = new Mesh(new CylinderGeometry(0.38, 0.38, 1.5, 12), material(PALETTE.chrome, 0.35));
  fuelLeft.rotation.x = Math.PI / 2;
  fuelLeft.position.set(-0.4, 0.85, -1.0);
  const fuelRight = fuelLeft.clone();
  fuelRight.position.z = 1.0;
  [chassis, deck, cab, roof, bumper, grille, fifthWheelPlate, exhaust, fuelLeft].forEach((part) => {
    part.castShadow = true;
  });
  tractor.add(chassis, deck, cab, windshield, roof, bumper, grille, fifthWheelPlate, exhaust, fuelLeft, fuelRight);

  [-1, 1].forEach((side) => {
    const front = buildWheel(spec);
    front.pivot.position.set(g.cgToFrontAxle, spec.geometry.wheelRadius, side * WHEEL_INSET);
    tractor.add(front.pivot);
    frontWheels.push(front);
    [g.cgToRearAxle - TRACTOR_TANDEM_GAP / 2, g.cgToRearAxle + TRACTOR_TANDEM_GAP / 2].forEach((along) => {
      const wheel = buildWheel(spec);
      wheel.pivot.position.set(-along, spec.geometry.wheelRadius, side * WHEEL_INSET);
      tractor.add(wheel.pivot);
      rearWheels.push(wheel);
    });
    const guard = new Mesh(box(TRACTOR_TANDEM_GAP + 0.9, 2.5, 0.12), material(PALETTE.tractorChassis, 0.8));
    guard.position.set(-g.cgToRearAxle, 1.35, side * 1.28);
    tractor.add(guard);
  });

  const trailer = new Group();
  const bodyLength = g.trailerLength;
  const bodyCentre = g.trailerBoxOffset;
  const body = new Mesh(box(bodyLength, g.trailerWidth, 2.85), material(PALETTE.trailerBox, 0.65));
  body.position.set(bodyCentre, 2.6, 0);
  const roofTrim = new Mesh(box(bodyLength, g.trailerWidth + 0.06, 0.1), material(PALETTE.trailerRoof, 0.7));
  roofTrim.position.set(bodyCentre, 4.06, 0);
  const skirt = new Mesh(box(bodyLength - 1.4, g.trailerWidth - 0.1, 0.5), material(PALETTE.trailerRoof, 0.7));
  skirt.position.set(bodyCentre, 1.28, 0);
  const doorPanel = new Mesh(box(0.1, g.trailerWidth - 0.2, 2.6), material(PALETTE.trailerRoof, 0.6));
  doorPanel.position.set(bodyCentre - bodyLength / 2 + 0.08, 2.6, 0);
  const kingpinGear = new Mesh(box(1.4, 0.5, 0.25), material(PALETTE.tractorChassis, 0.8));
  kingpinGear.position.set(g.kingpinToTrailerCg - 1.0, 1.05, 0);
  [body, roofTrim, skirt, doorPanel].forEach((part) => {
    part.castShadow = true;
  });
  trailer.add(body, roofTrim, skirt, doorPanel, kingpinGear);
  [-1, 1].forEach((side) => {
    const leg = new Mesh(new CylinderGeometry(0.07, 0.07, 1.1, 8), material(PALETTE.tractorChassis, 0.7));
    leg.position.set(g.kingpinToTrailerCg - 2.2, 0.55, side * 0.8);
    trailer.add(leg);
    [g.trailerCgToAxle - TRAILER_AXLE_GAP / 2, g.trailerCgToAxle + TRAILER_AXLE_GAP / 2].forEach((behind) => {
      const wheel = buildWheel(spec);
      wheel.pivot.position.set(-behind, spec.geometry.wheelRadius, side * WHEEL_INSET);
      trailer.add(wheel.pivot);
      trailerWheels.push(wheel);
    });
  });

  root.add(tractor, trailer);

  let roll = 0;
  return {
    root,
    update(pose, forwardSpeed, deltaSeconds) {
      roll -= (forwardSpeed / spec.geometry.wheelRadius) * deltaSeconds;
      tractor.position.set(pose.tractor.position.x, 0, pose.tractor.position.z);
      tractor.rotation.y = -pose.tractor.heading;
      trailer.position.set(pose.trailer.position.x, 0, pose.trailer.position.z);
      trailer.rotation.y = -pose.trailer.heading;
      const angles = ackermann(pose.steering, g.wheelbase, g.trackWidth);
      frontWheels.forEach((wheel) => {
        const left = wheel.pivot.position.z > 0;
        wheel.pivot.rotation.y = -(left ? angles.left : angles.right);
        wheel.mesh.rotation.z = roll;
      });
      [...rearWheels, ...trailerWheels].forEach((wheel) => {
        wheel.mesh.rotation.z = roll;
      });
    },
  };
}
