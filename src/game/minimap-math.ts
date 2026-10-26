import { BOTTOM_M, TOP_M } from './world';

/**
 * The minimap is not to scale on purpose: each band gets a share of the strip so the sea, the
 * airliner layers and the edge of space all stay clickable. `weight` is the share of the strip height.
 */
const BANDS = [
  { fromM: TOP_M, toM: 100000, weight: 0.12 },
  { fromM: 100000, toM: 12000, weight: 0.16 },
  { fromM: 12000, toM: 0, weight: 0.26 },
  { fromM: 0, toM: BOTTOM_M, weight: 0.46 },
];

/** 0 at the top of the world, 1 at the bottom. */
export function elevToFrac(elevM: number): number {
  let f = 0;
  for (const b of BANDS) {
    if (elevM >= b.toM) return f + ((b.fromM - Math.min(elevM, b.fromM)) / (b.fromM - b.toM)) * b.weight;
    f += b.weight;
  }
  return 1;
}

export function fracToElev(frac: number): number {
  let top = 0;
  for (const b of BANDS) {
    if (frac <= top + b.weight) return b.fromM - ((Math.max(frac, top) - top) / b.weight) * (b.fromM - b.toM);
    top += b.weight;
  }
  return BOTTOM_M;
}
