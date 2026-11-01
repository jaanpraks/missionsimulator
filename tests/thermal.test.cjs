const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {createDefaultMission,validateMissionDefinition}=require('../src/mission/definition.ts');
const {thermalStep,thermalEnvironment,STEFAN_BOLTZMANN}=require('../src/sim/thermal.ts');
const {fitSolarPanels,panelAreaLimit}=require('../src/mission/physical.ts');
const {compileScenario}=require('../src/sim/compiler.ts');

test('thermal integration conserves heat without radiation and approaches radiation equilibrium',()=>{
  assert.ok(Math.abs(thermalStep(300,10,0,1000,100)-301)<1e-10);
  assert.ok(thermalStep(300,0,.1,1000,100)<300);
  assert.ok(thermalStep(300,10,0,2000,100)<thermalStep(300,10,0,1000,100));
  const equilibrium=(100/(STEFAN_BOLTZMANN*.1)+3**4)**.25;
  assert.ok(Math.abs(thermalStep(equilibrium,100,.1,1000,500)-equilibrium)<1e-9);
  assert.ok(Math.abs(thermalStep(300,100,.1,1000,200)-thermalStep(thermalStep(300,100,.1,1000,100),100,.1,1000,100))<1e-8);
});

test('thermal surface balance follows absorptivity, eclipse, Earth view and solar conversion',()=>{
  const mission=createDefaultMission();
  const state={positionTemeKm:[6800,0,0],sunDirectionBody:[1,0,0],bodyAxesTeme:{x:[1,0,0],y:[0,1,0],z:[0,0,1]},sunlit:true};
  const a=thermalEnvironment(mission,state,0),b=thermalEnvironment(mission,state,5);
  assert.ok(Math.abs(a.solarHeatW-b.solarHeatW-5)<1e-10);
  assert.ok(a.earthInfraredHeatW>0);
  assert.equal(thermalEnvironment(mission,{...state,sunlit:false},0).solarHeatW,0);
  mission.spacecraft.thermal.absorptivity=1;
  assert.ok(thermalEnvironment(mission,state,0).solarHeatW>a.solarHeatW);
});

test('80% panel limits apply to every size, shared body faces and deployable leaves',()=>{
  for(const size of ['1U','2U','3U','6U'])for(const normal of [[1,0,0],[0,-1,0],[0,0,1]]){
    const mission=createDefaultMission();mission.spacecraft.body.size=size;
    const panel=mission.spacecraft.power.solarPanels[0];panel.normalBody=normal;panel.areaM2=panelAreaLimit(size,normal);
    validateMissionDefinition(mission);
    panel.areaM2+=.001;assert.throws(()=>validateMissionDefinition(mission),/80%/);
    panel.mounting='deployable';assert.throws(()=>validateMissionDefinition(mission),/80%/);
    fitSolarPanels(mission.spacecraft);validateMissionDefinition(mission);
  }
  const mission=createDefaultMission();
  mission.spacecraft.power.solarPanels.push({...mission.spacecraft.power.solarPanels[0],id:'extra',areaM2:.001});
  assert.throws(()=>validateMissionDefinition(mission),/80%/);
  fitSolarPanels(mission.spacecraft);validateMissionDefinition(mission);
  assert.equal(mission.spacecraft.power.solarPanels[1].areaM2,0);
});

test('compiled thermal states are deterministic, start at configured temperature and reject invalid inputs',()=>{
  const mission=createDefaultMission();mission.simulation.duration={type:'seconds',seconds:300};
  const a=compileScenario(mission),b=compileScenario(mission);
  assert.equal(a.states[0].temperatureC,20);
  assert.deepEqual(a.states,b.states);
  assert.ok(a.states.every(s=>Number.isFinite(s.temperatureC)&&s.temperatureC>-273.15));
  assert.notEqual(a.states.at(-1).temperatureC,20);
  delete mission.spacecraft.thermal;
  assert.equal(compileScenario(mission).mission.spacecraft.thermal.massKg,4);
  mission.spacecraft.thermal={...a.mission.spacecraft.thermal,massKg:0};
  assert.throws(()=>validateMissionDefinition(mission),/massKg/);
});
