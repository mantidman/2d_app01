import { describe, expect, it } from 'vitest';
import { MEASURES, MOUNTAINS, PLATFORM_HALF_WIDTHS, axisM, frameView, fullWidthKm, heightBy, insideSolid, profileElevation, rankBy, shoreDistanceKm } from '../../src/game/mountains';
import { LANDMARKS } from '../../src/game/markers';

const by = (id: string) => MOUNTAINS.find((m) => m.id === id)!;
const everest = by('everest');
const kea = by('mauna-kea');

describe('mountain data', () => {
  it('has Everest and Mauna Kea, with sources and honest width notes', () => {
    expect(MOUNTAINS.map((m) => m.id).sort()).toEqual(['everest', 'mauna-kea']);
    for (const m of MOUNTAINS) {
      expect(m.sources.length).toBeGreaterThan(0);
      for (const s of m.sources) expect(s).toMatch(/^https:\/\//);
      expect(m.fact.length).toBeGreaterThan(20);
      expect(m.baseNote.length).toBeGreaterThan(10);
      expect(m.widthNote.length).toBeGreaterThan(20);
      expect(['approximate', 'sourced']).toContain(m.widthStatus);
      expect(m.summitM).toBeGreaterThan(m.baseM);
      expect(m.halfWidthKm).toBeGreaterThan(0);
    }
  });

  it('uses the sourced heights', () => {
    expect(everest.summitM).toBeCloseTo(8848.86, 2); // 2020 Nepal-China survey
    expect(kea.summitM).toBeGreaterThanOrEqual(4205); // sources give 4,205 to 4,207 m
    expect(kea.summitM).toBeLessThanOrEqual(4207);
    expect(kea.summitM - kea.baseM).toBeGreaterThanOrEqual(10200); // NOAA/Guinness: about 10,205 to 10,210 m from base
    expect(kea.summitM - kea.baseM).toBeLessThanOrEqual(10215);
  });

  it('marks both widths as approximate until a source is found', () => {
    expect(everest.widthStatus).toBe('approximate');
    expect(kea.widthStatus).toBe('approximate');
    expect(fullWidthKm(everest)).toBeCloseTo(17.6, 6);
    expect(fullWidthKm(kea)).toBe(120);
  });
});

describe('two ways to measure height', () => {
  it('above sea level Everest wins by more than double', () => {
    const rank = rankBy('above-sea');
    expect(rank.map((r) => r.mountain.id)).toEqual(['everest', 'mauna-kea']);
    expect(rank[0].heightM / rank[1].heightM).toBeGreaterThan(2);
  });

  it('base to summit Mauna Kea wins by several kilometres', () => {
    const rank = rankBy('base-to-summit');
    expect(rank.map((r) => r.mountain.id)).toEqual(['mauna-kea', 'everest']);
    expect(rank[0].heightM - rank[1].heightM).toBeGreaterThan(5000);
  });

  it('has labels', () => {
    expect(MEASURES.map((m) => m.id)).toEqual(['above-sea', 'base-to-summit']);
    expect(heightBy(kea, 'above-sea')).toBe(kea.summitM);
  });
});

describe('schematic profiles', () => {
  it('start at the summit, end at the base, are symmetric and never rise away from the summit', () => {
    for (const m of MOUNTAINS) {
      expect(profileElevation(m, 0)).toBeCloseTo(m.summitM, 6);
      expect(profileElevation(m, m.halfWidthKm)).toBeCloseTo(m.baseM, 6);
      expect(profileElevation(m, m.halfWidthKm * 3)).toBeCloseTo(m.baseM, 6);
      let prev = Infinity;
      for (let d = 0; d <= m.halfWidthKm; d += m.halfWidthKm / 50) {
        const e = profileElevation(m, d);
        expect(e).toBeLessThanOrEqual(prev + 1e-9);
        expect(e).toBeCloseTo(profileElevation(m, -d), 9);
        prev = e;
      }
    }
  });

  it('puts Mauna Kea\'s shoreline between the summit and the foot, and none on Everest', () => {
    const s = shoreDistanceKm(kea)!;
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(kea.halfWidthKm);
    expect(profileElevation(kea, s)).toBeCloseTo(0, 3);
    expect(shoreDistanceKm(everest)).toBeNull();
  });

  it('has realistic average slopes: a steep peak and a gentle shield', () => {
    const slope = (m: typeof kea) => (Math.atan((m.summitM - m.baseM) / (m.halfWidthKm * 1000)) * 180) / Math.PI;
    expect(slope(everest)).toBeGreaterThan(15);
    expect(slope(kea)).toBeLessThan(12);
  });
});

describe('placement in the world', () => {
  it('puts the right foot of each mountain at the animal column (x = 0)', () => {
    for (const m of MOUNTAINS) expect(axisM(m) + m.halfWidthKm * 1000).toBeCloseTo(0, 6);
  });

  it('knows which points are inside rock or ground', () => {
    // Under the summit axis: rock below the profile, air above it.
    expect(insideSolid(everest, axisM(everest), everest.summitM - 10)).toBe(true);
    expect(insideSolid(everest, axisM(everest), everest.summitM + 10)).toBe(false);
    // On the plateau next to the mountain: ground below the base, air above.
    expect(insideSolid(everest, axisM(everest) + 2 * everest.halfWidthKm * 1000, everest.baseM - 1)).toBe(true);
    expect(insideSolid(everest, axisM(everest) + 2 * everest.halfWidthKm * 1000, everest.baseM + 1)).toBe(false);
    // Mauna Kea stands on the sea floor: open water above it, ground below it, far away nothing.
    expect(insideSolid(kea, 0, -3000)).toBe(false);
    expect(insideSolid(kea, 0, kea.baseM - 1)).toBe(true);
    expect(insideSolid(kea, axisM(kea) + (PLATFORM_HALF_WIDTHS + 1) * kea.halfWidthKm * 1000, kea.baseM - 1)).toBe(false);
  });

  it('frames the whole mountain with margin at its true proportions', () => {
    for (const size of [{ w: 289, h: 700 }, { w: 1176, h: 720 }]) {
      for (const m of MOUNTAINS) {
        const f = frameView(m, size);
        const widthPx = (fullWidthKm(m) * 1000) / f.mPerPx;
        const heightPx = (m.summitM - m.baseM) / f.mPerPx;
        expect(widthPx).toBeLessThanOrEqual(size.w);
        expect(heightPx).toBeLessThanOrEqual(size.h);
        expect(f.x).toBe(axisM(m));
        // one scale for both axes: the shape keeps its true proportions
        expect(widthPx / heightPx).toBeCloseTo((fullWidthKm(m) * 1000) / (m.summitM - m.baseM), 6);
      }
    }
  });
});

describe('summits as landmarks', () => {
  it('are on the world axis at the same heights', () => {
    const byId = Object.fromEntries(LANDMARKS.map((l) => [l.id, l.elevM]));
    expect(byId['everest']).toBe(Math.round(everest.summitM));
    expect(byId['mauna-kea']).toBe(kea.summitM);
    expect(byId['mauna-loa']).toBeUndefined(); // not needed for now
  });
});
