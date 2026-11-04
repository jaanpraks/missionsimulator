import React from 'react';
import type { MissionDefinition } from '../mission/definition';
import { busPowerLoads } from '../mission/subsystems';
import { elementsFromTle } from '../mission/orbit';
import { CAMERA_PRESETS, DEFAULT_RADIO, DEFAULT_STORAGE } from '../sim/resources';
import SatellitePreview from './SatellitePreview';
import InfoPopover from './InfoPopover';

export default function SatelliteProfile({ mission }: { mission: MissionDefinition }) {
  const { spacecraft } = mission;
  const busW = Object.values(busPowerLoads(spacecraft)).reduce((sum, load) => sum + load, 0);
  const orbit = elementsFromTle(mission.orbit.line2);
  const entries = [
    ['Structure', `${spacecraft.body.size} CubeSat`],
    ['Continuous power', `${busW.toFixed(1)} W`],
    ['Imaging + downlink', `${(busW + spacecraft.payload.loadW + (spacecraft.radio ?? DEFAULT_RADIO).loadW).toFixed(1)} W`],
    ['Battery capacity', `${spacecraft.power.batteryCapacityWh} Wh`],
    ['Attitude strategy', spacecraft.attitude?.strategy === 'nadir-pointing' ? 'Nadir pointing' : 'Sun pointing'],
    ['Solar panels', `${spacecraft.power.solarPanels.length} · ${spacecraft.power.solarPanels.reduce((sum, panel) => sum + panel.areaM2, 0).toFixed(3)} m²`],
    ['Camera', CAMERA_PRESETS[spacecraft.payload.cameraPreset ?? 'bw100'].label],
    ['Storage / downlink', `${spacecraft.storage?.capacityMB ?? DEFAULT_STORAGE.capacityMB} MB / ${spacecraft.radio?.downlinkMbps ?? DEFAULT_RADIO.downlinkMbps} Mbps`],
    ['Inclination / RAAN', `${orbit.inclinationDeg}° / ${orbit.raanDeg}°`],
    ['Ground stations', String(mission.groundStations.length)]
  ];
  return <section className="panel-card satellite-profile" aria-label="Satellite preview and mission profile">
    <div className="preview-pane"><h2>Satellite preview</h2><SatellitePreview spacecraft={spacecraft} /></div>
    <aside className="mission-profile">
      <div className="profile-heading"><div><span className="eyebrow">MISSION PROFILE</span><h2>{mission.name}</h2></div><InfoPopover label="Mission profile">Live design parameters, updated as you edit. Power is the configured demand, not measured telemetry or a guarantee that the solar panels and battery can supply it. Safe-mode demand equals the EPS power configured in Satellite.</InfoPopover></div>
      <dl>{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </aside>
  </section>;
}
