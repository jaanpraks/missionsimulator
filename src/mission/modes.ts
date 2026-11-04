import type { MissionDefinition } from './definition';
import { busPowerLoads } from './subsystems';
import { DEFAULT_RADIO } from '../sim/resources';

/** Full active-subsystem budgets; contact-dependent transmission may draw less. */
export function missionModeBudgets(spacecraft: MissionDefinition['spacecraft']) {
  const bus = busPowerLoads(spacecraft);
  const definitions = [
    { id: 'safe', label: 'Safe', active: ['EPS'] },
    { id: 'nominal', label: 'Nominal', active: ['EPS', 'OBC', 'ADCS'] },
    { id: 'downlink', label: 'Downlink', active: ['EPS', 'OBC', 'ADCS', 'COM'] },
    { id: 'imaging', label: 'Imaging', active: ['EPS', 'OBC', 'ADCS', 'Payload'] }
  ];
  const design = { EPS: bus.eps, OBC: bus.obc + bus.structure, ADCS: bus.adcs, COM: (spacecraft.radio ?? DEFAULT_RADIO).loadW, Payload: spacecraft.payload.loadW };
  return definitions.map(mode => {
    const loads = Object.entries(design).map(([system, watts]): [string, number | null] => [system, mode.active.includes(system) ? watts : null]);
    return { ...mode, loads, totalW: loads.reduce((sum, [, watts]) => sum + (watts ?? 0), 0) };
  });
}
