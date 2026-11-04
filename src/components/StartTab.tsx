import React from 'react';
import { Button } from './ui';

export default function StartTab({ onBuild }: { onBuild: () => void }) {
  return <div className="start-screen">
    <div className="start-hero">
      <div className="start-copy">
        <span className="eyebrow">MISSION SIMULATOR · EDUCATION</span>
        <h1>A small satellite.<br /><em>A whole mission.</em></h1>
        <p>Design a CubeSat, send it into orbit, and discover how its systems work together.</p>
        <p className="muted">Explore the tradeoffs between power, pointing, imaging, and communication in an interactive mission simulator built for students.</p>
        <Button onClick={onBuild}>Build your satellite <span aria-hidden="true">↗</span></Button>
        <span className="start-defaults">YOUR FIRST ORBIT · 85° inclination · 160° RAAN</span>
      </div>
      <svg className="start-art" viewBox="0 0 640 520" role="img" aria-label="CubeSat with solar arrays orbiting Earth">
        <defs>
          <radialGradient id="earth"><stop stopColor="#1f8190"/><stop offset=".7" stopColor="#124269"/><stop offset="1" stopColor="#071428"/></radialGradient>
          <linearGradient id="sat-body" x2="1" y2="1"><stop stopColor="#e1e7ef"/><stop offset="1" stopColor="#60738b"/></linearGradient>
          <pattern id="solar-grid" width="17" height="17" patternUnits="userSpaceOnUse"><rect width="17" height="17" fill="#163d73"/><path d="M0 0h17v17" fill="none" stroke="#5399c6" strokeWidth=".6"/></pattern>
        </defs>
        {[ [40,90],[570,100],[520,420],[90,400],[340,40],[600,300],[200,60],[70,250],[400,460] ].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i%3===0?2:1} fill="#86a7c5"/>) }
        <circle cx="330" cy="280" r="150" fill="url(#earth)" stroke="#429ca5" strokeWidth="1"/>
        <g fill="none" stroke="#5eadaf" opacity=".25"><ellipse cx="330" cy="280" rx="80" ry="150"/><ellipse cx="330" cy="280" rx="130" ry="150"/><ellipse cx="330" cy="280" rx="150" ry="55"/><path d="M180 280h300M330 130v300"/></g>
        <path d="m248 182 34-16 26 14-3 24 31 20-10 24-22 8-13 48-22-10-7-42-30-21Z M361 283l46-13 29 28-12 40-31 27-13-20-3-34Z" fill="#57b3a2" opacity=".38"/>
        <ellipse cx="330" cy="280" rx="264" ry="100" transform="rotate(-34 330 280)" fill="none" stroke="#50ddc7" strokeWidth="1.5" strokeDasharray="6 8" opacity=".65"/>
        <g transform="translate(166 147) rotate(-25)">
          <rect x="-104" y="-27" width="80" height="56" rx="2" fill="url(#solar-grid)" stroke="#72b6d9"/>
          <rect x="34" y="-27" width="80" height="56" rx="2" fill="url(#solar-grid)" stroke="#72b6d9"/>
          <path d="M-24 0h58" stroke="#a6b6cb" strokeWidth="5"/>
          <path d="M-24-42 15-50 39-30v78L0 56-24 35Z" fill="url(#sat-body)" stroke="#b5c9db"/>
          <path d="M0-22 39-30v78L0 56Z" fill="#344c64"/><path d="M-24-42 0-22 39-30M0-22v78" fill="none" stroke="#d3e6f1"/>
          <circle cx="18" cy="17" r="12" fill="#081728" stroke="#57e2d3" strokeWidth="3"/>
          <path d="M11-48v-27m0 0-13-10m13 10 13-10" fill="none" stroke="#b0c8dd" strokeWidth="2"/>
        </g>
        <text x="418" y="107" fill="#71dacb" fontSize="11" letterSpacing="3">DESIGN · ORBIT · DISCOVER</text>
      </svg>
    </div>
    <div className="start-steps">
      {[['01', 'Build', 'Choose your subsystems, set an orbit, and plan your mission.'], ['02', 'Simulate', 'Follow your satellite around Earth as it collects images and contacts ground stations.'], ['03', 'Analyze', 'Inspect power, battery, storage, and thermal results. Refine your design and try again.']].map(([number,title,description]) => <div key={number}><span>{number}</span><h2>{title}</h2><p>{description}</p></div>)}
    </div>
  </div>;
}
