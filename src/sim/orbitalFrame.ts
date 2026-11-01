import type { BodyAxes, Vec3 } from './attitude';

/** Earth-fixed components of an orbital frame: +X along-track, +Z radial outward. */
export function orbitalFrameAxes(positionFixedM: Vec3, velocityFixedMps: Vec3): BodyAxes {
  const unit = (v: Vec3): Vec3 => {
    const length = Math.hypot(...v);
    if (length < 1e-10) throw new Error('Degenerate orbital reference frame.');
    return v.map(component => component / length) as Vec3;
  };
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const z = unit(positionFixedM);
  // A derivative of Earth-fixed positions includes Earth's rotation. Restore the
  // inertial velocity, expressed in fixed axes, before constructing along-track.
  const omega = 7.292115e-5;
  const velocity: Vec3 = [velocityFixedMps[0] - omega*positionFixedM[1], velocityFixedMps[1] + omega*positionFixedM[0], velocityFixedMps[2]];
  const radialSpeed = velocity.reduce((sum,v,i) => sum + v*z[i], 0);
  const x = unit(velocity.map((v,i) => v-radialSpeed*z[i]) as Vec3);
  const y = unit(cross(z,x));
  return { x: unit(cross(y,z)), y, z };
}

// Fixed metres in the moving frame. Independent of attitude, playback and zoom.
export const ORBITAL_CAMERA_OFFSET: Vec3 = [-15000, -5000, 6000];
export const SATELLITE_DISPLAY_RADIUS_M = 1800;
