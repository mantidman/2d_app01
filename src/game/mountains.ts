import raw from '../data/mountains.json';

export type PeakShape = 'peak' | 'shield';

export interface Mountain {
  id: string;
  name: string;
  /** Summit height above sea level, in metres. */
  summitM: number;
  summitNote?: string;
  /** Elevation of the surrounding base (the sea floor for the volcanoes), in metres; negative is below sea level. */
  baseM: number;
  baseNote: string;
  /** How far the volcano's weight presses the crust below its base, in metres (null if not known). */
  depressionM: number | null;
  volumeKm3: number | null;
  /** Schematic half-width of the profile in km. Heights are sourced; widths and flank shapes are idealised. */
  halfWidthKm: number;
  shape: { kind: PeakShape };
  color: string;
  fact: string;
  sources: string[];
}

export const MOUNTAINS = raw as Mountain[];

/** The three ways to say how tall a mountain is. */
export type Measure = 'above-sea' | 'base-to-summit' | 'with-depression';

export const MEASURES: Array<{ id: Measure; label: string; blurb: string }> = [
  { id: 'above-sea', label: 'Above sea level', blurb: 'Summit height above the sea surface.' },
  { id: 'base-to-summit', label: 'Base to summit', blurb: 'From the surrounding ground or sea floor up to the summit.' },
  { id: 'with-depression', label: 'Incl. pressed-down crust', blurb: 'From the bottom of the dent the volcano presses into the crust (only known for Mauna Loa).' },
];

/** Height of a mountain by a measure, or null if there is no sourced figure. */
export function heightBy(m: Mountain, measure: Measure): number | null {
  switch (measure) {
    case 'above-sea':
      return m.summitM;
    case 'base-to-summit':
      return m.summitM - m.baseM;
    case 'with-depression':
      return m.depressionM === null ? null : m.summitM - m.baseM + m.depressionM;
  }
}

/** Mountains that have a figure for this measure, tallest first. */
export function rankBy(measure: Measure, list: Mountain[] = MOUNTAINS): Array<{ mountain: Mountain; heightM: number }> {
  return list
    .map((mountain) => ({ mountain, heightM: heightBy(mountain, measure) }))
    .filter((r): r is { mountain: Mountain; heightM: number } => r.heightM !== null)
    .sort((a, b) => b.heightM - a.heightM);
}

/** Elevation of the schematic profile at a distance (km) from the summit axis. */
export function profileElevation(m: Mountain, distKm: number): number {
  const u = Math.min(1, Math.abs(distKm) / m.halfWidthKm);
  const rise = m.summitM - m.baseM;
  const f = m.shape.kind === 'peak' ? Math.pow(1 - u, 1.4) : Math.pow(1 - u * u, 1.3);
  return m.baseM + rise * f;
}

/** Evenly spaced profile points from the left foot to the right foot. */
export function profileSamples(m: Mountain, n = 80): Array<{ distKm: number; elevM: number }> {
  return Array.from({ length: n + 1 }, (_, i) => {
    const distKm = -m.halfWidthKm + (2 * m.halfWidthKm * i) / n;
    return { distKm, elevM: profileElevation(m, distKm) };
  });
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

/** How much one mountain's summit rises above another's, in metres. */
export function summitDifferenceM(a: Mountain, b: Mountain): number {
  return a.summitM - b.summitM;
}
