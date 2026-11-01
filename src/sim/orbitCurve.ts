import { twoline2satrec } from 'satellite.js';
import type { MissionDefinition } from '../mission/definition';
import type { Vec3 } from './attitude';

/** Stable mean-element teaching outline; the spacecraft itself still follows SGP4.
 * Vertices keep their anomaly and shape. Only smooth secular plane/apsis rotation
 * changes with time, avoiding perigee flips and sample-boundary velocity noise.
 */
export function createOrbitCurve(mission:MissionDefinition,segments=512) {
  const record=twoline2satrec(mission.orbit.line1,mission.orbit.line2);
  const motion=Number(mission.orbit.line2.slice(52,63))*2*Math.PI/86400;
  const a=Math.cbrt(398600.8/(motion*motion)),e=record.ecco,b=a*Math.sqrt(1-e*e);
  const shape=Array.from({length:segments},(_,i)=>{
    const angle=i/segments*2*Math.PI;
    return [a*(Math.cos(angle)-e),b*Math.sin(angle)] as const;
  });
  const epochMinutes=(Date.parse(mission.simulation.startIso)/86400000+2440587.5-record.jdsatepoch)*1440;
  const ci=Math.cos(record.inclo),si=Math.sin(record.inclo);
  return (timeSec:number):Vec3[]=>{
    const minutes=epochMinutes+timeSec/60;
    const node=record.nodeo+record.nodedot*minutes;
    const perigee=record.argpo+record.argpdot*minutes;
    const cn=Math.cos(node),sn=Math.sin(node),cw=Math.cos(perigee),sw=Math.sin(perigee);
    const x:Vec3=[cn*cw-sn*sw*ci,sn*cw+cn*sw*ci,sw*si];
    const y:Vec3=[-cn*sw-sn*cw*ci,-sn*sw+cn*cw*ci,cw*si];
    const points=shape.map(([px,py])=>x.map((v,j)=>v*px+y[j]*py) as Vec3);
    points.push([...points[0]]);
    return points;
  };
}
