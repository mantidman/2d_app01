export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Sutherland-Hodgman: the part of a polygon inside a rectangle. Mountains are tens of thousands of
 * pixels wide when zoomed in, far outside what a GPU can draw precisely, so shapes are clipped to the
 * screen (in doubles) before they are drawn.
 */
export function clipPolygon(poly: Pt[], r: Rect): Pt[] {
  const edges: Array<{ inside: (p: Pt) => boolean; cut: (a: Pt, b: Pt) => Pt }> = [
    { inside: (p) => p.x >= r.x0, cut: (a, b) => ({ x: r.x0, y: a.y + ((b.y - a.y) * (r.x0 - a.x)) / (b.x - a.x) }) },
    { inside: (p) => p.x <= r.x1, cut: (a, b) => ({ x: r.x1, y: a.y + ((b.y - a.y) * (r.x1 - a.x)) / (b.x - a.x) }) },
    { inside: (p) => p.y >= r.y0, cut: (a, b) => ({ y: r.y0, x: a.x + ((b.x - a.x) * (r.y0 - a.y)) / (b.y - a.y) }) },
    { inside: (p) => p.y <= r.y1, cut: (a, b) => ({ y: r.y1, x: a.x + ((b.x - a.x) * (r.y1 - a.y)) / (b.y - a.y) }) },
  ];
  let out = poly;
  for (const e of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (e.inside(cur)) {
        if (!e.inside(prev)) out.push(e.cut(prev, cur));
        out.push(cur);
      } else if (e.inside(prev)) {
        out.push(e.cut(prev, cur));
      }
    }
    if (out.length === 0) break;
  }
  return out;
}

/** Liang-Barsky: the part of a segment inside a rectangle, or null. */
export function clipSegment(a: Pt, b: Pt, r: Rect): [Pt, Pt] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const checks: Array<[number, number]> = [
    [-dx, a.x - r.x0],
    [dx, r.x1 - a.x],
    [-dy, a.y - r.y0],
    [dy, r.y1 - a.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return null;
        t0 = Math.max(t0, t);
      } else {
        if (t < t0) return null;
        t1 = Math.min(t1, t);
      }
    }
  }
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}
