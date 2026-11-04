export type TabId = 'start' | 'build' | 'simulate' | 'analyze' | 'challenges';
export type SimViewId = 'global' | 'orbital' | 'operator' | 'satInertial' | 'payload';

import type { MissionDefinition } from './mission/definition';
import type { StationLook } from './sim/station';
import type { OperationState } from './sim/operations';
import type { ResourceState } from './sim/resources';
import type { ThermalState } from './sim/thermal';
import type { BodyAxes, Vec3 } from './sim/attitude';
export type { MissionDefinition, GroundStation } from './mission/definition';

export type ScenarioMeta = {
  name: string;
  createdAtIso: string;
  startIso: string;
  endIso: string;
  durationSec: number;
  stepSec: number;
};

export type Telemetry = {
  solarPowerByPanelW: Record<string, number[]>;
  totalSolarPowerW: number[];
  timeSec: number[];
  sunlight: boolean[];
  batterySoc: number[]; // 0..1
  accessByStation: Record<string, boolean[]>;
  lookAnglesByStation: Record<string, (StationLook | null)[]>;
};

export type SatelliteState = OperationState & ResourceState & ThermalState & {
  timeSec: number;
  positionTemeKm: Vec3;
  velocityTemeKmSec: Vec3;
  bodyAxesTeme: BodyAxes;
  sunDirectionBody: Vec3;
  sunlit: boolean;
};

export type CompiledScenario = {
  meta: ScenarioMeta;
  mission: MissionDefinition;
  czml: any[];
  telemetry: Telemetry;
  states: SatelliteState[];
};

export type RunRecord = {
  id: string;
  createdAtIso: string;
  scenario: CompiledScenario;
};



