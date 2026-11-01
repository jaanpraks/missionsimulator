const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Exercise the actual TypeScript modules without adding a test-runner dependency.
require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(result.outputText, filename);
};
const { createDefaultMission, parseMissionDefinition, validateMissionDefinition } = require('../src/mission/definition.ts');
const { compileScenario } = require('../src/sim/compiler.ts');
const { stationLook, polarPoint } = require('../src/sim/station.ts');
const { elementsFromTle, tleFromElements, tleChecksum, ascendingNodeLongitude } = require('../src/mission/orbit.ts');
const { payloadFrame, PAYLOAD_SIDES } = require('../src/mission/payload.ts');

test('RAAN field and Earth-fixed ascending node agree with propagated TLE geometry', () => {
  const satellite = require('satellite.js');
  const mission = createDefaultMission();
  const original = elementsFromTle(mission.orbit.line2);
  for (const raanDeg of [0,90,180,270,360]) {
    const tle = tleFromElements({...original,perigeeKm:500,apogeeKm:500,inclinationDeg:60,raanDeg,argumentOfPerigeeDeg:0,meanAnomalyDeg:0},mission.simulation.startIso,mission.orbit);
    assert.equal(elementsFromTle(tle.line2).raanDeg,raanDeg%360);
    const sat = satellite.twoline2satrec(tle.line1,tle.line2);
    const date = new Date(mission.simulation.startIso);
    const pv = satellite.propagate(sat,date);
    const geo = satellite.eciToGeodetic(pv.position,satellite.gstime(date));
    const expected = ascendingNodeLongitude(raanDeg,mission.simulation.startIso);
    const difference = ((geo.longitude*180/Math.PI-expected+540)%360)-180;
    assert.ok(Math.abs(difference)<.2);
    assert.ok(pv.velocity.z>0,'Ascending crossing must head north');
  }
});

test('payload side controls boresight and physical aperture on every body face', () => {
  const spacecraft = createDefaultMission().spacecraft;
  for(const side of PAYLOAD_SIDES) {
    spacecraft.payload.side = side;
    const frame = payloadFrame(side);
    assert.equal(Math.hypot(...frame.normal),1);
    assert.equal(dot(frame.normal,frame.up),0);
    const camera = satelliteGeometry(spacecraft).parts.find(p=>p.name===`Camera aperture (${side})`);
    assert.deepEqual(camera.axes[2],frame.normal);
    assert.ok(dot(camera.center,frame.normal)>0);
  }
  assert.deepEqual(payloadFrame().normal,[0,0,1]);
});

test('nadir attitude points every selectable payload face at Earth in state and CZML', async () => {
  const { Matrix3, Quaternion, Cartesian3 } = await import('cesium');
  const satellite = require('satellite.js');
  for (const side of PAYLOAD_SIDES) {
    const mission = createDefaultMission();
    mission.spacecraft.attitude = {strategy:'nadir-pointing'};
    mission.spacecraft.payload.side = side;
    const result = compileScenario(mission);
    const normal = payloadFrame(side).normal;
    const samples = result.czml.find(p=>p.id==='sat-1').orientation.unitQuaternion;
    for (const i of [0,100,result.states.length-1]) {
      const state = result.states[i];
      const axes = [state.bodyAxesTeme.x,state.bodyAxesTeme.y,state.bodyAxesTeme.z];
      const boresight = [0,1,2].map(k=>axes.reduce((sum,axis,j)=>sum+axis[k]*normal[j],0));
      const radial = state.positionTemeKm.map(v=>-v/Math.hypot(...state.positionTemeKm));
      assert.ok(dot(boresight,radial)>1-1e-12,side+' must point toward Earth');
      const q = new Quaternion(...samples.slice(i*5+1,i*5+5));
      const fixed = Matrix3.multiplyByVector(Matrix3.fromQuaternion(q),Cartesian3.fromArray(normal),new Cartesian3());
      const date = new Date(Date.parse(result.meta.startIso)+state.timeSec*1000);
      const expected = satellite.eciToEcf({x:radial[0],y:radial[1],z:radial[2]},satellite.gstime(date));
      assert.ok(Cartesian3.distance(fixed,new Cartesian3(expected.x,expected.y,expected.z))<1e-10);
    }
  }
});
const { attitudeAxes, sunInBody, panelPowerW, dot, axesQuaternion } = require('../src/sim/attitude.ts');
const { contactWindows } = require('../src/sim/contact.ts');
const { satelliteGeometry, satelliteGltf } = require('../src/mission/geometry.ts');
const { missionTiming, operationAt, validateOperationSchedule } = require('../src/sim/operations.ts');

test('mission schedule repeats modes and sums bus/payload loads with precise boundaries', () => {
  const mission=createDefaultMission();
  mission.spacecraft.power.baseLoadW=8;
  mission.spacecraft.payload.loadW=12;
  mission.missionPlan={defaultMode:'nominal',safeLoadW:2,repeatEachOrbit:true};
  mission.operations=[{startSec:10,endSec:30,mode:'imaging'},{startSec:30,endSec:40,mode:'safe'}];
  assert.equal(operationAt(mission,9,100).totalLoadW,8);
  assert.equal(operationAt(mission,10,100).totalLoadW,20);
  assert.equal(operationAt(mission,30,100).totalLoadW,2);
  assert.equal(operationAt(mission,40,100).mode,'nominal');
  assert.equal(operationAt(mission,110,100).payloadOn,true);
  assert.equal(operationAt(mission,130,100).mode,'safe');
  mission.missionPlan.repeatEachOrbit=false;
  assert.equal(operationAt(mission,110,100).payloadOn,false);
  const {periodSec,durationSec}=missionTiming(mission);
  validateOperationSchedule(mission,periodSec,durationSec);
  const run=compileScenario(mission);
  assert.equal(run.states.find(s=>s.timeSec===10).totalLoadW,20);
  assert.equal(run.states.find(s=>s.timeSec===30).mode,'safe');
  assert.equal(run.states.find(s=>s.timeSec===40).totalLoadW,8);
});

test('mission schedule rejects overlapping and out-of-window intervals', () => {
  const mission=createDefaultMission();
  mission.operations=[{startSec:0,endSec:20,mode:'imaging'},{startSec:10,endSec:30,mode:'safe'}];
  assert.throws(()=>validateOperationSchedule(mission,100,300),/overlap/);
  mission.operations=[{startSec:0,endSec:20+1e-12,mode:'imaging'},{startSec:20,endSec:30,mode:'safe'}];
  validateOperationSchedule(mission,100,300);
  mission.operations=[{startSec:10,endSec:110,mode:'imaging'}];
  assert.throws(()=>validateOperationSchedule(mission,100,300),/one orbit/);
  mission.missionPlan.repeatEachOrbit=false;
  validateOperationSchedule(mission,100,300);
  assert.throws(()=>validateOperationSchedule(mission,100,50),/simulation duration/);
});

test('legacy operations retain nominal idle behaviour and one-off scheduling', () => {
  const mission=createDefaultMission();
  delete mission.missionPlan;
  mission.operations=[{startSec:0,endSec:10,mode:'idle'}];
  assert.equal(operationAt(mission,0,100).mode,'nominal');
  const run=compileScenario(mission);
  assert.equal(run.mission.missionPlan.repeatEachOrbit,false);
  assert.equal(run.states[0].totalLoadW,mission.spacecraft.power.baseLoadW);
});
const { orbitalFrameAxes, ORBITAL_CAMERA_OFFSET } = require('../src/sim/orbitalFrame.ts');

test('orbital camera frame keeps a constant local pose while spacecraft attitude stays independent', async () => {
  const { Matrix3, Matrix4, Cartesian3 } = await import('cesium');
  const satellite = require('satellite.js');
  const result = compileScenario(createDefaultMission());
  let firstSunDirection;
  let changed = false;
  for (const i of [0, 1, 10, 100, 300, result.states.length - 1]) {
    const state = result.states[i];
    const date = new Date(Date.parse(result.meta.startIso) + state.timeSec * 1000);
    const gmst = satellite.gstime(date);
    const fixed = v => satellite.eciToEcf({x:v[0],y:v[1],z:v[2]},gmst);
    const pKm = fixed(state.positionTemeKm), inertialVelocity = fixed(state.velocityTemeKmSec);
    const p = [pKm.x*1000,pKm.y*1000,pKm.z*1000];
    const v = [inertialVelocity.x*1000 + 7.292115e-5*p[1], inertialVelocity.y*1000 - 7.292115e-5*p[0], inertialVelocity.z*1000];
    const axes = orbitalFrameAxes(p,v);
    const rotation = Matrix3.fromColumnMajorArray([...axes.x,...axes.y,...axes.z]);
    assert.ok(Math.abs(Matrix3.determinant(rotation)-1)<1e-10);
    const transform = Matrix4.fromRotationTranslation(rotation,Cartesian3.fromArray(p));
    const worldCamera = Matrix4.multiplyByPoint(transform,Cartesian3.fromArray(ORBITAL_CAMERA_OFFSET),new Cartesian3());
    assert.ok(Math.abs(Cartesian3.distance(worldCamera,Cartesian3.fromArray(p))-Math.hypot(...ORBITAL_CAMERA_OFFSET))<1e-6);
    const inverse = Matrix4.inverseTransformation(transform,new Matrix4());
    const localCamera = Matrix4.multiplyByPoint(inverse,worldCamera,new Cartesian3());
    assert.ok(Cartesian3.distance(localCamera,Cartesian3.fromArray(ORBITAL_CAMERA_OFFSET))<1e-6);
    assert.ok(Cartesian3.magnitude(Matrix4.multiplyByPoint(inverse,Cartesian3.fromArray(p),new Cartesian3()))<1e-6);
    const sun = fixed(state.bodyAxesTeme.x);
    const sunLocal = Matrix3.multiplyByVector(Matrix3.transpose(rotation,new Matrix3()),new Cartesian3(sun.x,sun.y,sun.z),new Cartesian3());
    if (!firstSunDirection) firstSunDirection = sunLocal;
    else if (Cartesian3.distance(firstSunDirection,sunLocal)>.1) changed=true;
  }
  assert.ok(changed, 'Sun-pointing attitude must rotate relative to the orbital camera frame');
});

test('CubeSat preview and glTF share size, panel geometry and self-contained buffers', () => {
  const spacecraft = createDefaultMission().spacecraft;
  assert.deepEqual(satelliteGeometry(spacecraft).size, [.1,.1,.3]);
  spacecraft.body.size = '6U';
  assert.deepEqual(satelliteGeometry(spacecraft).size, [.2,.1,.3]);
  const body = satelliteGeometry(spacecraft);
  spacecraft.power.solarPanels[0].mounting = 'deployable';
  const deployed = satelliteGeometry(spacecraft);
  const panel = deployed.parts.find(p => p.name === 'panel-1');
  assert.deepEqual(panel.axes[2], spacecraft.power.solarPanels[0].normalBody);
  assert.ok(deployed.extent > body.extent);
  const uri = satelliteGltf(spacecraft);
  const model = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8'));
  assert.equal(model.asset.version, '2.0');
  assert.equal(model.meshes[0].primitives.length, deployed.parts.length);
  const binary = Buffer.from(model.buffers[0].uri.split(',')[1], 'base64');
  assert.equal(binary.byteLength, model.buffers[0].byteLength);
  model.bufferViews.forEach(view => assert.ok(view.byteOffset + view.byteLength <= binary.byteLength));
  model.accessors.forEach(accessor => { assert.equal(accessor.count, 36); assert.ok(accessor.min.every((v,i) => v <= accessor.max[i])); });
  // Cesium maps glTF Y-up to Z-up; the root inverse rotation preserves body XYZ.
  assert.deepEqual(model.nodes[0].rotation, [-Math.SQRT1_2,0,0,Math.SQRT1_2]);
});

test('station contact windows interpolate mask crossings and partial intervals', () => {
  const looks = elevations => elevations.map(elevationDeg => elevationDeg === null ? null : ({ elevationDeg, azimuthDeg: 0, rangeKm: 1000 }));
  assert.deepEqual(contactWindows([0,10,20,30], looks([0,20,20,0]), 10), [{ startSec: 5, endSec: 25 }]);
  assert.deepEqual(contactWindows([0,10,25], looks([20,20,0]), 10), [{ startSec: 0, endSec: 17.5 }]);
  assert.deepEqual(contactWindows([0,10,25], looks([0,20,20]), 10), [{ startSec: 5, endSec: 25 }]);
  assert.deepEqual(contactWindows([0,10,20,30,40], looks([20,20,null,20,20]), 10), [{ startSec: 0, endSec: 10 }, { startSec: 30, endSec: 40 }]);
  assert.deepEqual(contactWindows([0,10], looks([-20,0]), 10), []);
  assert.deepEqual(contactWindows([], [], 10), []);
});

test('attitude frames are right-handed and align commanded body axes', () => {
  for (const strategy of ['sun-pointing', 'nadir-pointing']) {
    for (const sun of [[1, 0, 0], [0, 0, 1]]) {
      const axes = attitudeAxes(strategy, [7000, 0, 0], [0, 7.5, 0], sun);
      for (const axis of Object.values(axes)) assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-12);
      assert.ok(Math.abs(dot(axes.x, axes.y)) < 1e-12);
      assert.ok(Math.abs(dot(axes.x, axes.z)) < 1e-12);
      assert.ok(Math.abs(dot(axes.y, axes.z)) < 1e-12);
      const cross = [axes.x[1]*axes.y[2]-axes.x[2]*axes.y[1], axes.x[2]*axes.y[0]-axes.x[0]*axes.y[2], axes.x[0]*axes.y[1]-axes.x[1]*axes.y[0]];
      assert.ok(dot(cross, axes.z) > 0.999999);
      if (strategy === 'sun-pointing') assert.ok(Math.abs(sunInBody(axes, sun)[0] - 1) < 1e-12);
      else assert.ok(dot(axes.z, [-1, 0, 0]) > 0.999999);
      assert.ok(Math.abs(Math.hypot(...axesQuaternion(axes)) - 1) < 1e-12);
    }
  }
});

test('solar panels obey area, efficiency, cosine incidence and eclipse', () => {
  const maximum = 1361 * 0.03 * 0.28;
  assert.equal(panelPowerW(.03, .28, [1,0,0], [1,0,0], true), maximum);
  assert.equal(panelPowerW(.03, .28, [-1,0,0], [1,0,0], true), 0);
  assert.equal(panelPowerW(.03, .28, [0,1,0], [1,0,0], true), 0);
  assert.equal(panelPowerW(.03, .28, [1,0,0], [1,0,0], false), 0);
  assert.ok(Math.abs(panelPowerW(.06, .28, [1,0,0], [.5,Math.sqrt(.75),0], true) - maximum) < 1e-12);
});

test('recorded attitude, per-panel power, total power and CZML orientation agree', async () => {
  const mission = createDefaultMission();
  const panel = mission.spacecraft.power.solarPanels[0];
  mission.spacecraft.power.solarPanels.push({ ...panel, id: 'opposite', normalBody: [-1,0,0] });
  const result = compileScenario(mission);
  const telemetry = result.telemetry;
  assert.equal(result.states.length, telemetry.timeSec.length);
  assert.ok(telemetry.sunlight.some(v => !v));
  result.states.forEach((state, i) => {
    assert.equal(state.timeSec, telemetry.timeSec[i]);
    assert.equal(telemetry.solarPowerByPanelW.opposite[i], 0);
    assert.ok(Math.abs(telemetry.totalSolarPowerW[i] - (state.sunlit ? 1361 * panel.areaM2 * panel.efficiency : 0)) < 1e-10);
    assert.equal(telemetry.totalSolarPowerW[i], Object.values(telemetry.solarPowerByPanelW).reduce((sum, series) => sum + series[i], 0));
  });
  const { Quaternion, Matrix3, Cartesian3 } = await import('cesium');
  const samples = result.czml.find(p => p.id === 'sat-1').orientation.unitQuaternion;
  const first = samples.slice(1,5);
  const matrix = Matrix3.fromQuaternion(new Quaternion(...first));
  const actual = Matrix3.multiplyByVector(matrix, Cartesian3.UNIT_X, new Cartesian3());
  const expected = require('satellite.js').eciToEcf({x:result.states[0].bodyAxesTeme.x[0],y:result.states[0].bodyAxesTeme.x[1],z:result.states[0].bodyAxesTeme.x[2]}, require('satellite.js').gstime(new Date(mission.simulation.startIso)));
  assert.ok(Cartesian3.distance(actual, new Cartesian3(expected.x,expected.y,expected.z)) < 1e-10);
  mission.spacecraft.attitude = { strategy: 'nadir-pointing' };
  const nadir = compileScenario(mission);
  assert.ok(nadir.telemetry.totalSolarPowerW.some((w,i) => Math.abs(w - telemetry.totalSolarPowerW[i]) > 1));
  delete mission.spacecraft.attitude;
  assert.equal(compileScenario(mission).mission.spacecraft.attitude.strategy, 'sun-pointing');
});

test('mission JSON round trip and deterministic orbit replay', () => {
  const mission = createDefaultMission();
  const parsed = parseMissionDefinition(JSON.stringify(mission));
  assert.deepEqual(parsed, mission);
  const first = compileScenario(parsed);
  const second = compileScenario(parsed);
  assert.equal(first.meta.startIso, mission.simulation.startIso);
  assert.deepEqual(first.czml, second.czml);
  assert.deepEqual(first.telemetry, second.telemetry);
  parsed.spacecraft.power.solarPanels[0].areaM2 = 10;
  parsed.groundStations[0].lat = 0;
  assert.equal(first.mission.spacecraft.power.solarPanels[0].areaM2, 0.024);
  assert.equal(first.mission.groundStations[0].lat, 60.1699);
});

test('orbit counts and partial final steps cover the complete mission', () => {
  const mission = createDefaultMission();
  const one = compileScenario(mission);
  mission.simulation.duration.count = 3;
  const three = compileScenario(mission);
  assert.ok(Math.abs(three.meta.durationSec - 3 * one.meta.durationSec) <= 2);
  assert.equal(three.telemetry.timeSec.at(-1), three.meta.durationSec);
  mission.simulation.duration = { type: 'seconds', seconds: 25 };
  const short = compileScenario(mission);
  assert.deepEqual(short.telemetry.timeSec, [0, 10, 20, 25]);
  const samples = short.czml.find(entity => entity.id === 'sat-1').position.cartographicDegrees;
  assert.equal(samples.at(-4), 25);
});

test('invalid definitions report useful paths before propagation', () => {
  for (const [mutate, expected] of [
    [m => { m.schemaVersion = 2; }, /schemaVersion/],
    [m => { m.simulation.stepSec = NaN; }, /simulation.stepSec/],
    [m => { m.simulation.startIso = 'bad date'; }, /simulation.startIso/],
    [m => { m.simulation.duration.count = 0; }, /duration.count/],
    [m => { m.groundStations[0].lat = 100; }, /groundStations\[0\].lat/],
    [m => { m.groundStations[0].id = 'sat-1'; }, /unique/],
    [m => { m.spacecraft.power.solarPanels[0].normalBody = [0, 0, 0]; }, /unit vector/],
    [m => { m.operations = [{ startSec: 20, endSec: 10, mode: 'imaging' }]; }, /endSec/],
    [m => { m.orbit.line1 = ''; }, /orbit.line1/]
  ]) {
    const mission = createDefaultMission();
    mutate(mission);
    assert.throws(() => validateMissionDefinition(mission), expected);
  }
  assert.throws(() => parseMissionDefinition('{'), SyntaxError);
});

test('oversized sampling requests are rejected', () => {
  const mission = createDefaultMission();
  mission.simulation.duration = { type: 'seconds', seconds: 864000 };
  mission.simulation.stepSec = 1;
  assert.throws(() => compileScenario(mission), /100,000 samples/);
});

test('orbit sliders generate fixed-width, checksummed TLEs that propagate', () => {
  const satellite = require('satellite.js');
  const mission = createDefaultMission();
  const elements = { perigeeKm: 400, apogeeKm: 1200, inclinationDeg: 97.5, raanDeg: 42, argumentOfPerigeeDeg: 15, meanAnomalyDeg: 80 };
  const tle = tleFromElements(elements, '2024-02-29T12:00:00.000Z', mission.orbit);
  assert.equal(tle.line1.length, 69);
  assert.equal(tle.line2.length, 69);
  assert.equal(tleChecksum(tle.line1), tle.line1);
  assert.equal(tleChecksum(tle.line2), tle.line2);
  assert.equal(tle.line1.slice(18, 32), '24060.50000000');
  const decoded = elementsFromTle(tle.line2);
  assert.ok(Math.abs(decoded.perigeeKm - 400) < 0.01);
  assert.ok(Math.abs(decoded.apogeeKm - 1200) < 0.01);
  assert.equal(decoded.inclinationDeg, 97.5);
  assert.equal(decoded.raanDeg, 42);
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const pv = satellite.propagate(satrec, new Date('2024-02-29T12:00:00Z'));
  assert.ok(pv?.position && Number.isFinite(pv.position.x));
  mission.orbit = tle;
  mission.simulation.startIso = '2024-02-29T12:00:00Z';
  assert.ok(compileScenario(mission).telemetry.timeSec.length > 100);
});

test('circular, polar and retrograde educational orbit settings round-trip', () => {
  const mission = createDefaultMission();
  const original = elementsFromTle(mission.orbit.line2);
  for (const inclinationDeg of [0, 90, 180]) {
    const tle = tleFromElements({ ...original, perigeeKm: 500, apogeeKm: 500, inclinationDeg }, mission.simulation.startIso, mission.orbit);
    const result = elementsFromTle(tle.line2);
    assert.ok(Math.abs(result.apogeeKm - result.perigeeKm) < 1e-8);
    assert.equal(result.inclinationDeg, inclinationDeg);
  }
  assert.throws(() => tleFromElements({ ...original, perigeeKm: 100 }, mission.simulation.startIso, mission.orbit), /150 km/);
});

test('antenna coordinates use north-clockwise azimuth and zenith at the polar centre', () => {
  const station = { id: 'test', name: 'Equator', lat: 0, lng: 0, maskDeg: 10 };
  const overhead = stationLook(station, { x: 6878.137, y: 0, z: 0 }, 0);
  assert.ok(Math.abs(overhead.elevationDeg - 90) < 1e-8);
  assert.ok(Math.abs(overhead.rangeKm - 500) < 0.001);
  const east = stationLook(station, { x: 6378.137, y: 500, z: 0 }, 0);
  assert.ok(Math.abs(east.azimuthDeg - 90) < 1e-8);
  assert.ok(Math.abs(east.elevationDeg) < 1e-8);
  assert.deepEqual(polarPoint(0, 0), { x: 0, y: -1 });
  assert.ok(Math.abs(polarPoint(90, 0).x - 1) < 1e-12);
  assert.ok(Math.hypot(...Object.values(polarPoint(123, 90))) < 1e-12);
});

test('station look angles and access stay aligned with every telemetry sample', () => {
  const mission = createDefaultMission();
  mission.simulation.duration = { type: 'orbits', count: 16 };
  const result = compileScenario(mission);
  const looks = result.telemetry.lookAnglesByStation['GS-1'];
  const access = result.telemetry.accessByStation['GS-1'];
  assert.equal(looks.length, result.telemetry.timeSec.length);
  assert.ok(looks.some(look => look && look.elevationDeg > 0));
  looks.forEach((look, i) => assert.equal(access[i], !!look && look.elevationDeg >= 10));
});

test('Cesium ground track follows the satellite surface projection and rewinds', async () => {
  // CZML's type dispatch references browser image classes even for numeric values.
  global.Image ??= class Image {};
  global.HTMLCanvasElement ??= class HTMLCanvasElement {};
  const { CzmlDataSource, JulianDate, Cartographic, Color, Cartesian3 } = await import('cesium');
  const mission = createDefaultMission();
  const result = compileScenario(mission);
  // Avoid loading a remote model in this data-source integration test.
  const packets = structuredClone(result.czml);
  delete packets.find(p => p.id === 'sat-1').model;
  const ds = await CzmlDataSource.load(packets);
  const ground = ds.entities.getById('ground-track');
  const future = ds.entities.getById('ground-track-future');
  const sat = ds.entities.getById('sat-1');
  const line = ds.entities.getById('nadir-line');
  const start = JulianDate.fromIso8601(result.meta.startIso);
  for (const seconds of [0, 1200, 300, result.meta.durationSec]) {
    const time = JulianDate.addSeconds(start, seconds, new JulianDate());
    const projected = Cartographic.fromCartesian(ground.position.getValue(time));
    const spacecraft = Cartographic.fromCartesian(sat.position.getValue(time));
    assert.ok(Math.abs(projected.height - 500) < 0.01);
    assert.ok(Math.abs(projected.latitude - spacecraft.latitude) < 1e-10);
    assert.ok(Math.abs(projected.longitude - spacecraft.longitude) < 1e-10);
    assert.deepEqual(future.position.getValue(time), ground.position.getValue(time));
    assert.equal(line.polyline.positions.getValue(time).length, 2);
    assert.equal(ground.path.leadTime.getValue(time), 0);
    assert.equal(future.path.trailTime.getValue(time), 0);
    assert.ok(Math.abs(future.path.leadTime.getValue(time) / ground.path.trailTime.getValue(time) - 2/3) < 1e-12);
    assert.ok(ground.path.trailTime.getValue(time) > 5000);
    assert.ok(ground.path.material.color.getValue(time) instanceof Color);
  }
  // Smooth direction through a position-sample boundary (the old chase-view jerk).
  const position = seconds => sat.position.getValue(JulianDate.addSeconds(start, seconds, new JulianDate()));
  const before = Cartesian3.subtract(position(10), position(9.99), new Cartesian3());
  const after = Cartesian3.subtract(position(10.01), position(10), new Cartesian3());
  assert.ok(Cartesian3.angleBetween(before, after) < 0.001);
});

test('yellow orbit is a closed inertial ellipse, independent of historical Earth rotation', async () => {
  const {orbitEllipse,inertialStateAt}=require('../src/sim/orbitCurve.ts');
  const {Cartesian3,Matrix3,Transforms,JulianDate}=await import('cesium');
  const mu=398600.4418;
  const circular=orbitEllipse([7000,0,0],[0,Math.sqrt(mu/7000),0]);
  assert.deepEqual(circular[0],circular.at(-1));
  circular.forEach(point=>assert.ok(Math.abs(Math.hypot(...point)-7000)<1e-8));
  const eccentric=orbitEllipse([7000,0,0],[0,8,0]);
  const a=1/(2/7000-64/mu),e=64*7000/mu-1,b=a*Math.sqrt(1-e*e);
  eccentric.forEach(([x,y,z])=>{
    assert.ok(Math.abs((x+a*e)**2/a**2+y*y/b**2-1)<1e-10);
    assert.ok(Math.abs(z)<1e-12);
  });
  const mission=createDefaultMission();mission.simulation.duration={type:'orbits',count:3};
  const run=compileScenario(mission);
  assert.equal(run.czml.find(p=>p.id==='sat-1').path,undefined);
  for(const seconds of [0,123.5,6000,run.meta.durationSec,200]){
    const state=inertialStateAt(run.states,seconds),curve=orbitEllipse(state.position,state.velocity);
    assert.deepEqual(curve[0],curve.at(-1));
    const h=Cartesian3.cross(Cartesian3.fromArray(state.position),Cartesian3.fromArray(state.velocity),new Cartesian3());
    Cartesian3.normalize(h,h);
    const t=JulianDate.addSeconds(JulianDate.fromIso8601(run.meta.startIso),seconds,new JulianDate());
    const rotation=Transforms.computeTemeToPseudoFixedMatrix(t),inverse=Matrix3.transpose(rotation,new Matrix3());
    const fixed=curve.map(p=>Matrix3.multiplyByVector(rotation,Cartesian3.fromArray(p),new Cartesian3()));
    assert.deepEqual(fixed[0],fixed.at(-1));
    fixed.forEach((p,i)=>{
      const inertial=Matrix3.multiplyByVector(inverse,p,new Cartesian3());
      assert.ok(Cartesian3.distance(inertial,Cartesian3.fromArray(curve[i]))<1e-8);
      assert.ok(Math.abs(Cartesian3.dot(inertial,h))<1e-8);
    });
    const r=Math.hypot(...state.position),v2=state.velocity.reduce((s,v)=>s+v*v,0);
    const semimajor=1/(2/r-v2/mu);
    const angular=Cartesian3.magnitude(Cartesian3.cross(Cartesian3.fromArray(state.position),Cartesian3.fromArray(state.velocity),new Cartesian3()));
    const ecc=Math.sqrt(Math.max(0,1-angular*angular/(mu*semimajor)));
    const closest=curve[0];
    assert.ok(Math.abs(Math.hypot(...closest)-semimajor*(1-ecc))<1e-7);
  }
});
