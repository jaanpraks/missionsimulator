import React, { useEffect, useMemo, useState } from 'react';
import type { CompiledScenario, RunRecord, SimViewId, TabId } from './types';
import { compileScenario } from './sim/compiler';
import CesiumViewer from './components/CesiumViewer';
import OperatorPolarPlot from './components/OperatorPolarPlot';
import BuildTab from './components/BuildTab';
import SolarPowerChart from './components/SolarPowerChart';
import StationAnalysis from './components/StationAnalysis';
import ResourceCharts from './components/ResourceCharts';
import ThermalChart from './components/ThermalChart';
import { createDefaultMission, parseMissionDefinition } from './mission/definition';
import { Card, ChipBar, Button } from './components/ui';
import { HeaderTargets, HeaderPortal } from './components/HeaderPortal';
import { scrollContentToTop } from './components/scroll';

const TAB_OPTIONS = [
  { id: 'build', label: 'Build' },
  { id: 'simulate', label: 'Simulate' },
  { id: 'analyze', label: 'Analyze' }
] as const;

const VIEW_OPTIONS = [
  { id: 'global', label: 'Global' },
  { id: 'orbital', label: 'Orbital' },
  { id: 'operator', label: 'Operator' },
  { id: 'satInertial', label: 'Satellite Inertial' },
  { id: 'payload', label: 'Payload' }
] as const;


export default function App() {
  const [tab, setTab] = useState<TabId>('build');
  const [view, setView] = useState<SimViewId>('global');
  const [navigation, setNavigation] = useState<HTMLDivElement | null>(null);
  const [actions, setActions] = useState<HTMLDivElement | null>(null);


  const [scenario, setScenario] = useState<CompiledScenario | null>(null);
  const [savedText, setSavedText] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [missionText, setMissionText] = useState(() => JSON.stringify(createDefaultMission(), null, 2));
  const [buildError, setBuildError] = useState<string | null>(null);
  useEffect(() => { scrollContentToTop(); }, [tab, view]);

  const subtitle = useMemo(() => {
    if (!scenario) return 'No saved configuration';
    const durMin = (scenario.meta.durationSec / 60).toFixed(1);
    return `${scenario.meta.name} • ${durMin} min • step ${scenario.meta.stepSec}s`;
  }, [scenario]);

  return (
    <HeaderTargets.Provider value={{navigation,actions}}>
    <div className="app-shell">
      <header className="app-header">
        <TopBar canSimulate={!!scenario && savedText === missionText} canAnalyze={runs.length > 0} tab={tab} setTab={setTab} subtitle={tab === 'build' ? 'Configure your mission' : tab === 'analyze' ? 'Inspect recorded mission results' : subtitle} />
        <div className="stage-header-row">
          <div className="stage-navigation" ref={setNavigation} />
          <div className="stage-actions" ref={setActions} />
        </div>
      </header>

      <main className="app-content" aria-label="Stage content" tabIndex={-1}>
        <section hidden={tab !== 'build'}>
          <BuildTab
            active={tab === 'build'}
            text={missionText}
            onChange={text => { setMissionText(text); setBuildError(null); }}
            error={buildError}
            onCompile={() => {
              try {
                const mission = parseMissionDefinition(missionText);
                const compiled = compileScenario(mission);
                setBuildError(null);
                setScenario(compiled);
                setSavedText(missionText);
                setTab('simulate');
              } catch (error) {
                setBuildError(error instanceof Error ? error.message : String(error));
              }
            }}
          />
        </section>

        {(scenario || tab === 'simulate') && <section hidden={tab !== 'simulate'}>
          <SimulateTab scenario={scenario} view={view} setView={setView} active={tab === 'simulate'} onComplete={() => {
            if (scenario) setRuns(prev => prev.some(run => run.scenario === scenario) ? prev : [{ id: crypto.randomUUID(), createdAtIso: new Date().toISOString(), scenario }, ...prev]);
          }} />
        </section>}

        <section hidden={tab !== 'analyze'}>
          <AnalyzeTab active={tab === 'analyze'} runs={runs} onOpen={(s) => { setScenario(s); const text = JSON.stringify(s.mission, null, 2); setMissionText(text); setSavedText(text); setTab('simulate'); }} />
        </section>
      </main>
    </div>
    </HeaderTargets.Provider>
  );
}

function TopBar({ tab, setTab, subtitle, canSimulate, canAnalyze }: { tab: TabId; setTab: (t: TabId) => void; subtitle: string; canSimulate: boolean; canAnalyze: boolean }) {
  return <div className="main-header-row">
    <nav className="stage-tabs" aria-label="Mission stages">{TAB_OPTIONS.map(option => {
      const disabled = option.id === 'simulate' ? !canSimulate : option.id === 'analyze' ? !canAnalyze : false;
      return <button key={option.id} aria-current={tab === option.id ? 'page' : undefined} disabled={disabled} title={disabled ? option.id === 'simulate' ? 'Save your configuration first' : 'Complete a simulation first' : undefined} onClick={() => setTab(option.id)}>{option.label}</button>;
    })}</nav>
    <div className="brand"><strong>MissionSim EDU</strong><span>{subtitle}</span></div>
  </div>;
}

function SimulateTab({ scenario, view, setView, active, onComplete }: { onComplete: () => void; scenario: CompiledScenario | null; view: SimViewId; setView: (v: SimViewId) => void; active: boolean }) {
  const subtitle = scenario ? scenario.meta.name : 'No scenario loaded yet';
  const [tSec, setTSec] = useState(0);   // ✅ must be here, always called
  const [stationIndex, setStationIndex] = useState(0);
  const selectedStation = Math.min(stationIndex, Math.max(0, (scenario?.mission.groundStations.length ?? 1) - 1));
  const sampleIndex = scenario ? Math.min(scenario.telemetry.timeSec.length - 1, Math.floor(tSec / scenario.meta.stepSec)) : 0;
  const stationId = scenario?.mission.groundStations[selectedStation]?.id;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <HeaderPortal slot="navigation" active={active}><nav aria-label="Simulation views"><ChipBar value={view} options={[...VIEW_OPTIONS]} onChange={id => setView(id as SimViewId)} /></nav></HeaderPortal>
      {!scenario && <p>Save a mission in Build to start a simulation.</p>}
      <div className="simulation-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 12 }}>
        <div style={{ gridColumn: view === 'operator' ? 'span 8' : 'span 9' }}>
          
          <Card title={view === 'global' ? 'Mission overview' : view === 'orbital' ? 'Orbital frame' : view === 'operator' ? 'Ground operator' : view === 'payload' ? 'Payload camera' : 'Inertial frame'}>
            {view === 'global' && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                In 3D, Earth rotates against the stars. The 2D and oblique maps use Earth-fixed coordinates to show geographic coverage.
              </div>
            )}
            <CesiumViewer active={active} scenario={scenario} simView={view} stationIndex={selectedStation} onTimeSec={seconds => { setTSec(seconds); if (scenario && seconds >= scenario.meta.durationSec) onComplete(); }} />
          </Card>
        </div>

        <div style={{ gridColumn: view === 'operator' ? 'span 4' : 'span 3', display: 'grid', gap: 16, alignContent: 'start' }}>
          {view === 'operator' && scenario && (
            <Card title="Antenna visibility">
              <OperatorPolarPlot scenario={scenario} timeSec={tSec} stationIndex={selectedStation} onStationChange={setStationIndex} />
            </Card>
          )}
          <Card title="Mission status">
            {scenario ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <KV k="View" v={view} />
                <KV k="Mode" v={scenario.states[sampleIndex]?.mode ?? 'nominal'} />
                <KV k="Imaging" v={scenario.states[sampleIndex]?.payloadOn ? 'ACTIVE' : 'OFF'} />
                <KV k="Electrical demand" v={`${(scenario.states[sampleIndex]?.totalLoadW ?? 0).toFixed(1)} W`} />
                <KV k="Sunlight" v={scenario.telemetry.sunlight[sampleIndex] ? 'SUNLIT' : 'ECLIPSE'} />
                <KV k="Battery" v={`${((scenario.states[sampleIndex]?.batterySoc ?? 0)*100).toFixed(1)}%`} />
                <KV k="Temperature" v={`${(scenario.states[sampleIndex]?.temperatureC ?? 20).toFixed(1)} °C`} />
                <KV k="Memory" v={`${((scenario.states[sampleIndex]?.storedBytes ?? 0)/1e6).toFixed(2)} MB`} />
                <KV k="Downlink" v={scenario.states[sampleIndex]?.downlinkActive ? 'TRANSMITTING' : 'OFF'} />
                <KV k="Power" v={scenario.states[sampleIndex]?.powerLimited ? 'SHORTFALL' : 'OK'} />
                <KV k="Station access" v={stationId ? (scenario.telemetry.accessByStation[stationId]?.[sampleIndex] ? 'YES' : 'NO') : 'No station'} />
              </div>
            ) : (
              <div style={{ color: '#94a3b8' }}>Build → Save to load a scenario.</div>
            )}
          </Card>

          <Card title="Timeline Strips">
            {scenario ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <SunlightStrip
                  label="Sunlight"
                  sunlight={scenario.telemetry.sunlight}
                  stepSec={scenario.meta.stepSec}
                  durationSec={scenario.meta.durationSec}
                  playheadSec={tSec}
                />
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Bright = sunlit ☀, Dark = eclipse 🌑
                </div>
              </div>
            ) : (
              <div style={{ color: '#94a3b8' }}>Build → Save to load telemetry.</div>
            )}
          </Card>

        </div>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  const modes: Record<string,string> = {nominal:'#5276b9',safe:'#e4ad56',imaging:'#44dcb8',downlink:'#b791ef'};
  const number = parseFloat(v);
  const color = k === 'Mode' ? modes[v] : k === 'Battery' ? number <= 0 ? '#f87171' : number < 20 ? '#ffcf5c' : '#44ebd3' : k === 'Temperature' ? number < 0 ? '#60a5fa' : '#ffcf5c' : k === 'Power' ? v === 'SHORTFALL' ? '#f87171' : '#44ebd3' : k === 'Memory' ? '#44ebd3' : k === 'Electrical demand' ? '#ffcf5c' : undefined;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ color: '#cbd5e1' }}>{k}</div>
      <div style={{ color, fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>{v}</div>
    </div>
  );
}

function AnalyzeTab({ runs, onOpen, active }: { runs: RunRecord[]; onOpen: (s: CompiledScenario) => void; active: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState('graphs');
  useEffect(() => { if (active) scrollContentToTop(); }, [sheet, selectedId, active]);
  const selected = runs.find(run => run.id === selectedId) ?? runs[0];
  return <div className="stage-content">
    <HeaderPortal slot="navigation" active={active}>
      <nav aria-label="Analysis sheets"><ChipBar value={sheet} options={[{id:'graphs',label:'Graphs'},{id:'runs',label:'Runs'},{id:'details',label:'Run definition'}]} onChange={setSheet} /></nav>
      {selected && <select className="run-selector" aria-label="Analysis run" value={selected.id} onChange={e => setSelectedId(e.target.value)}>{runs.map(run => <option key={run.id} value={run.id}>{run.scenario.meta.name} | {new Date(run.createdAtIso).toLocaleTimeString()}</option>)}</select>}
    </HeaderPortal>
    <HeaderPortal slot="actions" active={active}><Button disabled={!selected} onClick={() => selected && onOpen(selected.scenario)}>Replay run</Button></HeaderPortal>
    {!selected ? <Card title="No recorded runs"><p>Save a mission in Build, then return here to inspect its results.</p></Card> : <>
      {sheet === 'graphs' && <>
        <Card title="Solar cell power - all panels"><SolarPowerChart key={selected.id} scenario={selected.scenario} /></Card>
        <ResourceCharts key={`resources-${selected.id}`} scenario={selected.scenario} />
        <ThermalChart key={`thermal-${selected.id}`} scenario={selected.scenario} />
        <Card title="Ground station visibility and distance"><StationAnalysis key={selected.id} scenario={selected.scenario} /></Card>
      </>}
      {sheet === 'runs' && <Card title="Recorded runs"><div className="run-list">{runs.map(run => <button key={run.id} className="run-item" onClick={() => {setSelectedId(run.id);setSheet('graphs');}}><strong>{run.scenario.meta.name}</strong><span>{new Date(run.createdAtIso).toLocaleString()} | {(run.scenario.meta.durationSec/60).toFixed(1)} min | {run.scenario.mission.spacecraft.attitude?.strategy}</span></button>)}</div></Card>}
      {sheet === 'details' && <Card title="Recorded mission definition"><p className="muted">This is the configuration saved with the selected run. Edit the current mission in Build.</p><pre className="definition-preview">{JSON.stringify(selected.scenario.mission,null,2)}</pre></Card>}
    </>}
  </div>;
}

function SunlightStrip({
  label,
  sunlight,
  stepSec,
  durationSec,
  playheadSec
}: {
  label: string;
  sunlight: boolean[];
  stepSec: number;
  durationSec: number;
  playheadSec: number;
}) {
  // Convert boolean samples to segments [start,end,isSunlit]
  const segments: { start: number; end: number; sun: boolean }[] = [];
  if (sunlight.length > 0) {
    let cur = sunlight[0];
    let segStart = 0;

    for (let i = 1; i < sunlight.length; i++) {
      if (sunlight[i] !== cur) {
        segments.push({ start: segStart, end: i * stepSec, sun: cur });
        cur = sunlight[i];
        segStart = i * stepSec;
      }
    }
    segments.push({ start: segStart, end: durationSec, sun: cur });
  }

  const play = Math.max(0, Math.min(durationSec, playheadSec));
  const playPct = durationSec > 0 ? (play / durationSec) * 100 : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: '#cbd5e1' }}>{label}</div>
        <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
          t = {play.toFixed(0)}s
        </div>
      </div>

      <div style={{ position: 'relative', height: 16, borderRadius: 999, background: '#1f2937', overflow: 'hidden' }}>
        {segments.map((s, idx) => {
          const left = (s.start / durationSec) * 100;
          const width = ((s.end - s.start) / durationSec) * 100;
          return (
            <div
              key={idx}
              title={s.sun ? 'Sunlit' : 'Eclipse'}
              style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${width}%`,
                top: 0,
                bottom: 0,
                background: s.sun ? 'rgba(245, 158, 11, 0.85)' : 'rgba(15, 23, 42, 0.95)'
              }}
            />
          );
        })}

        {/* Playhead */}
        <div
          style={{
            position: 'absolute',
            left: `${playPct}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'rgba(226, 232, 240, 0.95)'
          }}
        />
      </div>
    </div>
  );
}

