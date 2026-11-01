import type { CompiledScenario, Telemetry, SatelliteState } from '../types';
import { validateMissionDefinition, type MissionDefinition } from '../mission/definition';
import * as satellite from 'satellite.js';
import { defaultThermal, EMPTY_THERMAL } from './thermal';
import { defaultMissionPlan, missionTiming, operationAt, validateOperationSchedule } from './operations';
import { DEFAULT_BATTERY, DEFAULT_RADIO, DEFAULT_STORAGE, EMPTY_RESOURCES, simulateResources } from './resources';
import { stationLook, type StationLook } from './station';
import { attitudeAxes, sunInBody, panelPowerW, axesQuaternion, type Vec3 } from './attitude';

// Earth radius (km) for eclipse test
const RE_KM = 6378.137;

// ---- Sun position (ECI) - low precision, good enough for education ----
// Returns Sun position vector in ECI (km)
function sunEciKm(date: Date): { x: number; y: number; z: number } {
  // Julian date
  const ms = date.getTime();
  const jd = ms / 86400000 + 2440587.5;

  const T = (jd - 2451545.0) / 36525.0;

  // Mean longitude (deg)
  const L0 = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360;
  // Mean anomaly (deg)
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360;

  const Mrad = (M * Math.PI) / 180;

  // Equation of center (deg)
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) +
    0.000289 * Math.sin(3 * Mrad);

  // True longitude (deg)
  const trueLon = L0 + C;

  // Obliquity of the ecliptic (deg)
  const eps = 23.439291 - 0.0130042 * T;
  const epsRad = (eps * Math.PI) / 180;

  const lonRad = (trueLon * Math.PI) / 180;

  // Distance in AU (approx)
  const R =
    1.000001018 * (1 - 0.01670862 * 0.01670862) /
    (1 + 0.01670862 * Math.cos(Mrad));

  // Convert AU to km
  const AU_KM = 149597870.7;
  const rKm = R * AU_KM;

  // Ecliptic coords
  const xEcl = rKm * Math.cos(lonRad);
  const yEcl = rKm * Math.sin(lonRad);
  const zEcl = 0;

  // Rotate to equatorial (ECI)
  const x = xEcl;
  const y = yEcl * Math.cos(epsRad) - zEcl * Math.sin(epsRad);
  const z = yEcl * Math.sin(epsRad) + zEcl * Math.cos(epsRad);

  return { x, y, z };
}

// Cylindrical shadow test (umbra approximation)
// rSat: satellite position in ECI (km)
// sHat: unit vector from Earth to Sun in ECI
function isEclipsed(rSat: { x: number; y: number; z: number }, sHat: { x: number; y: number; z: number }): boolean {
  // If satellite is on the sunward side, cannot be in eclipse
  const dot = rSat.x * sHat.x + rSat.y * sHat.y + rSat.z * sHat.z;
  if (dot > 0) return false;

  // Perpendicular distance from Earth-Sun line:
  // |r - (r·s)s|
  const px = rSat.x - dot * sHat.x;
  const py = rSat.y - dot * sHat.y;
  const pz = rSat.z - dot * sHat.z;
  const d = Math.sqrt(px * px + py * py + pz * pz);

  return d < RE_KM;
}

export function compileScenario(input: MissionDefinition): CompiledScenario {
  validateMissionDefinition(input);
  // Each run owns its input snapshot; later builder edits cannot alter it.
  const mission = structuredClone(input);
  mission.spacecraft.thermal ??= defaultThermal(mission.spacecraft.body.size);
  mission.missionPlan ??= { ...defaultMissionPlan };
  mission.missionPlan.downlinkStrategy ??= 'when-available';
  mission.spacecraft.power.battery ??= { ...DEFAULT_BATTERY };
  mission.spacecraft.radio ??= { ...DEFAULT_RADIO };
  mission.spacecraft.storage ??= { ...DEFAULT_STORAGE };
  mission.spacecraft.payload.cameraPreset ??= 'bw100';
  mission.spacecraft.payload.captureIntervalSec ??= 60;
  mission.spacecraft.payload.side ??= '+Z';
  mission.spacecraft.attitude ??= { strategy: 'sun-pointing' };
  const satrec = satellite.twoline2satrec(mission.orbit.line1.trim(), mission.orbit.line2.trim());

  const { periodSec, durationSec } = missionTiming(mission,satrec);
  validateOperationSchedule(mission,periodSec,durationSec);
  const stepSec = mission.simulation.stepSec;
  const n = Math.ceil(durationSec / stepSec) + 1;
  if (!Number.isFinite(n) || n > 100000) throw new Error('Mission exceeds 100,000 samples. Reduce duration or increase stepSec.');

  const start = new Date(mission.simulation.startIso);
  const startIso = start.toISOString();
  const endIso = new Date(start.getTime() + durationSec * 1000).toISOString();

  const states: SatelliteState[] = [];
  const orientationSamples: number[] = [];
  let previousQuaternion: number[] | null = null;
  const solarPowerByPanelW: Record<string, number[]> = Object.fromEntries(mission.spacecraft.power.solarPanels.map(p => [p.id, []]));
  const totalSolarPowerW: number[] = [];
  const timeSec: number[] = [];
  const sunlight: boolean[] = [];
  const batterySoc: number[] = [];
  const accessByStation: Record<string, boolean[]> = Object.fromEntries(
    mission.groundStations.map(gs => [gs.id, [] as boolean[]])
  );
  const lookAnglesByStation: Record<string, (StationLook | null)[]> = Object.fromEntries(
    mission.groundStations.map(gs => [gs.id, []])
  );

  // CZML sampled positions
  const posSamples: number[] = [];
  // A small display offset keeps the surface trace from flickering into Earth.
  // Smooth interpolation avoids straight chords cutting below the ellipsoid.
  const groundTrack: number[] = [];



  for (let i = 0; i < n; i++) {
    const t = Math.min(i * stepSec, durationSec);
    const d = new Date(start.getTime() + t * 1000);

    timeSec.push(t);

    // Orbit propagation
    const pv = satellite.propagate(satrec, d);
    if (!pv || !pv.position || !pv.velocity) throw new Error('Orbit propagation failed at t=' + t + 's. Check the TLE and mission epoch.');

    // Satellite geodetic for CZML
    const gmst = satellite.gstime(d);
    const geo = satellite.eciToGeodetic(pv.position, gmst);

    const lat = satellite.degreesLat(geo.latitude);
    const lon = satellite.degreesLong(geo.longitude);
    const altMeters = geo.height * 1000;

    if (![lat, lon, altMeters].every(Number.isFinite)) throw new Error('Invalid orbit position at t=' + t + 's.');

    // CZML sample
    posSamples.push(t, lon, lat, altMeters);
    groundTrack.push(t, lon, lat, 500);

    // Sunlight/eclipse
    const sun = sunEciKm(d);
    const sunMag = Math.sqrt(sun.x * sun.x + sun.y * sun.y + sun.z * sun.z);
    const sHat = { x: sun.x / sunMag, y: sun.y / sunMag, z: sun.z / sunMag };

    const rSat = { x: pv.position.x, y: pv.position.y, z: pv.position.z }; // km
    const eclipsed = isEclipsed(rSat, sHat);
    sunlight.push(!eclipsed);
    const position: Vec3 = [pv.position.x, pv.position.y, pv.position.z];
    const velocity: Vec3 = [pv.velocity.x, pv.velocity.y, pv.velocity.z];
    const sunDirection: Vec3 = [sHat.x, sHat.y, sHat.z];
    const axes = attitudeAxes(mission.spacecraft.attitude.strategy, position, velocity, sunDirection, mission.spacecraft.payload.side);
    const sunBody = sunInBody(axes, sunDirection);
    states.push({ ...EMPTY_THERMAL, ...EMPTY_RESOURCES, ...operationAt(mission,t,periodSec), timeSec: t, positionTemeKm: position, velocityTemeKmSec: velocity, bodyAxesTeme: axes, sunDirectionBody: sunBody, sunlit: !eclipsed });
    let total = 0;
    for (const panel of mission.spacecraft.power.solarPanels) {
      const watts = panelPowerW(panel.areaM2, panel.efficiency, panel.normalBody, sunBody, !eclipsed);
      solarPowerByPanelW[panel.id].push(watts);
      total += watts;
    }
    totalSolarPowerW.push(total);
    const fixed = (axis: Vec3): Vec3 => {
      const v = satellite.eciToEcf({ x: axis[0], y: axis[1], z: axis[2] }, gmst);
      return [v.x, v.y, v.z];
    };
    let q = axesQuaternion({ x: fixed(axes.x), y: fixed(axes.y), z: fixed(axes.z) });
    if (previousQuaternion && q.reduce((sum, value, k) => sum + value * previousQuaternion![k], 0) < 0) q = q.map(v => -v) as typeof q;
    orientationSamples.push(t, ...q);
    previousQuaternion = q;

    for (const gs of mission.groundStations) {
      const look = stationLook(gs, pv.position, gmst);
      lookAnglesByStation[gs.id].push(look);
      accessByStation[gs.id].push(look.elevationDeg >= gs.maskDeg);
    }
  }

  if (posSamples.length < 8) {
    throw new Error('Not enough valid orbit samples. Check the TLE and mission start time.');

  }

  const telemetry: Telemetry = { solarPowerByPanelW, totalSolarPowerW, timeSec, sunlight, batterySoc, accessByStation, lookAnglesByStation };
  simulateResources(mission,states,telemetry);

  const czml: any[] = [
    {
      id: 'document',
      name: mission.name,
      version: '1.0',
      clock: {
        interval: `${startIso}/${endIso}`,
        currentTime: startIso,
        multiplier: 60,
        range: 'LOOP_STOP',
        step: 'SYSTEM_CLOCK_MULTIPLIER'
      }
    },
    {
      id: 'sat-1',
      name: 'Satellite',
      orientation: { epoch: startIso, unitQuaternion: orientationSamples },
      availability: `${startIso}/${endIso}`,
      position: {
        epoch: startIso,
        cartographicDegrees: posSamples,
        interpolationAlgorithm: 'LAGRANGE',
        interpolationDegree: 5
      },
      point: {
        pixelSize: 8,
        color: { rgba: [255, 207, 92, 255] },
        outlineColor: { rgba: [10, 20, 35, 255] },
        outlineWidth: 2
      }
    },
    ...mission.groundStations.map(gs => ({
      id: gs.id,
      name: gs.name,
      position: { cartographicDegrees: [gs.lng, gs.lat, gs.altMeters ?? 0] },
      point: { pixelSize: 10 },
      label: { text: gs.name, font: '14px sans-serif', pixelOffset: { cartesian2: [12, -12] } }
    })),
    {
      id: 'ground-track',
      name: 'Sub-satellite point / recent ground track',
      availability: `${startIso}/${endIso}`,
      position: {
        epoch: startIso,
        cartographicDegrees: groundTrack,
        interpolationAlgorithm: 'LAGRANGE',
        interpolationDegree: 5
      },
      point: {
        pixelSize: 10,
        color: { rgba: [68, 235, 211, 255] },
        outlineColor: { rgba: [5, 25, 35, 255] },
        outlineWidth: 2
      },
      path: {
        show: true,
        width: 4,
        leadTime: 0,
        trailTime: periodSec,
        resolution: Math.min(stepSec, 30),
        material: { polylineOutline: {
          color: { rgba: [68, 235, 211, 255] },
          outlineColor: { rgba: [5, 25, 35, 220] },
          outlineWidth: 1
        } }
      }
    },
    {
      id: 'ground-track-future',
      name: 'Upcoming ground track',
      availability: `${startIso}/${endIso}`,
      position: { reference: 'ground-track#position' },
      path: {
        show: true,
        width: 2,
        leadTime: periodSec * 2 / 3,
        trailTime: 0,
        resolution: Math.min(stepSec, 30),
        material: { polylineDash: {
          color: { rgba: [68, 235, 211, 140] },
          dashLength: 12
        } }
      }
    },
    {
      id: 'nadir-line',
      name: 'Satellite projection onto Earth',
      availability: `${startIso}/${endIso}`,
      polyline: {
        positions: { references: ['sat-1#position', 'ground-track#position'] },
        arcType: 'NONE',
        width: 1,
        material: { polylineDash: {
          color: { rgba: [230, 244, 255, 180] },
          dashLength: 8
        } }
      }
    }
  ];

  return {
    meta: {
      name: mission.name,
      createdAtIso: new Date().toISOString(),
      startIso,
      endIso,
      durationSec,
      stepSec
    },
    mission,
    czml,
    telemetry,
    states
  };
}
