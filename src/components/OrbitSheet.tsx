import InfoPopover from './InfoPopover';
import React, { useState } from 'react';
import { EARTH_CONTOURS } from '../mission/earthContours';
import type { MissionDefinition } from '../mission/definition';
import { ascendingNodeLongitude, EARTH_RADIUS_KM, elementsFromTle, orbitGeometry, tleFromElements, type OrbitElements } from '../mission/orbit';
import { Card } from './ui';

function Slider({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit: string;
  onChange: (value: number) => void;
}) {
  return <label style={{ display: 'grid', gap: 8, fontSize: 13 }}>
    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><span>{label}</span><strong style={{ color: '#44ebd3', fontVariantNumeric: 'tabular-nums' }}>{value.toFixed(step < 1 ? 1 : 0)} {unit}</strong></span>
    <input aria-label={label} type="range" min={Math.min(min, value)} max={Math.max(max, value)} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: '#44ebd3' }} />
    <span style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11 }}><span>{min} {unit}</span><span>{max} {unit}</span></span>
  </label>;
}

function OrbitPreview({ elements, startIso }: { elements: OrbitElements; startIso: string }) {
  const [viewLongitude,setViewLongitude] = useState(20);
  const { a, b, e } = orbitGeometry(elements);
  const scale = 150 / (a * (1 + e));
  const radians = (deg: number) => deg * Math.PI / 180;
  const inc = radians(elements.inclinationDeg), node = radians(ascendingNodeLongitude(elements.raanDeg,startIso)), arg = radians(elements.argumentOfPerigeeDeg);
  const yaw = radians(viewLongitude), elevation = radians(25);
  const project = (wx:number, wy:number, wz:number) => ({
    x:300+(-Math.sin(yaw)*wx+Math.cos(yaw)*wy)*scale,
    y:180-(-Math.sin(elevation)*Math.cos(yaw)*wx-Math.sin(elevation)*Math.sin(yaw)*wy+Math.cos(elevation)*wz)*scale,
    depth:Math.cos(elevation)*Math.cos(yaw)*wx+Math.cos(elevation)*Math.sin(yaw)*wy+Math.sin(elevation)*wz
  });
  const point = (anomaly: number, inPlane = false) => {
    const x = a * (Math.cos(anomaly) - e), y = b * Math.sin(anomaly);
    if (inPlane) return { x: 300 + x * scale, y: 180 - y * scale, depth: 0 };
    const px=x*Math.cos(arg)-y*Math.sin(arg), py=x*Math.sin(arg)+y*Math.cos(arg);
    return project(px*Math.cos(node)-py*Math.cos(inc)*Math.sin(node),px*Math.sin(node)+py*Math.cos(inc)*Math.cos(node),py*Math.sin(inc));
  };
  const geoPoint = (lng:number,lat:number) => project(EARTH_RADIUS_KM*Math.cos(radians(lat))*Math.cos(radians(lng)),EARTH_RADIUS_KM*Math.cos(radians(lat))*Math.sin(radians(lng)),EARTH_RADIUS_KM*Math.sin(radians(lat)));
  const geographicPath = (coordinates:number[][]) => {
    let path='', connected=false;
    for(let i=1;i<coordinates.length;i++) {
      const from=coordinates[i-1], to=coordinates[i];
      const delta=((to[0]-from[0]+540)%360)-180;
      const steps=Math.max(1,Math.ceil(Math.max(Math.abs(delta),Math.abs(to[1]-from[1]))/2));
      for(let j=0;j<=steps;j++) {
        const p=geoPoint(from[0]+delta*j/steps,from[1]+(to[1]-from[1])*j/steps);
        if(p.depth<0){connected=false;continue;}
        path+=(connected?'L':'M')+p.x.toFixed(2)+','+p.y.toFixed(2);connected=true;
      }
    }
    return path;
  };
  const equator=geographicPath(Array.from({length:181},(_,i)=>[-180+2*i,0]));
  const meridian=geographicPath(Array.from({length:91},(_,i)=>[0,-90+2*i]));
  // Argument of latitude is zero at the northbound equator crossing.
  const nodeRadius = a*(1-e*e)/(1+e*Math.cos(-arg));
  const ascending = project(Math.cos(node)*nodeRadius,Math.sin(node)*nodeRadius,0);
  const segments = Array.from({ length: 240 }, (_, i) => [point(i * 2 * Math.PI / 240), point((i + 1) * 2 * Math.PI / 240)]);
  const segmentPath = (front: boolean) => segments.filter(s => (s[0].depth + s[1].depth >= 0) === front).map(s => `M${s[0].x},${s[0].y}L${s[1].x},${s[1].y}`).join(' ');
  let anomaly = radians(elements.meanAnomalyDeg);
  for (let i = 0; i < 12; i++) anomaly -= (anomaly - e * Math.sin(anomaly) - radians(elements.meanAnomalyDeg)) / (1 - e * Math.cos(anomaly));
  const satellite = point(anomaly);
  const radius = EARTH_RADIUS_KM * scale;
  const outline = Array.from({ length: 241 }, (_, i) => { const p = point(i * 2 * Math.PI / 240, true); return `${p.x},${p.y}`; }).join(' ');
  return <>
    <svg viewBox="0 0 600 360" role="img" aria-label="Earth and inclined orbital ellipse, with continent outlines and the satellite starting position" style={{ width: '100%', display: 'block', background: '#020617', borderRadius: 12 }}>
      <defs><radialGradient id="orbit-earth"><stop offset="0" stopColor="#4598bf" /><stop offset="0.8" stopColor="#145276" /><stop offset="1" stopColor="#0a273f" /></radialGradient></defs>
      <text x="20" y="28" fill="#94a3b8" fontSize="12">Orbit orientation · Earth-centred view</text>
      <path d={segmentPath(false)} stroke="#44ebd3" strokeWidth="2" fill="none" opacity="0.45" />
      <circle cx="300" cy="180" r={radius} fill="url(#orbit-earth)" stroke="#62a8cb" />
      {EARTH_CONTOURS.map((coast,i)=><path key={i} d={geographicPath(coast)} fill="none" stroke="#a2cfa4" strokeWidth="1.2" />)}
      <path d={equator} fill="none" stroke="#91c9db" strokeDasharray="4 4" />
      <path d={meridian} fill="none" stroke="#e5bc83" strokeDasharray="2 4" />
      {ascending.depth>=0 && Math.abs(Math.sin(inc))>1e-6 && <g><circle cx={ascending.x} cy={ascending.y} r="4" fill="#ff8899"/><text x={ascending.x+6} y={ascending.y-8} fill="#ff8899" fontSize="11">Ascending node</text></g>}
      <path d={segmentPath(true)} stroke="#44ebd3" strokeWidth="3" fill="none" />
      {(satellite.depth >= 0 || Math.hypot(satellite.x - 300, satellite.y - 180) > radius) && <circle cx={satellite.x} cy={satellite.y} r="5" fill="#ffcf5c" stroke="#020617" strokeWidth="2" />}
      <text x="20" y="332" fill="#94a3b8" fontSize="12">Dashed: equator / Greenwich · Yellow dot: starting position</text>
    </svg>
    <label style={{display:'flex',gap:12,fontSize:12,alignItems:'center',marginTop:12}}>View longitude {viewLongitude} deg<input aria-label="Orbit preview longitude" type="range" min="-180" max="180" value={viewLongitude} onChange={e=>setViewLongitude(Number(e.target.value))} style={{flex:1}} /></label>
    <InfoPopover label="Orbit configuration">Earth-fixed at mission start. RAAN is measured in the inertial equatorial frame, not from Greenwich. Coastlines are schematic.</InfoPopover>
    <details style={{ marginTop: 12 }}><summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}>Inspect the ellipse in its orbital plane</summary>
    <svg viewBox="0 0 600 360" role="img" aria-label="Orbit shape viewed in its own plane; Earth at one focus" style={{ width: '100%', display: 'block' }}>
      <text x="20" y="22" fill="#94a3b8" fontSize="12">Orbit shape · Viewed in the orbital plane</text>
      <polyline points={outline} fill="none" stroke="#44ebd3" strokeWidth="2" />
      <circle cx="300" cy="180" r={radius} fill="#145276" stroke="#62a8cb" />
      <circle cx="300" cy="180" r="3" fill="#cbd5e1" />
      <text x="142" y="345" fill="#94a3b8" fontSize="12">Apogee: {elements.apogeeKm.toFixed(0)} km</text>
      <text x="350" y="345" fill="#94a3b8" fontSize="12">Perigee: {elements.perigeeKm.toFixed(0)} km</text>
    </svg>
    </details>
  </>;
}

export default function OrbitSheet({ mission, onUpdate }: {
  mission: MissionDefinition;
  onUpdate: (change: (next: MissionDefinition) => void) => string | null;
}) {
  let elements: OrbitElements;
  try { elements = elementsFromTle(mission.orbit.line2); }
  catch (error) { return <Card title="Orbit"><p role="alert">{String(error)}</p></Card>; }
  const { e, periodSec } = orbitGeometry(elements);
  const change = (patch: Partial<OrbitElements>) => {
    const next = { ...elements, ...patch };
    if (patch.perigeeKm !== undefined) next.apogeeKm = Math.max(next.perigeeKm, next.apogeeKm);
    if (patch.apogeeKm !== undefined) next.perigeeKm = Math.min(next.perigeeKm, next.apogeeKm);
    onUpdate(m => { m.orbit = tleFromElements(next, m.simulation.startIso, m.orbit); });
  };
  return <>
    <div className="orbit-builder-grid">
      <Card title="Orbit configuration">
        <div style={{ display: 'grid', gap: 22 }}>
          <InfoPopover label="Orbit configuration">Move the sliders to change the orbit. Equal perigee and apogee produce a circular orbit.</InfoPopover>
          <Slider label="Perigee altitude" value={elements.perigeeKm} min={150} max={2000} unit="km" onChange={value => change({ perigeeKm: value })} />
          <Slider label="Apogee altitude" value={elements.apogeeKm} min={150} max={10000} unit="km" onChange={value => change({ apogeeKm: value })} />
          <Slider label="Inclination" value={elements.inclinationDeg} min={0} max={180} step={0.1} unit="deg" onChange={value => change({ inclinationDeg: value })} />
          <div style={{ color: '#94a3b8', fontSize: 12 }}>0°: equatorial · 90°: polar · above 90°: retrograde</div>
          <details><summary style={{ cursor: 'pointer', marginBottom: 16 }}>Orbital plane and starting position</summary><div style={{ display: 'grid', gap: 22 }}>
            <Slider label="Ascending node (RAAN)" value={elements.raanDeg} min={0} max={359.9} step={0.1} unit="deg" onChange={value => change({ raanDeg: value })} />
            <label style={{fontSize:13}}>RAAN exact value (deg)<input aria-label="RAAN exact value" type="number" min="0" max="360" step="0.1" value={elements.raanDeg} onChange={e=>{if(e.target.value!=='' && Number.isFinite(Number(e.target.value)))change({raanDeg:Number(e.target.value)});}} style={{width:'100%',boxSizing:'border-box',marginTop:6}} /></label>
            <p style={{fontSize:12,color:'#94a3b8'}}>Ascending-node longitude at mission start: {ascendingNodeLongitude(elements.raanDeg,mission.simulation.startIso).toFixed(1)} deg east. Equatorial orbits have no unique ascending node.</p>
            <Slider label="Argument of perigee" value={elements.argumentOfPerigeeDeg} min={0} max={359.9} step={0.1} unit="deg" onChange={value => change({ argumentOfPerigeeDeg: value })} />
            <Slider label="Starting phase (mean anomaly)" value={elements.meanAnomalyDeg} min={0} max={359.9} step={0.1} unit="deg" onChange={value => change({ meanAnomalyDeg: value })} />
          </div></details>
          <div style={{ borderTop: '1px solid #334155', paddingTop: 12, fontSize: 13 }}>Period: <strong>{(periodSec / 60).toFixed(1)} min</strong> · Eccentricity: <strong>{e.toFixed(4)}</strong></div>
        </div>
      </Card>
      <Card title="Earth and orbital ellipse"><OrbitPreview elements={elements} startIso={mission.simulation.startIso} /></Card>
    </div>
    <Card title="Educational TLE">
      <InfoPopover label="Orbit configuration">Slider edits update the shared TLE, with its epoch set to the mission start time. Altitudes and the diagram are approximate mean-element geometry; simulation uses satellite.js. Manual TLE edits remain available in Configuration JSON.</InfoPopover>
      <pre style={{ overflowX: 'auto', fontSize: 12, color: '#44ebd3', padding: 12, background: '#020617', borderRadius: 8 }}>{mission.orbit.line1 + '\n' + mission.orbit.line2}</pre>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>Mission start (UTC): {mission.simulation.startIso}</div>
    </Card>
  </>;
}
