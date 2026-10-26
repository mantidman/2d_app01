import { describe, expect, it } from 'vitest';
import { pathBounds } from '../../src/game/svgBounds';
import { SILHOUETTE_BOUNDS } from '../../src/game/silhouettes';
import { SPECIES } from '../../src/game/species';

describe('pathBounds', () => {
  it('measures straight-edged shapes', () => {
    const b = pathBounds('M10 20L110 20L110 70L10 70Z');
    expect([b.minX, b.maxX, b.minY, b.maxY]).toEqual([10, 110, 20, 70]);
    expect(b.longest).toBe(100);
    expect([b.cx, b.cy]).toEqual([60, 45]);
  });

  it('follows curves instead of just their control points', () => {
    // A cubic that bulges to y = 0.75 * 100 = 75 although its control points sit at y = 100.
    const b = pathBounds('M0 0C0 100 100 100 100 0Z');
    expect(b.maxY).toBeCloseTo(75, 1);
    expect(b.maxX).toBeCloseTo(100, 5);
  });

  it('handles several sub-paths', () => {
    const b = pathBounds('M0 0L10 0L10 10ZM200 200L210 200L210 210Z');
    expect([b.maxX, b.maxY]).toEqual([210, 210]);
  });
});

describe('silhouette bounds', () => {
  it.each(SPECIES.map((s) => [s.id, s.silhouette] as const))('%s fills the box well enough to be scaled to real size', (_id, file) => {
    const b = SILHOUETTE_BOUNDS[file];
    expect(b, `no bounds for ${file}`).toBeDefined();
    expect(b.minX).toBeGreaterThanOrEqual(0);
    expect(b.minY).toBeGreaterThanOrEqual(0);
    expect(b.maxX).toBeLessThanOrEqual(256);
    expect(b.maxY).toBeLessThanOrEqual(256);
    // The longest side is what `lengthM` measures, so it must be a solid part of the box.
    expect(b.longest).toBeGreaterThanOrEqual(150);
  });
});
