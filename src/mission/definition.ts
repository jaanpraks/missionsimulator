import type { AttitudeStrategy } from '../sim/attitude';
import type { PayloadSide } from './payload';
import { faceIndex, panelAreaLimit } from './physical';
import { defaultThermal, type ThermalDefinition } from '../sim/thermal';
/** JSON-serializable mission inputs. Distances, angles and energy use named units. */
export type GroundStation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  altMeters?: number;
  maskDeg: number;
};

export type MissionDefinition = {
  schemaVersion: 1;
  name: string;
  orbit: { type: 'tle'; line1: string; line2: string };
  simulation: {
    startIso: string;
    duration: { type: 'orbits'; count: number } | { type: 'seconds'; seconds: number };
    stepSec: number;
  };
  spacecraft: {
    thermal?: ThermalDefinition;
    /** Omitted in older version-1 files: defaults to sun-pointing. */
    attitude?: { strategy: AttitudeStrategy };
    body: { size: '1U' | '2U' | '3U' | '6U' };
    power: {
      solarPanels: {
        id: string;
        mounting: 'body' | 'deployable';
        areaM2: number;
        efficiency: number;
        /** Unit normal in spacecraft body coordinates. */
        normalBody: [number, number, number];
      }[];
      batteryCapacityWh: number;
      battery?: { initialSoc: number; chargeEfficiency: number; dischargeEfficiency: number; maxChargeW: number; maxDischargeW: number };
      baseLoadW: number;
    };
    payload: { type: 'camera'; loadW: number; side?: PayloadSide; cameraPreset?: 'bw100' | 'rgb1000'; captureIntervalSec?: number };
    radio?: { downlinkMbps: number; loadW: number };
    storage?: { capacityMB: number };
  };
  groundStations: GroundStation[];
  /** Missing in older definitions: nominal mode, 2 W safe load, one-off schedule. */
  missionPlan?: {
    defaultMode: 'nominal' | 'safe';
    safeLoadW: number;
    repeatEachOrbit: boolean;
    downlinkStrategy?: 'when-available' | 'disabled';
  };
  operations: {
    startSec: number;
    endSec: number;
    mode: 'nominal' | 'safe' | 'idle' | 'imaging' | 'downlink';
  }[];
};

export function createDefaultMission(): MissionDefinition {
  return {
    schemaVersion: 1,
    name: 'CubeSat mission 1',
    orbit: {
      type: 'tle',
      line1: '1 25544U 98067A   24001.50000000  .00016717  00000+0  10270-3 0  9991',
      line2: '2 25544  51.6435  90.0000 0005000  10.0000  80.0000 15.50000000  9991'
    },
    simulation: {
      // Match the example TLE epoch instead of propagating an old TLE to today.
      startIso: '2024-01-01T12:00:00.000Z',
      duration: { type: 'orbits', count: 1 },
      stepSec: 10
    },
    spacecraft: {
      thermal: defaultThermal('3U'),
      attitude: { strategy: 'sun-pointing' },
      body: { size: '3U' },
      power: {
        solarPanels: [{ id: 'panel-1', mounting: 'body', areaM2: 0.024, efficiency: 0.28, normalBody: [1, 0, 0] }],
        batteryCapacityWh: 30,
        battery: { initialSoc: 0.8, chargeEfficiency: 0.9, dischargeEfficiency: 0.95, maxChargeW: 15, maxDischargeW: 25 },
        baseLoadW: 8
      },
      payload: { type: 'camera', loadW: 12, side: '+Z', cameraPreset: 'bw100', captureIntervalSec: 60 },
      radio: { downlinkMbps: 0.1, loadW: 5 },
      storage: { capacityMB: 64 }
    },
    groundStations: [{ id: 'GS-1', name: 'Helsinki', lat: 60.1699, lng: 24.9384, altMeters: 0, maskDeg: 10 }],
    missionPlan: { defaultMode: 'nominal', safeLoadW: 2, repeatEachOrbit: true, downlinkStrategy: 'when-available' },
    operations: []
  };
}

/** Validate external JSON before it can reach propagation or allocate sample arrays. */
export function parseMissionDefinition(text: string): MissionDefinition {
  const value: unknown = JSON.parse(text);
  validateMissionDefinition(value);
  return value;
}

export function validateMissionDefinition(value: unknown): asserts value is MissionDefinition {
  function object(v: unknown, path: string): Record<string, unknown> {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${path} must be an object`);
    return v as Record<string, unknown>;
  }
  function string(v: unknown, path: string): asserts v is string {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`${path} must be a non-empty string`);
  }
  function number(v: unknown, path: string, min: number, max = Infinity): asserts v is number {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${path} must be a finite number between ${min} and ${max}`);
  }
  function choice(v: unknown, path: string, options: unknown[]) {
    if (!options.includes(v)) throw new Error(`${path} must be one of: ${options.join(', ')}`);
  }
  function array(v: unknown, path: string): unknown[] {
    if (!Array.isArray(v)) throw new Error(`${path} must be an array`);
    return v;
  }
  const m = object(value, 'mission');
  choice(m.schemaVersion, 'schemaVersion', [1]);
  string(m.name, 'name');
  const orbit = object(m.orbit, 'orbit');
  choice(orbit.type, 'orbit.type', ['tle']);
  for (const [key, prefix] of [['line1', '1 '], ['line2', '2 ']]) {
    const line = orbit[key];
    string(line, `orbit.${key}`);
    if (line.length !== 69 || !line.startsWith(prefix)) throw new Error(`orbit.${key} must be a 69-character TLE line starting with "${prefix}"`);
  }
  const sim = object(m.simulation, 'simulation');
  string(sim.startIso, 'simulation.startIso');
  if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(sim.startIso) || !Number.isFinite(Date.parse(sim.startIso))) throw new Error('simulation.startIso must be an ISO date in UTC ending in Z');
  number(sim.stepSec, 'simulation.stepSec', 1, 120);
  const duration = object(sim.duration, 'simulation.duration');
  choice(duration.type, 'simulation.duration.type', ['orbits', 'seconds']);
  if (duration.type === 'orbits') {
    number(duration.count, 'simulation.duration.count', 1, 100);
    if (!Number.isInteger(duration.count)) throw new Error('simulation.duration.count must be an integer');
  } else number(duration.seconds, 'simulation.duration.seconds', 1, 864000);
  const spacecraft = object(m.spacecraft, 'spacecraft');
  if (spacecraft.attitude !== undefined) choice(object(spacecraft.attitude, 'spacecraft.attitude').strategy, 'spacecraft.attitude.strategy', ['sun-pointing', 'nadir-pointing']);
  choice(object(spacecraft.body, 'spacecraft.body').size, 'spacecraft.body.size', ['1U', '2U', '3U', '6U']);
  const bodySize=(spacecraft.body as MissionDefinition['spacecraft']['body']).size;
  const thermal=spacecraft.thermal===undefined ? defaultThermal(bodySize) : object(spacecraft.thermal,'spacecraft.thermal');
  number(thermal.massKg,'spacecraft.thermal.massKg',.1,100);
  number(thermal.specificHeatJkgK,'spacecraft.thermal.specificHeatJkgK',100,3000);
  number(thermal.initialTemperatureC,'spacecraft.thermal.initialTemperatureC',-200,200);
  for(const property of ['absorptivity','emissivity','panelAbsorptivity','panelEmissivity'] as const)number(thermal[property],`spacecraft.thermal.${property}`,0,1);
  const power = object(spacecraft.power, 'spacecraft.power');
  number(power.batteryCapacityWh, 'spacecraft.power.batteryCapacityWh', 0.001);
  number(power.baseLoadW, 'spacecraft.power.baseLoadW', 0);
  if (power.battery !== undefined) {
    const battery = object(power.battery, 'spacecraft.power.battery');
    number(battery.initialSoc, 'spacecraft.power.battery.initialSoc', 0, 1);
    number(battery.chargeEfficiency, 'spacecraft.power.battery.chargeEfficiency', 0, 1);
    number(battery.dischargeEfficiency, 'spacecraft.power.battery.dischargeEfficiency', 0.001, 1);
    number(battery.maxChargeW, 'spacecraft.power.battery.maxChargeW', 0);
    number(battery.maxDischargeW, 'spacecraft.power.battery.maxDischargeW', 0);
  }
  if (spacecraft.radio !== undefined) {
    const radio = object(spacecraft.radio, 'spacecraft.radio');
    number(radio.downlinkMbps, 'spacecraft.radio.downlinkMbps', 0, 10000);
    number(radio.loadW, 'spacecraft.radio.loadW', 0);
  }
  if (spacecraft.storage !== undefined) number(object(spacecraft.storage,'spacecraft.storage').capacityMB,'spacecraft.storage.capacityMB',0.001,1000000);
  const ids = new Set<string>(['document', 'sat-1', 'ground-track', 'ground-track-future', 'nadir-line', 'sat-body-axis-X', 'sat-body-axis-Y', 'sat-body-axis-Z']);
  function uniqueId(v: unknown, path: string) {
    string(v, path);
    if (ids.has(v)) throw new Error(`${path} must be unique and not a reserved entity ID`);
    ids.add(v);
  }
  const faceUsage=Array(6).fill(0);
  array(power.solarPanels, 'spacecraft.power.solarPanels').forEach((v, i) => {
    const path = `spacecraft.power.solarPanels[${i}]`;
    const panel = object(v, path);
    uniqueId(panel.id, `${path}.id`);
    choice(panel.mounting, `${path}.mounting`, ['body', 'deployable']);
    number(panel.areaM2, `${path}.areaM2`, 0);
    number(panel.efficiency, `${path}.efficiency`, 0, 1);
    const normal = array(panel.normalBody, `${path}.normalBody`);
    if (normal.length !== 3) throw new Error(`${path}.normalBody must have three components`);
    normal.forEach(n => number(n, `${path}.normalBody component`, -1, 1));
    if (Math.abs(Math.hypot(...normal as number[]) - 1) > 0.000001) throw new Error(`${path}.normalBody must be a unit vector`);
    const limit=panelAreaLimit(bodySize,normal as number[]),face=faceIndex(normal as number[]);
    if(panel.mounting==='body')faceUsage[face]+=panel.areaM2 as number;
    if((panel.areaM2 as number)>limit+1e-10 || faceUsage[face]>limit+1e-10)throw new Error(`${path}.areaM2 exceeds the 80% face-area budget (${limit.toFixed(4)} m²). Body panels share this budget; each deployable leaf must fit it. Use Fit solar panels to resize.`);
    if((panel.efficiency as number)>(thermal.panelAbsorptivity as number))throw new Error(`${path}.efficiency cannot exceed thermal.panelAbsorptivity`);
  });
  const payload = object(spacecraft.payload, 'spacecraft.payload');
  choice(payload.type, 'spacecraft.payload.type', ['camera']);
  if (payload.side !== undefined) choice(payload.side, 'spacecraft.payload.side', ['+X','-X','+Y','-Y','+Z','-Z']);
  number(payload.loadW, 'spacecraft.payload.loadW', 0);
  if (payload.cameraPreset !== undefined) choice(payload.cameraPreset, 'spacecraft.payload.cameraPreset', ['bw100','rgb1000']);
  if (payload.captureIntervalSec !== undefined) number(payload.captureIntervalSec,'spacecraft.payload.captureIntervalSec',1,86400);
  array(m.groundStations, 'groundStations').forEach((v, i) => {
    const path = `groundStations[${i}]`;
    const gs = object(v, path);
    uniqueId(gs.id, `${path}.id`);
    string(gs.name, `${path}.name`);
    number(gs.lat, `${path}.lat`, -90, 90);
    number(gs.lng, `${path}.lng`, -180, 180);
    number(gs.maskDeg, `${path}.maskDeg`, 0, 90);
    if (gs.altMeters !== undefined) number(gs.altMeters, `${path}.altMeters`, -500, 10000);
  });
  if (m.missionPlan !== undefined) {
    const plan = object(m.missionPlan, 'missionPlan');
    choice(plan.defaultMode, 'missionPlan.defaultMode', ['nominal','safe']);
    if (plan.downlinkStrategy !== undefined) choice(plan.downlinkStrategy,'missionPlan.downlinkStrategy',['when-available','disabled']);
    number(plan.safeLoadW, 'missionPlan.safeLoadW', 0);
    if (typeof plan.repeatEachOrbit !== 'boolean') throw new Error('missionPlan.repeatEachOrbit must be a boolean');
  }
  array(m.operations, 'operations').forEach((v, i) => {
    const path = `operations[${i}]`;
    const op = object(v, path);
    number(op.startSec, `${path}.startSec`, 0);
    number(op.endSec, `${path}.endSec`, 0);
    if ((op.endSec as number) <= (op.startSec as number)) throw new Error(`${path}.endSec must follow startSec`);
    choice(op.mode, `${path}.mode`, ['nominal', 'safe', 'idle', 'imaging', 'downlink']);
  });
}
