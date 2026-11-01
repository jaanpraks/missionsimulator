import React, { useMemo, useState } from 'react';
import type { MissionDefinition } from '../mission/definition';
import { satelliteGeometry } from '../mission/geometry';
import type { Vec3 } from '../sim/attitude';

export default function SatellitePreview({ spacecraft }: { spacecraft: MissionDefinition['spacecraft'] }) {
  const [angle,setAngle]=useState(40);
  const geometry=useMemo(()=>satelliteGeometry(spacecraft),[spacecraft]);
  const yaw=angle*Math.PI/180,pitch=.45;
  const right:Vec3=[-Math.sin(yaw),Math.cos(yaw),0];
  const up:Vec3=[-Math.sin(pitch)*Math.cos(yaw),-Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch)];
  const depth:Vec3=[Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch)];
  const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0);
  const scale=105/geometry.extent;
  const project=(p:Vec3)=>({x:240+dot(p,right)*scale,y:145-dot(p,up)*scale,z:dot(p,depth)});
  const faces=geometry.parts.flatMap(part=>{
    const corners=Array.from({length:8},(_,k)=>{
      const p:Vec3=[...part.center];
      for(let a=0;a<3;a++) for(let j=0;j<3;j++)p[j]+=part.axes[a][j]*((k>>a)&1?1:-1)*part.size[a]/2;
      return p;
    });
    return [[0,2,3,1],[4,5,7,6],[0,1,5,4],[2,6,7,3],[0,4,6,2],[1,3,7,5]].map((indices,i)=>{
      const points=indices.map(k=>project(corners[k]));
      const shade=[.72,1,.8,.95,.76,.9][i];
      return {points:points.map(p=>`${p.x},${p.y}`).join(' '),depth:points.reduce((sum,p)=>sum+p.z,0)/4,color:`rgb(${part.color.slice(0,3).map(c=>Math.round(c*255*shade)).join(',')})`};
    });
  }).sort((a,b)=>a.depth-b.depth);
  return <div>
    <svg viewBox="0 0 480 280" role="img" aria-label={`${spacecraft.body.size} CubeSat design with configured solar panels and body axes`} style={{width:'100%',maxHeight:300,display:'block',background:'#020617',borderRadius:12}}>
      <text x="18" y="25" fill="#94a3b8" fontSize="12">{spacecraft.body.size} · Conceptual assembly</text>
      {faces.map((face,i)=><polygon key={i} points={face.points} fill={face.color} />)}
      {([[1,0,0],[0,1,0],[0,0,1]] as Vec3[]).map((axis,i)=>{
        const p=project(axis.map(v=>v*geometry.extent*.65) as Vec3);
        return <g key={i}><line x1="240" y1="145" x2={p.x} y2={p.y} stroke={['#ff5555','#55dd77','#44ddee'][i]} strokeWidth="1.5" strokeDasharray="3 3" /><text x={p.x+5} y={p.y-5} fill={['#ff5555','#55dd77','#44ddee'][i]} fontSize="13">+{['X','Y','Z'][i]}</text></g>;
      })}
      <text x="18" y="260" fill="#94a3b8" fontSize="11">Blue grids: solar cells · Cyan camera: {spacecraft.payload.side ?? '+Z'}</text>
    </svg>
    <label style={{display:'flex',alignItems:'center',gap:12,fontSize:12,marginTop:8}}>Rotate preview <input aria-label="Satellite preview rotation" type="range" min="0" max="360" value={angle} onChange={e=>setAngle(Number(e.target.value))} style={{flex:1}} /></label>
    <p style={{fontSize:12,color:'#94a3b8'}}>Body-frame preview. Sun pointing aims +X at the Sun; nadir pointing aims the selected payload face toward Earth. Payload face: {spacecraft.payload.side ?? '+Z'}. Body-mounted cells are fitted to their face; panel area remains defined by the configuration.</p>
  </div>;
}
