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

  const p = await page.evaluate(() => window.__game.minimapPointAt(-2500));
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => {
    const v = window.__game.getView();
    return Math.abs(v.elevM + 2500) < 1 && Math.abs(v.mPerPx - 1) < 1e-6; // flight finished
  });
  await expect(page.locator('#zone')).toHaveText('Midnight zone');
  expect((await view(page)).mPerPx).toBeCloseTo(1, 3); // jumping keeps your zoom
  await shot(page, 'minimap-jump');

  const top = await page.evaluate(() => window.__game.minimapPointAt(408000));
  await page.mouse.click(top.x - 20, top.y); // empty spot left of dots
  await page.waitForFunction(() => window.__game.getView().elevM > 300000);
  await expect(page.locator('#zone')).toHaveText('Space (low Earth orbit)');
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
