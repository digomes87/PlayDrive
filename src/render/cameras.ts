/** Chase, cab, yard (high top view) and trailer cameras for parking. */
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

export type CameraMode = 'chase' | 'cab' | 'top' | 'trailer';

const ORDER: readonly CameraMode[] = ['chase', 'cab', 'top', 'trailer'];

const CHASE = { back: 13, up: 6.5, ahead: 9 };
const CAB = { along: 1.9, up: 3.0 };
const CAB_LOOK_AHEAD = 30;
const TOP_HEIGHT = 34;
const TOP_TILT = 7;
const TRAILER_VIEW = { back: 11, up: 5.5 };
const SMOOTHING = 5;

export interface CameraSubject {
  readonly tractor: { readonly x: number; readonly z: number; readonly heading: number };
  readonly trailer: { readonly x: number; readonly z: number; readonly heading: number };
}

export class CameraRig {
  readonly camera = new PerspectiveCamera(60, 1, 0.3, 600);
  private current: CameraMode = 'chase';
  private place = new Vector3(0, 10, 20);
  private aimedAt = new Vector3();

  get mode(): CameraMode {
    return this.current;
  }

  next(): CameraMode {
    this.current = ORDER[(ORDER.indexOf(this.current) + 1) % ORDER.length]!;
    return this.current;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(subject: CameraSubject, deltaSeconds: number): void {
    const target = this.placeFor(subject);
    /** Exponential approach: fast enough to follow, slow enough not to whip on gear changes. */
    const blend = 1 - Math.exp(-SMOOTHING * deltaSeconds);
    this.place.lerp(target, this.current === 'chase' || this.current === 'trailer' ? blend : 1);
    this.camera.position.copy(this.place);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.aimedAt);
  }

  /** Where this mode wants the eye, and the point it looks at. */
  private placeFor(subject: CameraSubject): Vector3 {
    const tractor = subject.tractor;
    const forward = new Vector3(Math.cos(tractor.heading), 0, Math.sin(tractor.heading));
    if (this.current === 'cab') {
      this.aimedAt.set(tractor.x + forward.x * CAB_LOOK_AHEAD, 1.4, tractor.z + forward.z * CAB_LOOK_AHEAD);
      return new Vector3(tractor.x + forward.x * CAB.along, CAB.up, tractor.z + forward.z * CAB.along);
    }
    if (this.current === 'top') {
      const centreX = (tractor.x + subject.trailer.x) / 2;
      const centreZ = (tractor.z + subject.trailer.z) / 2;
      this.aimedAt.set(centreX, 0, centreZ);
      return new Vector3(centreX, TOP_HEIGHT, centreZ + TOP_TILT);
    }
    if (this.current === 'trailer') {
      const tail = subject.trailer;
      const tailForward = new Vector3(Math.cos(tail.heading), 0, Math.sin(tail.heading));
      this.aimedAt.set(tractor.x, 1.6, tractor.z);
      return new Vector3(tail.x - tailForward.x * TRAILER_VIEW.back, TRAILER_VIEW.up, tail.z - tailForward.z * TRAILER_VIEW.back);
    }
    this.aimedAt.set(tractor.x + forward.x * CHASE.ahead, 1.6, tractor.z + forward.z * CHASE.ahead);
    return new Vector3(
      tractor.x - forward.x * CHASE.back + MathUtils.clamp(-forward.z, -1, 1) * 0,
      CHASE.up,
      tractor.z - forward.z * CHASE.back,
    );
  }
}
