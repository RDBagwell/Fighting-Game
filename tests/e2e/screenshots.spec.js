// Screenshots for the README and docs, from the real build:
//   npm run build && npm run screenshots
// Each is taken at a moment chosen by game state (e.g. the frame a hit
// lands), not by a timer.
import { test } from '@playwright/test';
import { openGame, waitForScene, freezeOn } from './helpers.js';

const OUT = 'docs/screenshots';
const SIZES = [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, scale: 1, touch: false },
  { name: 'phone', viewport: { width: 844, height: 390 }, scale: 3, touch: true },
];

for (const size of SIZES) {
  test.describe(`@screenshots ${size.name}`, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: size.scale, isMobile: size.touch, hasTouch: size.touch });

    test(`title and character select (${size.name}) @screenshots`, async ({ page }) => {
      await openGame(page);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/title-${size.name}.png` });
      await page.getByRole('button', { name: 'Versus CPU' }).click();
      await waitForScene(page, 'select');
      await page.screenshot({ path: `${OUT}/select-${size.name}.png` });
    });

    test(`a CPU match, on the frame a hit lands (${size.name}) @screenshots`, async ({ page }) => {
      await openGame(page);
      await page.getByRole('button', { name: 'Versus CPU' }).click();
      await page.getByRole('button', { name: 'Fight!' }).click();
      await waitForScene(page, 'match');
      await page.waitForFunction(() => window.__game.scene.state.phase === 'fight');
      // Walk in and attack, so the shot shows a fight rather than a stand-off.
      await page.keyboard.down('KeyD');
      await freezeOn(page, 'hit');
      await page.keyboard.up('KeyD');
      await page.screenshot({ path: `${OUT}/match-${size.name}.png` });
    });

    test(`training mode with hitboxes and the frame meter (${size.name}) @screenshots`, async ({ page }) => {
      await openGame(page);
      await page.getByRole('button', { name: 'Training mode' }).click();
      await page.getByRole('button', { name: 'Start training' }).click();
      await waitForScene(page, 'match');
      await page.keyboard.down('KeyD');
      await page.waitForFunction(() => {
        const [a, b] = window.__game.scene.state.fighters;
        return Math.abs(a.x - b.x) < 60 * 256;
      });
      await page.keyboard.up('KeyD');
      await page.keyboard.press('KeyK');
      await freezeOn(page, 'hit');
      await page.screenshot({ path: `${OUT}/training-hitboxes-${size.name}.png` });
      // Let the exchange finish: the meter shows the whole move and the measured advantage.
      await page.evaluate(() => window.__game.loop.setFrozen(false));
      await page.waitForFunction(() => window.__game.scene.training.meter.last !== null);
      await page.keyboard.press('KeyP');
      await page.screenshot({ path: `${OUT}/training-frame-meter-${size.name}.png` });
    });
  });
}

test('move list @screenshots', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Move list' }).click();
  await page.screenshot({ path: `${OUT}/move-list-desktop.png` });
});
