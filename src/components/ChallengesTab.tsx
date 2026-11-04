import React from 'react';
import { Card } from './ui';

export const CHALLENGES = [
  { id: 'download', objective: 'Download 3 MB within 10 orbits', description: 'Design an imaging mission that produces, stores, and downloads at least 3 MB of data.' },
  { id: 'warm', objective: 'Stay above 0°C for 5 orbits', description: 'Keep the satellite temperature above 0°C throughout five complete orbits.' },
  { id: 'helsinki', objective: 'Maintain Helsinki contact for 22 minutes', description: 'Find an orbit with at least 22 minutes of continuous visibility from the Helsinki ground station during one orbit.' },
  { id: 'power', objective: 'Complete 5 orbits without a power shortage', description: 'Balance solar generation, battery capacity, and subsystem demand over five complete orbits.' },
  { id: 'storage', objective: 'Capture 100 images without dropping any', description: 'Capture at least 100 images during your mission without losing images to full storage.' }
] as const;

export default function ChallengesTab({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  return <Card title="Mission challenges">
    <p className="muted">Choose an objective, then explore different satellite designs and mission plans. Results are not checked automatically.</p>
    <fieldset className="challenge-list">
      <legend>Choose a challenge</legend>
      <label className="challenge-option">
        <input type="radio" name="mission-challenge" value="none" checked={selectedId === null} onChange={() => onSelect(null)} />
        <span><strong>Free exploration</strong><span>No challenge reminder.</span></span>
      </label>
      {CHALLENGES.map(challenge => <label className="challenge-option" key={challenge.id}>
        <input type="radio" name="mission-challenge" value={challenge.id} checked={selectedId === challenge.id} onChange={() => onSelect(challenge.id)} />
        <span><strong>{challenge.objective}</strong><span>{challenge.description}</span></span>
      </label>)}
    </fieldset>
  </Card>;
}
