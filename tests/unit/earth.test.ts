import { describe, expect, it } from 'vitest';
import { backgroundGradient, contourY, earthGeometry, sag, worldToScreen } from '../../src/game/earth';
import { ZONES, backgroundColorAt, COLOR_STOP_ELEVATIONS } from '../../src/game/zones';
import { EARTH_CIRCUMFERENCE_M, EARTH_RADIUS_M, elevToScreenY, wholeEarthMPerPx } from '../../src/game/world';

const SIZE = { w: 1000, h: 700 };
const at = (mPerPx: number, elevM = 0) => ({ x: 0, elevM, mPerPx });

describe('Earth radius', () => {
  it('is the mean radius, 6,371 km', () => {
    expect(EARTH_RADIUS_M).toBe(6_371_000);
  });

  it('puts the interior layers at their accepted depths', () => {
    const edge = (id: string) => ZONES.find((z) => z.id === id)!;
    expect(-edge('mantle').topM).toBe(35_000); // crust, about 35 km
    expect(-edge('outer-core').topM).toBe(2_891_000); // core-mantle boundary
    expect(EARTH_RADIUS_M + edge('outer-core').topM).toBe(3_480_000); // outer core radius 3,480 km
    expect(EARTH_RADIUS_M + edge('inner-core').topM).toBe(1_221_000); // inner core radius 1,221 km
    expect(edge('inner-core').bottomM).toBe(-EARTH_RADIUS_M);
    expect(ZONES.at(-1)!.bottomM).toBe(-EARTH_RADIUS_M); // the zones go all the way to the centre
  });

  it('colours the interior from crust to a white-hot core, ending at the centre', () => {
    const lum = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    expect(lum(backgroundColorAt(-6_000_000))).toBeGreaterThan(lum(backgroundColorAt(-4_000_000)));
    expect(lum(backgroundColorAt(-4_000_000))).toBeGreaterThan(lum(backgroundColorAt(-1_000_000)));
    expect(COLOR_STOP_ELEVATIONS).toContain(-EARTH_RADIUS_M);
  });
});

describe('curvature', () => {
  it('sagitta matches the circle: d^2/(2R) for small d, a full radius at the horizon-most point', () => {
    expect(sag(1e9, 1000)).toBeCloseTo(1000 ** 2 / (2 * 1e9), 12);
    expect(sag(100, 100)).toBe(100);
    expect(sag(100, 60)).toBeCloseTo(100 - 80, 9); // 3-4-5 triangle
    expect(sag(1e11, 5e5)).toBeGreaterThan(0); // no cancellation to zero at huge radii
  });

  it('is invisible when zoomed in, noticeable around 100 m/px, a full ball when zoomed out', () => {
    const at1 = earthGeometry(at(1), SIZE);
    expect(at1.mode).toBe('flat');
    expect(at1.sagPx).toBeLessThan(0.25);
    const at100 = earthGeometry(at(100), SIZE);
    expect(at100.mode).toBe('arc');
    expect(at100.sagPx).toBeGreaterThan(1.5); // the horizon drops about 2 px at the screen edge (500 px out)
    const far = earthGeometry(at(20000, -EARTH_RADIUS_M), SIZE);
    expect(far.mode).toBe('circle');
    expect(far.seaPx).toBeCloseTo(EARTH_RADIUS_M / 20000, 9);
  });

  it('draws the true radius: sea-level circle radius in px is R / (metres per pixel)', () => {
    for (const m of [3000, 9000, 25000]) expect(earthGeometry(at(m, -EARTH_RADIUS_M), SIZE).seaPx).toBeCloseTo(6371000 / m, 6);
  });

  it('centres the planet when looking at its middle, and the sea-level top sits R/m above it', () => {
    const m = wholeEarthMPerPx(SIZE);
    const g = earthGeometry(at(m, -EARTH_RADIUS_M), SIZE);
    expect(g.cx).toBeCloseTo(SIZE.w / 2, 6);
    expect(g.cy).toBeCloseTo(SIZE.h / 2, 6);
    expect(elevToScreenY(at(m, -EARTH_RADIUS_M), 0, SIZE.h)).toBeCloseTo(g.cy - g.seaPx, 6);
    expect(g.seaPx * 2).toBeCloseTo(0.9 * Math.min(SIZE.w, SIZE.h), 6); // fits, with a margin
    expect(g.eLo).toBeCloseTo(-EARTH_RADIUS_M, 0); // the centre is on screen
  });

  it('bends contours away from the axis, by the same amount at both screen edges', () => {
    const v = at(200, 1000);
    const g = earthGeometry(v, SIZE);
    const mid = contourY(v, SIZE, g, 0, g.cx);
    const left = contourY(v, SIZE, g, 0, 0);
    const right = contourY(v, SIZE, g, 0, SIZE.w);
    expect(left).toBeGreaterThan(mid);
    expect(left).toBeCloseTo(right, 9);
  });
});

type Stops = ReturnType<typeof backgroundGradient>['stops'];

/** Colour a gradient gives at position t (linear in RGB between stops, like canvas gradients). */
function colorAt(stops: Stops, t: number): number {
  const right = stops.findIndex((s) => s.t >= t);
  if (right <= 0) return stops[Math.max(right, 0)].color;
  const a = stops[right - 1];
  const b = stops[right];
  const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
  const ch = (shift: number) => Math.round(((a.color >> shift) & 255) * (1 - k) + ((b.color >> shift) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

const near = (a: number, b: number, tol = 2) => [16, 8, 0].every((s) => Math.abs(((a >> s) & 255) - ((b >> s) & 255)) <= tol);

describe('background gradient', () => {
  it('is a plain top-to-bottom gradient when zoomed in, running from the sky above to the sea below', () => {
    const v = at(1, 0);
    const spec = backgroundGradient(v, SIZE, earthGeometry(v, SIZE));
    expect(spec.kind).toBe('linear');
    expect(spec.stops[0].t).toBe(0);
    expect(spec.stops.at(-1)!.t).toBe(1);
    for (const e of [-300, -50, -5, 5, 50, 300]) {
      const t = (v.elevM + (SIZE.h / 2) * v.mPerPx - e) / (SIZE.h * v.mPerPx);
      expect(near(colorAt(spec.stops, t), backgroundColorAt(e)), `${e} m`).toBe(true);
    }
  });

  it('is radial around the planet when zoomed out, with the true radius, and matches the colour table', () => {
    const v = at(20000, -EARTH_RADIUS_M);
    const g = earthGeometry(v, SIZE);
    const spec = backgroundGradient(v, SIZE, g);
    expect(spec.kind).toBe('radial');
    expect(spec.cx).toBeCloseTo(SIZE.w / 2, 6);
    expect(spec.cy).toBeCloseTo(SIZE.h / 2, 6);
    // Gradient radius = distance to the highest elevation shown, in px.
    expect(spec.r).toBeCloseTo((EARTH_RADIUS_M + g.eHi) / 20000, 6);
    for (const e of [-6_000_000, -4_000_000, -1_000_000, -20_000, -5_000, 100, 30_000, 300_000]) {
      if (e > g.eHi || e < g.eLo) continue;
      const t = (EARTH_RADIUS_M + e) / (EARTH_RADIUS_M + g.eHi);
      expect(near(colorAt(spec.stops, t), backgroundColorAt(e), 3), `${e} m`).toBe(true);
    }
  });

  it('keeps stop positions ordered and inside 0..1 at every zoom', () => {
    for (const [m, e] of [[0.001, -3800], [1, 0], [400, 10], [1500, 2000], [20000, -EARTH_RADIUS_M], [60000, -EARTH_RADIUS_M], [60000, 0]] as const) {
      const v = at(m, e);
      const spec = backgroundGradient(v, SIZE, earthGeometry(v, SIZE));
      for (let i = 0; i < spec.stops.length; i++) {
        expect(spec.stops[i].t).toBeGreaterThanOrEqual(0);
        expect(spec.stops[i].t).toBeLessThanOrEqual(1);
        if (i) expect(spec.stops[i].t).toBeGreaterThanOrEqual(spec.stops[i - 1].t);
      }
    }
  });

  it('shows the atmosphere as a thin bright halo at planet scale, and the sea as a thinner one', () => {
    const v = at(40000, -EARTH_RADIUS_M);
    const spec = backgroundGradient(v, SIZE, earthGeometry(v, SIZE));
    const seaT = (EARTH_RADIUS_M + 0) / (EARTH_RADIUS_M + earthGeometry(v, SIZE).eHi);
    const lum = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    expect(lum(colorAt(spec.stops, seaT + 1e-4))).toBeGreaterThan(lum(colorAt(spec.stops, seaT + 0.2))); // sky over space
  });
});

describe('worldToScreen on the round Earth', () => {
  it('puts the camera at the screen centre, wherever it has walked to', () => {
    for (const x of [0, 5000, -90_000, 3_000_000]) {
      const v = { x, elevM: 1234, mPerPx: 7 };
      const p = worldToScreen(v, SIZE, x, 1234);
      expect(p.x).toBeCloseTo(SIZE.w / 2, 6);
      expect(p.y).toBeCloseTo(SIZE.h / 2, 6);
    }
  });

  it('measures horizontal distance along the surface and elevation straight up', () => {
    const v = { x: 0, elevM: 0, mPerPx: 10 };
    const p = worldToScreen(v, SIZE, 2000, 0); // 2 km along the surface = 200 px at 10 m/px
    expect(p.x - SIZE.w / 2).toBeCloseTo(200, 3);
    const q = worldToScreen(v, SIZE, 0, 500); // 500 m up = 50 px up
    expect(SIZE.h / 2 - q.y).toBeCloseTo(50, 6);
  });

  it('lets the ground fall away from the camera by the curvature, d^2 / 2R', () => {
    const v = { x: 0, elevM: 0, mPerPx: 100 };
    const d = 300_000; // 300 km
    const p = worldToScreen(v, SIZE, d, 0);
    const dropM = ((p.y - SIZE.h / 2) * 100);
    expect(dropM).toBeCloseTo(d ** 2 / (2 * EARTH_RADIUS_M), -1); // about 7 km, to 10 m
  });

  it('agrees with the curved sea-level contour of the background', () => {
    const v = { x: 40_000, elevM: 300, mPerPx: 50 };
    const g = earthGeometry(v, SIZE);
    for (const s of [-60_000, 0, 40_000, 120_000]) {
      const p = worldToScreen(v, SIZE, v.x + s, 0);
      expect(p.y).toBeCloseTo(contourY(v, SIZE, g, 0, p.x), 1);
    }
  });

  it('wraps once around the planet', () => {
    const v = { x: 0, elevM: 0, mPerPx: 10 };
    const a = worldToScreen(v, SIZE, 1000, 0);
    const b = worldToScreen(v, SIZE, 1000 + EARTH_CIRCUMFERENCE_M, 0);
    expect(b.x).toBeCloseTo(a.x, 4);
  });
});
