import * as C from 'cesium';
import * as satellite from 'satellite.js';
import type { CompiledScenario } from '../types';

/** One Earth-fixed interpolator for BOTH the spacecraft and its teaching orbit.
 * Extra SGP4 samples beyond the run keep the full outline available at endpoints.
 */
export function createOrbitDisplay(scenario:CompiledScenario,segments=512) {
  const mission=scenario.mission,record=satellite.twoline2satrec(mission.orbit.line1,mission.orbit.line2);
  const period=2*Math.PI/record.no*60;
  const start=C.JulianDate.fromIso8601(scenario.meta.startIso);
  const step=scenario.meta.stepSec;
  const position=new C.SampledPositionProperty(C.ReferenceFrame.FIXED);
  position.setInterpolationOptions({interpolationAlgorithm:C.LagrangePolynomialApproximation,interpolationDegree:5});
  const add=(seconds:number,r:{x:number;y:number;z:number})=>{
    const t=C.JulianDate.addSeconds(start,seconds,new C.JulianDate());
    const fixed=satellite.eciToEcf(r,satellite.gstime(new Date(Date.parse(scenario.meta.startIso)+seconds*1000)));
    position.addSample(t,new C.Cartesian3(fixed.x*1000,fixed.y*1000,fixed.z*1000));
  };
  const propagate=(seconds:number)=>{
    const pv=satellite.propagate(record,new Date(Date.parse(scenario.meta.startIso)+seconds*1000));
    if(!pv?.position)throw new Error('Unable to extend orbit display trajectory.');
    add(seconds,pv.position);
  };
  for(let i=Math.ceil(period/step)+6;i>=1;i--)propagate(-i*step);
  scenario.states.forEach(state=>add(state.timeSec,{x:state.positionTemeKm[0],y:state.positionTemeKm[1],z:state.positionTemeKm[2]}));
  for(let i=1;i<=Math.ceil(period/step)+6;i++)propagate(scenario.meta.durationSec+i*step);

  const curve=(time:C.JulianDate):C.Cartesian3[]=>{
    const anchor=position.getValue(time);
    if(!anchor)return [];
    const currentRotation=C.Transforms.computeTemeToPseudoFixedMatrix(time);
    const points:C.Cartesian3[]=[];
    for(let i=0;i<=segments;i++){
      const future=C.JulianDate.addSeconds(time,period*i/segments,new C.JulianDate());
      const p=position.getValue(future);
      if(!p)return [];
      const inverse=C.Matrix3.transpose(C.Transforms.computeTemeToPseudoFixedMatrix(future),new C.Matrix3());
      const inertial=C.Matrix3.multiplyByVector(inverse,p,new C.Cartesian3());
      points.push(C.Matrix3.multiplyByVector(currentRotation,inertial,new C.Cartesian3()));
    }
    // Perturbed SGP4 trajectories do not close exactly after one nominal period.
    // Blend out only that residual; preserve the exact shared position at u=0.
    const residual=C.Cartesian3.subtract(points[segments],anchor,new C.Cartesian3());
    for(let i=1;i<segments;i++){
      const u=i/segments,weight=u*u*(3-2*u);
      C.Cartesian3.subtract(points[i],C.Cartesian3.multiplyByScalar(residual,weight,new C.Cartesian3()),points[i]);
    }
    points[0]=anchor.clone();points[segments]=anchor.clone();
    return points;
  };
  return {position,curve,period};
}
