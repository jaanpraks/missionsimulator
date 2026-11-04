import { busPowerLoads } from '../mission/subsystems';
import * as satellite from 'satellite.js';
import type { MissionDefinition } from '../mission/definition';

export type OperatingMode = 'nominal' | 'safe' | 'imaging' | 'downlink';
export type OperationState = { mode: OperatingMode; payloadOn: boolean; busLoadW: number; payloadLoadW: number; totalLoadW: number };
export const defaultMissionPlan = { defaultMode: 'nominal' as const, safeLoadW: 2, repeatEachOrbit: false, downlinkStrategy: 'when-available' as const };

export function missionTiming(mission: MissionDefinition, record?: satellite.SatRec) {
  const satrec = record ?? satellite.twoline2satrec(mission.orbit.line1, mission.orbit.line2);
  if (satrec.error || !Number.isFinite(satrec.no) || satrec.no <= 0) throw new Error('The TLE does not define a valid orbit.');
  const periodSec = 2 * Math.PI / satrec.no * 60;
  const duration = mission.simulation.duration;
  const durationSec = duration.type === 'orbits' ? Math.round(periodSec * duration.count) : duration.seconds;
  return {periodSec,durationSec};
}

export function validateOperationSchedule(mission: MissionDefinition, periodSec: number, durationSec: number) {
  const limit = mission.missionPlan?.repeatEachOrbit ? periodSec : durationSec;
  const sorted = [...mission.operations].sort((a,b)=>a.startSec-b.startSec);
  for (let i=0;i<sorted.length;i++) {
    const interval = sorted[i];
    if (interval.endSec > limit + 1e-6) throw new Error(`Schedule interval ends beyond ${mission.missionPlan?.repeatEachOrbit ? 'one orbit' : 'the simulation duration'}. Shorten the interval or extend the run.`);
    if (i>0 && interval.startSec < sorted[i-1].endSec - 1e-6) throw new Error('Schedule intervals overlap. Use one operating mode at a time.');
  }
}

/** Half-open intervals [start,end); outside them use the mission's default mode. */
export function operationAt(mission: MissionDefinition, timeSec: number, periodSec: number): OperationState {
  const plan = mission.missionPlan ?? defaultMissionPlan;
  const time = plan.repeatEachOrbit ? ((timeSec % periodSec) + periodSec) % periodSec : timeSec;
  const scheduled = mission.operations.find(op => time >= op.startSec && time < op.endSec)?.mode;
  const mode = scheduled === 'idle' ? 'nominal' : scheduled ?? plan.defaultMode;
  const busLoadW = mode === 'safe' ? busPowerLoads(mission.spacecraft).eps : Object.values(busPowerLoads(mission.spacecraft)).reduce((sum, load) => sum + load, 0);
  const payloadOn = mode === 'imaging';
  const payloadLoadW = payloadOn ? mission.spacecraft.payload.loadW : 0;
  return {mode,payloadOn,busLoadW,payloadLoadW,totalLoadW:busLoadW+payloadLoadW};
}
