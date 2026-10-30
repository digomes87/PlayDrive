/**
 * One axle of tyres. Lateral force grows with the slip speed until the axle saturates at
 * μ·Fz; the friction circle then shares what is left with braking and traction.
 */
export interface AxleForces {
  /** Along the wheel, N (traction/braking direction). */
  readonly forward: number;
  /** To the wheel's left, N. */
  readonly left: number;
}

export function axleForces(
  load: number,
  lateralSlipSpeed: number,
  longitudinalDemand: number,
  mu: number,
  saturationSpeed: number,
): AxleForces {
  const capacity = mu * load;
  const lateral = Math.min(Math.max(-(lateralSlipSpeed / saturationSpeed) * capacity, -capacity), capacity);
  const demanded = Math.hypot(longitudinalDemand, lateral);
  const scale = demanded > capacity && demanded > 0 ? capacity / demanded : 1;
  return { forward: longitudinalDemand * scale, left: lateral * scale };
}
