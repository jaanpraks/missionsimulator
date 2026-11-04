import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { parseMissionDefinition, validateMissionDefinition, type MissionDefinition } from '../mission/definition';
import { Button, Card, ChipBar, Select } from './ui';
import OrbitSheet from './OrbitSheet';
import MissionSheet from './MissionSheet';
import ThermalSheet from './ThermalSheet';
import { fitSolarPanels, panelAreaLimit, faceIndex, DEFAULT_MASS_KG } from '../mission/physical';
import { Field, FieldValidity } from './FormField';
import { CAMERA_PRESETS, DEFAULT_BATTERY, DEFAULT_RADIO, DEFAULT_STORAGE, imageBytes } from '../sim/resources';
import { busPowerLoads, type BusSubsystem } from '../mission/subsystems';
import SatelliteProfile from './SatelliteProfile';
import SubsystemCard from './SubsystemCard';
import InfoPopover from './InfoPopover';
import { BODY_DIMENSIONS } from '../mission/physical';
import { HeaderPortal } from './HeaderPortal';
import { scrollContentToTop } from './scroll';
import { PAYLOAD_SIDES, type PayloadSide } from '../mission/payload';

const SHEETS = [
  { id: 'satellite', label: 'Satellite' },
  { id: 'mission', label: 'Mission' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'thermal', label: 'Thermal' },
  { id: 'stations', label: 'Ground Stations' },
  { id: 'json', label: 'JSON' }
];
const NORMALS: { label: string; value: [number, number, number] }[] = [
  { label: '+X', value: [1, 0, 0] }, { label: '-X', value: [-1, 0, 0] },
  { label: '+Y', value: [0, 1, 0] }, { label: '-Y', value: [0, -1, 0] },
  { label: '+Z', value: [0, 0, 1] }, { label: '-Z', value: [0, 0, -1] }
];
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 };
export default function BuildTab({ text, onChange, onCompile, error, active }: {
  active: boolean; text: string; onChange: (text: string) => void; onCompile: () => void; error: string | null;
}) {
  const [sheet, setSheet] = useState('satellite');
  useEffect(() => { if (active) scrollContentToTop(); }, [sheet, active]);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const reportValidity = useCallback((label: string, error: string | null) => {
    setFieldErrors(previous => {
      const next = { ...previous };
      if (error) next[label] = error;
      else delete next[label];
      return next;
    });
  }, []);
  const parsed = useMemo(() => {
    try { return { mission: parseMissionDefinition(text), error: null }; }
    catch (e) { return { mission: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [text]);
  const mission = parsed.mission;
  const update = (change: (next: MissionDefinition) => void): string | null => {
    if (!mission) return parsed.error;
    try {
      const next = structuredClone(mission);
      change(next);
      validateMissionDefinition(next);
      onChange(JSON.stringify(next, null, 2));
      setFormError(null);
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setFormError(message);
      return message;
    }
  };
  const numeric = (change: (next: MissionDefinition, value: number) => void) => (value: string) => {
    if (!value.trim() || !Number.isFinite(Number(value))) {
      const message = 'Enter a finite number.';
      setFormError(message);
      return message;
    }
    return update(next => change(next, Number(value)));
  };
  const addStation = () => update(next => {
    const used = new Set([...next.groundStations.map(gs => gs.id), ...next.spacecraft.power.solarPanels.map(p => p.id)]);
    let n = 1;
    while (used.has(`GS-${n}`)) n++;
    next.groundStations.push({ id: `GS-${n}`, name: `Station ${n}`, lat: 0, lng: 0, altMeters: 0, maskDeg: 10 });
  });
  const addPanel = () => update(next => {
    const used = new Set([...next.groundStations.map(gs => gs.id), ...next.spacecraft.power.solarPanels.map(p => p.id)]);
    let n = 1;
    while (used.has(`panel-${n}`)) n++;
    const available=NORMALS.find(normal=>next.spacecraft.power.solarPanels.filter(p=>p.mounting==='body'&&faceIndex(p.normalBody)===faceIndex(normal.value)).reduce((sum,p)=>sum+p.areaM2,0)<panelAreaLimit(next.spacecraft.body.size,normal.value)-1e-8);
    const direction=available?.value ?? NORMALS[0].value;
    next.spacecraft.power.solarPanels.push({ id: `panel-${n}`, mounting: available?'body':'deployable', areaM2: panelAreaLimit(next.spacecraft.body.size,direction), efficiency: 0.28, normalBody: [...direction] });
    fitSolarPanels(next.spacecraft);
  });
  const repairPanels=()=>{
    try {const next=JSON.parse(text);fitSolarPanels(next.spacecraft);validateMissionDefinition(next);onChange(JSON.stringify(next,null,2));setFormError(null);}
    catch(error){setFormError(error instanceof Error?error.message:String(error));}
  };
  const busPowerField = (subsystem: BusSubsystem, label: string) => mission && <Field label={label} min={0} value={busPowerLoads(mission.spacecraft)[subsystem]} onCommit={numeric((next, value) => {
    const loads = { ...busPowerLoads(next.spacecraft), [subsystem]: value };
    next.spacecraft.power.subsystemLoadsW = loads;
    next.spacecraft.power.baseLoadW = Object.values(loads).reduce((sum, load) => sum + load, 0);
  })} />;
  return <FieldValidity.Provider value={reportValidity}><div style={{ display: 'grid', gap: 16 }}>
    <HeaderPortal slot="navigation" active={active}><nav aria-label="Build sheets"><ChipBar value={sheet} options={SHEETS} onChange={id => { setSheet(id); setFormError(null); }} /></nav></HeaderPortal>
    <HeaderPortal slot="actions" active={active}><Button disabled={!mission || !!formError || Object.keys(fieldErrors).length > 0} onClick={onCompile}>Save</Button></HeaderPortal>
    {sheet !== 'json' && !mission && <Card title="Configuration needs attention">
      <p role="alert" style={{ color: '#fca5a5' }}>{parsed.error}</p>
      <p>Your manual JSON draft is preserved. Fix it in Configuration JSON to enable the forms.</p>
      <Button onClick={() => setSheet('json')}>Edit Configuration JSON</Button>
      {parsed.error?.includes('80%') && <Button onClick={repairPanels}>Fit solar panels</Button>}
    </Card>}
    {sheet === 'mission' && mission && <MissionSheet mission={mission} onUpdate={update} />}
    {sheet === 'thermal' && mission && <ThermalSheet mission={mission} onUpdate={update} />}
    {sheet === 'orbit' && mission && <OrbitSheet mission={mission} onUpdate={update} />}
    {sheet === 'satellite' && mission && <>
      <SatelliteProfile mission={mission} />
      <div className="subsystem-grid">
        <SubsystemCard system="structure" title="Structure" subtitle="CubeSat envelope" help={<>Choose the CubeSat envelope. Size controls available solar-panel area. Structure is passive and has no electrical load.</>}><div style={grid}>
          <label style={{ fontSize: 13 }}>CubeSat size<Select aria-label="CubeSat size" value={mission.spacecraft.body.size} onChange={e => update(next => { const old=next.spacecraft.body.size; next.spacecraft.body.size = e.target.value as MissionDefinition['spacecraft']['body']['size']; fitSolarPanels(next.spacecraft); if(next.spacecraft.thermal?.massKg===DEFAULT_MASS_KG[old])next.spacecraft.thermal.massKg=DEFAULT_MASS_KG[next.spacecraft.body.size]; })}>
            {['1U', '2U', '3U', '6U'].map(size => <option key={size}>{size}</option>)}
          </Select></label>
</div><p className="structure-dimensions">Envelope: {BODY_DIMENSIONS[mission.spacecraft.body.size].map(m => Math.round(m * 100)).join(" × ")} cm</p></SubsystemCard>
        <SubsystemCard system="payload" title="Payload — Camera" subtitle="Imaging & observation" help={<>Resolution sets image size; capture interval sets data production. Imaging power contributes to the EPS budget.</>}><div style={grid}>          <Field label="Camera payload load (W)" min={0} value={mission.spacecraft.payload.loadW} onCommit={numeric((next, value) => { next.spacecraft.payload.loadW = value; })} />
          <label style={{fontSize:13}}>Payload face<Select aria-label="Payload face" value={mission.spacecraft.payload.side ?? '+Z'} onChange={e=>update(next=>{next.spacecraft.payload.side=e.target.value as PayloadSide;})}>{PAYLOAD_SIDES.map(side=><option key={side}>{side}</option>)}</Select></label>
          <label>Camera resolution<Select aria-label="Camera resolution" value={mission.spacecraft.payload.cameraPreset ?? 'bw100'} onChange={e=>update(next=>{next.spacecraft.payload.cameraPreset=e.target.value as 'bw100'|'rgb1000';})}>{Object.entries(CAMERA_PRESETS).map(([id,preset])=><option key={id} value={id}>{preset.label}</option>)}</Select></label>
          <Field label="Image interval while imaging (s)" min={1} max={86400} value={mission.spacecraft.payload.captureIntervalSec ?? 60} onCommit={numeric((next,value)=>{next.spacecraft.payload.captureIntervalSec=value;})}/></div><InfoPopover label="Payload — Camera details">Uncompressed image: {(imageBytes(mission.spacecraft.payload.cameraPreset)/1e6).toFixed(3)} MB. One image per interval of continuous imaging. MB = 1,000,000 bytes.</InfoPopover></SubsystemCard>
        <SubsystemCard system="obc" title="OBC" subtitle="On-board computer" help={<>Manage the mission and store camera data. Storage starts empty; images that do not fit are dropped.</>}><div style={grid}>{busPowerField('obc', 'OBC power (W)')}          <Field label="Available storage (MB)" min={0.001} value={mission.spacecraft.storage?.capacityMB ?? DEFAULT_STORAGE.capacityMB} onCommit={numeric((next,value)=>{next.spacecraft.storage={capacityMB:value};})}/></div></SubsystemCard>
        <SubsystemCard system="com" title="COM" subtitle="Telemetry and communication" help={<>One radio serves ground-station contacts. Transmit power is drawn during data transfer. Mbps = 1,000,000 bits/s.</>}><div style={grid}>          <Field label="Downlink speed (Mbps)" min={0} max={10000} value={mission.spacecraft.radio?.downlinkMbps ?? DEFAULT_RADIO.downlinkMbps} onCommit={numeric((next,value)=>{next.spacecraft.radio={...(next.spacecraft.radio ?? DEFAULT_RADIO),downlinkMbps:value};})}/>
<Field label="COM transmit power (W)" min={0} value={mission.spacecraft.radio?.loadW ?? DEFAULT_RADIO.loadW} onCommit={numeric((next, value) => { next.spacecraft.radio = { ...(next.spacecraft.radio ?? DEFAULT_RADIO), loadW: value }; })} /></div></SubsystemCard>
        <SubsystemCard system="adcs" title="ADCS" subtitle="Attitude determination and control" help={<>Sun pointing aims +X toward the Sun. Nadir pointing aims the selected payload face toward Earth. Pointing affects solar generation and camera orientation.</>}><div style={grid}>{busPowerField('adcs', 'ADCS power (W)')}          <label style={{ fontSize: 13 }}>Attitude strategy<Select aria-label="Attitude strategy" value={mission.spacecraft.attitude?.strategy ?? 'sun-pointing'} onChange={e => update(next => { next.spacecraft.attitude = { strategy: e.target.value as 'sun-pointing' | 'nadir-pointing' }; })}>
            <option value="sun-pointing">Sun pointing (+X toward Sun)</option>
            <option value="nadir-pointing">Nadir pointing (payload toward Earth)</option>
          </Select></label>
</div></SubsystemCard>
        <SubsystemCard system="eps" title="EPS" subtitle="Electrical power system" help={<>Supply all subsystem loads with solar generation and batteries. EPS power covers power-management electronics; battery conversion losses are modeled separately.</>}><div style={grid}>{busPowerField('eps', 'EPS power (W)')}          <Field label="Battery capacity (Wh)" min={0.001} value={mission.spacecraft.power.batteryCapacityWh} onCommit={numeric((next, value) => { next.spacecraft.power.batteryCapacityWh = value; })} />

</div><details className="subsystem-details"><summary>Battery behavior</summary><div style={grid}>
          <Field label="Initial battery charge (%)" min={0} max={100} value={(mission.spacecraft.power.battery?.initialSoc ?? DEFAULT_BATTERY.initialSoc)*100} onCommit={numeric((next,value)=>{next.spacecraft.power.battery={...(next.spacecraft.power.battery ?? DEFAULT_BATTERY),initialSoc:value/100};})}/>
          <Field label="Charge efficiency (0-1)" min={0} max={1} value={mission.spacecraft.power.battery?.chargeEfficiency ?? DEFAULT_BATTERY.chargeEfficiency} onCommit={numeric((next,value)=>{next.spacecraft.power.battery={...(next.spacecraft.power.battery ?? DEFAULT_BATTERY),chargeEfficiency:value};})}/>
          <Field label="Discharge efficiency (0-1)" min={0.001} max={1} value={mission.spacecraft.power.battery?.dischargeEfficiency ?? DEFAULT_BATTERY.dischargeEfficiency} onCommit={numeric((next,value)=>{next.spacecraft.power.battery={...(next.spacecraft.power.battery ?? DEFAULT_BATTERY),dischargeEfficiency:value};})}/>
          <Field label="Maximum charge power (W)" min={0} value={mission.spacecraft.power.battery?.maxChargeW ?? DEFAULT_BATTERY.maxChargeW} onCommit={numeric((next,value)=>{next.spacecraft.power.battery={...(next.spacecraft.power.battery ?? DEFAULT_BATTERY),maxChargeW:value};})}/>
          <Field label="Maximum discharge power (W)" min={0} value={mission.spacecraft.power.battery?.maxDischargeW ?? DEFAULT_BATTERY.maxDischargeW} onCommit={numeric((next,value)=>{next.spacecraft.power.battery={...(next.spacecraft.power.battery ?? DEFAULT_BATTERY),maxDischargeW:value};})}/>
        </div>
        <InfoPopover label="Battery behavior">Solar generation supplies current loads first. Surplus charges the battery; deficits discharge it. Capacity and power limits are enforced. Unmet demand is recorded and imaging/transmission pause during power shortages.</InfoPopover>
</details><details className="subsystem-details"><summary>Solar panels ({mission.spacecraft.power.solarPanels.length})</summary>
        <InfoPopover label="Solar panel sizing">Body-mounted panels share 80% of each face. Each deployable leaf is limited to 80% of its corresponding face; add leaves for larger arrays. Custom normals use the closest body face. Size changes shrink panels to fit and update mass only if it still matches the old default.</InfoPopover>
        <p style={{ fontSize: 13 }}>Total panel area: {mission.spacecraft.power.solarPanels.reduce((area, p) => area + p.areaM2, 0).toFixed(3)} m²</p>
        {mission.spacecraft.power.solarPanels.map((panel, i) => {
          const normal = NORMALS.find(n => n.value.every((v, k) => v === panel.normalBody[k]));
          return <fieldset key={panel.id} style={{ border: '1px solid #334155', borderRadius: 12, padding: 16, margin: '12px 0' }}>
            <legend style={{ color: '#94a3b8' }}>{panel.id}</legend>
            <div style={grid}>
              <label>Mounting<Select aria-label={`${panel.id} mounting`} value={panel.mounting} onChange={e => update(next => { next.spacecraft.power.solarPanels[i].mounting = e.target.value as 'body' | 'deployable'; fitSolarPanels(next.spacecraft); })}><option value="body">Body-mounted</option><option value="deployable">Deployable</option></Select></label>
              <Field label={`${panel.id} area (m²)`} min={0} max={panelAreaLimit(mission.spacecraft.body.size,panel.normalBody)} value={panel.areaM2} onCommit={numeric((next, value) => { next.spacecraft.power.solarPanels[i].areaM2 = value; })} />
              <Field label={`${panel.id} efficiency (0–1)`} min={0} max={1} value={panel.efficiency} onCommit={numeric((next, value) => { next.spacecraft.power.solarPanels[i].efficiency = value; })} />
              <label>Facing direction<Select aria-label={`${panel.id} facing direction`} value={normal?.label ?? 'custom'} onChange={e => { const selected = NORMALS.find(n => n.label === e.target.value); if (selected) update(next => { next.spacecraft.power.solarPanels[i].normalBody = [...selected.value]; fitSolarPanels(next.spacecraft); }); }}>
                {!normal && <option value="custom">Custom normal (edit in JSON)</option>}
                {NORMALS.map(n => <option key={n.label}>{n.label}</option>)}
              </Select></label>
            </div>
            <InfoPopover label={`${panel.id} face area`}>Face area limit: {panelAreaLimit(mission.spacecraft.body.size,panel.normalBody).toFixed(4)} m² (80%). Body-mounted panels on this face share the limit.</InfoPopover>
            <div style={{ marginTop: 12 }}><Button variant="ghost" onClick={() => update(next => { next.spacecraft.power.solarPanels.splice(i, 1); })}>Remove {panel.id}</Button></div>
          </fieldset>;
        })}
        {!mission.spacecraft.power.solarPanels.length && <p>No panels configured.</p>}
        <Button onClick={addPanel}>Add solar panel</Button>
      </details></SubsystemCard>
      </div>
    </>}
    {sheet === 'stations' && mission && <>
      <InfoPopover label="Ground stations">These stations appear on Earth and in the Operator camera and antenna plot. Changes apply when leaving a field or pressing Enter.</InfoPopover>
      {mission.groundStations.map((station, i) => <Card key={station.id} title={station.id}>
        <div style={grid}>
          <Field label={`${station.id} name`} type="text" value={station.name} onCommit={value => update(next => { next.groundStations[i].name = value; })} />
          <Field label={`${station.id} latitude (deg)`} min={-90} max={90} value={station.lat} onCommit={numeric((next, value) => { next.groundStations[i].lat = value; })} />
          <Field label={`${station.id} longitude (deg)`} min={-180} max={180} value={station.lng} onCommit={numeric((next, value) => { next.groundStations[i].lng = value; })} />
          <Field label={`${station.id} altitude (m)`} min={-500} max={10000} value={station.altMeters ?? 0} onCommit={numeric((next, value) => { next.groundStations[i].altMeters = value; })} />
          <Field label={`${station.id} elevation mask (deg)`} min={0} max={90} value={station.maskDeg} onCommit={numeric((next, value) => { next.groundStations[i].maskDeg = value; })} />
        </div>
        <div style={{ marginTop: 16 }}><Button variant="ghost" onClick={() => update(next => { next.groundStations.splice(i, 1); })}>Remove {station.id}</Button></div>
      </Card>)}
      {!mission.groundStations.length && <Card title="Ground stations"><p>No stations configured. Add one to enable the Operator camera and antenna plot.</p></Card>}
      <div><Button onClick={addStation}>Add ground station</Button></div>
    </>}
    {sheet === 'json' && <Card title="Mission definition JSON">
      <InfoPopover label="Configuration JSON">Full configuration, including orbit, simulation settings and operations. Valid manual edits appear in the other sheets automatically. Incomplete drafts are preserved.</InfoPopover>
      <textarea aria-label="Mission definition JSON" spellCheck={false} value={text} onChange={e => { onChange(e.target.value); setFormError(null); }} style={{ boxSizing: 'border-box', width: '100%', minHeight: 620, resize: 'vertical', padding: 12, background: '#020617', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, fontFamily: 'monospace' }} />
      {parsed.error && <p role="alert" style={{ color: '#fca5a5' }}>{parsed.error}</p>}
      {parsed.error?.includes('80%') && <Button onClick={repairPanels}>Fit solar panels</Button>}
    </Card>}
    {(formError || error) && <p role="alert" style={{ color: '#fca5a5', whiteSpace: 'pre-wrap' }}>{formError ?? error}</p>}
  </div></FieldValidity.Provider>;
}
