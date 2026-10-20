// Smoke tests: the game loads, a CPU match starts and plays, local versus
// takes input from both keyboard sets, training overlays toggle, and
// nothing logs an error.
import { test, expect } from '@playwright/test';
import { openGame, waitForScene, expectNoErrors } from './helpers.js';

test('the game loads to the title screen without errors', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.getByRole('heading', { name: 'Dusk Duel' })).toBeVisible();
  await expect(page.getByText('Pixel art / character assets by Luiz Melo')).toBeVisible();
  expectNoErrors(errors);
});

test('a CPU match starts, the round begins and the CPU fights', async ({ page }) => {
  const errors = await openGame(page);
  await page.getByRole('button', { name: 'Versus CPU' }).click();
  await waitForScene(page, 'select');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitForScene(page, 'match');
  await page.waitForFunction(() => window.__game.scene.state.phase === 'fight');
  // The CPU acts on its own: wait until it has started some move or walked.
  await page.waitForFunction(() => {
    const cpu = window.__game.scene.state.fighters[1];
    return cpu.state !== 'stand' || cpu.x !== 622 * 256;
  });
  // Player 1 walks forward with the keyboard.
  const x0 = await page.evaluate(() => window.__game.scene.state.fighters[0].x);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  const x1 = await page.evaluate(() => window.__game.scene.state.fighters[0].x);
  expect(x1).not.toBe(x0);
  expectNoErrors(errors);
});

test('local versus: each keyboard set drives its own player', async ({ page }) => {
  const errors = await openGame(page);
  await page.getByRole('button', { name: 'Versus (2 players)' }).click();
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitForScene(page, 'match');
  await page.waitForFunction(() => window.__game.scene.state.phase === 'fight');
  const before = await page.evaluate(() => window.__game.scene.state.fighters.map((f) => f.x));
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  const after = await page.evaluate(() => window.__game.scene.state.fighters.map((f) => f.x));
  expect(after[0]).toBe(before[0]);
  expect(after[1]).toBeGreaterThan(before[1]);
  expectNoErrors(errors);
});

test('training mode: overlays toggle, frame step advances one frame, the menu opens', async ({ page }) => {
  const errors = await openGame(page);
  await page.getByRole('button', { name: 'Training mode' }).click();
  await page.getByRole('button', { name: 'Start training' }).click();
  await waitForScene(page, 'match');
  const show = () => page.evaluate(() => ({ ...window.__game.scene.training.show }));
  expect((await show()).boxes).toBe(true);
  await page.keyboard.press('Digit1');
  expect((await show()).boxes).toBe(false);
  await page.keyboard.press('Digit2');
  expect((await show()).frameMeter).toBe(false);
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Digit2');

  // Pause, then step exactly one frame at a time.
  await page.getByRole('button', { name: 'Pause / play (P)' }).click();
  const f0 = await page.evaluate(() => window.__game.scene.state.frame);
  await page.keyboard.press('KeyN');
  await page.waitForFunction((f) => window.__game.scene.state.frame === f + 1, f0);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__game.scene.state.frame)).toBe(f0 + 1);

  // An attack shows up in the frame meter and its frame data.
  await page.keyboard.press('KeyP');
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => window.__game.scene.training.lastMove === '5L');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('dialog', { name: 'Training menu' })).toBeVisible();
  await expect(page.getByText('What this shows:').first()).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  expectNoErrors(errors);
});

test('the move list and settings open from the title', async ({ page }) => {
  const errors = await openGame(page);
  await page.getByRole('button', { name: 'Move list' }).click();
  await expect(page.getByRole('cell', { name: '236+M' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('Player 1 keyboard')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  expectNoErrors(errors);
});

test('phone: touch controls appear in a match and move the fighter', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = await openGame(page);
  await page.getByRole('button', { name: 'Versus CPU' }).tap();
  await page.getByRole('button', { name: 'Fight!' }).tap();
  await waitForScene(page, 'match');
  await expect(page.locator('.touch.visible')).toBeVisible();
  await expect(page.locator('.tb-sp')).toBeVisible();
  // Press the heavy button: player 1 starts 5H.
  await page.waitForFunction(() => window.__game.scene.state.phase === 'fight');
  const h = page.locator('.tb-h');
  const box = await h.boundingBox();
  await page.dispatchEvent('.tb-h', 'pointerdown', { pointerId: 7, clientX: box.x + 10, clientY: box.y + 10 });
  await page.waitForFunction(() => window.__game.scene.state.fighters[0].move === '5H');
  await page.dispatchEvent('.tb-h', 'pointerup', { pointerId: 7 });
  expectNoErrors(errors);
  await context.close();
});

test('captions for important sounds appear when turned on', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      const s = JSON.parse(localStorage.getItem('dusk-duel-settings-v1') ?? '{}');
      localStorage.setItem('dusk-duel-settings-v1', JSON.stringify({ ...s, captions: true }));
    } catch {}
  });
  const errors = await openGame(page);
  await page.getByRole('button', { name: 'Versus CPU' }).click();
  await waitForScene(page, 'select');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitForScene(page, 'match');
  await expect(page.locator('.captions')).toContainText('Round start');
  await expect(page.locator('.captions')).toContainText('Fight!');
  expectNoErrors(errors);
});
