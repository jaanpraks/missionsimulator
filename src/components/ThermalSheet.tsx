import InfoPopover from './InfoPopover';
import React from 'react';
import type { MissionDefinition } from '../mission/definition';
import { BODY_DIMENSIONS, faceAreas } from '../mission/physical';
import { defaultThermal, type ThermalDefinition } from '../sim/thermal';
import { Field } from './FormField';
import { Button, Card } from './ui';

export default function ThermalSheet({mission,onUpdate}:{mission:MissionDefinition;onUpdate:(change:(next:MissionDefinition)=>void)=>string|null}) {
  const settings=mission.spacecraft.thermal ?? defaultThermal(mission.spacecraft.body.size);
  const field=(label:string,key:keyof ThermalDefinition,min:number,max:number)=> <Field key={key} label={label} min={min} max={max} value={settings[key]} onCommit={text=>{
    if(!text.trim() || !Number.isFinite(Number(text)))return 'Enter a finite number.';
    return onUpdate(next=>{next.spacecraft.thermal={...settings,[key]:Number(text)};});
  }}/>;
  const dimensions=BODY_DIMENSIONS[mission.spacecraft.body.size];
  return <>
    <Card title="Single-node thermal model">
      <InfoPopover label="Thermal model">The bus, battery, payload and deployed panels share one temperature. Absorptivity controls sunlight heating; emissivity controls infrared absorption and radiation to space. Mass controls how quickly temperature changes.</InfoPopover>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:16}}>
        {field('Satellite mass (kg)','massKg',.1,100)}
        {field('Body solar absorptivity (0–1)','absorptivity',0,1)}
        {field('Body infrared emissivity (0–1)','emissivity',0,1)}
        {field('Initial temperature (°C)','initialTemperatureC',-200,200)}
        {field('Effective specific heat (J/kg/K)','specificHeatJkgK',100,3000)}
        {field('Solar-cell absorptivity (0–1)','panelAbsorptivity',0,1)}
        {field('Solar-cell emissivity (0–1)','panelEmissivity',0,1)}
      </div>
      <p>Thermal capacity: <strong>{(settings.massKg*settings.specificHeatJkgK).toFixed(0)} J/K</strong> · Body: {dimensions.map(d=>(d*100).toFixed(0)).join(' × ')} cm · Surface: {faceAreas(mission.spacecraft.body.size).reduce((sum,a)=>sum+a,0).toFixed(3)} m²</p>
      <Button variant="ghost" onClick={()=>onUpdate(next=>{next.spacecraft.thermal=defaultThermal(next.spacecraft.body.size);})}>Reset thermal defaults for {mission.spacecraft.body.size}</Button>
      <InfoPopover label="Thermal model">Teaching defaults: 1.33 / 2.66 / 4 / 8 kg for 1U / 2U / 3U / 6U; effective specific heat 900 J/kg/K. Body α = 0.35, ε = 0.80; solar cells α = 0.90, ε = 0.85. These are representative assumptions, not a specified material or flight prediction. Solar-cell absorptivity must be at least the electrical efficiency.</InfoPopover>
    </Card>
    <Card title="What drives temperature?">
      <p>Absorbed sunlight + Earth infrared + reflected sunlight + electrical dissipation − emitted infrared = stored heat.</p>
      <InfoPopover label="Thermal model">Attitude and eclipse change solar heating. Earth infrared uses 237 W/m² and albedo 0.30 with a simplified Earth view factor and illuminated fraction. Body-mounted cells replace covered body surface; deployable leaves add two radiating sides. All panels are assumed deployed and perfectly coupled to the bus, with no self-shadowing.</InfoPopover>
      <InfoPopover label="Thermal model">Converted solar electricity is removed from direct solar heat. Powered loads, battery losses and shunted surplus return as heat; battery charging stores energy. Radio input is treated entirely as heat. No convection, temperature-dependent efficiency, heaters or automatic thermal protection are modelled.</InfoPopover>
    </Card>
  </>;
}
