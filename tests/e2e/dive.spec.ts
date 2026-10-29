import { expect, test, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

interface View {
  x: number;
  elevM: number;
  mPerPx: number;
}
interface Info {
  key: string;
  x: number;
  y: number;
  sizePx: number;
  mode: 'dot' | 'sprite';
}
type GameApi = {
  ready(): boolean;
  getView(): View;
  getSize(): { w: number; h: number };
  setView(v: Partial<View>): void;
  setPaused(p: boolean): void;
  focus(key: string): boolean;
  fitLargest(): string | null;
  showEarth(): void;
  earthInfo(): { mode: 'flat' | 'arc' | 'circle'; seaPx: number; sagPx: number; cx: number; cy: number };
  focusSpecies(id: string): string | null;
  labels(): Array<{ key: string; text: string; x: number; y: number }>;
  getDiscovered(): string[];
  critterInfo(id: string): Info | null;
  critterPoints(): Array<{ key: string; speciesId: string; elevM: number; x: number }>;
  minimapPointOf(key: string): { x: number; y: number } | null;
  minimapPointAt(elevM: number): { x: number; y: number };
};
declare global {
  interface Window {
    __game: GameApi;
  }
}

mkdirSync('artifacts', { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: `artifacts/${test.info().project.name}-${name}.png` });

async function start(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready());
  await page.evaluate(() => window.__game.setPaused(true));
}

async function setView(page: Page, v: Partial<View>) {
  await page.evaluate((x) => window.__game.setView(x), v);
  await page.waitForTimeout(150); // let the HUD pick up the new view
}

const view = (page: Page) => page.evaluate(() => window.__game.getView());
const info = (page: Page, id: string) => page.evaluate((i) => window.__game.critterInfo(i), id);

async function tapCritter(page: Page, id: string) {
  const c = await info(page, id);
  expect(c, `${id} should be on screen`).not.toBeNull();
  await page.mouse.click(c!.x, c!.y);
}

test('HUD, zone and scale bar follow the view', async ({ page }) => {
  await start(page);
  await setView(page, { elevM: -3800, mPerPx: 1 });
  await expect(page.locator('#depth')).toHaveText('3,800 m deep');
  await expect(page.locator('#zone')).toHaveText('Midnight zone');
  await expect(page.locator('#scalebar-label')).toHaveText('100 m');
  await setView(page, { mPerPx: 0.001 });
  await expect(page.locator('#scalebar-label')).toHaveText('10 cm');
  await shot(page, '3800m');
});

test('tapping a big silhouette centres it and discovers it', async ({ page }) => {
  await start(page);
  await setView(page, { elevM: -3800, mPerPx: 1 });
  const c = await info(page, 'titanic-wreck');
  expect(c!.mode).toBe('sprite');
  expect(c!.sizePx).toBeCloseTo(269, 0); // 269 m at 1 m/px
  await tapCritter(page, 'titanic-wreck');

  await expect(page.locator('#card-name')).toHaveText('Wreck of the Titanic');
  await expect(page.locator('#card-badge')).toHaveText('New discovery');
  expect(await page.evaluate(() => window.__game.getDiscovered())).toEqual(['titanic-wreck']);
  await expect(page.locator('#book-btn')).toHaveText(/Book 1\/\d+/);
  await shot(page, 'discovery');

  await page.locator('#book-btn').click();
  await expect(page.locator('.entry.found')).toHaveCount(1);
  await expect(page.locator('.entry.found .range')).toContainText('270 m');
  await shot(page, 'book');
});

test('small things are circles; tapping one zooms in to its true size', async ({ page }) => {
  await start(page);
  const clown = (await page.evaluate(() => window.__game.critterPoints())).find((p) => p.speciesId === 'clownfish')!;
  await setView(page, { elevM: clown.elevM, x: clown.x, mPerPx: 4 });
  const far = await info(page, 'clownfish');
  expect(far, 'clownfish visible when zoomed out').not.toBeNull();
  expect(far!.mode).toBe('dot');
  expect(far!.sizePx).toBeLessThan(1); // 10 cm at 4 m/px
  await shot(page, 'circles');

  await tapCritter(page, 'clownfish');
  await expect(page.locator('#card-name')).toHaveText('Clownfish');
  const near = await info(page, 'clownfish');
  expect(near!.mode).toBe('sprite');
  const size = await page.evaluate(() => window.__game.getSize());
  const want = Math.min(size.w, size.h) * 0.55; // fills over half of the shorter screen side
  expect(near!.sizePx).toBeGreaterThan(want * 0.95);
  expect(near!.sizePx).toBeLessThan(want * 1.05);
  expect((await view(page)).mPerPx).toBeLessThan(0.001);
  await expect(page.locator('#scalebar-label')).toHaveText(/ cm$/);
  await shot(page, 'zoomed-clownfish');
});

test('the opening view is at sea level, about a ship wide', async ({ page }) => {
  await start(page);
  const v = await view(page);
  const size = await page.evaluate(() => window.__game.getSize());
  expect(v.elevM).toBe(0);
  expect(v.mPerPx * size.w).toBeCloseTo(300, 3);
  await shot(page, 'opening');
});

test('circles carry a name tag under them', async ({ page }) => {
  await start(page);
  const fish = (await page.evaluate(() => window.__game.critterPoints())).find((p) => p.speciesId === 'snailfish')!;
  await setView(page, { elevM: fish.elevM, x: fish.x, mPerPx: 4 });
  const c = await info(page, 'snailfish');
  expect(c!.mode).toBe('dot');
  const tag = (await page.evaluate(() => window.__game.labels())).find((l) => l.key === c!.key);
  expect(tag?.text).toBe('Mariana snailfish');
  expect(tag!.y).toBeGreaterThan(c!.y); // below the circle
  expect(Math.abs(tag!.x - c!.x)).toBeLessThan(2); // centred on it
  await shot(page, 'name-tag');

  // Zoomed right in on it, the tag steps aside: you are looking at the animal itself.
  await page.evaluate((k) => window.__game.focus(k), c!.key);
  await expect(page.locator('#card-name')).toHaveText('Mariana snailfish');
  expect((await page.evaluate(() => window.__game.labels())).some((l) => l.key === c!.key)).toBe(false);
});

test('the zoom-out button returns to the largest object nearby', async ({ page }) => {
  await start(page);
  const clown = (await page.evaluate(() => window.__game.critterPoints())).find((p) => p.speciesId === 'clownfish')!;
  await setView(page, { elevM: clown.elevM, x: clown.x, mPerPx: 4 });
  await tapCritter(page, 'clownfish');
  await expect(page.locator('#card-name')).toHaveText('Clownfish');
  expect((await view(page)).mPerPx).toBeLessThan(0.001);

  await page.locator('#zoom-fit').click();
  await expect(page.locator('#card-name')).toHaveText('Blue whale'); // 25 m beats everything else around
  const size = await page.evaluate(() => window.__game.getSize());
  const whale = await info(page, 'blue-whale');
  expect(whale!.mode).toBe('sprite');
  expect(whale!.sizePx).toBeGreaterThan(Math.min(size.w, size.h) * 0.5);
  expect((await view(page)).mPerPx).toBeGreaterThan(0.01);
  await shot(page, 'zoomed-out-to-whale');
});

test('size relations stay true on screen', async ({ page }) => {
  await start(page);
  // A 25 m whale and a 10 cm clownfish, measured through the real renderer at the same zoom.
  const sizes: Record<string, number> = {};
  for (const id of ['blue-whale', 'clownfish']) {
    const p = (await page.evaluate(() => window.__game.critterPoints())).find((q) => q.speciesId === id)!;
    await setView(page, { elevM: p.elevM, x: p.x, mPerPx: 0.25 });
    sizes[id] = (await info(page, id))!.sizePx;
  }
  expect(sizes['blue-whale']).toBeCloseTo(100, 1); // 25 m / 0.25 m per px
  expect(sizes['clownfish']).toBeCloseTo(0.4, 2); // 0.1 m / 0.25 m per px
  expect(sizes['blue-whale'] / sizes['clownfish']).toBeCloseTo(250, 0);
});

test('the minimap is always visible and jumps to an elevation', async ({ page }) => {
  await start(page);
  await expect(page.locator('#minimap')).toBeVisible();
  const box = await page.locator('#minimap').boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x + box!.width).toBeGreaterThan(vp.width - 20); // hugs the right edge
  const canvasBox = (await page.locator('canvas').first().boundingBox())!;
  expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(box!.x + 1); // the playfield stops where the map starts

  const startZoom = (await view(page)).mPerPx;
  const p = await page.evaluate(() => window.__game.minimapPointAt(-2500));
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction((z) => {
    const v = window.__game.getView();
    return Math.abs(v.elevM + 2500) < 1 && Math.abs(v.mPerPx - z) < 1e-9; // flight finished
  }, startZoom);
  await expect(page.locator('#zone')).toHaveText('Midnight zone');
  expect((await view(page)).mPerPx).toBeCloseTo(startZoom, 9); // jumping keeps your zoom
  await shot(page, 'minimap-jump');

  const top = await page.evaluate(() => window.__game.minimapPointAt(408000));
  await page.mouse.click(top.x - 20, top.y); // empty spot left of dots
  await page.waitForFunction(() => window.__game.getView().elevM > 300000);
  await expect(page.locator('#zone')).toHaveText('Space (low Earth orbit)');
});

test('the minimap itself can not be zoomed, only the world view', async ({ page }) => {
  await start(page);
  await setView(page, { elevM: -2500, mPerPx: 1 });
  const before = await page.evaluate(() => window.__game.minimapPointAt(-2500));
  const box = (await page.locator('#minimap').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -900);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(300);
  expect((await view(page)).mPerPx).toBe(1); // wheel over the map does not zoom the world either
  const after = await page.evaluate(() => window.__game.minimapPointAt(-2500));
  expect(after).toEqual(before); // the strip keeps its scale
  expect(await page.locator('#minimap').boundingBox()).toEqual(box);
});

test('clicking a dot on the minimap flies to that creature', async ({ page }) => {
  await start(page);
  const p = await page.evaluate(() => window.__game.minimapPointOf('titanic-wreck#0'));
  expect(p).not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
  await expect(page.locator('#card-name')).toHaveText('Wreck of the Titanic');
  expect(Math.abs((await view(page)).elevM + 3800)).toBeLessThan(1);
});

test('the ISS is found 408 km up and shown at its true size', async ({ page }) => {
  await start(page);
  expect(await page.evaluate(() => window.__game.focus('iss#0'))).toBe(true);
  await expect(page.locator('#card-name')).toHaveText('International Space Station');
  await expect(page.locator('#card-range')).toContainText('370 to 460 km above sea');
  await expect(page.locator('#zone')).toHaveText('Space (low Earth orbit)');
  const c = await info(page, 'iss');
  const v = await view(page);
  expect(c!.sizePx * v.mPerPx).toBeCloseTo(109, 3); // pixels x metres per pixel = the real 109 m
  expect(c!.sizePx).toBeGreaterThan(80);
  await shot(page, 'iss');
});

test('zoom buttons, wheel and drag move the view', async ({ page }) => {
  await start(page);
  await setView(page, { elevM: -500, mPerPx: 1 });
  await page.locator('#zoom-in').click();
  await page.waitForFunction(() => Math.abs(window.__game.getView().mPerPx - 0.5) < 0.01);
  await page.locator('#zoom-out').click();
  await page.locator('#zoom-out').click();
  await page.waitForFunction(() => Math.abs(window.__game.getView().mPerPx - 2) < 0.05);

  const canvas = (await page.locator('canvas').first().boundingBox())!;
  const cx = canvas.x + canvas.width / 2;
  const cy = canvas.y + canvas.height / 2;
  await page.mouse.move(cx, cy);
  const before = (await view(page)).mPerPx;
  await page.mouse.wheel(0, -600);
  await page.waitForFunction((b) => window.__game.getView().mPerPx < b * 0.8, before);

  await setView(page, { elevM: -500, mPerPx: 1 });
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 120, { steps: 6 });
  await page.mouse.up();
  const dragged = await view(page);
  expect(dragged.elevM).toBeGreaterThan(-500 + 60); // dragging down moves the view up
});

test('book entries are clickable and fly to that creature', async ({ page }) => {
  await start(page);
  await page.locator('#book-btn').click();
  await expect(page.locator('#book')).toBeVisible();
  await page.locator('.entry[data-id="iss"]').click();
  await expect(page.locator('#book')).toBeHidden();
  await expect(page.locator('#card-name')).toHaveText('International Space Station');
  await expect(page.locator('#zone')).toHaveText('Space (low Earth orbit)');

  // Undiscovered entries ("???") work too, and pick the nearest copy.
  await page.locator('#book-btn').click();
  await page.locator('.entry[data-id="anglerfish"]').click();
  await expect(page.locator('#card-name')).toHaveText('Anglerfish');
  const v = await view(page);
  const copies = (await page.evaluate(() => window.__game.critterPoints())).filter((p) => p.speciesId === 'anglerfish');
  const nearest = copies.reduce((best, p) => (Math.abs(p.elevM - v.elevM) < Math.abs(best.elevM - v.elevM) ? p : best));
  expect(Math.abs(nearest.elevM - v.elevM)).toBeLessThan(1); // we ended up on one of them
  await shot(page, 'book-jump');
});

test('discovery survives a reload', async ({ page }) => {
  await start(page);
  await page.evaluate(() => window.__game.focus('titanic-wreck#0'));
  await expect(page.locator('#card-name')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready());
  expect(await page.evaluate(() => window.__game.getDiscovered())).toEqual(['titanic-wreck']);
});

test('views from space to the trench render', async ({ page }) => {
  await start(page);
  for (const [name, v] of [
    ['space', { elevM: 450000, mPerPx: 200 }],
    ['karman', { elevM: 100000, mPerPx: 40 }],
    ['sky', { elevM: 6500, mPerPx: 5 }],
    ['surface', { elevM: 0, mPerPx: 1 }],
    ['abyss', { elevM: -4000, mPerPx: 1 }],
    ['trench', { elevM: -10300, mPerPx: 1 }],
    ['whole-world', { elevM: 294500, mPerPx: 637 }],
  ] as const) {
    await setView(page, v);
    await shot(page, name);
  }
});

const EARTH_R = 6_371_000;

test('the Earth curves into view as you zoom out', async ({ page }) => {
  await start(page);
  const modes: Array<[number, string]> = [
    [1, 'flat'],
    [400, 'arc'],
  ];
  for (const [m, mode] of modes) {
    await setView(page, { elevM: 0, mPerPx: m });
    expect((await page.evaluate(() => window.__game.earthInfo())).mode, `${m} m/px`).toBe(mode);
    await shot(page, `curve-${m}`);
  }
  await setView(page, { elevM: 2000, mPerPx: 1500 });
  const mid = await page.evaluate(() => window.__game.earthInfo());
  expect(mid.mode).not.toBe('flat');
  expect(mid.sagPx).toBeGreaterThan(2); // the horizon visibly bends
  await shot(page, 'curve-1500');

  await setView(page, { elevM: -EARTH_R, mPerPx: 20000 });
  const ball = await page.evaluate(() => window.__game.earthInfo());
  expect(ball.mode).toBe('circle');
  expect(ball.seaPx).toBeCloseTo(EARTH_R / 20000, 6); // 318.55 px: the true radius at this scale
  await expect(page.locator('#depth')).toHaveText('6,371 km deep');
  await expect(page.locator('#zone')).toHaveText('Inner core');
  await expect(page.locator('#scalebar-label')).toHaveText('2,000 km');
  expect(await page.evaluate(() => window.__game.labels())).toEqual([]); // no creature tags piling up at planet scale
  await shot(page, 'earth-centre');
});

test('zooming out with the wheel pulls back until the whole planet is in view', async ({ page }) => {
  await start(page);
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  let last = (await view(page)).mPerPx;
  for (let i = 0; i < 30 && last < 59000; i++) {
    await page.mouse.wheel(0, 1500);
    await page.waitForFunction((l) => window.__game.getView().mPerPx > l, last);
    last = (await view(page)).mPerPx;
  }
  const v = await view(page);
  expect(v.mPerPx).toBeGreaterThan(59000);
  expect(v.elevM).toBeCloseTo(-EARTH_R, -3); // eased all the way to the centre of the planet
  const info = await page.evaluate(() => window.__game.earthInfo());
  const size = await page.evaluate(() => window.__game.getSize());
  expect(info.mode).toBe('circle');
  expect(info.seaPx * 2).toBeLessThan(Math.max(size.w, size.h)); // the whole ball fits
  await shot(page, 'earth-whole-wheel');
});

test('the Earth button shows the whole planet and the way back down works', async ({ page }) => {
  await start(page);
  await page.locator('#zoom-earth').click();
  await page.waitForFunction(() => {
    const v = window.__game.getView();
    const s = window.__game.getSize();
    const target = (2 * 6371000) / (0.9 * Math.min(s.w, s.h)); // flight finished: exactly the whole-Earth zoom
    return Math.abs(v.mPerPx - target) < 1e-6 && Math.abs(v.elevM + 6371000) < 1e-3;
  });
  const info = await page.evaluate(() => window.__game.earthInfo());
  const size = await page.evaluate(() => window.__game.getSize());
  expect(info.mode).toBe('circle');
  expect(info.seaPx * 2).toBeCloseTo(0.9 * Math.min(size.w, size.h), 0); // 90% of the shorter side
  await shot(page, 'earth-whole-button');

  // Back to the surface: fly to the nearest creature, then to the largest one around it.
  await page.locator('#zoom-fit').click();
  await expect(page.locator('#card-name')).toBeVisible();
  expect((await view(page)).mPerPx).toBeLessThan(5);
});

test('the height profile panel compares Everest, Mauna Kea and Mauna Loa', async ({ page }) => {
  await start(page);
  await page.locator('#peaks-btn').click();
  await expect(page.locator('#peaks')).toBeVisible();
  await expect(page.locator('.peak-card')).toHaveCount(3);

  // Above sea level, Everest wins; Mauna Kea only edges out Mauna Loa by a few dozen metres.
  await expect(page.locator('#peaks-rank li.winner')).toContainText('Mount Everest: 8,849 m');
  await expect(page.locator('#peaks-rank')).toContainText('only 38 m higher');
  await shot(page, 'peaks-above-sea');

  // From the base, Mauna Kea is the tallest mountain.
  await page.locator('#peaks-measures button[data-measure="base-to-summit"]').click();
  await expect(page.locator('#peaks-rank li.winner')).toContainText('Mauna Kea: 10,205 m');
  await expect(page.locator('.peak-card.winner')).toHaveAttribute('data-id', 'mauna-kea');
  await shot(page, 'peaks-base-to-summit');

  // With the pressed-down crust only Mauna Loa has a figure.
  await page.locator('#peaks-measures button[data-measure="with-depression"]').click();
  await expect(page.locator('#peaks-rank li.winner')).toContainText('Mauna Loa: 17,169 m');
  await expect(page.locator('#peaks-rank')).toContainText('No sourced figure for the others');
  await shot(page, 'peaks-with-depression');
});

test('flying to a summit from the profile panel', async ({ page }) => {
  await start(page);
  await page.locator('#peaks-btn').click();
  await page.locator('[data-fly="everest"]').click();
  await expect(page.locator('#peaks')).toBeHidden();
  await page.waitForFunction(() => Math.abs(window.__game.getView().elevM - 8848.86) < 0.01);
  await expect(page.locator('#depth')).toHaveText('8,849 m above');
  await expect(page.locator('#zone')).toHaveText('Troposphere');
  await shot(page, 'peaks-everest-summit');

  await page.locator('#peaks-btn').click();
  await page.locator('[data-fly="mauna-loa"]').click();
  await page.waitForFunction(() => Math.abs(window.__game.getView().elevM - 4169) < 0.01);
  await expect(page.locator('#depth')).toHaveText('4,169 m above');
});
