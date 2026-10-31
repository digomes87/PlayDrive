/** Static world built from the site obstacles: buildings, walls, parked trailers and cones. */
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Obstacle, Site } from '../sim/site';
import { PALETTE } from './palette';

const material = (colour: number, rough = 0.8): MeshStandardMaterial => new MeshStandardMaterial({ color: colour, roughness: rough });

function buildObstacle(obstacle: Obstacle): Mesh | Group {
  const { box, height, kind } = obstacle;
  const place = (mesh: Mesh): Mesh => {
    mesh.position.set(box.center.x, obstacle.height / 2, box.center.z);
    mesh.rotation.y = -box.heading;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  if (kind === 'cone') {
    const cone = new Mesh(new ConeGeometry(0.3, height, 10), material(PALETTE.cone, 0.6));
    const band = new Mesh(new CylinderGeometry(0.17, 0.21, 0.14, 10), material(PALETTE.coneBand, 0.5));
    band.position.y = 0.12;
    cone.add(band);
    const base = new Mesh(new BoxGeometry(0.56, 0.05, 0.56), material(PALETTE.cone, 0.8));
    base.position.y = -height / 2 + 0.03;
    cone.add(base);
    cone.position.set(box.center.x, height / 2, box.center.z);
    cone.castShadow = true;
    return cone;
  }
  if (kind === 'trailer') {
    const group = new Group();
    const body = new Mesh(new BoxGeometry(box.halfLength * 2, height - 0.4, box.halfWidth * 2), material(PALETTE.parkedTrailer, 0.7));
    body.position.y = 0.2;
    const roof = new Mesh(new BoxGeometry(box.halfLength * 2 + 0.04, 0.12, box.halfWidth * 2 + 0.04), material(PALETTE.parkedTrim, 0.6));
    roof.position.y = height - 0.2;
    const skirt = new Mesh(new BoxGeometry(box.halfLength * 2 - 1.2, 0.5, box.halfWidth * 2 - 0.1), material(PALETTE.parkedTrim, 0.7));
    skirt.position.y = 0.9;
    [body, roof, skirt].forEach((part) => {
      part.castShadow = true;
      part.receiveShadow = true;
      group.add(part);
    });
    group.position.set(box.center.x, height / 2, box.center.z);
    group.rotation.y = -box.heading;
    return group;
  }
  const isBuilding = kind === 'building';
  const mesh = new Mesh(
    new BoxGeometry(box.halfLength * 2, height, box.halfWidth * 2),
    material(isBuilding ? PALETTE.building : PALETTE.wall, isBuilding ? 0.85 : 0.9),
  );
  return place(mesh);
}

export function buildSite(site: Site): Group {
  const group = new Group();
  site.obstacles.forEach((obstacle) => group.add(buildObstacle(obstacle)));
  return group;
}
