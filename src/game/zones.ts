import { clamp } from './world';

export interface Zone {
  id: string;
  name: string;
  topM: number;
  bottomM: number;
}

export const ZONES: Zone[] = [
  { id: 'space', name: 'Space (low Earth orbit)', topM: 600000, bottomM: 100000 },
  { id: 'thermosphere', name: 'Thermosphere', topM: 100000, bottomM: 85000 },
  { id: 'mesosphere', name: 'Mesosphere', topM: 85000, bottomM: 50000 },
  { id: 'stratosphere', name: 'Stratosphere', topM: 50000, bottomM: 12000 },
  { id: 'troposphere', name: 'Troposphere', topM: 12000, bottomM: 0 },
  { id: 'sunlit', name: 'Sunlit zone', topM: 0, bottomM: -200 },
  { id: 'twilight', name: 'Twilight zone', topM: -200, bottomM: -1000 },
  { id: 'midnight', name: 'Midnight zone', topM: -1000, bottomM: -4000 },
  { id: 'abyss', name: 'Abyssal zone', topM: -4000, bottomM: -6000 },
  { id: 'hadal', name: 'Hadal zone', topM: -6000, bottomM: -11000 },
];

export function zoneAt(elevM: number): Zone {
  return ZONES.find((z) => elevM <= z.topM && elevM > z.bottomM) ?? (elevM > 0 ? ZONES[0] : ZONES[ZONES.length - 1]);
}

/** Colour stops from the top of the world to the bottom; the jump at 0 is the sea surface. */
const STOPS: Array<[number, number]> = [
  [600000, 0x000003],
  [100000, 0x01020c],
  [50000, 0x050a26],
  [12000, 0x0b1033],
  [9000, 0x1c3f7a],
  [4000, 0x4f8fd0],
  [0.01, 0xbfe6f8],
  [0, 0x2aa6c9],
  [-200, 0x1a6f9c],
  [-1000, 0x0b3a66],
  [-4000, 0x04152e],
  [-6000, 0x020a18],
  [-11000, 0x000005],
];

export function mixColor(a: number, b: number, t: number): number {
  const k = clamp(t, 0, 1);
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function backgroundColorAt(elevM: number): number {
  if (elevM >= STOPS[0][0]) return STOPS[0][1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [hiM, hiC] = STOPS[i];
    const [loM, loC] = STOPS[i + 1];
    if (elevM <= hiM && elevM >= loM) return mixColor(hiC, loC, (hiM - elevM) / (hiM - loM));
  }
  return STOPS[STOPS.length - 1][1];
}

export function luminance(color: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Colour of an undiscovered silhouette: dark against light water or sky, faintly glowing in the dark. */
export function silhouetteColorAt(elevM: number): number {
  const bg = backgroundColorAt(elevM);
  return luminance(bg) > 0.3 ? mixColor(bg, 0x000000, 0.6) : mixColor(bg, 0x5fe0d0, 0.34);
}
