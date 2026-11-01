import React,{useState} from 'react';
import type {CompiledScenario} from '../types';
import {Card} from './ui';
export default function ThermalChart({scenario}:{scenario:CompiledScenario}) {
  const [cursor,setCursor]=useState<number|null>(null);
  const states=scenario.states,temperatures=states.map(s=>s.temperatureC);
  const min=temperatures.reduce((a,b)=>Math.min(a,b),Infinity),max=temperatures.reduce((a,b)=>Math.max(a,b),-Infinity);
  const low=Math.floor((min-5)/10)*10,high=Math.ceil((max+5)/10)*10;
  const x=(t:number)=>65+t/scenario.meta.durationSec*835,y=(c:number)=>25+(high-c)/(high-low)*220;
  const stride=Math.max(1,Math.ceil(states.length/2000));
  const points=states.filter((_,i)=>i%stride===0||i===states.length-1);
  const intervals:{start:number;end:number}[]=[];
  for(let i=1;i<states.length;i++)if(!states[i-1].sunlit){const previous=intervals.at(-1);if(previous?.end===states[i-1].timeSec)previous.end=states[i].timeSec;else intervals.push({start:states[i-1].timeSec,end:states[i].timeSec});}
  const selected=cursor===null?null:states[cursor];
  return <Card title="Satellite temperature — single node">
    <div className="resource-metrics"><span>Minimum: <strong>{min.toFixed(1)} °C</strong></span><span>Maximum: <strong>{max.toFixed(1)} °C</strong></span><span>Final: <strong>{temperatures.at(-1)!.toFixed(1)} °C</strong></span></div>
    <svg role="img" aria-label="Satellite temperature versus mission time" viewBox="0 0 920 290" style={{display:'block',width:'100%',background:'#020617',borderRadius:10}} onPointerLeave={()=>setCursor(null)} onPointerMove={event=>{
      const bounds=event.currentTarget.getBoundingClientRect(),time=Math.max(0,Math.min(scenario.meta.durationSec,((event.clientX-bounds.left)/bounds.width*920-65)/835*scenario.meta.durationSec));
      let lo=0,hi=states.length-1;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(states[mid].timeSec<time)lo=mid+1;else hi=mid;}setCursor(lo);
    }}>
      {intervals.map((v,i)=><rect key={i} x={x(v.start)} y={25} width={x(v.end)-x(v.start)} height={220} fill="#283650" opacity=".65"/>)}
      {[0,1,2,3,4].map(i=><g key={i}><line x1={65} x2={900} y1={y(low+(high-low)*i/4)} y2={y(low+(high-low)*i/4)} stroke="#27344c"/><text x={57} y={y(low+(high-low)*i/4)+4} fill="#94a3b8" fontSize={11} textAnchor="end">{(low+(high-low)*i/4).toFixed(0)}</text><text x={x(scenario.meta.durationSec*i/4)} y={267} fill="#94a3b8" fontSize={11} textAnchor="middle">{(scenario.meta.durationSec*i/240).toFixed(1)}</text></g>)}
      <path d={points.map((s,i)=>`${i?'L':'M'}${x(s.timeSec).toFixed(2)},${y(s.temperatureC).toFixed(2)}`).join(' ')} fill="none" stroke="#fb923c" strokeWidth={2}/>
      {selected&&<line x1={x(selected.timeSec)} x2={x(selected.timeSec)} y1={25} y2={245} stroke="#f8fafc"/>}
      <text x={12} y={18} fill="#cbd5e1" fontSize={12}>°C</text><text x={460} y={284} fill="#cbd5e1" textAnchor="middle" fontSize={12}>Mission time (minutes)</text>
    </svg>
    <p className="muted">{selected?`t = ${(selected.timeSec/60).toFixed(2)} min · ${selected.temperatureC.toFixed(2)} °C · Sun ${selected.solarHeatW.toFixed(1)} W · Earth IR ${selected.earthInfraredHeatW.toFixed(1)} W · Albedo ${selected.albedoHeatW.toFixed(1)} W · Internal ${selected.internalHeatW.toFixed(1)} W · Radiated ${selected.radiatedHeatW.toFixed(1)} W`:'Move over the graph to inspect temperature and heat flows. Shaded: eclipse.'}</p>
    <p className="muted">One temperature for the bus and all deployed panels. Heat flows include absorbed sunlight, simplified Earth IR/albedo, electrical dissipation and radiation to space. No thermal protection or temperature feedback into other subsystems.</p>
  </Card>;
}
