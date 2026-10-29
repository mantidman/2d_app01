import { describe, expect, it } from 'vitest';
import { clipPolygon, clipSegment } from '../../src/game/clip';

const R = { x0: 0, y0: 0, x1: 100, y1: 100 };
const area = (p: Array<{ x: number; y: number }>) => Math.abs(p.reduce((a, q, i) => a + (q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y), 0)) / 2;

describe('clipPolygon', () => {
  it('keeps a polygon that is already inside', () => {
    const tri = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 50, y: 80 }];
    expect(area(clipPolygon(tri, R))).toBeCloseTo(area(tri), 9);
  });

  it('cuts a huge polygon down to the screen', () => {
    const huge = [{ x: -1e9, y: -1e9 }, { x: 1e9, y: -1e9 }, { x: 1e9, y: 1e9 }, { x: -1e9, y: 1e9 }];
    expect(area(clipPolygon(huge, R))).toBeCloseTo(100 * 100, 6);
  });

  it('clips a half-plane flank, like a mountain side seen very close up', () => {
    const rock = [{ x: -1e8, y: 50 }, { x: 1e8, y: 50 }, { x: 1e8, y: 1e8 }, { x: -1e8, y: 1e8 }];
    expect(area(clipPolygon(rock, R))).toBeCloseTo(100 * 50, 6);
  });

  it('drops a polygon that is completely outside', () => {
    expect(clipPolygon([{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 250, y: 300 }], R)).toHaveLength(0);
  });
});

describe('clipSegment', () => {
  it('trims a long segment to the rectangle', () => {
    const [a, b] = clipSegment({ x: -100, y: 50 }, { x: 300, y: 50 }, R)!;
    expect([a.x, a.y, b.x, b.y]).toEqual([0, 50, 100, 50]);
  });

  it('returns null for a segment that misses', () => {
    expect(clipSegment({ x: -10, y: 200 }, { x: 300, y: 250 }, R)).toBeNull();
  });

  it('keeps a segment that is fully inside', () => {
    const seg = clipSegment({ x: 10, y: 10 }, { x: 20, y: 30 }, R)!;
    expect(seg[0]).toEqual({ x: 10, y: 10 });
    expect(seg[1]).toEqual({ x: 20, y: 30 });
  });
});
