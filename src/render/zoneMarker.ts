/** Target bay: a painted rectangle plus corner posts, so it reads from every camera. */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three';
import type { Box } from '../physics/vehicle';
import { PALETTE } from './palette';

const PAINT_GAP = 0.04;
const POST_HEIGHT = 1.1;
const POST_RADIUS = 0.07;

export function buildZoneMarker(zone: Box): Group {
  const paint = new Mesh(
    new PlaneGeometry(zone.halfLength * 2, zone.halfWidth * 2),
    new MeshBasicMaterial({ color: PALETTE.zone, transparent: true, opacity: 0.14, depthWrite: false }),
  );
  paint.rotation.x = -Math.PI / 2;
  const marker = new Group();
  marker.add(paint);
  const postMaterial = new MeshStandardMaterial({ color: PALETTE.zone, roughness: 0.5 });
  const signs: readonly [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  signs.forEach(([along, across]) => {
    const post = new Mesh(new CylinderGeometry(POST_RADIUS, POST_RADIUS, POST_HEIGHT, 8), postMaterial);
    post.position.set(along * zone.halfLength, POST_HEIGHT / 2, across * zone.halfWidth);
    post.castShadow = true;
    marker.add(post);
  });
  const board = new Mesh(new BoxGeometry(0.5, 0.3, 0.05), postMaterial);
  board.position.set(0, POST_HEIGHT + 0.5, 0);
  board.castShadow = true;
  marker.add(board);
  marker.position.set(zone.center.x, PAINT_GAP, zone.center.z);
  marker.rotation.y = -zone.heading;
  return marker;
}
