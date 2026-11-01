import type { SatelliteState } from '../types';
import type { Vec3 } from './attitude';
const MU=398600.4418; // km³/s²
const dot=(a:Vec3,b:Vec3)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(a:Vec3):Vec3=>a.map(v=>v/Math.hypot(...a)) as Vec3;

/** Interpolate TEME state with the same position/velocity pair (cubic Hermite). */
export function inertialStateAt(states:SatelliteState[],timeSec:number) {
  let lo=0,hi=states.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(states[mid].timeSec<=timeSec)lo=mid;else hi=mid-1;}
  const a=states[lo],b=states[Math.min(lo+1,states.length-1)];
  if(a===b || timeSec<=a.timeSec)return {position:a.positionTemeKm,velocity:a.velocityTemeKmSec};
  const dt=b.timeSec-a.timeSec,u=Math.min(1,(timeSec-a.timeSec)/dt);
  const position=a.positionTemeKm.map((r,i)=>(2*u**3-3*u*u+1)*r+(u**3-2*u*u+u)*dt*a.velocityTemeKmSec[i]+(-2*u**3+3*u*u)*b.positionTemeKm[i]+(u**3-u*u)*dt*b.velocityTemeKmSec[i]) as Vec3;
  const velocity=a.positionTemeKm.map((r,i)=>(6*u*u-6*u)/dt*r+(3*u*u-4*u+1)*a.velocityTemeKmSec[i]+(-6*u*u+6*u)/dt*b.positionTemeKm[i]+(3*u*u-2*u)*b.velocityTemeKmSec[i]) as Vec3;
  return {position,velocity};
}

/** Closed instantaneous two-body ellipse in TEME, kilometres; not an Earth-fixed history. */
export function orbitEllipse(position:Vec3,velocity:Vec3,segments=256):Vec3[] {
  const radius=Math.hypot(...position),h=cross(position,velocity);
  const eVector=cross(velocity,h).map((v,i)=>v/MU-position[i]/radius) as Vec3;
  const e=Math.hypot(...eVector),a=1/(2/radius-dot(velocity,velocity)/MU);
  if(!(a>0) || e>=1 || Math.hypot(...h)<1e-9)return [];
  const x=unit(e>1e-8?eVector:position),y=unit(cross(unit(h),x)),b=a*Math.sqrt(1-e*e);
  const points:Vec3[]=[];
  for(let i=0;i<segments;i++){
    const angle=i/segments*2*Math.PI;
    points.push(x.map((v,j)=>a*(Math.cos(angle)-e)*v+b*Math.sin(angle)*y[j]) as Vec3);
  }
  points.push([...points[0]]);
  return points;
}
