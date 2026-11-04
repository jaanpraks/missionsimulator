import type { MissionDefinition } from './definition';
import type { Vec3 } from '../sim/attitude';
import { payloadFrame } from './payload';
import { BODY_DIMENSIONS } from './physical';

export type SatellitePart = { name: string; center: Vec3; size: Vec3; axes: [Vec3, Vec3, Vec3]; color: [number, number, number, number] };
const identity: [Vec3, Vec3, Vec3] = [[1,0,0],[0,1,0],[0,0,1]];
const cross = (a: Vec3,b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = (a: Vec3): Vec3 => { const length=Math.hypot(...a); return a.map(v=>v/length) as Vec3; };
const add = (a: Vec3,b: Vec3): Vec3 => a.map((v,i)=>v+b[i]) as Vec3;
const scaled = (a: Vec3,s: number): Vec3 => a.map(v=>v*s) as Vec3;

/** Body coordinates and metres are shared by the builder preview and glTF model. */
export function satelliteGeometry(spacecraft: MissionDefinition['spacecraft']) {
  const size:Vec3 = [...BODY_DIMENSIONS[spacecraft.body.size]];
  const parts: SatellitePart[] = [];
  const box = (name:string,center:Vec3,dimensions:Vec3,color:SatellitePart['color'],axes = identity) => parts.push({name,center,size:dimensions,color,axes});
  box('CubeSat bus',[0,0,0],size,[.63,.51,.25,1]);
  for (const x of [-1,1]) for (const y of [-1,1]) box('Structural rail',[x*size[0]/2,y*size[1]/2,0],[.009,.009,size[2]+.008],[.72,.79,.86,1]);
  box('+X red face',[size[0]/2+.002,0,0],[.004,size[1]*.35,size[2]*.3],[.98,.28,.29,1]);
  box('+Y green face',[0,size[1]/2+.002,0],[size[0]*.35,.004,size[2]*.3],[.31,.86,.46,1]);
  const payload = payloadFrame(spacecraft.payload.side);
  const support = payload.normal.reduce((sum,n,i)=>sum+Math.abs(n)*size[i]/2,0);
  const payloadAxes: [Vec3,Vec3,Vec3] = [payload.right,payload.up,payload.normal];
  box('Payload mount',scaled(payload.normal,support+.005),[.05,.05,.012],[.12,.8,.91,1],payloadAxes);
  box('Camera aperture ('+(spacecraft.payload.side ?? '+Z')+')',scaled(payload.normal,support+.015),[.026,.026,.012],[.015,.035,.07,1],payloadAxes);
  for (const panel of spacecraft.power.solarPanels) {
    if (panel.areaM2 <= 0) continue;
    const n = unit(panel.normalBody);
    const u = unit(cross(Math.abs(n[2]) < .9 ? [0,0,1] : [0,1,0],n));
    const v = unit(cross(n,u));
    const support = (direction:Vec3) => direction.reduce((sum,c,i)=>sum+Math.abs(c)*size[i]/2,0);
    const w = panel.mounting === 'body' ? Math.min(Math.sqrt(panel.areaM2),support(u)*1.8) : Math.sqrt(panel.areaM2 / 2);
    const h = panel.mounting === 'body' ? Math.min(panel.areaM2/w,support(v)*1.8) : w*2;
    let center = scaled(n,support(n)+.007);
    if (panel.mounting === 'deployable') {
      center = add(center,scaled(u,support(u)+w/2+.025));
      box(panel.id+' hinge',add(scaled(n,support(n)+.007),scaled(u,support(u)+.0125)),[.025,.01,.008],[.7,.75,.8,1],[u,v,n]);
    }
    box(panel.id,center,[w,h,.004],[.035,.12,.34,1],[u,v,n]);
    // Bright cell grid identifies the active face (+normal); the back stays dark.
    for (let i=0;i<=3;i++) box(panel.id+' cell grid',add(add(center,scaled(u,w*(i/3-.5))),scaled(n,.0025)),[.001,h,.001],[.26,.5,.85,1],[u,v,n]);
    for (let i=0;i<=5;i++) box(panel.id+' cell grid',add(add(center,scaled(v,h*(i/5-.5))),scaled(n,.0025)),[w,.001,.001],[.26,.5,.85,1],[u,v,n]);
  }
  const extent = parts.reduce((max,p)=>Math.max(max,Math.hypot(...p.center)+Math.hypot(...p.size)/2),0);
  return { parts, size, extent };
}

/** Generate a self-contained glTF without external assets or a second 3D library. */
export function satelliteGltf(spacecraft: MissionDefinition['spacecraft']): string {
  const { parts } = satelliteGeometry(spacecraft);
  const vertices:number[] = [];
  const primitives: { attributes: { POSITION: number }; material: number }[] = [];
  const accessors: object[] = [];
  const views: object[] = [];
  const faces = [[0,2,3,0,3,1],[4,5,7,4,7,6],[0,1,5,0,5,4],[2,6,7,2,7,3],[0,4,6,0,6,2],[1,3,7,1,7,5]];
  for (const [index,part] of parts.entries()) {
    const corners = Array.from({length:8},(_,k)=>{
      let p:Vec3=[...part.center];
      for(let axis=0;axis<3;axis++) p=add(p,scaled(part.axes[axis],((k>>axis)&1 ? 1 : -1)*part.size[axis]/2));
      return p;
    });
    const start=vertices.length;
    for(const face of faces) for(const corner of face) vertices.push(...corners[corner]);
    views.push({buffer:0,byteOffset:start*4,byteLength:36*3*4,target:34962});
    accessors.push({bufferView:index,componentType:5126,count:36,type:'VEC3',min:[0,1,2].map(i=>Math.min(...corners.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...corners.map(p=>p[i])))});
    primitives.push({attributes:{POSITION:index},material:index});
  }
  const bytes = new Uint8Array(new Float32Array(vertices).buffer);
  let binary=''; for (const byte of bytes) binary+=String.fromCharCode(byte);
  const gltf={asset:{version:'2.0',generator:'Aalto EDUSat'},extensionsUsed:['KHR_materials_unlit'],scene:0,scenes:[{nodes:[0]}],
    // glTF +Y is up; rotate mesh so Cesium's Y-up conversion restores body XYZ.
    nodes:[{mesh:0,rotation:[-Math.SQRT1_2,0,0,Math.SQRT1_2]}],meshes:[{primitives}],
    buffers:[{uri:'data:application/octet-stream;base64,'+btoa(binary),byteLength:bytes.length}],bufferViews:views,accessors,
    materials:parts.map(part=>({name:part.name,pbrMetallicRoughness:{baseColorFactor:part.color,metallicFactor:0,roughnessFactor:1},doubleSided:true,extensions:{KHR_materials_unlit:{}}}))};
  return 'data:model/gltf+json;base64,'+btoa(JSON.stringify(gltf));
}
