import type { MissionDefinition } from './definition';
export type BusSubsystem = 'obc' | 'adcs' | 'eps' | 'structure';
/** Preserve legacy bus demand, allocated to OBC until edited. */
export function busPowerLoads(spacecraft: MissionDefinition['spacecraft']): Record<BusSubsystem, number> {
  return spacecraft.power.subsystemLoadsW ?? { obc: spacecraft.power.baseLoadW, adcs: 0, eps: 0, structure: 0 };
}
