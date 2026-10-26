import raw from '../data/species.json';
import { WORLD_W_M } from './world';

export type Domain = 'sky' | 'sea' | 'object';
export type Rarity = 'common' | 'uncommon' | 'rare';

export interface Species {
  id: string;
  name: string;
  domain: Domain;
  /** Elevation range in metres; 0 is sea level, negative is below the surface. */
  minM: number;
  maxM: number;
  /** Real size in metres of the longest side of the silhouette (e.g. wingspan for a bird seen from below). */
  lengthM: number;
  rarity: Rarity;
  color: string;
  silhouette: string;
  fact: string;
  source: string;
  license: string;
  /** Stays put at the centre of the world (e.g. a wreck) instead of drifting. */
  fixed?: boolean;
  /** Overrides the rarity-based number of copies, e.g. 1 for one-of-a-kind objects like the ISS. */
  instances?: number;
}

export const SPECIES = raw as Species[];

export interface Instance {
  speciesId: string;
  elevM: number;
  /** Horizontal position in metres on the wrapping column, in [-WORLD_W_M/2, WORLD_W_M/2). */
  x: number;
  dir: 1 | -1;
  speed: number;
}

const INSTANCE_COUNT: Record<Rarity, number> = { common: 4, uncommon: 3, rare: 2 };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Drift speed in m/s: a fraction of a body length per second, capped so big things don't race. */
export function driftSpeed(lengthM: number, rand: number): number {
  return Math.min(lengthM * (0.15 + 0.3 * rand), 3);
}

/** Deterministic placement so every run, and every test, sees the same world. */
export function placeInstances(sp: Species, worldW = WORLD_W_M): Instance[] {
  const rand = mulberry32(hash(sp.id));
  const count = sp.instances ?? (sp.fixed ? 1 : INSTANCE_COUNT[sp.rarity]);
  const out: Instance[] = [];
  for (let i = 0; i < count; i++) {
    const slice = (sp.maxM - sp.minM) / count;
    const elevM = sp.minM === sp.maxM ? sp.minM : sp.minM + slice * (i + rand());
    const x = sp.fixed ? 0 : (rand() - 0.5) * worldW;
    const dir = rand() < 0.5 ? -1 : 1;
    const speed = sp.fixed ? 0 : driftSpeed(sp.lengthM, rand());
    out.push({ speciesId: sp.id, elevM, x, dir, speed });
  }
  return out;
}
