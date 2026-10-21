/**
 * Captures the README's GIF and screenshots from the real build, with
 * Playwright: the rollback lab (a GIF and a still), two browsers in an
 * online match, and the replay viewer. Writes docs/media/.
 *
 *   npm run build && npm run build:e2e && node tools/capture-media.mjs
 *
 * Starts what it needs (vite preview of dist/ on 4173 and dist-e2e/ on
 * 4174, the matchmaking server on 3000) unless it's already running.
 * The GIF is made from Playwright's video with ffmpeg, which must be
 * installed (it's a documentation tool, not a dependency of the game).
 *
 * Not type-checked: the page callbacks read window.__game, which exists only in the page.
 */
// @ts-nocheck
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const OUT = 'docs/media';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
/** @type {import('node:child_process').ChildProcess[]} */
const started = [];

/** @param {string} url @param {string[]} cmd @param {Record<string, string>} [env] */
async function ensure(url, cmd, env = {}) {
  const up = async () => fetch(url).then((r) => r.ok, () => false);
  if (await up()) return;
  const child = spawn(cmd[0], cmd.slice(1), { env: { ...process.env, ...env }, stdio: 'ignore', shell: process.platform === 'win32' });
  started.push(child);
  for (let i = 0; i < 100 && !(await up()); i++) await sleep(200);
  if (!(await up())) throw new Error(`could not start ${cmd.join(' ')}`);
}

await ensure('http://localhost:4173/', ['npx', 'vite', 'preview', '--port', '4173', '--strictPort']);
await ensure('http://localhost:4174/', ['npx', 'vite', 'preview', '--outDir', 'dist-e2e', '--port', '4174', '--strictPort']);
await ensure('http://localhost:3000/healthz', ['node', 'server/index.js'], { PORT: '3000', ALLOWED_ORIGINS: 'http://localhost:4174' });

const browser = await chromium.launch();
const VIEW = { width: 1280, height: 720 };
const scene = (/** @type {import('@playwright/test').Page} */ p, /** @type {string} */ n) => p.waitForFunction((x) => window.__game?.scene?.name === x, n, { timeout: 30_000 });

// ── 1. The lab: a video for the GIF, and a still ─────────────────────
{
  const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-video-'));
  const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: videoDir, size: VIEW } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/');
  await scene(page, 'title');
  await page.getByRole('button', { name: 'Rollback lab' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await scene(page, 'lab');
  await page.getByRole('button', { name: 'Another continent' }).click();
  // The GIF shows the fight with the lab's overlays, panel closed; the still shows the panel.
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__game.scene.session.state.phase === 'fight', null, { timeout: 20_000 });
  const t0 = Date.now();
  // Walk in and attack, so the CPU reacts and the guesses go wrong now and then.
  await page.keyboard.down('KeyD');
  await sleep(700);
  await page.keyboard.up('KeyD');
  for (const key of ['KeyJ', 'KeyK', 'KeyJ', 'KeyL', 'KeyW', 'KeyJ', 'KeyK', 'KeyL']) {
    await page.keyboard.press(key);
    await sleep(380);
  }
  await page.keyboard.down('KeyA');
  await sleep(600);
  await page.keyboard.up('KeyA');
  await sleep(1500);
  const seconds = (Date.now() - t0) / 1000;
  await page.keyboard.press('Tab');
  await sleep(400);
  await page.screenshot({ path: `${OUT}/lab.png` });
  const stats = await page.evaluate(() => window.__game.scene.session.stats);
  console.log('lab stats while capturing:', JSON.stringify(stats));
  const video = await page.video()?.path();
  await ctx.close();
  if (video) {
    // The fight part only: skip the menus and intro at the start.
    const total = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString().trim());
    const start = Math.max(0, total - seconds - 0.9);
    const filter = 'fps=10,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4';
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(start), '-t', String(Math.min(9, seconds)), '-i', video, '-vf', filter, `${OUT}/lab.gif`]);
    console.log(`lab.gif: ${(fs.statSync(`${OUT}/lab.gif`).size / 1024).toFixed(0)} KB from ${total.toFixed(1)} s of video`);
  }
  fs.rmSync(videoDir, { recursive: true, force: true });
}

// ── 2. Two browsers online ─────────────────────────────────────────
{
  const [ca, cb] = [await browser.newContext({ viewport: VIEW }), await browser.newContext({ viewport: VIEW })];
  const [a, b] = [await ca.newPage(), await cb.newPage()];
  await a.goto('http://localhost:4174/');
  await scene(a, 'title');
  await a.getByRole('button', { name: 'Online' }).click();
  await scene(a, 'online-lobby');
  await a.getByRole('button', { name: 'Create a private room' }).click();
  await scene(a, 'online-room');
  await a.screenshot({ path: `${OUT}/online-room.png` });
  await b.goto(await a.getByLabel('Invite link').inputValue());
  await scene(b, 'online-room');
  await a.getByRole('button', { name: 'Ready' }).click();
  await b.getByRole('button', { name: 'Ready' }).click();
  await scene(a, 'online-match');
  await a.waitForFunction(() => window.__game.scene.session.state.phase === 'fight', null, { timeout: 20_000 });
  await a.keyboard.down('KeyD');
  await b.keyboard.down('KeyA');
  await sleep(900);
  await a.keyboard.up('KeyD');
  await b.keyboard.up('KeyA');
  await a.keyboard.press('KeyK');
  await sleep(250);
  await a.screenshot({ path: `${OUT}/online-match.png` });
  console.log('online path:', await a.evaluate(() => window.__game.scene.path()));
  await ca.close();
  await cb.close();
}

// ── 2b. Training: a combo trial and a tutorial lesson ────────────────
{
  const page = await browser.newPage({ viewport: VIEW });
  await page.goto('http://localhost:4173/');
  await scene(page, 'title');
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.getByRole('button', { name: /Combo trials/ }).click();
  await page.getByRole('button', { name: /3\. Chain lights/ }).click();
  await scene(page, 'match');
  await sleep(400);
  await page.screenshot({ path: `${OUT}/trial.png` });
  await page.goto('http://localhost:4173/');
  await scene(page, 'title');
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.getByRole('button', { name: /^Tutorial/ }).click();
  await page.getByRole('button', { name: /4\. High and low/ }).click();
  await scene(page, 'match');
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/lesson.png` });
  await page.close();
}

// ── 3. The replay viewer, from a replay recorded in the lab ─────────
{
  const ctx = await browser.newContext({ viewport: VIEW });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/');
  await scene(page, 'title');
  // A short CPU-vs-CPU replay made with the game's own code, in the page.
  const { sim } = await import('../src/game/sim.js');
  const { Cpu, DIFFICULTIES } = await import('../src/game/cpu/Cpu.js');
  const { makeReplay, encodeReplay } = await import('../src/game/replay/replays.js');
  const s = sim.createMatch({ chars: ['mack', 'kenji'], seed: 3, stage: 'dusk-shrine' });
  const cpus = [new Cpu(0, DIFFICULTIES.hard, sim, 7), new Cpu(1, DIFFICULTIES.hard, sim, 8)];
  /** @type {Array<[number, number]>} */
  const log = [];
  for (let f = 0; f < 1500; f++) {
    const inp = /** @type {[number, number]} */ ([cpus[0].think(s), cpus[1].think(s)]);
    log.push(inp);
    sim.step(s, inp);
  }
  const text = encodeReplay(makeReplay(sim, { chars: ['mack', 'kenji'], seed: 3, stage: 'dusk-shrine' }, log, { mode: 'cpu', names: ['Mack', 'Kenji'] }));
  await page.goto(`http://localhost:4173/#replay=${text}`);
  await scene(page, 'replay');
  await page.getByRole('button', { name: 'Hitboxes (1)' }).click();
  // Find a frame with a hit on screen, then pause there.
  await page.evaluate(() => {
    const sc = window.__game.scene;
    for (let f = 900; f < 1500; f++) {
      sc.seek(f);
      if (sc.state.fighters.some((x) => x.state === 'hitstun')) break;
    }
  });
  await sleep(300);
  await page.screenshot({ path: `${OUT}/replay.png` });
  await ctx.close();
}

await browser.close();
for (const c of started) c.kill();
for (const f of fs.readdirSync(OUT)) console.log(`${OUT}/${f}: ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`);
