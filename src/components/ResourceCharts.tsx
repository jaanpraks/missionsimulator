import React, { useState } from 'react';
import type { CompiledScenario } from '../types';
import { DEFAULT_STORAGE } from '../sim/resources';
import { Card } from './ui';

export default function ResourceCharts({scenario}:{scenario:CompiledScenario}) {
  const [cursor,setCursor]=useState<number|null>(null);
  const states=scenario.states;
  const last=states.at(-1)!;
  const duration=scenario.meta.durationSec;
  const capacity=scenario.mission.spacecraft.storage?.capacityMB ?? DEFAULT_STORAGE.capacityMB;
  const width=920,height=290,left=65,right=20,top=25,bottom=45;
  const x=(t:number)=>left+t/duration*(width-left-right);
  const inspect=(event:React.PointerEvent<SVGSVGElement>)=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    const t=Math.max(0,Math.min(duration,((event.clientX-bounds.left)/bounds.width*width-left)/(width-left-right)*duration));
    let lo=0,hi=states.length-1;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(states[mid].timeSec<t)lo=mid+1;else hi=mid;}
    setCursor(lo>0 && t-states[lo-1].timeSec<states[lo].timeSec-t?lo-1:lo);
  };
  const plot=(kind:'battery'|'memory')=>{
    const battery=kind==='battery', maximum=battery?100:capacity;
    const y=(value:number)=>top+(1-value/maximum)*(height-top-bottom);
    const value=(i:number)=>battery?states[i].batterySoc*100:states[i].storedBytes/1e6;
    const indices=new Set<number>([0,states.length-1]);
    const bucket=Math.max(1,Math.ceil(states.length/1200));
    for(let i=0;i<states.length;i+=bucket){let low=i,high=i;for(let j=i;j<Math.min(states.length,i+bucket);j++){if(value(j)<value(low))low=j;if(value(j)>value(high))high=j;}indices.add(low);indices.add(high);}
    const path=[...indices].sort((a,b)=>a-b).map((i,n)=>`${n?'L':'M'}${x(states[i].timeSec).toFixed(2)},${y(value(i)).toFixed(2)}`).join(' ');
    const intervals:{start:number;end:number}[]=[];
    for(let i=1;i<states.length;i++) {
      const shaded=battery?!states[i-1].sunlit:states[i].downloadedBytes>states[i-1].downloadedBytes;
      if(!shaded)continue;
      const previous=intervals.at(-1);
      if(previous && previous.end===states[i-1].timeSec)previous.end=states[i].timeSec;
      else intervals.push({start:states[i-1].timeSec,end:states[i].timeSec});
    }
    return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={battery?'Battery state of charge versus mission time':'Memory usage versus mission time'} onPointerMove={inspect} onPointerLeave={()=>setCursor(null)} style={{width:'100%',display:'block',background:'#020617',borderRadius:10}}>
      {intervals.map((interval,i)=><rect key={i} x={x(interval.start)} y={top} width={x(interval.end)-x(interval.start)} height={height-top-bottom} fill={battery?'#283650':'#175a96'} opacity=".65"/>)}
      {[0,1,2,3,4].map(i=><g key={i}><line x1={left} x2={width-right} y1={y(maximum*i/4)} y2={y(maximum*i/4)} stroke="#27344c"/><text x={left-8} y={y(maximum*i/4)+4} fill="#94a3b8" fontSize="11" textAnchor="end">{(maximum*i/4).toFixed(battery?0:1)}</text><text x={x(duration*i/4)} y={height-24} fill="#94a3b8" fontSize="11" textAnchor="middle">{(duration*i/240).toFixed(1)}</text></g>)}
      <line x1={left} x2={width-right} y1={y(maximum)} y2={y(maximum)} stroke="#fb7185" strokeDasharray="6 4"/>
      <text x="12" y="18" fill="#cbd5e1" fontSize="12">{battery?'%':'MB'}</text>
      <text x={width/2} y={height-6} fill="#cbd5e1" fontSize="12" textAnchor="middle">Mission time (minutes)</text>
      <path d={path} stroke={battery?'#ffcf5c':'#44ebd3'} strokeWidth="2" fill="none"/>
      {cursor!==null && <line x1={x(states[cursor].timeSec)} x2={x(states[cursor].timeSec)} y1={top} y2={height-bottom} stroke="#f8fafc"/>}
    </svg>;
  };
  const minimum=states.reduce((min,state)=>Math.min(min,state.batterySoc),1);
  const peakMemory=states.reduce((max,state)=>Math.max(max,state.storedBytes),0);
  const selected=cursor!==null?states[cursor]:null;
  return <>
    <Card title="Battery charge and discharge">
      <div className="resource-metrics"><span>Capacity: <strong>{scenario.mission.spacecraft.power.batteryCapacityWh} Wh</strong></span><span>Minimum: <strong>{(minimum*100).toFixed(1)}%</strong></span><span>Final: <strong>{(last.batterySoc*100).toFixed(1)}%</strong></span><span>Unmet demand: <strong>{last.unmetEnergyWh.toFixed(3)} Wh</strong></span></div>
      {plot('battery')}
      <p className="muted">Yellow: state of charge. Shaded: eclipse. Surplus solar power charges the battery; mode and radio loads discharge it. Capacity, efficiencies and charge/discharge power limits apply.</p>
      {last.unmetEnergyWh>1e-6 && <p style={{color:'#fda4af'}}>Power shortages occurred. Imaging and transmission pause when demand cannot be met; planned modes continue without an automatic safe-mode transition.</p>}
    </Card>
    <Card title="Memory usage and downlinked data">
      <div className="resource-metrics"><span>Storage: <strong>{capacity} MB</strong></span><span>Peak used: <strong>{(peakMemory/1e6).toFixed(2)} MB</strong></span><span>Images: <strong>{last.imagesCaptured}</strong></span><span>Dropped: <strong>{last.imagesDropped}</strong></span><span>Downloaded: <strong>{(last.downloadedBytes/1e6).toFixed(2)} MB</strong></span></div>
      {plot('memory')}
      <p className="muted">Turquoise: stored data. Blue shading: data downloaded during the sample interval. Pink dashed: storage capacity. Raw images require space for the whole image; overflowing images are dropped. The radio serves one station at a time, without multiplying rate during overlapping contacts.</p>
      <p className="muted">Downlink strategy: {scenario.mission.missionPlan?.downlinkStrategy==='disabled'?'Do not download data':'Download when a ground station is available'}. Initial storage is empty. MB are decimal megabytes; image compression and RF link budgets are omitted.</p>
    </Card>
    <div className="muted">{selected?`t = ${(selected.timeSec/60).toFixed(2)} min | Battery ${(selected.batterySoc*100).toFixed(1)}% (${selected.batteryWh.toFixed(2)} Wh) | Memory ${(selected.storedBytes/1e6).toFixed(3)} MB | Downloaded ${(selected.downloadedBytes/1e6).toFixed(3)} MB`:'Move over either resource graph to inspect the same mission instant.'}</div>
  </>;
}
