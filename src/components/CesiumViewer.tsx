import React, { useEffect, useRef, useState } from 'react';
import * as C from 'cesium';
import type { CompiledScenario, SimViewId } from '../types';

import { Button } from './ui';
import { satelliteGltf, satelliteGeometry } from '../mission/geometry';
import { payloadFrame } from '../mission/payload';
import { createOrbitDisplay } from '../sim/orbitCurve';
import { stationLook } from '../sim/station';
import { orbitalFrameAxes, ORBITAL_CAMERA_OFFSET, SATELLITE_DISPLAY_RADIUS_M } from '../sim/orbitalFrame';

type Props = {
  active: boolean;
  scenario: CompiledScenario | null;
  simView: SimViewId;
  stationIndex?: number;
  onTimeSec?: (tSec: number) => void;
};

function addMagneticField(viewer: C.Viewer) {
  const field = viewer.entities.add({ name: 'Schematic Earth magnetic field', show: false });
  const earthRadius = C.Ellipsoid.WGS84.maximumRadius;
  const tilt = C.Matrix3.fromRotationY(C.Math.toRadians(10));
  const material = C.Color.fromCssColorString('#c4a5ff').withAlpha(0.5);
  const segments = 128;
  const shells = [
    { equatorRadii: 1.35, meridians: 6 },
    { equatorRadii: 1.8, meridians: 6 },
    { equatorRadii: 3.4, meridians: 4 },
    { equatorRadii: 8, meridians: 4 }
  ];

  for (const { equatorRadii, meridians } of shells) {
    const equatorRadius = equatorRadii * earthRadius;
    // For r = L cos²(latitude), larger L brings the feet closer to the poles
    // and makes the line steeper at the surface. Let the globe clip the ends.
    const footpointLatitude = Math.acos(Math.sqrt(C.Ellipsoid.WGS84.minimumRadius / equatorRadius));
    for (let meridian = 0; meridian < meridians; meridian++) {
      const longitude = meridian * C.Math.TWO_PI / meridians;
      const positions = Array.from({ length: segments + 1 }, (_, index) => {
        const latitude = footpointLatitude * (2 * index / segments - 1);
        const cosLatitude = Math.cos(latitude);
        const radius = equatorRadius * cosLatitude ** 2;
        const position = new C.Cartesian3(
          radius * cosLatitude * Math.cos(longitude),
          radius * cosLatitude * Math.sin(longitude),
          radius * Math.sin(latitude)
        );
        return C.Matrix3.multiplyByVector(tilt, position, position);
      });
      viewer.entities.add({
        parent: field,
        name: field.name,
        polyline: { positions, width: 1.5, arcType: C.ArcType.NONE, material }
      });
    }
  }
  return field;
}

export default function CesiumViewer({ scenario, simView, stationIndex = 0, onTimeSec, active }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<C.Viewer | null>(null);
  const magneticFieldRef = useRef<C.Entity | null>(null);
  const [source, setSource] = useState<C.CzmlDataSource | null>(null);
  const [playing, setPlaying] = useState(false);
  const [timeSec, setTimeSec] = useState(0);
  const [speed, setSpeed] = useState(60);
  const [projection, setProjection] = useState<'3d' | '2d'>('3d');
  const [showMagneticField, setShowMagneticField] = useState(false);
  const [operatorTracking, setOperatorTracking] = useState(true);
  const [operatorHeading, setOperatorHeading] = useState(0);
  const [ground, setGround] = useState(true);
  const [orbit, setOrbit] = useState(true);
  const reportTime = useRef(onTimeSec);
  reportTime.current = onTimeSec;

  useEffect(() => {
    if (!container.current) return;
    const viewer = new C.Viewer(container.current, {
      animation: false, timeline: false, baseLayerPicker: false,
      automaticallyTrackDataSourceClocks: false,
      baseLayer: C.ImageryLayer.fromProviderAsync(C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl('Assets/Textures/NaturalEarthII'))),
      terrainProvider: new C.EllipsoidTerrainProvider(),
      geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, fullscreenButton: true,
      selectionIndicator: true, infoBox: false, shouldAnimate: false
    });
    viewer.scene.globe.enableLighting = true;
    viewerRef.current = viewer;
    return () => {
      viewerRef.current = null;
      magneticFieldRef.current = null;
      viewer.destroy();
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const visible = active && !!source && simView === 'global' && projection === '3d' && showMagneticField;
    if (visible && !magneticFieldRef.current) magneticFieldRef.current = addMagneticField(viewer);
    if (magneticFieldRef.current) magneticFieldRef.current.show = visible;
  }, [active, source, simView, projection, showMagneticField]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let cancelled = false;
    let removeTick: (() => void) | undefined;
    setSource(null);
    setPlaying(false);
    setTimeSec(0);
    reportTime.current?.(0);
    viewer.clock.shouldAnimate = false;
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    viewer.dataSources.removeAll(true);
    if (!scenario) return;
    void C.CzmlDataSource.load(scenario.czml).then(async ds => {
      if (cancelled || viewer.isDestroyed()) return;
      const satellite = ds.entities.getById('sat-1');
      const orbitDisplay=createOrbitDisplay(scenario);
      if(satellite) satellite.position=orbitDisplay.position;
      if (satellite) {
        const extent = satelliteGeometry(scenario.mission.spacecraft).extent;
        // Choose one illustrative size per run; never depend on the moving camera.
        const displayScale = SATELLITE_DISPLAY_RADIUS_M / extent;
        satellite.model = new C.ModelGraphics({
          uri: satelliteGltf(scenario.mission.spacecraft),
          scale: displayScale,
          show: false
        });
        for (const [i, axis] of ['X', 'Y', 'Z'].entries()) {
          const end = (time: C.JulianDate) => {
            const position = satellite.position?.getValue(time), q = satellite.orientation?.getValue(time);
            if (!position || !q) return undefined;
            const direction = C.Matrix3.getColumn(C.Matrix3.fromQuaternion(q), i, new C.Cartesian3());
            return C.Cartesian3.add(position, C.Cartesian3.multiplyByScalar(direction, (extent + .035) * displayScale, direction), new C.Cartesian3());
          };
          const color = [C.Color.fromCssColorString('#ff5555'), C.Color.fromCssColorString('#55dd77'), C.Color.fromCssColorString('#44ddee')][i];
          const target = (axis === 'X' && scenario.mission.spacecraft.attitude?.strategy === 'sun-pointing') ? ' / Sun' : ('+' + axis) === (scenario.mission.spacecraft.payload.side ?? '+Z') && scenario.mission.spacecraft.attitude?.strategy === 'nadir-pointing' ? ' / Earth' : '';
          ds.entities.add({
            id: 'sat-body-axis-' + axis,
            show: false,
            position: new C.CallbackPositionProperty(time => end(time ?? viewer.clock.currentTime), false),
            label: { text: '+' + axis + target, font: '12px sans-serif', fillColor: color, showBackground: true, backgroundColor: C.Color.BLACK.withAlpha(.65), pixelOffset: new C.Cartesian2(8, -8) },
            polyline: {
              positions: new C.CallbackProperty(time => {
                const t = time ?? viewer.clock.currentTime, p = satellite.position?.getValue(t), tip = end(t);
                return p && tip ? [p, tip] : [];
              }, false),
              width: 3, arcType: C.ArcType.NONE, material: new C.PolylineArrowMaterialProperty(color)
            }
          });
        }
      }
      ds.entities.add({
        id: 'inertial-orbit', name: 'Satellite-anchored inertial orbit',
        polyline: {
          positions: new C.CallbackProperty(time => orbitDisplay.curve(time ?? viewer.clock.currentTime),false),
          arcType:C.ArcType.NONE, width:2,
          material:C.Color.fromCssColorString('#ffcf5c').withAlpha(.82)
        }
      });
      for (const station of scenario.mission.groundStations) {
        const base = C.Cartesian3.fromDegrees(station.lng, station.lat, station.altMeters ?? 0);
        ds.entities.add({
          id: C.createGuid(), name: station.name + ' active ground link',
          polyline: {
            positions: new C.CallbackProperty(time => {
              const p = satellite?.position?.getValue(time ?? viewer.clock.currentTime);
              return p ? [base,p] : [];
            }, false),
            show: new C.CallbackProperty(time => {
              const p = satellite?.position?.getValue(time ?? viewer.clock.currentTime);
              return !!p && stationLook(station,{x:p.x/1000,y:p.y/1000,z:p.z/1000},0).elevationDeg >= station.maskDeg;
            },false),
            width: 3, arcType: C.ArcType.NONE,
            material: new C.ColorMaterialProperty(C.Color.fromCssColorString('#318bff'))
          }
        });
      }
      for (const [index, station] of scenario.mission.groundStations.entries()) {
        const base = C.Cartesian3.fromDegrees(station.lng,station.lat,station.altMeters ?? 0);
        const enu = C.Transforms.eastNorthUpToFixedFrame(base);
        const radius = Math.max(1500, ((station.altMeters ?? 0)+10)*6);
        const start = C.Cartesian3.fromDegrees(station.lng,station.lat,2);
        for (const [label, east, north] of [['N',0,1],['E',1,0],['S',0,-1],['W',-1,0]] as const) {
          const tip = C.Matrix4.multiplyByPoint(enu,new C.Cartesian3(east*radius,north*radius,0),new C.Cartesian3());
          const geo = C.Cartographic.fromCartesian(tip);
          const end = C.Cartesian3.fromRadians(geo.longitude,geo.latitude,2);
          const color = label === 'N' ? C.Color.fromCssColorString('#44ebd3') : C.Color.fromCssColorString('#d2ddec');
          ds.entities.add({
            id:C.createGuid(), name:station.name + ' compass ' + label, show:false,
            properties:{operatorCompassStation:index}, position:end,
            label:{text:label,font:'bold 22px sans-serif',fillColor:color,showBackground:true,backgroundColor:C.Color.BLACK.withAlpha(.7),pixelOffset:new C.Cartesian2(0,-12),distanceDisplayCondition:new C.DistanceDisplayCondition(0,1000000)},
            polyline:{positions:[start,end],width:4,clampToGround:true,material:new C.PolylineArrowMaterialProperty(color.withAlpha(.7))}
          });
        }
      }
      await viewer.dataSources.add(ds);
      if (cancelled || viewer.isDestroyed()) return;
      const start = C.JulianDate.fromIso8601(scenario.meta.startIso);
      viewer.clock.startTime = start.clone();
      viewer.clock.stopTime = C.JulianDate.fromIso8601(scenario.meta.endIso);
      viewer.clock.currentTime = start.clone();
      viewer.clock.clockRange = C.ClockRange.CLAMPED;
      viewer.clock.shouldAnimate = false;
      viewer.timeline?.zoomTo(viewer.clock.startTime, viewer.clock.stopTime);
      setSource(ds);
      let lastReport = -Infinity;
      removeTick = viewer.clock.onTick.addEventListener(() => {
        if (C.JulianDate.greaterThanOrEquals(viewer.clock.currentTime, viewer.clock.stopTime)) viewer.clock.shouldAnimate = false;
        const now = performance.now();
        if (now - lastReport < 100 && viewer.clock.shouldAnimate) return;
        lastReport = now;
        const seconds = Math.max(0, C.JulianDate.secondsDifference(viewer.clock.currentTime, start));
        setTimeSec(seconds);
        setPlaying(viewer.clock.shouldAnimate);
        setOperatorHeading((C.Math.toDegrees(viewer.camera.heading)+360)%360);
        reportTime.current?.(seconds);
      });
    }).catch(error => { if (!cancelled) console.error('Unable to load mission visualization', error); });
    return () => { cancelled = true; removeTick?.(); };
  }, [scenario]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer) viewer.clock.multiplier = speed;
  }, [speed, source]);

  useEffect(() => {
    if (!source) return;
    for (const id of ['ground-track', 'ground-track-future', 'nadir-line']) {
      const entity = source.entities.getById(id);
      if (entity) entity.show = ground;
    }
    const ellipse = source.entities.getById('inertial-orbit');
    if (ellipse) ellipse.show = orbit;
  }, [source, ground, orbit]);

  useEffect(() => {
    const sat = source?.entities.getById('sat-1');
    if (!sat) return;
    const close = simView === 'orbital' || simView === 'satInertial';
    if (sat.model) sat.model.show = new C.ConstantProperty(close);
    if (sat.point) sat.point.show = new C.ConstantProperty(!close && simView !== 'payload');
    for (const entity of source?.entities.values ?? []) {
      const index = entity.properties?.operatorCompassStation?.getValue();
      if (index !== undefined) entity.show = simView === 'operator' && index === stationIndex;
    }
    for (const axis of ['X','Y','Z']) {
      const entity = source?.entities.getById('sat-body-axis-' + axis);
      if (entity) entity.show = close;
    }
  }, [source, simView, stationIndex]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !source || !scenario) return;
    const camera = viewer.camera;
    camera.lookAtTransform(C.Matrix4.IDENTITY);
    viewer.trackedEntity = undefined;
    const mode = simView === 'global' ? projection : '3d';
    if (mode === '2d') viewer.scene.morphTo2D(0);
    else viewer.scene.morphTo3D(0);
    viewer.scene.screenSpaceCameraController.enableInputs = simView === 'global';
    if (camera.frustum instanceof C.PerspectiveFrustum) camera.frustum.fov = C.Math.toRadians(simView === 'payload' ? 35 : 60);
    const sat = source.entities.getById('sat-1');
    if (!sat?.position) return;
    const getPosition = (t: C.JulianDate) => sat.position!.getValue(t);
    const velocity = (t: C.JulianDate) => {
      const before = C.JulianDate.addSeconds(t, -1, new C.JulianDate());
      const after = C.JulianDate.addSeconds(t, 1, new C.JulianDate());
      if (C.JulianDate.lessThan(before, viewer.clock.startTime)) viewer.clock.startTime.clone(before);
      if (C.JulianDate.greaterThan(after, viewer.clock.stopTime)) viewer.clock.stopTime.clone(after);
      const a = getPosition(before), b = getPosition(after);
      if (!a || !b) return undefined;
      const dt = C.JulianDate.secondsDifference(after, before);
      return dt > 0 ? C.Cartesian3.divideByScalar(C.Cartesian3.subtract(b, a, new C.Cartesian3()), dt, new C.Cartesian3()) : undefined;
    };
    const aim = (position: C.Cartesian3, direction: C.Cartesian3, upHint: C.Cartesian3) => {
      const right = C.Cartesian3.cross(direction, upHint, new C.Cartesian3());
      if (C.Cartesian3.magnitudeSquared(right) < 1e-12) return;
      C.Cartesian3.normalize(right, right);
      const up = C.Cartesian3.cross(right, direction, new C.Cartesian3());
      camera.setView({ destination: position, orientation: { direction, up } });
    };
    const rotation = new C.Matrix3();
    const transform = new C.Matrix4();
    let attached = false;
    if (simView === 'global') {
      camera.setView({ destination: mode === '3d'
        ? C.Cartesian3.fromDegrees(20, 25, 20000000)
        : C.Rectangle.fromDegrees(-180, -90, 180, 90) });
    }
    const update = () => {
      const t = viewer.clock.currentTime;
      if (simView === 'global') {
        if (mode !== '3d') return; // Maps are intentionally Earth-fixed.
        C.Transforms.computeTemeToPseudoFixedMatrix(t, rotation);
        C.Matrix4.fromRotationTranslation(rotation, C.Cartesian3.ZERO, transform);
        const p = camera.position.clone(), d = camera.direction.clone(), u = camera.up.clone();
        camera.lookAtTransform(transform);
        if (attached) {
          p.clone(camera.position); d.clone(camera.direction); u.clone(camera.up);
          C.Cartesian3.cross(d, u, camera.right);
        }
        attached = true;
        return;
      }
      const p = getPosition(t);
      if (!p) return;
      const radial = C.Cartesian3.normalize(p, new C.Cartesian3());
      if (simView === 'satInertial') {
        C.Transforms.computeTemeToPseudoFixedMatrix(t, rotation);
        C.Matrix4.fromRotationTranslation(rotation, p, transform);
        // Offset and orientation remain in the star frame at the moving satellite.
        camera.lookAtTransform(transform, new C.Cartesian3(0, -12000, 5000));
        return;
      }
      if (simView === 'operator') {
        const station = scenario.mission.groundStations[stationIndex];
        if (!station) return;
        const base = C.Cartesian3.fromDegrees(station.lng, station.lat, station.altMeters ?? 0);
        const enu = C.Transforms.eastNorthUpToFixedFrame(base);
        const up = C.Matrix4.multiplyByPointAsVector(enu, C.Cartesian3.UNIT_Z, new C.Cartesian3());
        const north = C.Matrix4.multiplyByPointAsVector(enu, C.Cartesian3.UNIT_Y, new C.Cartesian3());
        const position = C.Cartesian3.add(base, C.Cartesian3.multiplyByScalar(up, 10, new C.Cartesian3()), new C.Cartesian3());
        const los = C.Cartesian3.normalize(C.Cartesian3.subtract(p, position, new C.Cartesian3()), new C.Cartesian3());
        // Pan/tilt from the fixed station position only during an available pass.
        // Use the same geodetic mask test as the antenna plot and contact lines.
        const visible = stationLook(station, {x:p.x/1000,y:p.y/1000,z:p.z/1000}, 0).elevationDeg >= station.maskDeg;
        const direction = operatorTracking && visible ? los : north;
        aim(position, direction, Math.abs(C.Cartesian3.dot(direction, up)) > 0.995 ? north : up);
        return;
      }
      if (simView === 'orbital') {
        const v = velocity(t);
        if (!v) return;
        const axes = orbitalFrameAxes([p.x,p.y,p.z], [v.x,v.y,v.z]);
        C.Matrix3.fromColumnMajorArray([...axes.x,...axes.y,...axes.z], rotation);
        C.Matrix4.fromRotationTranslation(rotation, p, transform);
        // Fixed local camera pose; body orientation remains independently sampled.
        camera.lookAtTransform(transform, C.Cartesian3.fromArray(ORBITAL_CAMERA_OFFSET));
      } else if (simView === 'payload') {
        const q = sat.orientation?.getValue(t);
        if (!q) return;
        const rotation = C.Matrix3.fromQuaternion(q);
        const face = payloadFrame(scenario.mission.spacecraft.payload.side);
        const bodyX = C.Matrix3.multiplyByVector(rotation, C.Cartesian3.fromArray(face.up), new C.Cartesian3());
        const bodyZ = C.Matrix3.multiplyByVector(rotation, C.Cartesian3.fromArray(face.normal), new C.Cartesian3());
        // Exactly the recorded payload boresight, without a display-only offset.
        aim(p, bodyZ, bodyX);
      }
    };
    update();
    // Set the frame before scene/camera/primitive updates all evaluate this time.
    const remove = viewer.scene.preUpdate.addEventListener(update);
    return () => {
      remove();
      if (!viewer.isDestroyed()) {
        camera.lookAtTransform(C.Matrix4.IDENTITY);
        viewer.scene.screenSpaceCameraController.enableInputs = true;
      }
    };
  }, [source, scenario, simView, projection, stationIndex, operatorTracking]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!active) {
      viewer.clock.shouldAnimate = false;
      setPlaying(false);
      viewer.useDefaultRenderLoop = false;
    } else {
      viewer.useDefaultRenderLoop = true;
      viewer.resize();
      viewer.scene.requestRender();
    }
  }, [active]);

  const seek = (seconds: number) => {
    const viewer = viewerRef.current;
    if (!viewer || !source) return;
    viewer.clock.currentTime = C.JulianDate.addSeconds(viewer.clock.startTime, seconds, new C.JulianDate());
    setTimeSec(seconds); reportTime.current?.(seconds);
  };
  const start = () => {
    const viewer = viewerRef.current;
    if (!viewer || !source) return;
    if (C.JulianDate.greaterThanOrEquals(viewer.clock.currentTime, viewer.clock.stopTime)) seek(0);
    viewer.clock.shouldAnimate = true; setPlaying(true);
  };
  const stop = () => { if (viewerRef.current) viewerRef.current.clock.shouldAnimate = false; setPlaying(false); };
  const formatTime = (seconds: number) => {
    const whole = Math.max(0, Math.floor(seconds));
    return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map(v => String(v).padStart(2, '0')).join(':');
  };
  return <div>


    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 12, marginBottom: 10 }}>
      <label style={{ color: '#44ebd3' }}><input type="checkbox" checked={ground} onChange={e => setGround(e.target.checked)} /> Ground track</label>
      <label style={{ color: '#ffcf5c' }}><input type="checkbox" checked={orbit} onChange={e => setOrbit(e.target.checked)} /> Orbit at altitude</label>
      {simView === 'operator' && <><label><input type="checkbox" aria-label="Track satellite from station" checked={operatorTracking} onChange={e=>setOperatorTracking(e.target.checked)} /> Track satellite</label><span className="operator-bearing">Looking {Math.round(operatorHeading)%360} deg | {operatorTracking ? 'Fixed station: tracking above antenna mask; otherwise North' : 'North horizon'}</span></>}
      {simView === 'global' && <>
        {projection === '3d' && <label style={{ color: '#c4a5ff' }} title="Schematic Earth magnetic field. Zoom out to see the outer arcs.">
          <input type="checkbox" checked={showMagneticField} onChange={e => setShowMagneticField(e.target.checked)} /> Magnetic field lines
        </label>}
        <label>Projection <select aria-label="Global projection" value={projection} onChange={e => setProjection(e.target.value === '2d' ? '2d' : '3d')}>
          <option value="3d">3D (star-fixed)</option>
          <option value="2d">2D map (Earth-fixed)</option>
        </select></label>
      </>}
      {simView === 'payload' && <span>Payload face: {scenario?.mission.spacecraft.payload.side ?? '+Z'} | Field of view: 35 deg | Recorded attitude</span>}
    </div>
    <div ref={container} style={{ width: '100%', height: 'min(62vh, 580px)', minHeight: 330, borderRadius: 10, overflow: 'hidden', border: '1px solid #1f2937' }} />
    <div className="simulation-timeline">
    <div className="playback-controls" role="group" aria-label="Playback controls">
      <Button disabled={!source || playing} onClick={start}>Start</Button>
      <Button variant="ghost" disabled={!source || !playing} onClick={stop}>Stop</Button>
      <Button variant="ghost" disabled={!source} onClick={() => { stop(); seek(0); }}>Reset</Button>
      <Button variant="ghost" disabled={!source || timeSec >= (scenario?.meta.durationSec ?? 0)} onClick={() => { stop(); seek(scenario?.meta.durationSec ?? 0); }}>Complete</Button>
      <label className="speed-control">Speed <select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[1,10,30,60,120,300].map(s => <option key={s} value={s}>{s}x</option>)}</select></label>
    </div>
      <div className="shared-clock" role="group" aria-label="Shared simulation clock">
        <div className="clock-readout"><span className={playing ? 'clock-running' : ''}>{playing ? 'Running' : 'Stopped'}</span><strong>T+ {formatTime(timeSec)}</strong><span>/ {formatTime(scenario?.meta.durationSec ?? 0)}</span><span className="clock-utc">{scenario ? new Date(Date.parse(scenario.meta.startIso) + timeSec * 1000).toISOString().slice(11,19) + ' UTC' : 'No run loaded'}</span></div>
        <input aria-label="Simulation time" disabled={!source} type="range" min="0" max={scenario?.meta.durationSec ?? 0} step="1" value={timeSec} onChange={e => seek(Number(e.target.value))} />
      </div>
    </div>
    {(simView === 'orbital' || simView === 'satInertial') && <p style={{fontSize:12,color:'#94a3b8'}}>Spacecraft enlarged for visibility; orbit unchanged. Red face: +X, green: +Y, cyan camera face: {scenario?.mission.spacecraft.payload.side ?? '+Z'}. Attitude: {scenario?.mission.spacecraft.attitude?.strategy ?? 'sun-pointing'}.</p>}
    <p style={{ fontSize: 12, color: '#94a3b8' }}>Turquoise solid: recent ground track; dashed: predicted track (next 2/3 orbit). Yellow: satellite-anchored inertial orbit. Stop holds the current time; Reset returns to the beginning.</p>
  </div>;
}
