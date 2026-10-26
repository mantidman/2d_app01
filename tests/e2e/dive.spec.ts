import { expect, test, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

type GameApi = {
  ready(): boolean;
  setElevation(m: number): void;
  getElevation(): number;
  setPaused(p: boolean): void;
  getDiscovered(): string[];
  screenPositionOf(id: string): { x: number; y: number } | null;
};
declare global {
  interface Window {
    __game: GameApi;
  }
}

mkdirSync('artifacts', { recursive: true });

async function start(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready());
  await page.evaluate(() => window.__game.setPaused(true));
}

async function diveTo(page: Page, m: number) {
  await page.evaluate((v) => window.__game.setElevation(v), m);
  await page.waitForFunction((v) => Math.abs(window.__game.getElevation() - v) < 1, m);
  await page.waitForTimeout(150); // let the HUD pick up the new elevation
}

test('HUD follows the elevation', async ({ page }) => {
  await start(page);
  await diveTo(page, -3800);
  await expect(page.locator('#depth')).toHaveText('3,800 m deep');
  await expect(page.locator('#zone')).toHaveText('Midnight zone');
  await page.screenshot({ path: `artifacts/${test.info().project.name}-3800m.png` });
});

test('tapping a silhouette discovers it and fills the book', async ({ page }) => {
  await start(page);
  await diveTo(page, -3800);
  const pos = await page.evaluate(() => window.__game.screenPositionOf('titanic-wreck'));
  expect(pos).not.toBeNull();
  await page.mouse.click(pos!.x, pos!.y);

  await expect(page.locator('#card-name')).toHaveText('Wreck of the Titanic');
  await expect(page.locator('#card-badge')).toHaveText('New discovery');
  expect(await page.evaluate(() => window.__game.getDiscovered())).toEqual(['titanic-wreck']);
  await expect(page.locator('#book-btn')).toHaveText(/Book 1\/\d+/);
  await page.screenshot({ path: `artifacts/${test.info().project.name}-discovery.png` });

  await page.locator('#book-btn').click();
  await expect(page.locator('.entry.found')).toHaveCount(1);
  await page.screenshot({ path: `artifacts/${test.info().project.name}-book.png` });
});

test('discovery survives a reload', async ({ page }) => {
  await start(page);
  await diveTo(page, -3800);
  const pos = await page.evaluate(() => window.__game.screenPositionOf('titanic-wreck'));
  await page.mouse.click(pos!.x, pos!.y);
  await expect(page.locator('#card-name')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready());
  expect(await page.evaluate(() => window.__game.getDiscovered())).toEqual(['titanic-wreck']);
});

test('sky and surface views render', async ({ page }) => {
  await start(page);
  for (const [name, m] of [['sky', 6500], ['surface', 0], ['trench', -10300]] as const) {
    await diveTo(page, m);
    await page.screenshot({ path: `artifacts/${test.info().project.name}-${name}.png` });
  }
});
