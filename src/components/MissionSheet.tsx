import InfoPopover from './InfoPopover';
import MissionModesTable from './MissionModesTable';
import { missionModeBudgets } from '../mission/modes';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import type { MissionDefinition } from '../mission/definition';
import { defaultMissionPlan, missionTiming, operationAt, validateOperationSchedule } from '../sim/operations';
import { Button, Card, Select } from './ui';
import { Field, FieldValidity } from './FormField';

const grid: React.CSSProperties = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12};
const colors: Record<string,string> = {nominal:'#5276b9',idle:'#5276b9',safe:'#e4ad56',imaging:'#44dcb8',downlink:'#b791ef'};

export default function MissionSheet({mission,onUpdate}: {
  mission:MissionDefinition; onUpdate:(change:(next:MissionDefinition)=>void)=>string|null;
}) {
  const [duty,setDuty]=useState(20);
  const reportValidity=useContext(FieldValidity);
  const timing=useMemo(()=>{
    try {return {...missionTiming(mission),error:null};}
    catch(error){return {periodSec:5400,durationSec:5400,error:String(error)};}
  },[mission]);
  const plan=mission.missionPlan ?? defaultMissionPlan;
  const limit=plan.repeatEachOrbit ? timing.periodSec : timing.durationSec;
  let scheduleError=timing.error;
  try {
    validateOperationSchedule(mission,timing.periodSec,timing.durationSec);
    if (Math.ceil(timing.durationSec/mission.simulation.stepSec)+1>100000) scheduleError='Run exceeds 100,000 samples. Increase the time step or shorten the mission.';
  } catch(error){scheduleError=error instanceof Error ? error.message : String(error);}
  useEffect(()=>{reportValidity('Mission schedule',scheduleError);return()=>reportValidity('Mission schedule',null);},[scheduleError,reportValidity]);
  const changePlan=(patch:Partial<NonNullable<MissionDefinition['missionPlan']>>)=>onUpdate(next=>{next.missionPlan={...(next.missionPlan ?? defaultMissionPlan),...patch};});
  const numeric=(change:(next:MissionDefinition,value:number)=>void)=>(text:string)=> {
    if(!text.trim() || !Number.isFinite(Number(text))) return 'Enter a finite number.';
    return onUpdate(next=>change(next,Number(text)));
  };
  const sorted=[...mission.operations].sort((a,b)=>a.startSec-b.startSec);
  const segments:{start:number;end:number;mode:string}[]=[];
  let end=0;
  for(const op of sorted) {
    if(op.startSec>end)segments.push({start:end,end:Math.min(limit,op.startSec),mode:plan.defaultMode});
    if(op.startSec<limit)segments.push({start:op.startSec,end:Math.min(limit,op.endSec),mode:op.mode});
    end=Math.max(end,op.endSec);
  }
  if(end<limit)segments.push({start:end,end:limit,mode:plan.defaultMode});
  const imagingSec=segments.filter(s=>s.mode==='imaging').reduce((sum,s)=>sum+s.end-s.start,0);
  const latestEnd=mission.operations.reduce((end,op)=>Math.max(end,op.endSec),0);
  const points=[0,...sorted.flatMap(op=>[op.startSec,op.endSec]),limit].filter(t=>t>=0 && t<=limit).sort((a,b)=>a-b);
  const maxLoad=Math.max(1,...missionModeBudgets(mission.spacecraft).map(mode => mode.totalW))*1.2;
  const x=(t:number)=>60+t/limit*790;
  const y=(load:number)=>215-load/maxLoad*85;
  let loadPath='';
  for(let i=0;i<points.length-1;i++){
    const start=points[i],stop=points[i+1];
    const load=operationAt(mission,(start+stop)/2,timing.periodSec).totalLoadW;
    loadPath+=(i ? 'L':'M')+x(start)+','+y(load)+'L'+x(stop)+','+y(load);
  }
  return <div className="stage-content">
    <Card title="Mission and simulation">
      <div style={grid}>
        <Field label="Mission name" type="text" value={mission.name} onCommit={value=>onUpdate(next=>{next.name=value;})} />
        <label>Simulation length<Select aria-label="Simulation length type" value={mission.simulation.duration.type} onChange={e=>onUpdate(next=>{next.simulation.duration=e.target.value==='orbits'?{type:'orbits',count:1}:{type:'seconds',seconds:21600};})}><option value="orbits">Number of orbits</option><option value="seconds">Hours</option></Select></label>
        {mission.simulation.duration.type==='orbits'
          ? <Field label="Number of orbits" min={1} max={100} step="1" value={mission.simulation.duration.count} onCommit={numeric((next,value)=>{next.simulation.duration={type:'orbits',count:value};})}/>
          : <Field label="Simulation hours" min={1/3600} max={240} value={mission.simulation.duration.seconds/3600} onCommit={numeric((next,value)=>{next.simulation.duration={type:'seconds',seconds:value*3600};})}/>}
        <Field label="Time step (s)" min={1} max={120} value={mission.simulation.stepSec} onCommit={numeric((next,value)=>{next.simulation.stepSec=value;})}/>
        <Field label="Mission start (UTC ISO)" type="text" value={mission.simulation.startIso} onCommit={value=>onUpdate(next=>{next.simulation.startIso=value;})}/>
      </div>
      <p className="muted">Orbit: {(timing.periodSec/60).toFixed(1)} min · Run: {(timing.durationSec/3600).toFixed(2)} h. Changing start time does not rewrite an imported TLE; use Orbit controls to generate elements at the new epoch.</p>
    </Card>
    <Card title="Mission modes">
      <div style={grid}>
        <label>Default operating mode<Select aria-label="Default operating mode" value={plan.defaultMode} onChange={e=>changePlan({defaultMode:e.target.value as 'nominal'|'safe'})}><option value="nominal">Nominal</option><option value="safe">Safe</option></Select></label>
        <label>Downlink strategy<Select aria-label="Downlink strategy" value={plan.downlinkStrategy ?? 'when-available'} onChange={e=>changePlan({downlinkStrategy:e.target.value as 'when-available'|'disabled'})}><option value="when-available">Download when a station is available</option><option value="disabled">Do not download data</option></Select></label>
      </div>
      <MissionModesTable spacecraft={mission.spacecraft} />
    </Card>
    <Card title="Operations schedule">
      <label><input type="checkbox" aria-label="Repeat schedule each orbit" checked={plan.repeatEachOrbit} onChange={e=>changePlan({repeatEachOrbit:e.target.checked})}/> Repeat this schedule each orbit</label>
      <InfoPopover label="Mission planning">Times are minutes from {plan.repeatEachOrbit?'the beginning of each orbit':'mission start'}. Unscheduled time uses {plan.defaultMode} mode. Intervals must not overlap.</InfoPopover>
      {scheduleError && <p role="alert" style={{color:'#fca5a5'}}>{scheduleError}</p>}
      {mission.operations.map((op,i)=><fieldset key={i} style={{border:'1px solid #334155',borderRadius:8,padding:12,margin:'10px 0'}}>
        <legend>Interval {i+1}</legend><div style={grid}>
          <label>Mode<Select aria-label={`Interval ${i+1} mode`} value={op.mode} onChange={e=>onUpdate(next=>{next.operations[i].mode=e.target.value as typeof op.mode;})}>{['nominal','safe','imaging','downlink'].map(mode=><option key={mode}>{mode}</option>)}{op.mode==='idle'&&<option value="idle">idle (nominal)</option>}</Select></label>
          <Field label={`Interval ${i+1} start (min)`} min={0} value={op.startSec/60} onCommit={numeric((next,value)=>{next.operations[i].startSec=value*60;})}/>
          <Field label={`Interval ${i+1} end (min)`} min={0} value={op.endSec/60} onCommit={numeric((next,value)=>{next.operations[i].endSec=value*60;})}/>
        </div><div style={{marginTop:10}}><Button variant="ghost" onClick={()=>onUpdate(next=>{next.operations.splice(i,1);})}>Remove interval {i+1}</Button></div>
      </fieldset>)}
      {!mission.operations.length && <p>No intervals: {plan.defaultMode} mode for the entire run.</p>}
      <Button disabled={latestEnd>=limit} onClick={()=>onUpdate(next=>{next.operations.push({startSec:latestEnd,endSec:Math.min(limit,latestEnd+300),mode:'imaging'});})}>Add interval</Button>
      <div style={{borderTop:'1px solid #27344c',marginTop:16,paddingTop:12,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <label>Payload duty-cycle preset: {duty}% <input aria-label="Payload duty cycle preset" type="range" min="0" max="100" value={duty} onChange={e=>setDuty(Number(e.target.value))}/></label>
        <Button variant="ghost" onClick={()=>onUpdate(next=>{next.operations=duty>0?[{startSec:0,endSec:limit*duty/100,mode:'imaging'}]:[];})}>Replace schedule with preset</Button>
      </div>
    </Card>
    <Card title="Schedule and load preview">
      <div style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:13}}><span>Preview: {plan.repeatEachOrbit?'one repeating orbit':'whole mission'}</span><span>Payload active: {(imagingSec/60).toFixed(1)} min ({(imagingSec/limit*100).toFixed(1)}%)</span></div>
      <svg viewBox="0 0 920 260" role="img" aria-label="Planned operating modes and electrical load over mission time" style={{width:'100%',display:'block',background:'#020617',borderRadius:8,marginTop:10}}>
        <text x="12" y="32" fill="#94a3b8" fontSize="12">Mode</text>
        {segments.map((segment,i)=><g key={i}><rect x={x(segment.start)} y="20" width={Math.max(0,x(segment.end)-x(segment.start))} height="45" fill={colors[segment.mode]}/>{x(segment.end)-x(segment.start)>65 && <text x={(x(segment.start)+x(segment.end))/2} y="47" textAnchor="middle" fill="#020617" fontSize="12">{segment.mode}</text>}</g>)}
        {[0,1,2,3,4].map(i=><g key={i}><line x1={x(limit*i/4)} x2={x(limit*i/4)} y1="20" y2="220" stroke="#64748b" opacity=".3"/><text x={x(limit*i/4)} y="242" fill="#94a3b8" fontSize="11" textAnchor="middle">{(limit*i/240).toFixed(1)} min</text></g>)}
        <text x="12" y="112" fill="#94a3b8" fontSize="12">Load W</text>
        {[0,maxLoad/2,maxLoad].map(load=><g key={load}><line x1="60" x2="850" y1={y(load)} y2={y(load)} stroke="#27344c"/><text x="52" y={y(load)+4} fill="#94a3b8" fontSize="11" textAnchor="end">{load.toFixed(1)}</text></g>)}
        <path d={loadPath} fill="none" stroke="#ffcf5c" strokeWidth="2"/>
      </svg>
      <div style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:12,marginTop:8}}>{['nominal','safe','imaging','downlink'].map(mode=><span key={mode} style={{color:colors[mode]}}>■ {mode}</span>)}<span style={{color:'#ffcf5c'}}>Line: electrical demand</span></div>
      <InfoPopover label="Mission planning">Preview shows scheduled loads. Contact-dependent radio demand is added during simulation, when data is actually available to transmit.</InfoPopover>
    </Card>
  </div>;
}
