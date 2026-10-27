import { wrapDx } from './world';

export interface Candidate {
  key: string;
  lengthM: number;
  elevM: number;
  x: number;
}

/** "Nearby" means within this many metres of the camera. */
export const NEARBY_RADIUS_M = 1500;

/**
 * The largest thing near a spot, used by the "zoom out to the biggest nearby object" button.
 * Ties go to the closer one; if nothing is within the radius the closest thing overall wins.
 */
export function pickLargestNearby<T extends Candidate>(items: T[], at: { x: number; elevM: number }, radiusM = NEARBY_RADIUS_M): T | null {
  const dist = (c: Candidate) => Math.hypot(wrapDx(c.x - at.x), c.elevM - at.elevM);
  const near = items.filter((c) => dist(c) <= radiusM);
  if (near.length === 0) return items.reduce<T | null>((best, c) => (!best || dist(c) < dist(best) ? c : best), null);
  return near.reduce((best, c) => (c.lengthM > best.lengthM || (c.lengthM === best.lengthM && dist(c) < dist(best)) ? c : best));
}
