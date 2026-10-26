import landmarkData from '../data/landmarks.json';
import { ZONES } from './zones';

export interface Landmark {
  id: string;
  name: string;
  elevM: number;
  source: string;
}

export interface Marker {
  id: string;
  label: string;
  elevM: number;
  kind: 'landmark' | 'zone';
}

export const LANDMARKS = landmarkData as Landmark[];

/** Landmarks plus the top edge of every zone, except where a landmark already marks that level. */
export function buildMarkers(): Marker[] {
  const out: Marker[] = LANDMARKS.map((l) => ({ id: l.id, label: l.name, elevM: l.elevM, kind: 'landmark' }));
  for (const z of ZONES.slice(1)) {
    if (!out.some((m) => Math.abs(m.elevM - z.topM) < 1)) out.push({ id: z.id, label: z.name, elevM: z.topM, kind: 'zone' });
  }
  return out.sort((a, b) => b.elevM - a.elevM);
}
