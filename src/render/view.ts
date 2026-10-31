/** The 3D view: owns the renderer and turns a simulation pose into a frame. */
import { ACESFilmicToneMapping, Group, PCFShadowMap, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import type { TruckSpec } from '../truckSpec';
import type { Mission } from '../sim/missions';
import type { Session } from '../sim/session';
import { type CameraMode, CameraRig } from './cameras';
import { addEnvironment } from './environment';
import { buildSite } from './siteModel';
import { buildTruck } from './truckModel';
import { buildZoneMarker } from './zoneMarker';

const MAX_PIXEL_RATIO = 2;

export class SceneView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly cameras = new CameraRig();
  private readonly truck;
  private readonly markers = new Group();
  private site: Group | null = null;
  private lastFrameSeconds = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    spec: TruckSpec,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.truck = buildTruck(spec);
    addEnvironment(this.scene);
    this.scene.add(this.truck.root, this.markers);
    this.resize();
  }

  get cameraMode(): CameraMode {
    return this.cameras.mode;
  }

  nextCamera(): CameraMode {
    return this.cameras.next();
  }

  /** Each mission has its own yard; the obstacle group is swapped with the mission. */
  showMission(mission: Mission): void {
    this.site?.removeFromParent();
    this.site = buildSite(mission.site);
    this.scene.add(this.site);
    this.markers.clear();
    if (mission.goal !== null) this.markers.add(buildZoneMarker(mission.goal.zone));
    this.lastFrameSeconds = 0;
  }

  resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false);
    this.cameras.resize(width / Math.max(height, 1));
  }

  render(session: Session, nowMilliseconds: number): void {
    const seconds = nowMilliseconds / 1000;
    const delta = this.lastFrameSeconds === 0 ? 1 / 60 : Math.min(Math.max(seconds - this.lastFrameSeconds, 0), 0.25);
    this.lastFrameSeconds = seconds;
    const pose = session.pose();
    this.truck.update(pose, session.state.vehicle.tractor.forwardSpeed, delta);
    this.cameras.update(
      {
        tractor: { x: pose.tractor.position.x, z: pose.tractor.position.z, heading: pose.tractor.heading },
        trailer: { x: pose.trailer.position.x, z: pose.trailer.position.z, heading: pose.trailer.heading },
      },
      delta,
    );
    this.renderer.render(this.scene, this.cameras.camera);
  }
}
