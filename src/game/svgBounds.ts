export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  /** The longer side of the drawing: this is the dimension a species' `lengthM` refers to. */
  longest: number;
  cx: number;
  cy: number;
}

const STEPS = 32;

/** Exact-enough bounds of an absolute M/L/C/Z path (the only commands silhouettes may use). */
export function pathBounds(d: string): Bounds {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g);
  if (!tokens) throw new Error('empty path');
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/^[MLCZ]$/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'Z') {
      cx = sx;
      cy = sy;
    } else if (cmd === 'M' || cmd === 'L') {
      cx = num();
      cy = num();
      if (cmd === 'M') {
        sx = cx;
        sy = cy;
        cmd = 'L';
      }
      add(cx, cy);
    } else if (cmd === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      for (let s = 1; s <= STEPS; s++) {
        const t = s / STEPS;
        const u = 1 - t;
        add(
          u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
        );
      }
      cx = x;
      cy = y;
    } else {
      throw new Error(`unsupported path command near token ${i}: ${tokens[i]}`);
    }
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return { minX, minY, maxX, maxY, width, height, longest: Math.max(width, height), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}
