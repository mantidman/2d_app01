/**
 * World model. Everything is in metres and drawn at true scale from one continuous zoom:
 * `mPerPx` is how many metres one screen pixel covers. Elevation: 0 = sea level, negative = below.
 * Horizontally the world is a column WORLD_W_M wide that wraps around.
 */
export const TOP_M = 600000;
export const BOTTOM_M = -11000;
export const WORLD_W_M = 1000;
/** Mean radius of the Earth (IUGG): the world is a sphere of this radius, its centre this far below sea level. */
export const EARTH_RADIUS_M = 6_371_000;

/** Size of the playfield in CSS pixels; it follows the window, so these functions take it as a parameter. */
export interface Size {
  w: number;
  h: number;
}

export const MIN_M_PER_PX = 0.00005;
/** Zoomed out this far the whole Earth (12,742 km across) fits on a phone-sized screen. */
export const MAX_M_PER_PX = 60000;
/** Zooming out past this starts pulling the camera back towards the Earth's centre, so the planet comes into view. */
export const PULL_BACK_FROM_M_PER_PX = 5000;
/** The opening view is about as wide as a big ship is long. */
export const DEFAULT_VIEW_WIDTH_M = 300;

/** Things smaller than this on screen are drawn as a circle of this diameter. */
export const DOT_PX = 14;
/** When focusing a creature, its longest side fills this fraction of the shorter screen side. */
export const FOCUS_FRACTION = 0.55;

export interface View {
  /** Horizontal centre in metres, kept in [-WORLD_W_M/2, WORLD_W_M/2). */
  x: number;
  /** Elevation at the screen centre in metres. */
  elevM: number;
  mPerPx: number;
}

export function defaultMPerPx(size: Size): number {
  return clamp(DEFAULT_VIEW_WIDTH_M / size.w, MIN_M_PER_PX, MAX_M_PER_PX);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Shortest signed horizontal distance on the wrapping column. */
export function wrapDx(dx: number, w = WORLD_W_M): number {
  return ((((dx + w / 2) % w) + w) % w) - w / 2;
}

/** Half the height of a typical screen: how far past the world's edges the view centre may wander. */
const CLAMP_HALF_H_PX = 350;

export function clampView(v: View): View {
  const m = clamp(v.mPerPx, MIN_M_PER_PX, MAX_M_PER_PX);
  const lowest = Math.max(-EARTH_RADIUS_M, BOTTOM_M - CLAMP_HALF_H_PX * m);
  const highest = TOP_M + Math.min(CLAMP_HALF_H_PX * m, EARTH_RADIUS_M);
  return { x: wrapDx(v.x), elevM: clamp(v.elevM, lowest, highest), mPerPx: m };
}

export function sizeInPx(lengthM: number, mPerPx: number): number {
  return lengthM / mPerPx;
}

export type RenderMode = 'dot' | 'sprite';

export function renderMode(sizePx: number): RenderMode {
  return sizePx < DOT_PX ? 'dot' : 'sprite';
}

export function elevToScreenY(view: View, elevM: number, h: number): number {
  return h / 2 + (view.elevM - elevM) / view.mPerPx;
}

export function screenYToElev(view: View, y: number, h: number): number {
  return view.elevM - (y - h / 2) * view.mPerPx;
}

export function xToScreenX(view: View, xM: number, w: number): number {
  return w / 2 + wrapDx(xM - view.x) / view.mPerPx;
}

/**
 * Zoom by `factor` (>1 zooms out) keeping the world point under the screen anchor fixed.
 * Zooming out past PULL_BACK_FROM_M_PER_PX also eases the camera towards the Earth's centre: the
 * remaining distance shrinks linearly with log(zoom), reaching the centre at the widest zoom.
 */
export function zoomAbout(view: View, factor: number, size: Size, ax = size.w / 2, ay = size.h / 2): View {
  const m = clamp(view.mPerPx * factor, MIN_M_PER_PX, MAX_M_PER_PX);
  const wx = view.x + (ax - size.w / 2) * view.mPerPx;
  const we = screenYToElev(view, ay, size.h);
  const out = clampView({ x: wx - (ax - size.w / 2) * m, elevM: we + (ay - size.h / 2) * m, mPerPx: m });
  if (factor <= 1 || m <= PULL_BACK_FROM_M_PER_PX) return out;
  const from = Math.max(view.mPerPx, PULL_BACK_FROM_M_PER_PX);
  const span = Math.log(MAX_M_PER_PX) - Math.log(from);
  if (span < 1e-9) return out;
  const keep = (Math.log(MAX_M_PER_PX) - Math.log(m)) / span;
  return clampView({ x: out.x * keep, elevM: -EARTH_RADIUS_M + (out.elevM + EARTH_RADIUS_M) * keep, mPerPx: m });
}

/** Zoom at which the whole Earth fills 90% of the shorter screen side. */
export function wholeEarthMPerPx(size: Size): number {
  return clamp((2 * EARTH_RADIUS_M) / (0.9 * Math.min(size.w, size.h)), MIN_M_PER_PX, MAX_M_PER_PX);
}

/** On-screen size in px of the zoom a focused creature is shown at. */
export function focusPx(size: Size): number {
  return Math.min(size.w, size.h) * FOCUS_FRACTION;
}

/** Zoom level at which a thing of this size fills FOCUS_FRACTION of the shorter screen side. */
export function focusMPerPx(lengthM: number, size: Size): number {
  return clamp(lengthM / focusPx(size), MIN_M_PER_PX, MAX_M_PER_PX);
}
