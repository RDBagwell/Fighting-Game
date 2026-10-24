// "Send feedback" after a CPU match opens the beta form in a new tab with
// the match filled in. The form itself is stubbed: the test never reaches
// tally.so.
import { test, expect } from '@playwright/test';
import { openGame, waitForScene, expectNoErrors } from './helpers.js';

test('Send feedback opens the beta form with the match filled in', async ({ page, context }) => {
  await context.route('https://tally.so/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Feedback</title>' }));
  const errors = await openGame(page);
  await page.getByRole('button', { name: 'Versus CPU' }).click();
  await waitForScene(page, 'select');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitForScene(page, 'match');
  await page.waitForFunction(() => window.__game.scene.state.phase === 'fight');
  await page.evaluate(() => {
    const s = window.__game.scene.state;
    s.wins[0] = 1;
    s.fighters[1].health = 0;
  });
  await waitForScene(page, 'results');

  const [form] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Send feedback' }).click()]);
  const u = new URL(form.url());
  expect(`${u.origin}${u.pathname}`).toBe('https://tally.so/r/yXP8zd');
  const fields = Object.fromEntries(u.searchParams);
  expect(fields).toMatchObject({ mode: 'cpu', p1: 'Mack', p2: 'Kenji', result: 'Mack won 2–0', device: 'keyboard' });
  expect(fields.version).toMatch(/^[0-9a-f]{8}$/);
  expect(fields.cpu).toMatch(/^(Easy|Normal|Hard)$/);
  expect(fields.browser).toMatch(/^Chrome \d+ \//);
  // The replay link opens this match in the game's viewer.
  expect(fields.replay).toMatch(/#replay=/);
  expectNoErrors(errors);
});
