/**
 * Shared steps for the smoke tests. They drive the real UI (buttons,
 * keys) and read window.__game only to wait for scenes and states.
 */
import { expect } from '@playwright/test';

/**
 * Opens the game and collects console errors.
 * @param {import('@playwright/test').Page} page
 */
export async function openGame(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.waitForFunction(() => window.__game?.scene?.name === 'title');
  return errors;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function waitForScene(page, name) {
  await page.waitForFunction((n) => window.__game?.scene?.name === n, name);
}

/**
 * Freezes the game the moment a simulation event of this type happens
 * (training mode's own pause), for a screenshot of that exact frame.
 * @param {import('@playwright/test').Page} page
 * @param {string} type
 */
export async function freezeOn(page, type) {
  await page.evaluate((t) => {
    const scene = window.__game.scene;
    const original = scene.update.bind(scene);
    scene.update = () => {
      original();
      if (scene.state.events.some((e) => e.type === t)) {
        window.__game.loop.setFrozen(true);
        scene.update = original;
      }
    };
  }, type);
  await page.waitForFunction(() => window.__game.loop.frozen, null, { timeout: 60_000 });
}

/**
 * @param {string[]} errors
 */
export function expectNoErrors(errors) {
  expect(errors, errors.join('\n')).toEqual([]);
}
