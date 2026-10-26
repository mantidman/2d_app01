/** One vertical axis: elevation in metres, 0 = sea level, negative = below the surface. */
export const TOP_M = 12000;
export const BOTTOM_M = -11000;
export const M_PER_PX = 1;

export const WORLD_W = 540;
export const VIEW_H = 960;
export const WORLD_H = Math.round((TOP_M - BOTTOM_M) / M_PER_PX);

export function elevToY(elevM: number): number {
  return (TOP_M - elevM) / M_PER_PX;
}

export function yToElev(y: number): number {
  return TOP_M - y * M_PER_PX;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
