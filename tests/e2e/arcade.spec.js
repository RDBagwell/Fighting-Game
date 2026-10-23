// Arcade mode end to end: six fights (one lost and continued), a reload
// in the middle that carries the run on, the rival last, the ending, the
// clear summary, and the ✓ on the character afterwards. Each match is
// decided by setting health to zero, so the test doesn't depend on
// beating the CPU.
import { test, expect } from '@playwright/test';
import { openGame, waitForScene, expectNoErrors } from './helpers.js';

/**
 * Plays the VS screen and the match, then decides it: one round already
 * won, and the loser's health to zero.
 * @param {import('@playwright/test').Page} page
 * @param {0 | 1} winner
 */
async function playFight(page, winner) {
  await waitForScene(page, 'vs');
  await page.keyboard.press('Enter');
  await waitForScene(page, 'match');
  await page.waitForFunction(() => window.__game.scene.state.phase === 'fight');
  await page.evaluate((w) => {
    const s = window.__game.scene.state;
    s.wins[w] = 1;
    s.fighters[1 - w].health = 0;
  }, winner);
  await waitForScene(page, winner === 0 && (await fightNumber(page)) === 6 ? 'ending' : 'results');
}

/** @param {import('@playwright/test').Page} page */
async function fightNumber(page) {
  return page.evaluate(() => window.__game.scene.config.arcade.run.fight + 1);
}

test('arcade: a whole ladder with a continue, a reload, the rival, the ending and the clear', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openGame(page);
  await page.getByRole('button', { name: 'Arcade' }).click();
  await waitForScene(page, 'arcade-select');
  await page.getByRole('radio', { name: /^Reroe/ }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  for (let fight = 1; fight <= 6; fight++) {
    if (fight === 2) {
      // Lose once: the same opponent again, for a continue.
      await waitForScene(page, 'vs');
      const opponent = await page.evaluate(() => window.__game.scene.config.chars[1]);
      await playFight(page, 1);
      await expect(page.getByRole('heading', { name: 'Continue?' })).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
      await waitForScene(page, 'vs');
      expect(await page.evaluate(() => window.__game.scene.config.chars[1])).toBe(opponent);
    }
    if (fight === 4) {
      // Reload in the middle of the run: it carries on from fight 4.
      await page.reload();
      await page.waitForFunction(() => window.__game?.scene?.name === 'title');
      await page.getByRole('button', { name: 'Arcade' }).click();
      await expect(page.getByText('Reroe, fight 4 of 6, 1 continue used.')).toBeVisible();
      await page.getByRole('button', { name: 'Continue the run' }).click();
    }
    if (fight === 6) {
      await waitForScene(page, 'vs');
      expect(await page.evaluate(() => window.__game.scene.config.chars[1])).toBe('kenji');
    }
    await playFight(page, 0);
    if (fight < 6) {
      await expect(page.getByRole('heading', { name: `Fight ${fight} of 6 cleared` })).toBeVisible();
      await page.getByRole('button', { name: 'Next fight' }).click();
    }
  }

  // The ending: four panels, then the summary.
  await expect(page.getByText('This time, it isn’t enough.')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'The end' }).click();
  await waitForScene(page, 'results');
  await expect(page.getByRole('heading', { name: 'Reroe clears arcade mode!' })).toBeVisible();
  await expect(page.getByRole('row', { name: 'Continues 1' })).toBeVisible();

  await page.getByRole('button', { name: 'Arcade again' }).click();
  await waitForScene(page, 'arcade-select');
  await expect(page.getByRole('radio', { name: 'Reroe (Spear zoner), cleared' })).toBeVisible();
  await expect(page.getByText('Run in progress')).toHaveCount(0);
  expectNoErrors(errors);
});
