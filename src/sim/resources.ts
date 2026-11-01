import type { MissionDefinition } from '../mission/definition';
import type { SatelliteState, Telemetry } from '../types';
import { contactWindows } from './contact';
import { missionTiming, operationAt } from './operations';
import { defaultThermal, thermalEnvironment, thermalStep, STEFAN_BOLTZMANN } from './thermal';

export const DEFAULT_BATTERY = {initialSoc:0.8,chargeEfficiency:0.9,dischargeEfficiency:0.95,maxChargeW:15,maxDischargeW:25};
export const DEFAULT_RADIO = {downlinkMbps:0.1,loadW:5};
export const DEFAULT_STORAGE = {capacityMB:64};
const EMPTY_BATTERY_WH = 1e-10;
export const CAMERA_PRESETS = {
  bw100: {label:'100×100 · 16-bit monochrome',width:100,height:100,bitsPerPixel:16},
  rgb1000: {label:'1000×1000 · 24-bit RGB',width:1000,height:1000,bitsPerPixel:24}
};
export function imageBytes(preset:keyof typeof CAMERA_PRESETS='bw100') {
  const camera=CAMERA_PRESETS[preset];
  return camera.width*camera.height*camera.bitsPerPixel/8;
}

export type ResourceState = {
  batteryWh:number; batterySoc:number; storedBytes:number;
  capturedBytes:number; downloadedBytes:number; droppedBytes:number;
  imagesCaptured:number; imagesDropped:number; unmetEnergyWh:number;
  downlinkActive:boolean; downlinkLoadW:number; powerLimited:boolean;
};
export const EMPTY_RESOURCES: ResourceState = {batteryWh:0,batterySoc:0,storedBytes:0,capturedBytes:0,downloadedBytes:0,droppedBytes:0,imagesCaptured:0,imagesDropped:0,unmetEnergyWh:0,downlinkActive:false,downlinkLoadW:0,powerLimited:false};

/** Bus-side power balance. Demand beyond battery output is recorded as unmet. */
export function batteryStep(energyWh:number, generationW:number, demandW:number, dtSec:number, capacityWh:number, settings=DEFAULT_BATTERY) {
  const surplus=generationW-demandW;
  if(surplus>=0) return {energyWh:Math.min(capacityWh,energyWh+Math.min(surplus,settings.maxChargeW)*settings.chargeEfficiency*dtSec/3600),unmetWh:0};
  const suppliedWh=Math.min(-surplus*dtSec/3600,settings.maxDischargeW*dtSec/3600,energyWh*settings.dischargeEfficiency);
  return {energyWh:Math.max(0,energyWh-suppliedWh/settings.dischargeEfficiency),unmetWh:Math.max(0,-surplus*dtSec/3600-suppliedWh)};
}

/** Fixed output samples, with <=5-second integration split at schedule/contact events. */
export function simulateResources(mission:MissionDefinition, states:SatelliteState[], telemetry:Telemetry) {
  const battery=mission.spacecraft.power.battery ?? DEFAULT_BATTERY;
  const thermal=mission.spacecraft.thermal ?? defaultThermal(mission.spacecraft.body.size);
  const environment=states.map((state,i)=>thermalEnvironment(mission,state,telemetry.totalSolarPowerW[i]));
  let temperatureK=thermal.initialTemperatureC+273.15,internalHeatW=0;
  const radio=mission.spacecraft.radio ?? DEFAULT_RADIO;
  const storage=mission.spacecraft.storage ?? DEFAULT_STORAGE;
  const capacity=storage.capacityMB*1e6;
  const bytesPerImage=imageBytes(mission.spacecraft.payload.cameraPreset);
  const interval=mission.spacecraft.payload.captureIntervalSec ?? 60;
  const {periodSec,durationSec}=missionTiming(mission);
  const windows=mission.groundStations.flatMap(station=>contactWindows(telemetry.timeSec,telemetry.lookAnglesByStation[station.id] ?? [],station.maskDeg)).sort((a,b)=>a.startSec-b.startSec);
  const contacts:typeof windows=[];
  for(const window of windows){const previous=contacts.at(-1);if(previous&&window.startSec<=previous.endSec)previous.endSec=Math.max(previous.endSec,window.endSec);else contacts.push({...window});}
  const boundaries=new Set<number>([0,durationSec]);
  for(const contact of contacts){boundaries.add(contact.startSec);boundaries.add(contact.endSec);}
  const repeats=mission.missionPlan?.repeatEachOrbit ? Math.ceil(durationSec/periodSec) : 1;
  for(let orbit=0;orbit<repeats;orbit++) {
    const offset=mission.missionPlan?.repeatEachOrbit ? orbit*periodSec : 0;
    boundaries.add(Math.min(durationSec,offset));
    for(const op of mission.operations)for(const t of [op.startSec,op.endSec])if(offset+t<=durationSec)boundaries.add(offset+t);
  }
  const events=[...boundaries].sort((a,b)=>a-b);
  let eventIndex=1,contactIndex=0;
  let energy=mission.spacecraft.power.batteryCapacityWh*battery.initialSoc;
  let stored=0,captured=0,downloaded=0,dropped=0,images=0,droppedImages=0,unmet=0,exposure=0;
  const enabled=mission.missionPlan?.downlinkStrategy !== 'disabled';
  const inContact=(time:number)=>{
    while(contactIndex<contacts.length && contacts[contactIndex].endSec<=time)contactIndex++;
    return contactIndex<contacts.length && contacts[contactIndex].startSec<=time && time<contacts[contactIndex].endSec;
  };
  for(let i=0;i<states.length;i++) {
    let limited=false;
    if(i>0) {
      let time=states[i-1].timeSec;
      const stop=states[i].timeSec;
      while(time<stop-1e-8) {
        while(eventIndex<events.length && events[eventIndex]<=time+1e-8)eventIndex++;
        let dt=Math.min(5,stop-time,(events[eventIndex] ?? stop)-time);
        const op=operationAt(mission,time+Math.min(dt/2,1e-5),periodSec);
        const batteryAvailable=energy>EMPTY_BATTERY_WH;
        const imaging=op.payloadOn && batteryAvailable;
        if(imaging)dt=Math.min(dt,Math.max(1e-8,interval-exposure));
        else exposure=0;
        const mid=time+dt/2;
        const fraction=(mid-states[i-1].timeSec)/(stop-states[i-1].timeSec);
        const solar=telemetry.totalSolarPowerW[i-1]*(1-fraction)+telemetry.totalSolarPowerW[i]*fraction;
        const link=batteryAvailable && enabled && op.mode!=='safe' && radio.downlinkMbps>0 && stored>0 && inContact(mid);
        const transfer=link ? Math.min(stored,radio.downlinkMbps*1e6/8*dt) : 0;
        const radioDuty=link ? transfer/(radio.downlinkMbps*1e6/8*dt) : 0;
        const demand=op.busLoadW+(imaging?op.payloadLoadW:0)+radio.loadW*radioDuty;
        const balance=batteryStep(energy,solar,demand,dt,mission.spacecraft.power.batteryCapacityWh,battery);
        // Electrical energy not stored becomes heat: supplied loads, losses and shunted surplus.
        // Includes all radio input as heat; exported RF power is omitted in this teaching model.
        internalHeatW=Math.max(0,solar-(balance.energyWh-energy)*3600/dt);
        const a=environment[i-1],b=environment[i];
        const blend=(key:keyof typeof a)=>a[key]*(1-fraction)+b[key]*fraction;
        temperatureK=thermalStep(temperatureK,blend('solarHeatW')+blend('earthInfraredHeatW')+blend('albedoHeatW')+internalHeatW,blend('emittingArea'),thermal.massKg*thermal.specificHeatJkgK,dt);
        energy=balance.energyWh; unmet+=balance.unmetWh;
        const powered=balance.unmetWh<1e-10;
        limited ||= !powered;
        if(powered) {
          stored-=transfer; downloaded+=transfer;
          if(imaging) {
            exposure+=dt;
            if(exposure>=interval-1e-7) {
              exposure=0; images++; captured+=bytesPerImage;
              if(stored+bytesPerImage<=capacity+1e-6)stored=Math.min(capacity,stored+bytesPerImage);
              else {dropped+=bytesPerImage;droppedImages++;}
            }
          }
        } else exposure=0;
        time+=dt;
      }
    }
    const state=states[i];
    const env=environment[i];
    Object.assign(state,{temperatureC:temperatureK-273.15,solarHeatW:env.solarHeatW,earthInfraredHeatW:env.earthInfraredHeatW,albedoHeatW:env.albedoHeatW,internalHeatW,radiatedHeatW:STEFAN_BOLTZMANN*env.emittingArea*(temperatureK**4-3**4)});
    const visible=mission.groundStations.some(station=>telemetry.accessByStation[station.id]?.[i]);
    const batteryAvailable=energy>EMPTY_BATTERY_WH;
    const availableW=telemetry.totalSolarPowerW[i]+(batteryAvailable?battery.maxDischargeW:0);
    const payloadOn=state.payloadOn && batteryAvailable && !limited && availableW>=state.busLoadW+state.payloadLoadW;
    state.payloadOn=payloadOn;
    if(!payloadOn)state.payloadLoadW=0;
    state.totalLoadW=state.busLoadW+state.payloadLoadW;
    const downlinkActive=batteryAvailable && enabled && visible && state.mode!=='safe' && stored>0 && radio.downlinkMbps>0 && !limited && availableW>=state.totalLoadW+radio.loadW;
    Object.assign(state,{batteryWh:energy,batterySoc:energy/mission.spacecraft.power.batteryCapacityWh,storedBytes:stored,capturedBytes:captured,downloadedBytes:downloaded,droppedBytes:dropped,imagesCaptured:images,imagesDropped:droppedImages,unmetEnergyWh:unmet,downlinkActive,downlinkLoadW:downlinkActive?radio.loadW:0,powerLimited:limited});
    state.totalLoadW+=downlinkActive?radio.loadW:0;
    telemetry.batterySoc.push(energy/mission.spacecraft.power.batteryCapacityWh);
  }
}
