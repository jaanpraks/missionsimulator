import React, { useState } from 'react';
import type { CompiledScenario } from '../types';

export default function SolarPowerChart({ scenario }: { scenario: CompiledScenario }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const { timeSec, solarPowerByPanelW, totalSolarPowerW, sunlight } = scenario.telemetry;
  const panels = scenario.mission.spacecraft.power.solarPanels;
  const color = (i: number) => `hsl(${(165 + i * 137.508) % 360} 80% 65%)`;
  const width = 920, height = 330, left = 58, right = 20, top = 20, bottom = 48;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const duration = scenario.meta.durationSec;
  const max = totalSolarPowerW.reduce((peak, watts) => Math.max(peak, watts), 1) * 1.1;
  const x = (t: number) => left + t / duration * plotWidth;
  const y = (w: number) => top + plotHeight * (1 - w / max);
  const eclipses: { start: number; end: number }[] = [];
  for (let i = 0; i < sunlight.length; i++) {
    if (sunlight[i]) continue;
    const start = timeSec[i];
    while (i + 1 < sunlight.length && !sunlight[i + 1]) i++;
    eclipses.push({ start, end: timeSec[i + 1] ?? duration });
  }
  // Preserve each bucket's extrema, so small peaks survive long-run rendering.
  const path = (values: number[]) => {
    const indices = new Set<number>([0, values.length - 1]);
    const bucket = Math.max(1, Math.ceil(values.length / 1000));
    for (let i = 0; i < values.length; i += bucket) {
      let low = i, high = i;
      for (let j = i; j < Math.min(values.length, i + bucket); j++) {
        if (values[j] < values[low]) low = j;
        if (values[j] > values[high]) high = j;
      }
      indices.add(low); indices.add(high);
    }
    return [...indices].sort((a, b) => a - b).map((i, n) => `${n ? 'L' : 'M'}${x(timeSec[i]).toFixed(2)},${y(values[i]).toFixed(2)}`).join(' ');
  };
  let energyWh = 0;
  for (let i = 1; i < timeSec.length; i++) energyWh += (totalSolarPowerW[i - 1] + totalSolarPowerW[i]) / 2 * (timeSec[i] - timeSec[i - 1]) / 3600;
  const peak = totalSolarPowerW.reduce((peak, watts) => Math.max(peak, watts), 0);
  const inspect = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, ((event.clientX - bounds.left) / bounds.width * width - left) / plotWidth * duration));
    let lo = 0, hi = timeSec.length - 1;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (timeSec[mid] < t) lo = mid + 1; else hi = mid; }
    setCursor(lo > 0 && t - timeSec[lo - 1] < timeSec[lo] - t ? lo - 1 : lo);
  };
  return <div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 14, marginBottom: 16 }}>
      <span>Peak: <strong>{peak.toFixed(2)} W</strong></span>
      <span>Generated energy: <strong>{energyWh.toFixed(2)} Wh</strong></span>
      <span>Attitude: <strong>{scenario.mission.spacecraft.attitude?.strategy ?? 'sun-pointing'}</strong></span>
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Solar power versus mission time, each panel and total on one graph; shaded regions are eclipse" onPointerMove={inspect} onPointerLeave={() => setCursor(null)} style={{ width: '100%', display: 'block', background: '#020617', borderRadius: 12 }}>
      {eclipses.map((e, i) => <rect key={i} x={x(e.start)} y={top} width={x(e.end) - x(e.start)} height={plotHeight} fill="#26334d" opacity="0.65" />)}
      {[0, 1, 2, 3, 4].map(i => <g key={i}>
        <line x1={left} x2={width - right} y1={y(max * i / 4)} y2={y(max * i / 4)} stroke="#25324a" />
        <text x={left - 8} y={y(max * i / 4) + 4} textAnchor="end" fill="#94a3b8" fontSize="11">{(max * i / 4).toFixed(1)}</text>
        <text x={x(duration * i / 4)} y={height - 26} textAnchor="middle" fill="#94a3b8" fontSize="11">{(duration * i / 240).toFixed(1)}</text>
      </g>)}
      <text x="12" y="17" fill="#cbd5e1" fontSize="12">W</text>
      <text x={width / 2} y={height - 7} textAnchor="middle" fill="#cbd5e1" fontSize="12">Mission time (minutes)</text>
      {panels.map((panel, i) => <path key={panel.id} d={path(solarPowerByPanelW[panel.id])} fill="none" stroke={color(i)} strokeWidth="2" />)}
      <path d={path(totalSolarPowerW)} fill="none" stroke="#f8fafc" strokeWidth="1.5" strokeDasharray="6 4" />
      {cursor !== null && <line x1={x(timeSec[cursor])} x2={x(timeSec[cursor])} y1={top} y2={height - bottom} stroke="#ffcf5c" />}
    </svg>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12, fontSize: 13 }}>
      {panels.map((panel, i) => <span key={panel.id} style={{ color: color(i) }}>━ {panel.id}{cursor !== null && `: ${solarPowerByPanelW[panel.id][cursor].toFixed(2)} W`}</span>)}
      <span>┄ Total{cursor !== null && `: ${totalSolarPowerW[cursor].toFixed(2)} W`}</span>
      <span style={{ color: '#94a3b8' }}>Shaded: eclipse</span>
    </div>
    {cursor !== null ? <p style={{ color: '#ffcf5c', fontSize: 12 }}>t = {(timeSec[cursor] / 60).toFixed(2)} min · {sunlight[cursor] ? 'Sunlit' : 'Eclipse'}</p> : <p style={{ color: '#94a3b8', fontSize: 12 }}>Move over the graph to inspect all panel values. Identical curves overlap.</p>}
    {!panels.length && <p>No solar panels configured. Generation is zero.</p>}
    <p style={{ color: '#94a3b8', fontSize: 12 }}>Ideal generation at 1361 W/m², with cosine incidence and eclipse. Deployable panels are assumed deployed; panel shading and electrical losses are omitted. Energy uses trapezoidal integration at the configured time step.</p>
  </div>;
}
