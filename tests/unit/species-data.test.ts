import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SPECIES } from '../../src/game/species';
import { ZONES } from '../../src/game/zones';
import { TOP_M, BOTTOM_M } from '../../src/game/world';

const dir = resolve(__dirname, '../../public/silhouettes');

describe('species data', () => {
  it('has unique ids', () => {
    const ids = SPECIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SPECIES.map((s) => [s.id, s] as const))('%s is a valid entry', (_id, s) => {
    expect(s.name.length).toBeGreaterThan(1);
    expect(s.fact.length).toBeGreaterThan(20);
    expect(s.source).toMatch(/^https?:\/\//);
    expect(s.license.length).toBeGreaterThan(2);
    expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(s.lengthM).toBeGreaterThan(0);
    expect(s.minM).toBeLessThanOrEqual(s.maxM);
    expect(s.minM).toBeGreaterThanOrEqual(BOTTOM_M);
    expect(s.maxM).toBeLessThanOrEqual(TOP_M);
  });

  it('keeps animals on the right side of the surface', () => {
    for (const s of SPECIES.filter((x) => x.domain === 'sea')) expect(s.maxM).toBeLessThanOrEqual(0);
    for (const s of SPECIES.filter((x) => x.domain === 'sky')) expect(s.minM).toBeGreaterThanOrEqual(0);
  });

  it('has aircraft and spacecraft, flying where they really fly', () => {
    const objects = SPECIES.filter((s) => s.domain === 'object');
    for (const id of ['passenger-jet', 'concorde', 'iss', 'hubble', 'starlink']) expect(objects.map((o) => o.id)).toContain(id);
    const iss = SPECIES.find((s) => s.id === 'iss')!;
    expect(iss.minM).toBeLessThan(408000);
    expect(iss.maxM).toBeGreaterThan(408000);
  });

  it('has content in every zone', () => {
    for (const z of ZONES) {
      const hit = SPECIES.some((s) => s.maxM >= z.bottomM && s.minM <= z.topM);
      expect(hit, `no species in ${z.name}`).toBe(true);
    }
  });
});

describe('silhouette files', () => {
  it.each(SPECIES.map((s) => [s.id, s.silhouette] as const))('%s has a valid svg', (_id, file) => {
    const path = resolve(dir, file);
    expect(existsSync(path)).toBe(true);
    const svg = readFileSync(path, 'utf8');
    expect(svg).toContain('viewBox="0 0 256 256"');
    expect(svg.match(/<path\b/g)?.length).toBe(1);
    expect(svg).toContain('fill="#fff"');
    expect(svg).not.toMatch(/<(script|image|text)\b/);
    const d = /\sd="([^"]+)"/.exec(svg)![1];
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums.every((n) => n >= 0 && n <= 256)).toBe(true);
  });

  it('has no orphan files', () => {
    const used = new Set(SPECIES.map((s) => s.silhouette));
    for (const f of readdirSync(dir)) expect(used.has(f), `${f} unused`).toBe(true);
  });
});
