const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {createDefaultMission}=require('../src/mission/definition.ts');
const {batteryStep,DEFAULT_BATTERY,EMPTY_RESOURCES,imageBytes,simulateResources}=require('../src/sim/resources.ts');
const {operationAt}=require('../src/sim/operations.ts');

function run({disabled=false,stations=1,visible=true,capacityMB=1,power=100,initialSoc=1,safe=false,batteryCapacityWh=30}={}) {
  const mission=createDefaultMission();
  mission.simulation.duration={type:'seconds',seconds:60};
  mission.missionPlan={defaultMode:'nominal',safeLoadW:2,repeatEachOrbit:false,downlinkStrategy:disabled?'disabled':'when-available'};
  mission.operations=[{startSec:0,endSec:30,mode:'imaging'},...(safe?[{startSec:30,endSec:60,mode:'safe'}]:[])];
  mission.spacecraft.payload.cameraPreset='bw100';
  mission.spacecraft.payload.captureIntervalSec=10;
  mission.spacecraft.storage={capacityMB};
  mission.spacecraft.radio={downlinkMbps:0.008,loadW:5}; // 1000 bytes/second
  mission.spacecraft.power.batteryCapacityWh=batteryCapacityWh;
  mission.spacecraft.power.battery={...DEFAULT_BATTERY,initialSoc};
  mission.groundStations=Array.from({length:stations},(_,i)=>({id:`s${i}`,name:'Station',lat:0,lng:0,maskDeg:10}));
  const timeSec=Array.from({length:13},(_,i)=>i*5);
  const states=timeSec.map(timeSec=>({...EMPTY_RESOURCES,...operationAt(mission,timeSec,6000),timeSec,sunlit:(typeof power==='function'?power(timeSec):power)>0,positionTemeKm:[6800,0,0],sunDirectionBody:[1,0,0],bodyAxesTeme:{x:[1,0,0],y:[0,1,0],z:[0,0,1]}}));
  const telemetry={timeSec,batterySoc:[],totalSolarPowerW:timeSec.map(time=>typeof power==='function'?power(time):power),lookAnglesByStation:{},accessByStation:{}};
  for(const station of mission.groundStations){telemetry.lookAnglesByStation[station.id]=timeSec.map(()=>({elevationDeg:visible?30:0,azimuthDeg:0,rangeKm:1000}));telemetry.accessByStation[station.id]=timeSec.map(()=>visible);}
  simulateResources(mission,states,telemetry);
  return states;
}

test('raw camera sizes and battery efficiency, rate, capacity and depletion limits',()=>{
  assert.equal(imageBytes('bw100'),20000);
  assert.equal(imageBytes('rgb1000'),3000000);
  assert.equal(batteryStep(1,100,0,3600,10).energyWh,10);
  assert.equal(batteryStep(0,100,0,3600,100).energyWh,13.5);
  const empty=batteryStep(1,0,10,3600,10);
  assert.equal(empty.energyWh,0);
  assert.ok(Math.abs(empty.unmetWh-9.05)<1e-9);
  const limited=batteryStep(100,0,30,3600,100);
  assert.equal(limited.unmetWh,5);
});

test('imaging and downlink conserve bytes and overlapping stations share one radio',()=>{
  const states=run(), last=states.at(-1);
  assert.equal(last.imagesCaptured,3);
  assert.equal(last.capturedBytes,60000);
  assert.equal(last.downloadedBytes,50000);
  assert.equal(last.storedBytes,10000);
  assert.equal(last.capturedBytes,last.storedBytes+last.downloadedBytes+last.droppedBytes);
  assert.equal(run({stations:2}).at(-1).downloadedBytes,last.downloadedBytes);
  assert.ok(states.some(state=>state.downlinkLoadW===5 && state.totalLoadW===state.busLoadW+state.payloadLoadW+5));
});

test('disabled downlink, absent contact, safe mode and storage overflow gate data flow',()=>{
  assert.equal(run({disabled:true}).at(-1).downloadedBytes,0);
  assert.equal(run({visible:false}).at(-1).downloadedBytes,0);
  const safe=run({safe:true});
  assert.equal(safe.at(-1).downloadedBytes,safe[6].downloadedBytes);
  const full=run({disabled:true,capacityMB:.03}).at(-1);
  assert.equal(full.storedBytes,20000);
  assert.equal(full.imagesDropped,2);
  assert.equal(full.capturedBytes,full.storedBytes+full.droppedBytes);
});

test('empty battery without solar prevents image generation and records unmet demand',()=>{
  const last=run({power:0,initialSoc:0}).at(-1);
  assert.equal(last.batterySoc,0);
  assert.equal(last.imagesCaptured,0);
  assert.equal(last.downloadedBytes,0);
  assert.ok(last.unmetEnergyWh>0);
});

test('radio energy follows actual transmitting time and is absent when downlink is disabled',()=>{
  const active=run({power:0}).at(-1);
  const disabled=run({power:0,disabled:true}).at(-1);
  const expectedWh=active.downloadedBytes/1000*5/3600/DEFAULT_BATTERY.dischargeEfficiency;
  assert.ok(Math.abs(disabled.batteryWh-active.batteryWh-expectedWh)<1e-9);
});

test('legacy resource defaults compile explicitly and invalid resource inputs are rejected',()=>{
  const {compileScenario}=require('../src/sim/compiler.ts');
  const {validateMissionDefinition}=require('../src/mission/definition.ts');
  const mission=createDefaultMission();
  delete mission.spacecraft.power.battery;
  delete mission.spacecraft.radio;
  delete mission.spacecraft.storage;
  delete mission.spacecraft.payload.cameraPreset;
  delete mission.spacecraft.payload.captureIntervalSec;
  delete mission.missionPlan.downlinkStrategy;
  const result=compileScenario(mission);
  assert.equal(result.mission.spacecraft.storage.capacityMB,64);
  assert.equal(result.mission.spacecraft.radio.downlinkMbps,.1);
  assert.equal(result.states[0].batterySoc,.8);
  assert.equal(result.telemetry.batterySoc.length,result.states.length);
  const invalid=createDefaultMission();
  invalid.spacecraft.power.battery.dischargeEfficiency=0;
  assert.throws(()=>validateMissionDefinition(invalid),/dischargeEfficiency/);
  invalid.spacecraft.power.battery.dischargeEfficiency=.95;
  invalid.spacecraft.payload.cameraPreset='unknown';
  assert.throws(()=>validateMissionDefinition(invalid),/cameraPreset/);
});


test('battery depletion disables camera and radio with stored images and station access',()=>{
  const states=run({power:0,batteryCapacityWh:.1});
  assert.ok(states.some(s=>s.imagesCaptured>0 && s.storedBytes>0));
  assert.ok(states.some(s=>s.downloadedBytes>0));
  const empty=states.findIndex(s=>s.batteryWh===0);
  assert.ok(empty>0);
  const stopped=states[empty];
  for(const state of states.slice(empty)) {
    assert.equal(state.payloadOn,false);
    assert.equal(state.payloadLoadW,0);
    assert.equal(state.downlinkActive,false);
    assert.equal(state.downlinkLoadW,0);
    assert.equal(state.imagesCaptured,stopped.imagesCaptured);
    assert.equal(state.downloadedBytes,stopped.downloadedBytes);
    assert.equal(state.storedBytes,stopped.storedBytes);
  }
});

test('empty battery blocks camera initially and solar recharge restores operation',()=>{
  const states=run({initialSoc:0,power:100});
  assert.equal(states[0].payloadOn,false);
  assert.equal(states[0].downlinkActive,false);
  assert.ok(states.some(s=>s.batteryWh>0 && s.payloadOn));
  assert.ok(states.at(-1).imagesCaptured>0);
  assert.ok(states.at(-1).downloadedBytes>0);
});
