import * as satellite from 'satellite.js';
import type { GroundStation } from '../mission/definition';

export type StationLook = { azimuthDeg: number; elevationDeg: number; rangeKm: number };

/** Geodetic station horizon: azimuth clockwise from north; elevation above horizon. */
export function stationLook(
  station: GroundStation,
  positionEciKm: { x: number; y: number; z: number },
  gmst: number
): StationLook {
  const look = satellite.ecfToLookAngles({
    latitude: station.lat * Math.PI / 180,
    longitude: station.lng * Math.PI / 180,
    height: (station.altMeters ?? 0) / 1000
  }, satellite.eciToEcf(positionEciKm, gmst));
  return {
    azimuthDeg: look.azimuth * 180 / Math.PI,
    elevationDeg: look.elevation * 180 / Math.PI,
    rangeKm: look.rangeSat
  };
}

/** North at top, east at right, horizon at radius 1, zenith at centre. */
export function polarPoint(azimuthDeg: number, elevationDeg: number) {
  const radius = (90 - Math.max(0, Math.min(90, elevationDeg))) / 90;
  const angle = azimuthDeg * Math.PI / 180;
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
}
