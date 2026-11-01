import React, { useMemo } from 'react';
import * as satellite from 'satellite.js';
import type { CompiledScenario } from '../types';
import { polarPoint, stationLook, type StationLook } from '../sim/station';

export default function OperatorPolarPlot({ scenario, timeSec, stationIndex, onStationChange }: {
  scenario: CompiledScenario;
  timeSec: number;
  stationIndex: number;
  onStationChange: (index: number) => void;
}) {
  const stations = scenario.mission.groundStations;
  const station = stations[stationIndex];
  const satrec = useMemo(() => satellite.twoline2satrec(
    scenario.mission.orbit.line1, scenario.mission.orbit.line2
  ), [scenario]);
  const passes = useMemo(() => {
    if (!station) return [];
    const result: { start: number; end: number; points: string }[] = [];
    let pass: { start: number; end: number; points: string } | null = null;
    (scenario.telemetry.lookAnglesByStation[station.id] ?? []).forEach((look, i) => {
      if (!look || look.elevationDeg < 0) { pass = null; return; }
      const t = scenario.telemetry.timeSec[i];
      if (!pass) { pass = { start: t, end: t, points: '' }; result.push(pass); }
      const p = polarPoint(look.azimuthDeg, look.elevationDeg);
      pass.end = t;
      pass.points += `${130 + p.x * 95},${130 + p.y * 95} `;
    });
    return result;
  }, [scenario, station]);
  if (!station) return <p>No ground stations configured. Add one in Build to use the operator camera and polar plot.</p>;

  // Live point uses propagation at the playback instant, not a nearest-sample jump.
  const date = new Date(Date.parse(scenario.meta.startIso) + timeSec * 1000);
  const pv = satellite.propagate(satrec, date);
  const look: StationLook | null = pv?.position ? stationLook(station, pv.position, satellite.gstime(date)) : null;
  const point = look ? polarPoint(look.azimuthDeg, look.elevationDeg) : null;
  const visible = !!look && look.elevationDeg >= station.maskDeg;
  const active = passes.find(pass => pass.end >= timeSec);
  const maskRadius = 95 * (90 - station.maskDeg) / 90;
  return <div>
    <label style={{ fontSize: 12 }}>Ground station <select aria-label="Operator ground station" value={stationIndex} onChange={e => onStationChange(Number(e.target.value))}>
      {stations.map((gs, i) => <option value={i} key={gs.id}>{gs.name}</option>)}
    </select></label>
    <svg viewBox="0 0 260 260" role="img" aria-label={`Antenna sky plot for ${station.name}, north at top, zenith at centre`} style={{ width: '100%', display: 'block' }}>
      <circle cx="130" cy="130" r="95" fill="#39232e" stroke="#64748b" />
      <circle cx="130" cy="130" r={maskRadius} fill="#071c2a" stroke="#fb7185" strokeDasharray="4 4" />
      {[30, 60].map(el => <circle key={el} cx="130" cy="130" r={95 * (90 - el) / 90} fill="none" stroke="#334155" />)}
      <path d="M35 130H225 M130 35V225" stroke="#334155" />
      {passes.map((pass, i) => <polyline key={i} points={pass.points} fill="none" stroke={pass === active ? '#44ebd3' : '#475569'} strokeWidth={pass === active ? 2.5 : 1} />)}
      {[['N', 130, 22], ['E', 243, 134], ['S', 130, 248], ['W', 17, 134]].map(([label, x, y]) => <text key={label} x={x} y={y} fill="#cbd5e1" fontSize="12" textAnchor="middle">{label}</text>)}
      {[0, 30, 60, 90].map(el => <text key={el} x="134" y={130 - 95 * (90 - el) / 90 - 3} fill="#94a3b8" fontSize="9">{el}°</text>)}
      {point && look && look.elevationDeg >= 0 && <circle cx={130 + point.x * 95} cy={130 + point.y * 95} r="5" fill={visible ? '#ffcf5c' : '#fb7185'} stroke="#020617" strokeWidth="2" />}
    </svg>
    <div style={{ fontSize: 13, color: visible ? '#44ebd3' : '#fda4af' }}>{visible ? 'Above antenna mask' : look && look.elevationDeg >= 0 ? 'Below antenna mask' : 'Below horizon'}</div>
    <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 6 }}>
      Az {look?.azimuthDeg.toFixed(1) ?? '—'}° · El {look?.elevationDeg.toFixed(1) ?? '—'}°<br />
      Range {look?.rangeKm.toFixed(0) ?? '—'} km · Mask {station.maskDeg}°
    </div>
    <p style={{ fontSize: 12, color: '#94a3b8' }}>Centre: overhead. Edge: horizon. Shaded ring: below mask. Turquoise: current or next pass; grey: other passes. Geometric visibility only.</p>
    {!passes.length && <p style={{ fontSize: 12 }}>No above-horizon passes in this run.</p>}
  </div>;
}
