import type { MissionDefinition } from './definition';
export type BusSubsystem = 'obc' | 'adcs' | 'eps' | 'structure';
/** Preserve legacy bus demand with up to 2 W allocated to EPS until edited. */
export function busPowerLoads(spacecraft: MissionDefinition['spacecraft']): Record<BusSubsystem, number> {
  const eps = Math.min(2, spacecraft.power.baseLoadW);
  return spacecraft.power.subsystemLoadsW ?? { obc: spacecraft.power.baseLoadW - eps, adcs: 0, eps, structure: 0 };
}
