import { payloadFrame, type PayloadSide } from '../mission/payload';
export type Vec3 = [number, number, number];
export type AttitudeStrategy = 'sun-pointing' | 'nadir-pointing';
/** Columns of the rotation taking spacecraft body vectors into TEME coordinates. */
export type BodyAxes = { x: Vec3; y: Vec3; z: Vec3 };
export const SOLAR_IRRADIANCE_W_M2 = 1361;
export const dot = (a: Vec3, b: Vec3) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = (a: Vec3): Vec3 => {
  const length = Math.hypot(...a);
  if (length < 1e-12) throw new Error('Cannot construct attitude from a zero vector.');
  return a.map(v => v / length) as Vec3;
};
const perpendicular = (direction: Vec3, hint: Vec3): Vec3 => {
  let projected = hint.map((v, i) => v - dot(hint, direction) * direction[i]) as Vec3;
  if (Math.hypot(...projected) < 1e-8) {
    const fallback: Vec3 = Math.abs(direction[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
    projected = fallback.map((v, i) => v - dot(fallback, direction) * direction[i]) as Vec3;
  }
  return unit(projected);
};

export function attitudeAxes(strategy: AttitudeStrategy, position: Vec3, velocity: Vec3, sunDirection: Vec3, payloadSide: PayloadSide = '+Z'): BodyAxes {
  if (strategy === 'nadir-pointing') {
    const normal = unit(position.map(v => -v) as Vec3);
    const up = perpendicular(normal, velocity);
    const right = unit(cross(up, normal));
    const body = payloadFrame(payloadSide);
    // Map the selected face to Earth and its camera-up direction along-track.
    const transform = (v: Vec3): Vec3 => right.map((r,i) => r*dot(v,body.right)+up[i]*dot(v,body.up)+normal[i]*dot(v,body.normal)) as Vec3;
    return { x: transform([1,0,0]), y: transform([0,1,0]), z: transform([0,0,1]) };
  }
  const x = unit(sunDirection);
  const z = perpendicular(x, cross(position, velocity));
  const y = unit(cross(z, x));
  return { x, y, z: unit(cross(x, y)) };
}

export function sunInBody(axes: BodyAxes, sunDirection: Vec3): Vec3 {
  const sun = unit(sunDirection);
  return [dot(axes.x, sun), dot(axes.y, sun), dot(axes.z, sun)];
}

export function panelPowerW(areaM2: number, efficiency: number, normalBody: Vec3, sunBody: Vec3, sunlit: boolean) {
  return sunlit ? SOLAR_IRRADIANCE_W_M2 * areaM2 * efficiency * Math.max(0, Math.min(1, dot(normalBody, sunBody))) : 0;
}

/** Unit quaternion [x,y,z,w], body -> target frame, from an orthonormal basis. */
export function axesQuaternion({ x, y, z }: BodyAxes): [number, number, number, number] {
  const m00=x[0], m01=y[0], m02=z[0], m10=x[1], m11=y[1], m12=z[1], m20=x[2], m21=y[2], m22=z[2];
  const trace=m00+m11+m22;
  if (trace > 0) { const s=2*Math.sqrt(trace+1); return [(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4]; }
  if (m00 > m11 && m00 > m22) { const s=2*Math.sqrt(1+m00-m11-m22); return [s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s]; }
  if (m11 > m22) { const s=2*Math.sqrt(1+m11-m00-m22); return [(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s]; }
  const s=2*Math.sqrt(1+m22-m00-m11); return [(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];
}
