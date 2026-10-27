import { describe, expect, it } from 'vitest';
import {
  BOTTOM_M,
  DEFAULT_VIEW_WIDTH_M,
  EARTH_RADIUS_M,
  PULL_BACK_FROM_M_PER_PX,
  wholeEarthMPerPx,
  DOT_PX,
  MAX_M_PER_PX,
  MIN_M_PER_PX,
  TOP_M,
  focusPx,
  WORLD_W_M,
  clampView,
  defaultMPerPx,
  elevToScreenY,
  focusMPerPx,
  renderMode,
  screenYToElev,
  sizeInPx,
  wrapDx,
  xToScreenX,
  zoomAbout,
} from '../../src/game/world';
import { zoneAt, backgroundColorAt, silhouetteColorAt, luminance, ZONES } from '../../src/game/zones';
import { formatElevation, formatRange } from '../../src/game/format';
import { SPECIES, placeInstances } from '../../src/game/species';

const byId = (id: string) => SPECIES.find((s) => s.id === id)!;
const SIZE = { w: 400, h: 800 };
const H = SIZE.h;

describe('view maths', () => {
  const view = { x: 0, elevM: -3800, mPerPx: 1 };

  it('puts the view centre in the middle of the screen', () => {
    expect(elevToScreenY(view, view.elevM, H)).toBe(H / 2);
    expect(xToScreenX(view, 0, SIZE.w)).toBe(SIZE.w / 2);
  });

  it('maps screen to elevation and back at any zoom', () => {
    for (const m of [0.001, 1, 50, 600]) {
      const v = { ...view, mPerPx: m };
      for (const e of [-3800, -3800 + 100 * m, -3800 - 400 * m]) expect(screenYToElev(v, elevToScreenY(v, e, H), H)).toBeCloseTo(e, 6);
    }
  });

  it('measures true distances: 100 m apart is 100 px at 1 m/px and 10 px at 10 m/px', () => {
    expect(elevToScreenY(view, -3900, H) - elevToScreenY(view, -3800, H)).toBeCloseTo(100);
    expect(elevToScreenY({ ...view, mPerPx: 10 }, -3900, H) - elevToScreenY({ ...view, mPerPx: 10 }, -3800, H)).toBeCloseTo(10);
  });

  it('wraps the horizontal column the short way round', () => {
    expect(wrapDx(10)).toBe(10);
    expect(wrapDx(WORLD_W_M - 10)).toBeCloseTo(-10);
    expect(wrapDx(-WORLD_W_M + 10)).toBeCloseTo(10);
  });

  it('zooming about a point keeps that point under the pointer', () => {
    const before = { x: 120, elevM: -500, mPerPx: 2 };
    const anchor = { x: 400, y: 200 };
    const after = zoomAbout(before, 0.25, SIZE, anchor.x, anchor.y);
    expect(after.mPerPx).toBeCloseTo(0.5);
    expect(screenYToElev(after, anchor.y, H)).toBeCloseTo(screenYToElev(before, anchor.y, H), 6);
    const wx = (v: typeof before) => v.x + (anchor.x - SIZE.w / 2) * v.mPerPx;
    expect(wx(after)).toBeCloseTo(wx(before), 6);
  });

  it('clamps the view to the world and the zoom range', () => {
    const v = clampView({ x: 1750, elevM: 9e9, mPerPx: 1e-12 });
    expect(v.elevM).toBeCloseTo(TOP_M, 1); // a hair past the top at the finest zoom
    expect(v.mPerPx).toBe(MIN_M_PER_PX);
    expect(v.x).toBeCloseTo(-250);
    const out = clampView({ x: 0, elevM: -9e9, mPerPx: 1e9 });
    expect(out.mPerPx).toBe(MAX_M_PER_PX);
    expect(out.elevM).toBe(-EARTH_RADIUS_M); // zoomed out you may look down to the planet's centre
    expect(clampView({ x: 0, elevM: -9e9, mPerPx: 1 }).elevM).toBeCloseTo(BOTTOM_M - 350, 6); // zoomed in you may not
  });

  it('can zoom out until the whole Earth fits on a phone-sized screen', () => {
    expect(MAX_M_PER_PX * 289).toBeGreaterThanOrEqual(2 * EARTH_RADIUS_M);
    expect(wholeEarthMPerPx({ w: 289, h: 700 })).toBeLessThanOrEqual(MAX_M_PER_PX);
    expect(2 * EARTH_RADIUS_M / wholeEarthMPerPx({ w: 289, h: 700 })).toBeCloseTo(0.9 * 289, 6);
  });

  it('keeps the world as it was until you zoom far out, then pulls back towards the Earth\'s centre', () => {
    const size = { w: 400, h: 800 };
    const near = { x: 0, elevM: 100, mPerPx: 1 };
    const small = zoomAbout(near, 10, size); // 10 m/px: no pull-back
    expect(small.mPerPx).toBe(10);
    expect(small.elevM).toBeCloseTo(100, 6); // plain zoom about the screen centre keeps the centre where it is
    let v = { x: 0, elevM: 0, mPerPx: PULL_BACK_FROM_M_PER_PX };
    let prev = v.elevM;
    while (v.mPerPx < MAX_M_PER_PX) {
      v = zoomAbout(v, 1.3, size);
      expect(v.elevM).toBeLessThanOrEqual(prev); // keeps sinking towards the centre
      prev = v.elevM;
    }
    expect(v.mPerPx).toBe(MAX_M_PER_PX);
    expect(v.elevM).toBeCloseTo(-EARTH_RADIUS_M, -2); // dead centre at the widest zoom
  });

  it('does not pull back when zooming in, so you can dive back down at a point on the surface', () => {
    const size = { w: 400, h: 800 };
    const far = { x: 0, elevM: -EARTH_RADIUS_M, mPerPx: 40000 };
    const anchor = { x: 200, y: 100 }; // a point near the top of the disc
    const closer = zoomAbout(far, 0.5, size, anchor.x, anchor.y);
    expect(closer.elevM).toBeGreaterThan(far.elevM);
    expect(screenYToElev(closer, anchor.y, size.h)).toBeCloseTo(screenYToElev(far, anchor.y, size.h), 3);
  });
});

describe('opening view', () => {
  it('is about as wide as a big ship, whatever the screen', () => {
    for (const w of [289, 393, 1176, 2400]) expect(defaultMPerPx({ w, h: 800 }) * w).toBeCloseTo(DEFAULT_VIEW_WIDTH_M, 6);
  });

  it('shows a 3 m albatross as a circle and a 25 m whale as a silhouette on a phone', () => {
    const m = defaultMPerPx({ w: 289, h: 700 });
    expect(renderMode(sizeInPx(byId('albatross').lengthM, m))).toBe('dot');
    expect(renderMode(sizeInPx(byId('blue-whale').lengthM, m))).toBe('sprite');
    expect(sizeInPx(byId('titanic-wreck').lengthM, m)).toBeGreaterThan(250); // a ship fills the width
  });
});

describe('true sizes', () => {
  it('keeps size relations exact at every zoom', () => {
    for (const m of [0.0005, 0.1, 1, 40, 600]) {
      const ratio = sizeInPx(byId('blue-whale').lengthM, m) / sizeInPx(byId('clownfish').lengthM, m);
      expect(ratio).toBeCloseTo(byId('blue-whale').lengthM / byId('clownfish').lengthM, 9);
    }
    expect(byId('blue-whale').lengthM / byId('clownfish').lengthM).toBeGreaterThan(200);
  });

  it('draws small things as circles and big things as silhouettes', () => {
    expect(renderMode(sizeInPx(byId('clownfish').lengthM, 1))).toBe('dot');
    expect(renderMode(sizeInPx(byId('great-white-shark').lengthM, 1))).toBe('dot');
    expect(renderMode(sizeInPx(byId('blue-whale').lengthM, 1))).toBe('sprite');
    expect(renderMode(sizeInPx(byId('titanic-wreck').lengthM, 1))).toBe('sprite');
    expect(renderMode(DOT_PX - 0.01)).toBe('dot');
    expect(renderMode(DOT_PX)).toBe('sprite');
  });

  it('sizes the focus zoom by the shorter side so it fits portrait and landscape', () => {
    expect(focusPx({ w: 400, h: 800 })).toBe(focusPx({ w: 1200, h: 400 }));
    expect(focusPx({ w: 1200, h: 800 })).toBeLessThan(800);
  });

  it('turns every circle into a silhouette once you zoom in on it', () => {
    for (const s of SPECIES) {
      const m = focusMPerPx(s.lengthM, SIZE);
      expect(m).toBeGreaterThanOrEqual(MIN_M_PER_PX);
      expect(m).toBeLessThanOrEqual(MAX_M_PER_PX);
      expect(renderMode(sizeInPx(s.lengthM, m))).toBe('sprite');
      expect(sizeInPx(s.lengthM, m)).toBeCloseTo(focusPx(SIZE), 6);
    }
  });

  it('matches reference measurements', () => {
    const ref: Record<string, [number, number]> = {
      titanic: [269, 269],
      iss: [100, 120],
      concorde: [60, 65],
      hubble: [12, 14],
      'blue-whale': [20, 30],
      'great-white-shark': [3.5, 6],
      clownfish: [0.06, 0.12],
    };
    const ids: Record<string, string> = { titanic: 'titanic-wreck' };
    for (const [k, [lo, hi]] of Object.entries(ref)) {
      const s = byId(ids[k] ?? k);
      expect(s.lengthM, s.id).toBeGreaterThanOrEqual(lo);
      expect(s.lengthM, s.id).toBeLessThanOrEqual(hi);
    }
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
    expect(zoneAt(-20000).id).toBe('crust');
    expect(zoneAt(-1_000_000).id).toBe('mantle');
    expect(zoneAt(-4_000_000).id).toBe('outer-core');
    expect(zoneAt(-6_000_000).id).toBe('inner-core');
    expect(zoneAt(-EARTH_RADIUS_M).id).toBe('inner-core');
    expect(ZONES).toHaveLength(14);
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
    expect(formatElevation(-EARTH_RADIUS_M)).toBe('6,371 km deep');
    expect(formatElevation(-2_891_000)).toBe('2,891 km deep');
    expect(formatElevation(-10935)).toBe('10,935 m deep');
    expect(formatElevation(11300)).toBe('11,300 m above');
    expect(formatRange(370000, 460000)).toBe('370 to 460 km above sea');
    expect(formatRange(0, 35000)).toBe('0 m to 35 km above sea');
  });
});

describe('placement', () => {
  it('places one-of-a-kind objects exactly once', () => {
    for (const id of ['iss', 'hubble', 'titanic-wreck']) expect(placeInstances(byId(id))).toHaveLength(1);
  });

  it('places instances deterministically, inside their range and the column', () => {
    for (const sp of SPECIES) {
      const a = placeInstances(sp);
      expect(placeInstances(sp)).toEqual(a);
      for (const i of a) {
        expect(i.elevM).toBeGreaterThanOrEqual(sp.minM);
        expect(i.elevM).toBeLessThanOrEqual(sp.maxM);
        expect(Math.abs(i.x)).toBeLessThanOrEqual(WORLD_W_M / 2);
      }
    }
  });

  it('drifts slowly, relative to body size', () => {
    for (const sp of SPECIES) for (const i of placeInstances(sp)) expect(i.speed).toBeLessThanOrEqual(Math.min(3, sp.lengthM * 0.45) + 1e-9);
  });
});
