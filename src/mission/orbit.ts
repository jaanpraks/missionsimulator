import { gstime } from 'satellite.js';
/** RAAN -> Earth-fixed longitude at the mission epoch (degrees east). */
export function ascendingNodeLongitude(raanDeg: number, startIso: string) {
  return ((raanDeg - gstime(new Date(startIso))*180/Math.PI + 540) % 360 + 360) % 360 - 180;
}
/** Approximate mean elements for educational TLE authoring; not an orbit fit. */
export type OrbitElements = {
  perigeeKm: number;
  apogeeKm: number;
  inclinationDeg: number;
  raanDeg: number;
  argumentOfPerigeeDeg: number;
  meanAnomalyDeg: number;
};
export const EARTH_RADIUS_KM = 6378.135;
const MU = 398600.8; // WGS72 km^3/s^2, matching SGP4's Earth model.

export function elementsFromTle(line2: string): OrbitElements {
  const inclinationDeg = Number(line2.slice(8, 16));
  const raanDeg = Number(line2.slice(17, 25));
  const eccentricity = Number(`0.${line2.slice(26, 33).trim()}`);
  const argumentOfPerigeeDeg = Number(line2.slice(34, 42));
  const meanAnomalyDeg = Number(line2.slice(43, 51));
  const meanMotion = Number(line2.slice(52, 63));
  if (![inclinationDeg, raanDeg, eccentricity, argumentOfPerigeeDeg, meanAnomalyDeg, meanMotion].every(Number.isFinite)
    || meanMotion <= 0 || eccentricity < 0 || eccentricity >= 1 || inclinationDeg < 0 || inclinationDeg > 180) {
    throw new Error('Cannot read orbital elements from this TLE. Check line 2 in Configuration JSON.');
  }
  const a = Math.cbrt(MU / Math.pow(meanMotion * 2 * Math.PI / 86400, 2));
  return {
    perigeeKm: a * (1 - eccentricity) - EARTH_RADIUS_KM,
    apogeeKm: a * (1 + eccentricity) - EARTH_RADIUS_KM,
    inclinationDeg, raanDeg, argumentOfPerigeeDeg, meanAnomalyDeg
  };
}

export function orbitGeometry(elements: OrbitElements) {
  const rp = EARTH_RADIUS_KM + elements.perigeeKm;
  const ra = EARTH_RADIUS_KM + elements.apogeeKm;
  const a = (rp + ra) / 2;
  const e = (ra - rp) / (ra + rp);
  return { a, e, b: a * Math.sqrt(1 - e * e), periodSec: 2 * Math.PI * Math.sqrt(a ** 3 / MU) };
}

export function tleChecksum(line: string): string {
  const content = line.slice(0, 68);
  if (content.length !== 68) throw new Error('TLE content must be 68 characters before checksum.');
  let sum = 0;
  for (const c of content) sum += /\d/.test(c) ? Number(c) : c === '-' ? 1 : 0;
  return content + sum % 10;
}

export function tleFromElements(elements: OrbitElements, startIso: string, original: { line1: string; line2: string }) {
  if (!Object.values(elements).every(Number.isFinite)
    || elements.perigeeKm < 150 || elements.apogeeKm < elements.perigeeKm || elements.apogeeKm > 100000
    || elements.inclinationDeg < 0 || elements.inclinationDeg > 180) throw new Error('Choose a perigee of at least 150 km, an apogee no lower than perigee, and inclination from 0 to 180 degrees.');
  const date = new Date(startIso);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 1957 || year > 2056) throw new Error('TLE authoring supports mission epochs from 1957 through 2056.');
  const day = 1 + (date.getTime() - Date.UTC(year, 0, 1)) / 86400000;
  const epoch = String(year % 100).padStart(2, '0') + day.toFixed(8).padStart(12, '0');
  const { e, periodSec } = orbitGeometry(elements);
  const angle = (value: number) => (Number((((value % 360) + 360) % 360).toFixed(4)) % 360).toFixed(4).padStart(8, ' ');
  const inclination = elements.inclinationDeg.toFixed(4).padStart(8, ' ');
  const motion = (86400 / periodSec).toFixed(8).padStart(11, ' ');
  const eccentricity = Math.round(e * 1e7).toString().padStart(7, '0');
  const line1 = tleChecksum(original.line1.slice(0, 18) + epoch + original.line1.slice(32, 68));
  const line2 = tleChecksum(`2 ${original.line2.slice(2, 7)} ${inclination} ${angle(elements.raanDeg)} ${eccentricity} ${angle(elements.argumentOfPerigeeDeg)} ${angle(elements.meanAnomalyDeg)} ${motion}${original.line2.slice(63, 68)}`);
  return { type: 'tle' as const, line1, line2 };
}
