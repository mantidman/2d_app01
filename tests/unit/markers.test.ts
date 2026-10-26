import { describe, expect, it } from 'vitest';
import { LANDMARKS, buildMarkers } from '../../src/game/markers';
import { ZONES } from '../../src/game/zones';
import { BOTTOM_M, TOP_M } from '../../src/game/world';

describe('landmarks', () => {
  it.each(LANDMARKS.map((l) => [l.id, l] as const))('%s is valid', (_id, l) => {
    expect(l.name.length).toBeGreaterThan(3);
    expect(l.source).toMatch(/^https?:\/\//);
    expect(l.elevM).toBeGreaterThanOrEqual(BOTTOM_M);
    expect(l.elevM).toBeLessThanOrEqual(TOP_M);
  });

  it('includes the levels players expect', () => {
    const byId = Object.fromEntries(LANDMARKS.map((l) => [l.id, l.elevM]));
    expect(byId['karman-line']).toBe(100000);
    expect(byId['iss-orbit']).toBe(408000);
    expect(byId['sea-level']).toBe(0);
    expect(byId['challenger-deep']).toBeLessThan(-10000);
  });
});

describe('markers', () => {
  const markers = buildMarkers();

  it('are sorted top to bottom without duplicate levels', () => {
    for (let i = 1; i < markers.length; i++) expect(markers[i].elevM).toBeLessThan(markers[i - 1].elevM);
  });

  it('label every zone edge, either as a zone or a landmark at the same level', () => {
    for (const z of ZONES.slice(1)) expect(markers.some((m) => Math.abs(m.elevM - z.topM) < 1), z.name).toBe(true);
    expect(markers.some((m) => m.id === 'abyss' && m.elevM === -4000)).toBe(true);
  });
});
