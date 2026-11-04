import React from 'react';
import InfoPopover from './InfoPopover';

export type SubsystemIcon = 'structure' | 'payload' | 'obc' | 'com' | 'adcs' | 'eps';

export function SystemGraphic({ system }: { system: SubsystemIcon }) {
  const drawings: Record<SubsystemIcon, React.ReactNode> = {
    structure: <><path d="M16 17 32 8 48 17v29L32 55 16 46Z M16 17l16 9 16-9 M32 26v29 M16 31l16 9 16-9"/><path d="m21 20 22 23M43 20 21 43" opacity=".35"/></>,
    payload: <><rect x="10" y="19" width="44" height="32" rx="6"/><path d="m21 19 4-8h14l4 8"/><circle cx="32" cy="35" r="11"/><circle cx="32" cy="35" r="5"/><path d="M46 26h2"/></>,
    obc: <><rect x="16" y="16" width="32" height="32" rx="4"/><rect x="24" y="24" width="16" height="16" rx="2"/>{[22,32,42].map(n=><path key={n} d={`M${n} 8v8m0 32v8M8 ${n}h8m32 0h8`}/>)}</>,
    com: <><path d="M15 22a22 22 0 0 0 27 27Z M28 36l17-17 M40 15l9 9 M29 47l-5 9h25 M37 8a21 21 0 0 1 19 19 M37 16a13 13 0 0 1 11 11"/><circle cx="45" cy="19" r="2"/></>,
    adcs: <><circle cx="32" cy="32" r="17"/><ellipse cx="32" cy="32" rx="27" ry="9" transform="rotate(-35 32 32)"/><path d="M32 9v46 M9 32h46 M32 9l-4 6m4-6 4 6 M55 32l-6-4m6 4-6 4"/><circle cx="32" cy="32" r="3"/></>,
    eps: <><rect x="9" y="18" width="40" height="31" rx="4"/><path d="M49 27h6v13h-6 M31 22l-9 14h10l-5 10 15-17H31Z M15 10h7m-3-3v6 M42 10h7"/></>
  };
  return <svg className={`system-graphic system-${system}`} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{drawings[system]}</svg>;
}

export default function SubsystemCard({ system, title, subtitle, help, children }: {
  system: SubsystemIcon; title: string; subtitle: string; help: React.ReactNode; children: React.ReactNode;
}) {
  return <section className={`panel-card subsystem-card subsystem-${system}`} aria-label={title}>
    <header className="subsystem-heading">
      <SystemGraphic system={system} />
      <div><h2>{title}</h2><span>{subtitle}</span></div>
      <InfoPopover label={title}>{help}</InfoPopover>
    </header>
    {children}
  </section>;
}
