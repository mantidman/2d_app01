import { describe, expect, it } from 'vitest';
import { elevToY, yToElev, WORLD_H, TOP_M, BOTTOM_M } from '../../src/game/world';
import { zoneAt, backgroundColorAt, silhouetteColorAt, luminance, ZONES } from '../../src/game/zones';
import { formatElevation, formatRange } from '../../src/game/format';
import { SPECIES, displaySizeFor, placeInstances } from '../../src/game/species';

describe('world axis', () => {
  it('maps elevation to y and back', () => {
    expect(elevToY(TOP_M)).toBe(0);
    expect(elevToY(BOTTOM_M)).toBe(WORLD_H);
    for (const m of [-10900, -3800, 0, 7290]) expect(yToElev(elevToY(m))).toBeCloseTo(m);
  });
});

describe('zones', () => {
  it('finds the zone for an elevation', () => {
    expect(zoneAt(9000).id).toBe('high-sky');
    expect(zoneAt(10).id).toBe('low-sky');
    expect(zoneAt(-50).id).toBe('sunlit');
    expect(zoneAt(-3800).id).toBe('midnight');
    expect(zoneAt(-10900).id).toBe('hadal');
    expect(ZONES).toHaveLength(7);
  });

  it('gets darker with depth and jumps at the surface', () => {
    expect(luminance(backgroundColorAt(-100))).toBeGreaterThan(luminance(backgroundColorAt(-2000)));
    expect(luminance(backgroundColorAt(-2000))).toBeGreaterThan(luminance(backgroundColorAt(-10000)));
    expect(luminance(backgroundColorAt(5))).toBeGreaterThan(luminance(backgroundColorAt(-5)));
  });

  it('keeps silhouettes distinguishable from the background', () => {
    for (const m of [10000, 3000, 10, -10, -500, -3000, -5000, -10000]) {
      const diff = Math.abs(luminance(silhouetteColorAt(m)) - luminance(backgroundColorAt(m)));
      expect(diff, `at ${m} m`).toBeGreaterThan(0.08);
    }
  });
});

describe('formatting', () => {
  it('formats elevations and ranges', () => {
    expect(formatElevation(0)).toBe('Sea level');
    expect(formatElevation(-3800)).toBe('3,800 m deep');
    expect(formatElevation(1250)).toBe('1,250 m above');
    expect(formatRange(-200, 0)).toBe('0 to 200 m deep');
    expect(formatRange(100, 11300)).toBe('100 to 11,300 m above sea');
    expect(formatRange(-3800, -3800)).toBe('3,800 m deep');
  });
});

describe('sizes and placement', () => {
  it('scales sprites by length with a readable range', () => {
    const clown = displaySizeFor(0.1);
    const whale = displaySizeFor(25);
    expect(clown).toBeGreaterThanOrEqual(56);
    expect(whale).toBeGreaterThan(clown * 2);
    expect(displaySizeFor(10000)).toBe(260);
  });

  it('places instances deterministically and inside their range', () => {
    for (const sp of SPECIES) {
      const a = placeInstances(sp, 540);
      expect(placeInstances(sp, 540)).toEqual(a);
      for (const i of a) {
        expect(i.elevM).toBeGreaterThanOrEqual(sp.minM);
        expect(i.elevM).toBeLessThanOrEqual(sp.maxM);
        expect(i.x).toBeGreaterThanOrEqual(0);
        expect(i.x).toBeLessThanOrEqual(540);
      }
    }
  });
});
