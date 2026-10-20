// The rollback lab and the replay viewer, in the production build. Both work
// with no server at all.
import { test, expect } from '@playwright/test';
import { openGame, waitForScene, expectNoErrors } from './helpers.js';
import { sim } from '../../src/game/sim.js';
import { Cpu, DIFFICULTIES } from '../../src/game/cpu/Cpu.js';
import { makeReplay, encodeReplay } from '../../src/game/replay/replays.js';

test('the rollback lab: a match against the CPU over a simulated network, the panel and presets', async ({ page }) => {
  const errors = await openGame(page);
  await page.getByRole('button', { name: 'Rollback lab' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await waitForScene(page, 'lab');
  await expect(page.getByRole('heading', { name: 'Rollback lab' })).toBeVisible();
  await page.getByRole('button', { name: 'Bad Wi-Fi' }).click();
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyD');
  // Under Bad Wi-Fi the guesses go wrong sometimes, and are corrected.
  await page.waitForFunction(() => window.__game.scene.session.stats.rollbacks > 0, null, { timeout: 30_000 });
  const stats = await page.evaluate(() => ({ ...window.__game.scene.session.stats, desync: window.__game.scene.session.desync }));
  expect(stats.desync).toBeNull();
  expect(stats.maxResimMs).toBeLessThan(16);
  // Tab closes and reopens the panel.
  await page.keyboard.press('Tab');
  await expect(page.locator('.lab')).not.toHaveClass(/open/);
  await page.keyboard.press('Tab');
  await expect(page.locator('.lab')).toHaveClass(/open/);
  expectNoErrors(errors);
});

/** A short CPU-vs-CPU replay, made in Node with the game's own simulation. */
function shortReplay(frames = 600) {
  const s = sim.createMatch({ chars: ['mack', 'kenji'], seed: 9, stage: 'dusk-shrine' });
  const cpus = [new Cpu(0, DIFFICULTIES.hard, sim, 1), new Cpu(1, DIFFICULTIES.hard, sim, 2)];
  /** @type {Array<[number, number]>} */
  const log = [];
  for (let f = 0; f < frames; f++) {
    const inputs = /** @type {[number, number]} */ ([cpus[0].think(s), cpus[1].think(s)]);
    log.push(inputs);
    sim.step(s, inputs);
  }
  const replay = makeReplay(sim, { chars: ['mack', 'kenji'], seed: 9, stage: 'dusk-shrine' }, log, { mode: 'cpu', names: ['Mack', 'Kenji'] });
  return { text: encodeReplay(replay), final: { frame: s.frame, hp: s.fighters.map((f) => f.hp) } };
}

test('a shared replay link opens the viewer, which plays, pauses, steps and seeks', async ({ page }) => {
  const { text, final } = shortReplay();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`./#replay=${text}`);
  await waitForScene(page, 'replay');
  await page.waitForFunction(() => window.__game.scene.state.frame > 30);
  await page.getByRole('button', { name: 'Play / pause (P)' }).click();
  const f0 = await page.evaluate(() => window.__game.scene.state.frame);
  await page.getByRole('button', { name: 'One frame forward (N)' }).click();
  expect(await page.evaluate(() => window.__game.scene.state.frame)).toBe(f0 + 1);
  // Seek to the end: the same state the match ended in, in Node.
  await page.getByLabel('Seek').fill(String(final.frame));
  const end = await page.evaluate(() => ({ frame: window.__game.scene.state.frame, hp: window.__game.scene.state.fighters.map((f) => f.hp) }));
  expect(end).toEqual(final);
  await page.getByLabel('Seek').fill('100');
  expect(await page.evaluate(() => window.__game.scene.state.frame)).toBe(100);
  expect(errors).toEqual([]);
});

test('kept replays are listed; a damaged link is refused with a message', async ({ page }) => {
  const { text } = shortReplay(120);
  await page.addInitScript((data) => {
    localStorage.setItem('dusk-duel-replays-v1', JSON.stringify([{ id: 'e2e', date: '2026-01-01T00:00:00.000Z', mode: 'cpu', names: ['Mack', 'Kenji'], frames: 120, data }]));
  }, text);
  await openGame(page);
  await page.getByRole('button', { name: 'Replays' }).click();
  await waitForScene(page, 'replays');
  await page.getByRole('button', { name: 'Watch' }).click();
  await waitForScene(page, 'replay');
  await page.goto(`./#replay=${text.slice(0, -10)}xx`);
  await expect(page.getByText(/damaged|not a Dusk Duel replay/)).toBeVisible();
});
