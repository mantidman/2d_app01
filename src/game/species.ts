import raw from '../data/species.json';
import { clamp } from './world';

export type Domain = 'sky' | 'sea' | 'object';
export type Rarity = 'common' | 'uncommon' | 'rare';

export interface Species {
  id: string;
  name: string;
  domain: Domain;
  /** Elevation range in metres; 0 is sea level, negative is below the surface. */
  minM: number;
  maxM: number;
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
  x: number;
  dir: 1 | -1;
  speed: number;
}

const INSTANCE_COUNT: Record<Rarity, number> = { common: 4, uncommon: 3, rare: 2 };

/** Sprite size in px; log scaled so a blue whale dwarfs a clownfish but both stay readable. */
export function displaySizeFor(lengthM: number): number {
  return Math.round(clamp(56 + 48 * Math.log10(lengthM / 0.05), 56, 260));
}

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

/** Deterministic placement so every run, and every test, sees the same world. */
export function placeInstances(sp: Species, worldW: number): Instance[] {
  const rand = mulberry32(hash(sp.id));
  const size = displaySizeFor(sp.lengthM);
  const count = sp.instances ?? (sp.fixed ? 1 : INSTANCE_COUNT[sp.rarity]);
  const out: Instance[] = [];
  for (let i = 0; i < count; i++) {
    const slice = (sp.maxM - sp.minM) / count;
    const elevM = sp.minM === sp.maxM ? sp.minM : sp.minM + slice * (i + rand());
    const x = sp.fixed ? worldW / 2 : size / 2 + rand() * Math.max(0, worldW - size);
    const dir = rand() < 0.5 ? -1 : 1;
    const speed = sp.fixed ? 0 : 8 + rand() * 22;
    out.push({ speciesId: sp.id, elevM, x, dir, speed });
  }
  return out;
}
