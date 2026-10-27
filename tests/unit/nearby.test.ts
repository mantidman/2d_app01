import { describe, expect, it } from 'vitest';
import { NEARBY_RADIUS_M, pickLargestNearby } from '../../src/game/nearby';
import { WORLD_W_M } from '../../src/game/world';

const c = (key: string, lengthM: number, elevM: number, x = 0) => ({ key, lengthM, elevM, x });

describe('pickLargestNearby', () => {
  const at = { x: 0, elevM: -10 };

  it('picks the biggest thing within range, not the closest', () => {
    const items = [c('fish', 0.1, -10), c('whale', 25, -400), c('ship', 269, -3800)];
    expect(pickLargestNearby(items, at)?.key).toBe('whale'); // the ship is out of range
  });

  it('breaks ties by distance', () => {
    const items = [c('far', 25, -900), c('near', 25, -100)];
    expect(pickLargestNearby(items, at)?.key).toBe('near');
  });

  it('measures horizontal distance around the wrapping column', () => {
    const items = [c('across-the-seam', 10, -10, WORLD_W_M / 2 - 20), c('small', 1, -10, 5)];
    expect(pickLargestNearby(items, { x: -WORLD_W_M / 2 + 20, elevM: -10 })?.key).toBe('across-the-seam');
  });

  it('falls back to the closest thing when nothing is in range', () => {
    const items = [c('a', 5, 100000), c('b', 50, 408000)];
    expect(pickLargestNearby(items, { x: 0, elevM: 90000 })?.key).toBe('a');
    expect(NEARBY_RADIUS_M).toBeGreaterThan(500);
  });

  it('returns null with no items', () => {
    expect(pickLargestNearby([], at)).toBeNull();
  });
});
