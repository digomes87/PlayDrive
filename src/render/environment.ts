/** Sky dome, light, fog and the asphalt yard. */
import {
  BackSide,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  type Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import { PALETTE } from './palette';

const YARD_RADIUS = 120;
const TEXTURE_SIZE = 2048;
const FOG_DENSITY = 0.0032;
const SHADOW_RANGE = 45;

const SKY_VERTEX = `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = `
uniform vec3 topColor;
uniform vec3 horizonColor;
varying vec3 vDirection;
void main() {
  float height = clamp(vDirection.y, 0.0, 1.0);
  gl_FragColor = vec4(mix(horizonColor, topColor, pow(height, 0.55)), 1.0);
}`;

function buildSky(): Mesh {
  const material = new ShaderMaterial({
    uniforms: { topColor: { value: new Color(PALETTE.skyTop) }, horizonColor: { value: new Color(PALETTE.skyHorizon) } },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  return new Mesh(new SphereGeometry(700, 24, 12), material);
}

/** Deterministic speckle so the asphalt looks the same on every load. */
function speckle(context: CanvasRenderingContext2D): void {
  let seed = 98765;
  const next = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  context.fillStyle = PALETTE.asphaltSpeckle;
  for (let index = 0; index < 6000; index += 1) {
    context.globalAlpha = 0.12 + next() * 0.25;
    context.fillRect(next() * TEXTURE_SIZE, next() * TEXTURE_SIZE, 2 + next() * 8, 2 + next() * 8);
  }
  context.globalAlpha = 1;
}

function groundTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  if (context === null) return new CanvasTexture(canvas);
  context.fillStyle = PALETTE.asphalt;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  speckle(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function buildGround(): Group {
  const yard = new Mesh(new CircleGeometry(YARD_RADIUS, 64), new MeshStandardMaterial({ map: groundTexture(), roughness: 1 }));
  const beyond = new Mesh(
    new RingGeometry(YARD_RADIUS, 500, 64),
    new MeshStandardMaterial({ color: PALETTE.mud, roughness: 1 }),
  );
  const ground = new Group();
  ground.add(yard, beyond);
  ground.rotation.x = -Math.PI / 2;
  ground.children.forEach((part) => {
    part.receiveShadow = true;
  });
  return ground;
}

function buildSun(): DirectionalLight {
  const sun = new DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(45, 70, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -SHADOW_RANGE;
  sun.shadow.camera.right = SHADOW_RANGE;
  sun.shadow.camera.top = SHADOW_RANGE;
  sun.shadow.camera.bottom = -SHADOW_RANGE;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  return sun;
}

export function addEnvironment(scene: Scene): void {
  scene.fog = new FogExp2(PALETTE.fog, FOG_DENSITY);
  scene.add(buildSky(), buildGround(), buildSun(), new HemisphereLight(PALETTE.skyHorizon, 0x59554a, 1.1));
}
