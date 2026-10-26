/**
 * World model. Everything is in metres and drawn at true scale from one continuous zoom:
 * `mPerPx` is how many metres one screen pixel covers. Elevation: 0 = sea level, negative = below.
 * Horizontally the world is a column WORLD_W_M wide that wraps around.
 */
export const TOP_M = 600000;
export const BOTTOM_M = -11000;
export const WORLD_W_M = 1000;

/** Size of the playfield in CSS pixels; it follows the window, so these functions take it as a parameter. */
export interface Size {
  w: number;
  h: number;
}

export const MIN_M_PER_PX = 0.00005;
/** Zoomed out this far the whole 611 km world fits on any screen at least 560 px tall. */
export const MAX_M_PER_PX = 1100;
export const DEFAULT_M_PER_PX = 1;

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

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Shortest signed horizontal distance on the wrapping column. */
export function wrapDx(dx: number, w = WORLD_W_M): number {
  return ((((dx + w / 2) % w) + w) % w) - w / 2;
}

export function clampView(v: View): View {
  return {
    x: wrapDx(v.x),
    elevM: clamp(v.elevM, BOTTOM_M, TOP_M),
    mPerPx: clamp(v.mPerPx, MIN_M_PER_PX, MAX_M_PER_PX),
  };
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

/** Zoom by `factor` (>1 zooms out) keeping the world point under the screen anchor fixed. */
export function zoomAbout(view: View, factor: number, size: Size, ax = size.w / 2, ay = size.h / 2): View {
  const m = clamp(view.mPerPx * factor, MIN_M_PER_PX, MAX_M_PER_PX);
  const wx = view.x + (ax - size.w / 2) * view.mPerPx;
  const we = screenYToElev(view, ay, size.h);
  return clampView({ x: wx - (ax - size.w / 2) * m, elevM: we + (ay - size.h / 2) * m, mPerPx: m });
}

/** On-screen size in px of the zoom a focused creature is shown at. */
export function focusPx(size: Size): number {
  return Math.min(size.w, size.h) * FOCUS_FRACTION;
}

/** Zoom level at which a thing of this size fills FOCUS_FRACTION of the shorter screen side. */
export function focusMPerPx(lengthM: number, size: Size): number {
  return clamp(lengthM / focusPx(size), MIN_M_PER_PX, MAX_M_PER_PX);
}
