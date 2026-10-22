// The tutorial and the combo trials, in the production build: a trial done
// by watching the demonstration then by hand with the keyboard, a lesson
// step passed, and progress kept after a reload.
import { test, expect } from '@playwright/test';
import { openGame, waitForScene, expectNoErrors } from './helpers.js';

/** @param {import('@playwright/test').Page} page */
async function openTraining(page) {
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await waitForScene(page, 'learn');
}

test('combo trial: the demonstration, then the trial done by hand on the keyboard, and the ✓ kept after a reload', async ({ page }) => {
  const errors = await openGame(page);
  await openTraining(page);
  await page.getByRole('button', { name: /Combo trials/ }).click();
  await page.getByRole('button', { name: /1\. Cancel into a special/ }).click();
  await waitForScene(page, 'match');
  const panel = page.getByRole('complementary', { name: 'Combo trial' });
  // Each step says how to do it with the player's keys.
  await expect(panel).toContainText('Keys S, S+D, D, then K');
  await page.getByRole('button', { name: 'Demonstrate' }).click();
  await expect(panel).toContainText('That’s the whole combo');
  // Wait for the reset after the demonstration, then do it by hand: K, then S, S+D, D + K.
  await page.waitForFunction(() => /Your turn|Now you try/.test(document.querySelector('.coach-status')?.textContent ?? '') && window.__game.scene.training.activity.resetIn === -1);
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(120);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(40);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(40);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(30);
  await page.keyboard.press('KeyK');
  await page.keyboard.up('KeyD');
  await expect(panel).toContainText('Trial complete!');
  // The ✓ survives a reload.
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene?.name === 'title');
  await openTraining(page);
  await page.getByRole('button', { name: /Combo trials/ }).click();
  await expect(page.getByRole('button', { name: /✓ 1\. Cancel into a special/ })).toBeVisible();
  expectNoErrors(errors);
});

test('tutorial: a lesson step checks what you did and moves on', async ({ page }) => {
  const errors = await openGame(page);
  await openTraining(page);
  await page.getByRole('button', { name: /^Tutorial/ }).click();
  await page.getByRole('button', { name: /2\. Attacks/ }).click();
  await waitForScene(page, 'match');
  const panel = page.getByRole('complementary', { name: 'Tutorial lesson' });
  await expect(panel).toContainText('Press Light (J /');
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(500);
  }
  await expect(panel).toContainText('Press Medium (K /');
  expectNoErrors(errors);
});
