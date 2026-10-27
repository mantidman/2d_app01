import { COLOR_STOPS, backgroundColorAt } from './zones';
import { EARTH_RADIUS_M, Size, View, clamp, elevToScreenY } from './world';

/**
 * Earth geometry for drawing. The world is a sphere: every elevation e is a circle of radius R+e
 * around the centre (world x = 0, elevation -R). Near the surface that circle is almost flat, so
 * three modes keep the drawing cheap and numerically safe at every zoom:
 *  - flat:   the curve is under a quarter of a pixel across the screen, draw horizontal bands
 *  - arc:    visibly curved but the circle is much bigger than the screen, draw sagging arcs
 *  - circle: the planet is small enough to draw as real circles
 */
export type EarthMode = 'flat' | 'arc' | 'circle';

export interface EarthGeometry {
  mode: EarthMode;
  /** Screen position of the Earth's centre. */
  cx: number;
  cy: number;
  /** Radius of the sea-level circle in pixels. */
  seaPx: number;
  /** Largest drop of the sea-level curve below its top across the screen, in pixels. */
  sagPx: number;
  /** Highest and lowest elevation that appears on screen (metres). */
  eHi: number;
  eLo: number;
}

const FLAT_SAG_PX = 0.25;
const CIRCLE_MODE_FACTOR = 3;

/** How far a circle of radius rho falls below its top at horizontal distance d. Stable for rho >> d. */
export function sag(rho: number, d: number): number {
  const a = Math.abs(d);
  if (a >= rho) return rho;
  return (a * a) / (rho + Math.sqrt(rho * rho - a * a));
}

export function earthGeometry(view: View, size: Size): EarthGeometry {
  const { w, h } = size;
  const m = view.mPerPx;
  const cx = w / 2 - view.x / m;
  const seaPx = EARTH_RADIUS_M / m;
  const dEdge = Math.max(Math.abs(0 - cx), Math.abs(w - cx));
  const sagPx = sag(seaPx, Math.min(dEdge, seaPx));
  const eAxisTop = view.elevM + (h / 2) * m;
  const eAxisBottom = view.elevM - (h / 2) * m;

  if (seaPx > CIRCLE_MODE_FACTOR * (w + h)) {
    if (sagPx < FLAT_SAG_PX) return { mode: 'flat', cx, cy: Infinity, seaPx, sagPx, eHi: eAxisTop, eLo: eAxisBottom };
    return { mode: 'arc', cx, cy: Infinity, seaPx, sagPx, eHi: eAxisTop + sagPx * m, eLo: eAxisBottom };
  }

  const cy = elevToScreenY(view, -EARTH_RADIUS_M, h);
  const nearX = clamp(cx, 0, w);
  const nearY = clamp(cy, 0, h);
  const dMin = Math.hypot(nearX - cx, nearY - cy);
  const dMax = Math.max(...[0, w].flatMap((x) => [0, h].map((y) => Math.hypot(x - cx, y - cy))));
  return { mode: 'circle', cx, cy, seaPx, sagPx, eHi: dMax * m - EARTH_RADIUS_M, eLo: dMin * m - EARTH_RADIUS_M };
}

export interface GradientStop {
  /** Position along the gradient, 0 to 1. */
  t: number;
  color: number;
}

export interface BackgroundGradient {
  /** Radial around the Earth's centre (arc and circle modes) or linear top to bottom (flat mode). */
  kind: 'radial' | 'linear';
  cx: number;
  cy: number;
  /** Radius in pixels where t = 1 (radial only). */
  r: number;
  stops: GradientStop[];
}

/**
 * The sky, sea and Earth's insides as ONE gradient, so no pixel is painted twice. Colours are the
 * same table as backgroundColorAt; because the table is piecewise linear in elevation, and radius is
 * linear in elevation, a radial gradient with those stops reproduces it exactly.
 */
export function backgroundGradient(view: View, size: Size, g: EarthGeometry): BackgroundGradient {
  const eLo = Math.max(g.eLo, -EARTH_RADIUS_M);
  const eHi = Math.max(g.eHi, eLo + 1e-9);
  const radial = g.mode !== 'flat';
  const t = (e: number) => (radial ? (EARTH_RADIUS_M + e) / (EARTH_RADIUS_M + eHi) : (eHi - e) / (eHi - eLo));
  const inside = COLOR_STOPS.filter(([e]) => e > eLo && e < eHi);
  const pts: Array<readonly [number, number]> = [[eLo, backgroundColorAt(eLo)], ...[...inside].reverse(), [eHi, backgroundColorAt(eHi)]];
  // Radial: low elevation = small t, so ascending elevation is ascending t. Linear: the top is t = 0, so reverse.
  const ordered = radial ? pts : [...pts].reverse();
  const stops = ordered.map(([e, color]) => ({ t: clamp(t(e), 0, 1), color }));
  if (radial) {
    const cy = elevToScreenY(view, -EARTH_RADIUS_M, size.h);
    return { kind: 'radial', cx: g.cx, cy, r: (EARTH_RADIUS_M + eHi) / view.mPerPx, stops };
  }
  return { kind: 'linear', cx: 0, cy: 0, r: size.h, stops };
}

/** Screen y of the contour at elevation e at screen column x (arc and flat modes). */
export function contourY(view: View, size: Size, g: EarthGeometry, e: number, x: number): number {
  const top = elevToScreenY(view, e, size.h);
  if (g.mode === 'flat') return top;
  return top + sag((EARTH_RADIUS_M + e) / view.mPerPx, x - g.cx);
}
