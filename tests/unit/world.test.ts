import { describe, expect, it } from 'vitest';
import { elevToY, yToElev, WORLD_H, TOP_M, BOTTOM_M } from '../../src/game/world';
import { zoneAt, backgroundColorAt, silhouetteColorAt, luminance, ZONES } from '../../src/game/zones';
import { formatElevation, formatRange } from '../../src/game/format';
import { SPECIES, displaySizeFor, placeInstances } from '../../src/game/species';

describe('world axis', () => {
  it('maps elevation to y and back', () => {
    expect(elevToY(TOP_M)).toBe(0);
    expect(elevToY(BOTTOM_M)).toBe(WORLD_H);
    for (const m of [-10900, -3800, 0, 7290, 12000, 41419, 100000, 408000]) expect(yToElev(elevToY(m))).toBeCloseTo(m, 3);
  });

  it('is strictly decreasing in elevation and a phone-scrollable size', () => {
    let prev = -1;
    for (const m of [600000, 408000, 100000, 12000, 0, -3800, -11000]) {
      const y = elevToY(m);
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }
    expect(WORLD_H).toBeLessThan(40000);
  });

  it('keeps 1 px per metre from airliner height down to the trench', () => {
    expect(elevToY(-3800) - elevToY(0)).toBeCloseTo(3800);
    expect(elevToY(0) - elevToY(8849)).toBeCloseTo(8849);
  });
});

describe('zones', () => {
  it('finds the zone for an elevation', () => {
    expect(zoneAt(408000).id).toBe('space');
    expect(zoneAt(90000).id).toBe('thermosphere');
    expect(zoneAt(60000).id).toBe('mesosphere');
    expect(zoneAt(20000).id).toBe('stratosphere');
    expect(zoneAt(9000).id).toBe('troposphere');
    expect(zoneAt(10).id).toBe('troposphere');
    expect(zoneAt(-50).id).toBe('sunlit');
    expect(zoneAt(-3800).id).toBe('midnight');
    expect(zoneAt(-10900).id).toBe('hadal');
    expect(ZONES).toHaveLength(10);
  });

  it('gets darker with depth and jumps at the surface', () => {
    expect(luminance(backgroundColorAt(-100))).toBeGreaterThan(luminance(backgroundColorAt(-2000)));
    expect(luminance(backgroundColorAt(-2000))).toBeGreaterThan(luminance(backgroundColorAt(-10000)));
    expect(luminance(backgroundColorAt(5))).toBeGreaterThan(luminance(backgroundColorAt(-5)));
  });

  it('keeps silhouettes distinguishable from the background', () => {
    for (const m of [500000, 200000, 60000, 20000, 10000, 3000, 10, -10, -500, -3000, -5000, -10000]) {
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
    expect(formatElevation(408000)).toBe('408 km above');
    expect(formatElevation(11300)).toBe('11,300 m above');
    expect(formatRange(370000, 460000)).toBe('370 to 460 km above sea');
    expect(formatRange(0, 35000)).toBe('0 m to 35 km above sea');
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

  it('places one-of-a-kind objects exactly once', () => {
    for (const id of ['iss', 'hubble', 'titanic-wreck']) {
      expect(placeInstances(SPECIES.find((s) => s.id === id)!, 540)).toHaveLength(1);
    }
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
