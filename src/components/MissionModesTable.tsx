import React from 'react';
import type { MissionDefinition } from '../mission/definition';
import { missionModeBudgets } from '../mission/modes';
import InfoPopover from './InfoPopover';

export default function MissionModesTable({ spacecraft }: { spacecraft: MissionDefinition['spacecraft'] }) {
  return <>
    <div className="mode-table-scroll">
      <table className="mission-modes-table">
        <caption>Subsystem activity and design power by mission mode</caption>
        <thead><tr><th scope="col">Mode</th>{['EPS', 'OBC', 'ADCS', 'COM', 'Payload'].map(system => <th scope="col" key={system}>{system}</th>)}<th scope="col">Total</th></tr></thead>
        <tbody>{missionModeBudgets(spacecraft).map(mode => <tr key={mode.id}>
          <th scope="row">{mode.label}</th>
          {mode.loads.map(([system, watts]) => <td key={system} className={watts === null ? 'mode-off' : 'mode-on'}>{watts === null ? 'Off' : <><span>On</span> {watts.toFixed(2)} W</>}</td>)}
          <td className="mode-total">{mode.totalW.toFixed(2)} W</td>
        </tr>)}</tbody>
      </table>
    </div>
    <InfoPopover label="Mission mode power">Power values come from Satellite and update with your design. Safe powers only EPS; Nominal adds OBC and ADCS; Downlink adds COM; Imaging adds the camera. These are design budgets with the listed subsystems active. Automatic downlink can additionally activate COM in any non-safe mode when stored data and ground contact are available; actual radio demand depends on transmission time. A disabled strategy prevents transmission. Legacy combined bus loads are allocated to EPS (up to 2 W) and OBC until edited; any legacy Structure allocation is included with OBC.</InfoPopover>
  </>;
}
