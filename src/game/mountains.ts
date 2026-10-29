import raw from '../data/mountains.json';
import { Size } from './world';

export type PeakShape = 'peak' | 'shield';

export interface Mountain {
  id: string;
  name: string;
  /** Summit height above sea level, in metres. */
  summitM: number;
  summitNote?: string;
  /** Elevation of the surrounding base (the sea floor for the volcano), in metres; negative is below sea level. */
  baseM: number;
  baseNote: string;
  /** Half of the mountain's width at its base, in km (true distance along the surface). */
  halfWidthKm: number;
  widthNote: string;
  /** The width is an estimate, not a surveyed figure. */
  widthStatus: 'approximate' | 'sourced';
  /** The flank shape is always schematic: an idealised curve through the sourced summit, base and width. */
  shape: { kind: PeakShape };
  color: string;
  fact: string;
  sources: string[];
}

export const MOUNTAINS = raw as Mountain[];

/** Two ways to say how tall a mountain is. */
export type Measure = 'above-sea' | 'base-to-summit';

export const MEASURES: Array<{ id: Measure; label: string; blurb: string }> = [
  { id: 'above-sea', label: 'Above sea level', blurb: 'Summit height above the sea surface.' },
  { id: 'base-to-summit', label: 'Base to summit', blurb: 'From the surrounding ground or sea floor up to the summit.' },
];

export function heightBy(m: Mountain, measure: Measure): number {
  return measure === 'above-sea' ? m.summitM : m.summitM - m.baseM;
}

/** Mountains tallest first by a measure. */
export function rankBy(measure: Measure, list: Mountain[] = MOUNTAINS): Array<{ mountain: Mountain; heightM: number }> {
  return list.map((mountain) => ({ mountain, heightM: heightBy(mountain, measure) })).sort((a, b) => b.heightM - a.heightM);
}

/** Elevation of the schematic profile at a distance (km) from the summit axis. */
export function profileElevation(m: Mountain, distKm: number): number {
  const u = Math.min(1, Math.abs(distKm) / m.halfWidthKm);
  const rise = m.summitM - m.baseM;
  const f = m.shape.kind === 'peak' ? Math.pow(1 - u, 1.4) : Math.pow(1 - u * u, 1.3);
  return m.baseM + rise * f;
}

/** Where the profile crosses sea level, as a distance from the summit axis in km (null if it never does). */
export function shoreDistanceKm(m: Mountain): number | null {
  if (m.baseM >= 0 || m.summitM <= 0) return null;
  let lo = 0;
  let hi = m.halfWidthKm;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (profileElevation(m, mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export const fullWidthKm = (m: Mountain) => 2 * m.halfWidthKm;

/**
 * Where the summit axis sits on the world's horizontal axis (metres along the surface): a fixed, arbitrary
 * place, chosen so the mountain's right foot is at x = 0.
 */
export function axisM(m: Mountain): number {
  return -m.halfWidthKm * 1000;
}

/** The ground the mountain stands on extends this many half-widths each side of its axis. */
export const PLATFORM_HALF_WIDTHS = 3;

/** True if a point (distance along the surface, elevation) is inside rock or ground, i.e. nothing can swim or fly there. */
export function insideSolid(m: Mountain, sM: number, elevM: number): boolean {
  const d = Math.abs(sM - axisM(m));
  if (d > PLATFORM_HALF_WIDTHS * m.halfWidthKm * 1000) return false;
  if (elevM <= m.baseM) return true;
  return d <= m.halfWidthKm * 1000 && elevM <= profileElevation(m, d / 1000);
}

/** Zoom and centre that show the whole mountain with a little margin, at its true proportions. */
export function frameView(m: Mountain, size: Size): { x: number; elevM: number; mPerPx: number } {
  const wM = 2 * m.halfWidthKm * 1000 * 1.15;
  const hM = (m.summitM - m.baseM) * 1.4;
  return { x: axisM(m), elevM: (m.summitM + m.baseM) / 2, mPerPx: Math.max(wM / size.w, hM / size.h) };
}
