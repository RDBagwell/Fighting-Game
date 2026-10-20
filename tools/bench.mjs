/**
 * Measures what session 2's rollback netcode will depend on: the cost of
 * one simulation step, of saveState and loadState, and of hashing a state.
 *
 *   npm run bench            Node only
 *   npm run bench -- --browser   also in headless Chromium (Playwright), via the Vite dev server
 *
 * The workload is a real CPU-vs-CPU match on Hard (both fighters moving,
 * attacking, blocking and throwing projectiles): its inputs are recorded
 * once, then replayed into the simulation alone, so CPU thinking isn't
 * counted. Results are printed as Markdown for docs/PERFORMANCE.md.
 */
import os from 'node:os';

/**
 * The benchmark itself. Self-contained so it runs the same in Node and,
 * passed to page.evaluate, in the browser.
 * @param {{ sim: any, Cpu: any, DIFFICULTIES: any, saveState: Function, loadState: Function, hashState: Function }} m
 */
export function benchmark(m) {
  const { sim, Cpu, DIFFICULTIES, saveState, loadState, hashState } = m;
  const now = () => performance.now();

  // 1. Record a busy match's inputs.
  const log = [];
  const snapshots = [];
  for (let game = 0; game < 4; game++) {
    const s = sim.createMatch({ chars: game % 2 ? ['mack', 'kenji'] : ['kenji', 'mack'], seed: game + 1 });
    const cpus = [new Cpu(0, DIFFICULTIES.hard, sim, 10 + game), new Cpu(1, DIFFICULTIES.hard, sim, 20 + game)];
    const start = log.length;
    while (s.phase !== 'matchEnd' && log.length - start < 60 * 60 * 3) {
      const inputs = [cpus[0].think(s), cpus[1].think(s)];
      log.push({ game, inputs });
      if ((log.length - start) % 97 === 0 && s.phase === 'fight') snapshots.push(saveState(s));
      sim.step(s, inputs);
    }
  }

  /** Times `fn` over batches, returning microseconds per call. */
  const time = (/** @type {() => void} */ fn, /** @type {number} */ calls, batch = 100) => {
    for (let i = 0; i < Math.min(calls, 2000); i++) fn(); // warm up the JIT
    const samples = [];
    for (let done = 0; done < calls; done += batch) {
      const t0 = now();
      for (let i = 0; i < batch; i++) fn();
      samples.push(((now() - t0) * 1000) / batch);
    }
    samples.sort((a, b) => a - b);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    return { mean, p50: samples[Math.floor(samples.length * 0.5)], p99: samples[Math.floor(samples.length * 0.99)], max: samples[samples.length - 1] };
  };

  // 2. Step: replay the log into fresh matches, one step per call.
  let s = sim.createMatch({ chars: ['kenji', 'mack'], seed: 1 });
  let game = 0;
  let i = 0;
  const step = time(() => {
    const entry = log[i];
    if (entry.game !== game) {
      game = entry.game;
      s = sim.createMatch({ chars: game % 2 ? ['mack', 'kenji'] : ['kenji', 'mack'], seed: game + 1 });
    }
    sim.step(s, entry.inputs);
    i = (i + 1) % log.length;
    if (i === 0) {
      game = 0;
      s = sim.createMatch({ chars: ['kenji', 'mack'], seed: 1 });
    }
  }, Math.min(log.length, 40000), 50);

  let k = 0;
  const save = time(() => saveState(snapshots[k++ % snapshots.length]), 50000);
  const load = time(() => loadState(snapshots[k++ % snapshots.length]), 50000);
  const hash = time(() => hashState(snapshots[k++ % snapshots.length]), 20000);

  // 3. A rollback: load a state from 8 frames ago and re-simulate 8 frames.
  const rollback8 = time(() => {
    const st = loadState(snapshots[k++ % snapshots.length]);
    for (let f = 0; f < 8; f++) sim.step(st, [0, 0]);
  }, 5000, 20);

  const bytes = JSON.stringify(snapshots[Math.floor(snapshots.length / 2)]).length;
  return { frames: log.length, snapshots: snapshots.length, step, save, load, hash, rollback8, bytes };
}

/** @param {any} r @param {string} where */
function report(r, where) {
  const f = (/** @type {number} */ us) => (us >= 100 ? `${(us / 1000).toFixed(2)} ms` : `${us.toFixed(2)} µs`);
  const row = (/** @type {string} */ name, /** @type {any} */ t) => `| ${name} | ${f(t.mean)} | ${f(t.p50)} | ${f(t.p99)} | ${f(t.max)} |`;
  return [
    `### ${where}`,
    '',
    `Workload: ${r.frames} frames of recorded CPU-vs-CPU (Hard) matches; ${r.snapshots} mid-fight snapshots. A state is ${r.bytes} bytes as JSON.`,
    '',
    '| Operation | Mean | Median | 99th percentile | Worst batch |',
    '| --- | --- | --- | --- | --- |',
    row('One simulation step', r.step),
    row('saveState', r.save),
    row('loadState', r.load),
    row('hashState', r.hash),
    row('Rollback of 8 frames (load + 8 steps)', r.rollback8),
    '',
    '(Each figure is the average over a batch of calls; the percentiles are across batches.)',
  ].join('\n');
}

async function main() {
  const { sim } = await import('../src/game/sim.js');
  const { Cpu, DIFFICULTIES } = await import('../src/game/cpu/Cpu.js');
  const { saveState, loadState, hashState } = await import('../src/engine/sim/state.js');
  const cpu = os.cpus()[0]?.model ?? 'unknown CPU';
  console.log(`Measured ${new Date().toISOString().slice(0, 10)} on ${cpu} × ${os.cpus().length}, ${os.platform()}.\n`);
  console.log(report(benchmark({ sim, Cpu, DIFFICULTIES, saveState, loadState, hashState }), `Node ${process.version}`));

  if (process.argv.includes('--browser')) {
    const { chromium } = await import('@playwright/test');
    const { createServer } = await import('vite');
    const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
    await server.listen();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:5199/');
    const source = benchmark.toString();
    const result = await page.evaluate(async (src) => {
      const load = (/** @type {string} */ p) => import(/* @vite-ignore */ p);
      const [{ sim }, { Cpu, DIFFICULTIES }, { saveState, loadState, hashState }] = await Promise.all([
        load('/src/game/sim.js'), load('/src/game/cpu/Cpu.js'), load('/src/engine/sim/state.js'),
      ]);
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return (${src})`)();
      return fn({ sim, Cpu, DIFFICULTIES, saveState, loadState, hashState });
    }, source);
    console.log(`\n${report(result, `Headless Chromium ${browser.version()}`)}`);
    await browser.close();
    await server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
