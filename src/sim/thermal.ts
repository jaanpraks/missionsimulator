import type { MissionDefinition } from '../mission/definition';
import type { SatelliteState } from '../types';
import { faceAreas,faceIndex,DEFAULT_MASS_KG } from '../mission/physical';

export type ThermalDefinition={massKg:number;specificHeatJkgK:number;initialTemperatureC:number;absorptivity:number;emissivity:number;panelAbsorptivity:number;panelEmissivity:number};
export function defaultThermal(size:MissionDefinition['spacecraft']['body']['size']):ThermalDefinition {
  return {massKg:DEFAULT_MASS_KG[size],specificHeatJkgK:900,initialTemperatureC:20,absorptivity:.35,emissivity:.8,panelAbsorptivity:.9,panelEmissivity:.85};
}
export type ThermalState={temperatureC:number;solarHeatW:number;earthInfraredHeatW:number;albedoHeatW:number;internalHeatW:number;radiatedHeatW:number};
export const EMPTY_THERMAL:ThermalState={temperatureC:20,solarHeatW:0,earthInfraredHeatW:0,albedoHeatW:0,internalHeatW:0,radiatedHeatW:0};
export const STEFAN_BOLTZMANN=5.670374419e-8;
const normals=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((sum,v,i)=>sum+v*b[i],0);

/** Isothermal bus and deployed panels. Earth IR/albedo use a spherical-Earth view factor. */
export function thermalEnvironment(mission:MissionDefinition,state:SatelliteState,solarElectricW:number) {
  const settings=mission.spacecraft.thermal ?? defaultThermal(mission.spacecraft.body.size);
  const areas=faceAreas(mission.spacecraft.body.size),bare=[...areas];
  for(const panel of mission.spacecraft.power.solarPanels)if(panel.mounting==='body')bare[faceIndex(panel.normalBody)]-=panel.areaM2;
  const radius=Math.hypot(...state.positionTemeKm);
  const earthTeme=state.positionTemeKm.map(v=>-v/radius);
  const earthBody=[dot(state.bodyAxesTeme.x,earthTeme),dot(state.bodyAxesTeme.y,earthTeme),dot(state.bodyAxesTeme.z,earthTeme)];
  const view=Math.min(1,(6378.137/radius)**2);
  // Fraction of the visible Earth illuminated, based on Sun/Earth separation at spacecraft.
  const dayFraction=(1-dot(earthBody,state.sunDirectionBody))/2;
  let absorbed=0,ir=0,albedo=0,emittingArea=0;
  const surface=(area:number,normal:readonly number[],alpha:number,epsilon:number)=>{
    const sunCos=Math.max(0,dot(normal,state.sunDirectionBody));
    const earthCos=Math.max(0,dot(normal,earthBody));
    absorbed+=state.sunlit?1361*alpha*area*sunCos:0;
    ir+=237*epsilon*area*earthCos*view;
    albedo+=1361*.3*alpha*area*earthCos*view*dayFraction;
    emittingArea+=epsilon*area;
  };
  bare.forEach((area,i)=>surface(Math.max(0,area),normals[i],settings.absorptivity,settings.emissivity));
  for(const panel of mission.spacecraft.power.solarPanels){
    surface(panel.areaM2,panel.normalBody,settings.panelAbsorptivity,settings.panelEmissivity);
    if(panel.mounting==='deployable')surface(panel.areaM2,panel.normalBody.map(v=>-v),settings.absorptivity,settings.emissivity);
  }
  return {solarHeatW:Math.max(0,absorbed-solarElectricW),earthInfraredHeatW:ir,albedoHeatW:albedo,emittingArea};
}
/** RK4 radiation integration in kelvin. No air convection or inter-node conduction. */
export function thermalStep(temperatureK:number,inputW:number,emittingArea:number,capacityJPerK:number,dtSec:number) {
  const rate=(t:number)=>(inputW-STEFAN_BOLTZMANN*emittingArea*(t**4-3**4))/capacityJPerK;
  // Limit steps for small thermal masses and hot radiators.
  let t=temperatureK,remaining=dtSec;
  while(remaining>1e-10){
    const h=Math.min(remaining,5,.2*capacityJPerK/Math.max(1e-9,4*STEFAN_BOLTZMANN*emittingArea*t**3));
    const a=rate(t),b=rate(t+h*a/2),c=rate(t+h*b/2),d=rate(t+h*c);
    t=Math.max(3,t+h*(a+2*b+2*c+d)/6);remaining-=h;
  }
  return t;
}
