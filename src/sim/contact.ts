import type { StationLook } from './station';

export type ContactWindow = { startSec: number; endSec: number };

/** Interpolate mask crossings between samples; never bridge missing geometry. */
export function contactWindows(times: number[], looks: (StationLook | null)[], maskDeg: number): ContactWindow[] {
  const windows: ContactWindow[] = [];
  for (let i = 1; i < times.length; i++) {
    const a = looks[i - 1], b = looks[i];
    if (!a || !b || !Number.isFinite(a.elevationDeg) || !Number.isFinite(b.elevationDeg)) continue;
    const aVisible = a.elevationDeg >= maskDeg, bVisible = b.elevationDeg >= maskDeg;
    if (!aVisible && !bVisible) continue;
    let startSec = times[i - 1], endSec = times[i];
    if (aVisible !== bVisible) {
      const crossing = startSec + (maskDeg - a.elevationDeg) / (b.elevationDeg - a.elevationDeg) * (endSec - startSec);
      if (aVisible) endSec = crossing;
      else startSec = crossing;
    }
    if (endSec <= startSec) continue;
    const previous = windows.at(-1);
    if (previous && Math.abs(previous.endSec - startSec) < 1e-6) previous.endSec = endSec;
    else windows.push({ startSec, endSec });
  }
  return windows;
}
