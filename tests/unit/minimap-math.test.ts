import { describe, expect, it } from 'vitest';
import { elevToFrac, fracToElev } from '../../src/game/minimap-math';
import { BOTTOM_M, TOP_M } from '../../src/game/world';
import { formatLength, niceScale } from '../../src/game/format';

describe('minimap mapping', () => {
  it('runs from the top of the world (0) to the trench (1)', () => {
    expect(elevToFrac(TOP_M)).toBe(0);
    expect(elevToFrac(BOTTOM_M)).toBe(1);
  });

  it('is strictly monotonic and invertible', () => {
    let prev = -1;
    for (const m of [TOP_M, 408000, 100000, 41419, 12000, 8849, 0, -3800, -10935, BOTTOM_M]) {
      const f = elevToFrac(m);
      expect(f).toBeGreaterThan(prev);
      expect(fracToElev(f)).toBeCloseTo(m, 3);
      prev = f;
    }
  });

  it('gives the sea and the sky below 12 km most of the strip', () => {
    expect(elevToFrac(0) - elevToFrac(12000)).toBeGreaterThan(0.2);
    expect(1 - elevToFrac(0)).toBeGreaterThan(0.4);
  });
});

describe('scale bar and lengths', () => {
  it('formats sizes from millimetres to kilometres', () => {
    expect(formatLength(0.004)).toBe('4 mm');
    expect(formatLength(0.1)).toBe('10 cm');
    expect(formatLength(0.33)).toBe('33 cm');
    expect(formatLength(25)).toBe('25 m');
    expect(formatLength(269)).toBe('270 m');
    expect(formatLength(1500)).toBe('1.5 km');
  });

  it('picks a round bar that fits and measures the right number of pixels', () => {
    const cases: Array<[number, number, string]> = [
      [1, 100, '100 m'],
      [0.001, 0.1, '10 cm'],
      [0.0005, 0.05, '5 cm'],
      [637, 50000, '50 km'],
      [0.2, 20, '20 m'],
    ];
    for (const [mPerPx, meters, label] of cases) {
      const s = niceScale(mPerPx, 110);
      expect(s.label).toBe(label);
      expect(s.meters).toBeCloseTo(meters, 9);
      expect(s.px).toBeCloseTo(meters / mPerPx, 6);
      expect(s.px).toBeLessThanOrEqual(110);
      expect(s.px).toBeGreaterThan(30);
    }
  });
});
