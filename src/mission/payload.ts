import type { Vec3 } from '../sim/attitude';
export type PayloadSide = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';
export const PAYLOAD_SIDES: PayloadSide[] = ['+X','-X','+Y','-Y','+Z','-Z'];
export function payloadFrame(side: PayloadSide = '+Z') {
  const normal: Vec3 = [0,0,0];
  normal['XYZ'.indexOf(side[1])] = side[0] === '+' ? 1 : -1;
  const up: Vec3 = Math.abs(normal[2]) < .9 ? [0,0,1] : [1,0,0];
  const right: Vec3 = [up[1]*normal[2]-up[2]*normal[1],up[2]*normal[0]-up[0]*normal[2],up[0]*normal[1]-up[1]*normal[0]];
  return { normal, up, right };
}
