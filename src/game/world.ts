/**
 * One vertical axis: elevation in metres, 0 = sea level, negative = below the surface.
 * The axis is piecewise linear: full detail from the trench to airliner height, compressed above
 * so that the Karman line and low Earth orbit fit into a world a phone can scroll.
 */
export const TOP_M = 600000;
export const BOTTOM_M = -11000;

interface Segment {
  fromM: number;
  toM: number;
  pxPerM: number;
}

export const SEGMENTS: Segment[] = [
  { fromM: 600000, toM: 100000, pxPerM: 0.004 },
  { fromM: 100000, toM: 12000, pxPerM: 0.03 },
  { fromM: 12000, toM: BOTTOM_M, pxPerM: 1 },
];

const segmentPx = (s: Segment) => (s.fromM - s.toM) * s.pxPerM;

export const WORLD_W = 540;
export const VIEW_H = 960;
export const WORLD_H = Math.round(SEGMENTS.reduce((sum, s) => sum + segmentPx(s), 0));

export function elevToY(elevM: number): number {
  let y = 0;
  for (const s of SEGMENTS) {
    if (elevM >= s.toM) return y + (s.fromM - Math.min(elevM, s.fromM)) * s.pxPerM;
    y += segmentPx(s);
  }
  return y;
}

export function yToElev(y: number): number {
  let top = 0;
  for (const s of SEGMENTS) {
    const h = segmentPx(s);
    if (y <= top + h) return s.fromM - (Math.max(y, top) - top) / s.pxPerM;
    top += h;
  }
  return BOTTOM_M;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
