import type { MissionDefinition } from './definition';
export const BODY_DIMENSIONS = {'1U':[.1,.1,.1],'2U':[.1,.1,.2],'3U':[.1,.1,.3],'6U':[.2,.1,.3]} as const;
export const DEFAULT_MASS_KG = {'1U':1.33,'2U':2.66,'3U':4,'6U':8};
export function faceIndex(normal:readonly number[]) {
  const axis=normal.reduce((best,n,i)=>Math.abs(n)>Math.abs(normal[best])?i:best,0);
  return axis*2+(normal[axis]<0?1:0);
}
export function faceAreas(size:keyof typeof BODY_DIMENSIONS) {
  const [x,y,z]=BODY_DIMENSIONS[size];
  return [y*z,y*z,x*z,x*z,x*y,x*y];
}
export function panelAreaLimit(size:keyof typeof BODY_DIMENSIONS,normal:readonly number[]) {
  return .8*faceAreas(size)[faceIndex(normal)];
}
/** Explicit authoring action; never silently alters imported JSON. */
export function fitSolarPanels(spacecraft:MissionDefinition['spacecraft']) {
  const used=Array(6).fill(0);
  for(const panel of spacecraft.power.solarPanels) {
    const face=faceIndex(panel.normalBody),limit=panelAreaLimit(spacecraft.body.size,panel.normalBody);
    panel.areaM2=Math.max(0,Math.min(panel.areaM2,panel.mounting==='body'?limit-used[face]:limit));
    if(panel.mounting==='body')used[face]+=panel.areaM2;
  }
}
