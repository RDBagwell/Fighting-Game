// Online play between two browsers (two isolated contexts) through the real
// matchmaking server on localhost: invite link, character select, a match
// over a direct WebRTC data channel, identical checksums on both sides, and
// the pause when one player disconnects. Uses the dist-e2e build
// (npm run build:e2e), which points at localhost:3000.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4174/';

/** @param {import('@playwright/test').Browser} browser */
async function player(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
}

/** @param {import('@playwright/test').Page} page @param {string} name */
const scene = (page, name) => page.waitForFunction((n) => window.__game?.scene?.name === n, name, { timeout: 30_000 });

/** @param {import('@playwright/test').Page} page */
const netState = (page) => page.evaluate(() => {
  const s = window.__game.scene;
  const n = s.session;
  return { path: s.path(), frame: n.state.frame, confirmed: n.confirmedFrame, desync: n.desync, x: n.state.fighters.map((f) => f.x) };
});

test('two browsers play online: invite link, select, a direct WebRTC match, no desync, pause on disconnect', async ({ browser }) => {
  const a = await player(browser);
  const b = await player(browser);
  await a.page.goto(BASE);
  await scene(a.page, 'title');
  await a.page.getByRole('button', { name: 'Online' }).click();
  await scene(a.page, 'online-lobby');
  await a.page.getByRole('button', { name: 'Create a private room' }).click();
  await scene(a.page, 'online-room');
  const link = await a.page.getByLabel('Invite link').inputValue();
  expect(link).toMatch(/\?room=[A-Z2-9]{6}$/);

  await b.page.goto(link);
  await scene(b.page, 'online-room');
  await a.page.getByRole('button', { name: 'Ready' }).click();
  await b.page.getByRole('button', { name: 'Ready' }).click();
  await scene(a.page, 'online-match');
  await scene(b.page, 'online-match');

  // The direct path opens (two pages on one machine always can).
  await a.page.waitForFunction(() => window.__game.scene.path() === 'Direct (WebRTC)', null, { timeout: 20_000 });
  // Once the round starts, a player moves and the other sees it.
  await a.page.waitForFunction(() => window.__game.scene.session.state.phase === 'fight', null, { timeout: 20_000 });
  const before = await netState(b.page);
  await a.page.keyboard.down('KeyD');
  await a.page.waitForTimeout(1000);
  await a.page.keyboard.up('KeyD');
  await b.page.waitForFunction((x0) => window.__game.scene.session.state.fighters[0].x !== x0, before.x[0], { timeout: 10_000 });
  // Both sides agree on every checksummed frame (checked every 30 frames).
  await a.page.waitForFunction(() => window.__game.scene.session.confirmedFrame > 300, null, { timeout: 30_000 });
  const [sa, sb] = [await netState(a.page), await netState(b.page)];
  expect(sa.desync).toBeNull();
  expect(sb.desync).toBeNull();
  const f = Math.min(sa.confirmed, sb.confirmed) - 1;
  const ha = await a.page.evaluate((k) => window.__game.scene.session.frameHashes.get(k), f);
  const hb = await b.page.evaluate((k) => window.__game.scene.session.frameHashes.get(k), f);
  expect(ha).toBeDefined();
  expect(ha).toBe(hb);

  // B drops: A's match pauses with a reconnect countdown.
  await b.context.close();
  await a.page.waitForFunction(() => window.__game.scene.room?.status === 'paused', null, { timeout: 20_000 });
  await expect(a.page.getByText('Your opponent disconnected.', { exact: false })).toHaveCount(1);

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.context.close();
});
