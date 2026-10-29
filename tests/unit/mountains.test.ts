import { describe, expect, it } from 'vitest';
import { MEASURES, MOUNTAINS, heightBy, profileElevation, profileSamples, rankBy, shoreDistanceKm, summitDifferenceM } from '../../src/game/mountains';
import { LANDMARKS } from '../../src/game/markers';

const by = (id: string) => MOUNTAINS.find((m) => m.id === id)!;
const everest = by('everest');
const kea = by('mauna-kea');
const loa = by('mauna-loa');

describe('mountain data', () => {
  it('has the three mountains with sources', () => {
    expect(MOUNTAINS.map((m) => m.id).sort()).toEqual(['everest', 'mauna-kea', 'mauna-loa']);
    for (const m of MOUNTAINS) {
      expect(m.sources.length).toBeGreaterThan(0);
      for (const s of m.sources) expect(s).toMatch(/^https:\/\//);
      expect(m.fact.length).toBeGreaterThan(20);
      expect(m.baseNote.length).toBeGreaterThan(10);
      expect(m.summitM).toBeGreaterThan(m.baseM);
      expect(m.halfWidthKm).toBeGreaterThan(0);
    }
  });

  it('uses the sourced heights', () => {
    expect(everest.summitM).toBeCloseTo(8848.86, 2); // 2020 Nepal-China survey
    expect(kea.summitM).toBeGreaterThanOrEqual(4205); // sources give 4,205 to 4,207 m
    expect(kea.summitM).toBeLessThanOrEqual(4207);
    expect(loa.summitM).toBe(4169); // USGS
    expect(loa.volumeKm3).toBe(75000); // USGS: at least 75,000 cubic km
    expect(loa.depressionM).toBe(8000); // USGS: crust pressed down about 8 km
    expect(loa.baseM).toBe(-5000); // USGS: flanks descend about 5 km to the sea floor
  });

  it('does not invent a pressed-down-crust figure for the others', () => {
    expect(everest.depressionM).toBeNull();
    expect(kea.depressionM).toBeNull();
  });
});

describe('three ways to measure height', () => {
  it('above sea level: Everest, then Mauna Kea, then Mauna Loa', () => {
    expect(rankBy('above-sea').map((r) => r.mountain.id)).toEqual(['everest', 'mauna-kea', 'mauna-loa']);
    expect(summitDifferenceM(kea, loa)).toBeGreaterThanOrEqual(36);
    expect(summitDifferenceM(kea, loa)).toBeLessThanOrEqual(38); // "roughly 38 m"
  });

  it('base to summit: Mauna Kea beats Everest by several kilometres', () => {
    const rank = rankBy('base-to-summit');
    expect(rank[0].mountain.id).toBe('mauna-kea');
    expect(rank[0].heightM).toBeGreaterThanOrEqual(10200); // NOAA/Guinness: about 10,205 to 10,210 m
    expect(rank[0].heightM).toBeLessThanOrEqual(10215);
    expect(heightBy(kea, 'base-to-summit')! - heightBy(everest, 'base-to-summit')!).toBeGreaterThan(5000);
    expect(rank.map((r) => r.mountain.id)).toEqual(['mauna-kea', 'mauna-loa', 'everest']);
  });

  it('including the pressed-down crust only Mauna Loa has a figure: about 17 km', () => {
    const rank = rankBy('with-depression');
    expect(rank.map((r) => r.mountain.id)).toEqual(['mauna-loa']);
    expect(rank[0].heightM).toBeGreaterThan(16500);
    expect(rank[0].heightM).toBeLessThan(17500); // USGS: about 17,000 m above its base
  });

  it('every measure has a label and a blurb', () => {
    expect(MEASURES.map((m) => m.id)).toEqual(['above-sea', 'base-to-summit', 'with-depression']);
    for (const m of MEASURES) expect(m.label.length + m.blurb.length).toBeGreaterThan(20);
  });
});

describe('schematic profiles', () => {
  it('start at the summit, end at the base, and are symmetric and never rise away from the summit', () => {
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

  it('samples run foot to foot', () => {
    const s = profileSamples(kea, 40);
    expect(s).toHaveLength(41);
    expect(s[0].distKm).toBe(-kea.halfWidthKm);
    expect(s.at(-1)!.distKm).toBe(kea.halfWidthKm);
    expect(s[20].elevM).toBeCloseTo(kea.summitM, 6);
  });

  it('puts the shoreline of the volcanoes between the summit and the foot, and none on Everest', () => {
    for (const m of [kea, loa]) {
      const s = shoreDistanceKm(m)!;
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(m.halfWidthKm);
      expect(profileElevation(m, s)).toBeCloseTo(0, 3);
    }
    expect(shoreDistanceKm(everest)).toBeNull();
  });
});

describe('summits as landmarks', () => {
  it('are on the world axis at the same heights', () => {
    const byId = Object.fromEntries(LANDMARKS.map((l) => [l.id, l.elevM]));
    expect(byId['everest']).toBe(Math.round(everest.summitM));
    expect(byId['mauna-kea']).toBe(kea.summitM);
    expect(byId['mauna-loa']).toBe(loa.summitM);
  });
});
