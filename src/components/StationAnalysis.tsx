import React, { useMemo, useState } from 'react';
import type { CompiledScenario } from '../types';
import { contactWindows } from '../sim/contact';

export default function StationAnalysis({ scenario }: { scenario: CompiledScenario }) {
  const stations = scenario.mission.groundStations;
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [cursor, setCursor] = useState<number | null>(null);
  const station = stations.find(s => s.id === stationId) ?? stations[0];
  const times = scenario.telemetry.timeSec;
  const looks = station ? scenario.telemetry.lookAnglesByStation[station.id] ?? [] : [];
  const windows = useMemo(() => contactWindows(times, looks, station?.maskDeg ?? 0), [times, looks, station]);
  if (!station) return <p>No ground stations configured in this run. Add a station in Build and compile a new run.</p>;
  const duration = scenario.meta.durationSec;
  const secondsVisible = windows.reduce((sum, w) => sum + w.endSec - w.startSec, 0);
  let peakElevation = -90, closestContact = Infinity, maxRange = 1;
  looks.forEach(look => {
    if (!look) return;
    peakElevation = Math.max(peakElevation, look.elevationDeg);
    maxRange = Math.max(maxRange, look.rangeKm);
    if (look.elevationDeg >= station.maskDeg) closestContact = Math.min(closestContact, look.rangeKm);
  });
  maxRange *= 1.05;
  const width = 920, height = 270, left = 66, right = 58, top = 24, bottom = 44;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (t: number) => left + t / duration * plotWidth;
  const yElevation = (el: number) => top + (90 - el) / 180 * plotHeight;
  const yRange = (range: number) => top + (1 - range / maxRange) * plotHeight;
  // Shared indices preserve extrema and short contact changes on longer missions.
  const indices = new Set<number>([0, times.length - 1]);
  const bucket = Math.max(1, Math.ceil(times.length / 1200));
  for (let i = 0; i < times.length; i += bucket) {
    const extrema: number[] = [];
    for (const metric of ['elevationDeg', 'rangeKm'] as const) {
      let min = -1, max = -1;
      for (let j = i; j < Math.min(times.length, i + bucket); j++) {
        if (!looks[j]) continue;
        if (min < 0 || looks[j]![metric] < looks[min]![metric]) min = j;
        if (max < 0 || looks[j]![metric] > looks[max]![metric]) max = j;
      }
      if (min >= 0) extrema.push(min, max);
    }
    extrema.forEach(i => indices.add(i));
  }
  looks.forEach((look, i) => {
    const previous = looks[i - 1];
    if (i > 0 && (!!look !== !!previous || (look && previous && (look.elevationDeg >= station.maskDeg) !== (previous.elevationDeg >= station.maskDeg)))) {
      indices.add(i - 1); indices.add(i);
    }
  });
  const ordered = [...indices].sort((a, b) => a - b);
  const path = (metric: 'elevationDeg' | 'rangeKm', y: (value: number) => number) => {
    let connected = false;
    return ordered.map(i => {
      const look = looks[i];
      if (!look) { connected = false; return ''; }
      const command = connected ? 'L' : 'M'; connected = true;
      return `${command}${x(times[i]).toFixed(2)},${y(look[metric]).toFixed(2)}`;
    }).join(' ');
  };
  const inspect = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, ((event.clientX - bounds.left) / bounds.width * width - left) / plotWidth * duration));
    let lo = 0, hi = times.length - 1;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (times[mid] < t) lo = mid + 1; else hi = mid; }
    setCursor(lo > 0 && t - times[lo - 1] < times[lo] - t ? lo - 1 : lo);
  };
  const chart = (kind: 'elevation' | 'range') => {
    const elevation = kind === 'elevation';
    const y = elevation ? yElevation : yRange;
    const ticks = elevation ? [-90, -45, 0, 45, 90] : [0, maxRange / 4, maxRange / 2, maxRange * .75, maxRange];
    const curve = path(elevation ? 'elevationDeg' : 'rangeKm', y);
    const clipId = `station-contact-${kind}`;
    return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${station.name} ${elevation ? 'visibility elevation' : 'slant range'} versus mission time`} onPointerMove={inspect} onPointerLeave={() => setCursor(null)} style={{ width: '100%', display: 'block', background: '#020617', borderRadius: 12 }}>
      <defs><clipPath id={clipId}>{windows.map((w, i) => <rect key={i} x={x(w.startSec)} y={top} width={x(w.endSec) - x(w.startSec)} height={plotHeight} />)}</clipPath></defs>
      {windows.map((w, i) => <rect key={i} x={x(w.startSec)} y={top} width={x(w.endSec) - x(w.startSec)} height={plotHeight} fill="#144b46" opacity="0.5" />)}
      {ticks.map(tick => <g key={tick}><line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} stroke="#25324a" /><text x={left-8} y={y(tick)+4} textAnchor="end" fill="#94a3b8" fontSize="11">{tick.toFixed(0)}</text></g>)}
      {[0,1,2,3,4].map(i => <text key={i} x={x(duration*i/4)} y={height-23} textAnchor="middle" fill="#94a3b8" fontSize="11">{(duration*i/240).toFixed(1)}</text>)}
      <text x="12" y="17" fill="#cbd5e1" fontSize="12">{elevation ? 'deg' : 'km'}</text>
      <text x={width/2} y={height-5} textAnchor="middle" fill="#cbd5e1" fontSize="12">Mission time (minutes)</text>
      <>
        <line x1={left} x2={width-right} y1={yElevation(0)} y2={yElevation(0)} stroke="#94a3b8" strokeDasharray="3 5" />
        <line x1={left} x2={width-right} y1={yElevation(station.maskDeg)} y2={yElevation(station.maskDeg)} stroke="#fb7185" strokeDasharray="7 4" />
      </>
      {!elevation && <>
        {[-90,-45,0,45,90].map(value=><text key={value} x={width-right+8} y={yElevation(value)+4} fill="#c993ff" fontSize="10">{value}°</text>)}
        <text x={width-right-110} y="15" fill="#c993ff" fontSize="10">Right axis: elevation (deg)</text>
        <path d={path('elevationDeg',yElevation)} stroke="#c993ff" fill="none" strokeWidth="1.3" opacity=".8" />
      </>}
      <path d={curve} stroke="#7c8da8" fill="none" strokeWidth="2" />
      <path d={curve} stroke="#44ebd3" fill="none" strokeWidth="2.5" clipPath={`url(#${clipId})`} />
      {cursor !== null && <line x1={x(times[cursor])} x2={x(times[cursor])} y1={top} y2={height-bottom} stroke="#ffcf5c" />}
    </svg>;
  };
  const current = cursor !== null ? looks[cursor] : null;
  return <div style={{ display: 'grid', gap: 14 }}>
    <label>Ground station <select aria-label="Analysis ground station" value={station.id} onChange={event => { setStationId(event.target.value); setCursor(null); }}>{stations.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}</select></label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 13 }}>
      <span>Contact windows: <strong>{windows.length}</strong></span>
      <span>Time above mask: <strong>{(secondsVisible / 60).toFixed(1)} min</strong></span>
      <span>Peak elevation: <strong>{peakElevation.toFixed(1)}°</strong></span>
      <span>Closest during contact: <strong>{Number.isFinite(closestContact) ? `${closestContact.toFixed(0)} km` : 'No contact'}</strong></span>
    </div>
    <h3 style={{ fontSize: 14, margin: 0 }}>Ground station visibility</h3>
    {chart('elevation')}
    <div style={{ fontSize: 12, color: '#94a3b8' }}>Pink dashed: {station.maskDeg}° antenna mask. Grey dotted: horizon. Green shading: above-mask contact windows.</div>
    <h3 style={{ fontSize: 14, margin: '8px 0 0' }}>Satellite-to-station distance (slant range)</h3>
    {chart('range')}
    <div style={{fontSize:12,color:'#94a3b8'}}>Distance uses the left km axis. Purple elevation uses the right degree axis; its crossings of the pink mask and grey horizon show link geometry. A fixed distance threshold would be misleading when orbital altitude changes.</div>
    <div style={{ minHeight: 20, color: '#ffcf5c', fontSize: 13 }}>
      {cursor !== null && current ? `t = ${(times[cursor] / 60).toFixed(2)} min | Elevation ${current.elevationDeg.toFixed(1)}° | Range ${current.rangeKm.toFixed(0)} km | ${current.elevationDeg >= station.maskDeg ? 'Above mask' : current.elevationDeg >= 0 ? 'Below mask' : 'Below horizon'}` : 'Move over either graph to inspect both at the same time.'}
    </div>
    {!windows.length && <p style={{ margin: 0, fontSize: 13 }}>No above-mask contacts in this run. Try a longer mission or another station.</p>}
    <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Grey range includes times when Earth blocks the link; only green intervals are geometrically available for downlink. Transmission uses the configured constant rate without an RF link budget. Mask crossing times are interpolated between recorded samples; closest range is sample-based. Runs beginning or ending in contact include partial windows.</p>
  </div>;
}
