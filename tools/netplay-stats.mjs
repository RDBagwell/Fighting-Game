/**
 * Measures the rollback netcode under each network preset: how often it
 * rolls back, how far, what that costs, how much it sends, and, for
 * comparison, how a delay-based session fares on the same network.
 *
 *   npm run netplay-stats            all presets, 3 one-minute matches each
 *   npm run netplay-stats -- --quick one match each
 *
 * Two real RollbackSessions play each other in one process, through the
 * same simulated network the tests and the lab use (src/engine/rollback/
 * NetworkSimulator.js), on a virtual 60 Hz clock. Their inputs are a
 * recorded CPU-vs-CPU match on Hard (lots of attacks, blocks and jumps:
 * a hard case for prediction). Prints Markdown for docs/PERFORMANCE.md.
 */
import os from 'node:os';
import { sim } from '../src/game/sim.js';
import { RollbackSession } from '../src/engine/rollback/RollbackSession.js';
import { createLinkedPair } from '../src/engine/rollback/transport.js';
import { seededRandom } from '../src/engine/rollback/NetworkSimulator.js';
import { PRESETS } from '../src/engine/rollback/presets.js';
import { Cpu, DIFFICULTIES } from '../src/game/cpu/Cpu.js';
import { saveState, loadState, hashState } from '../src/engine/sim/state.js';

const FRAME_MS = 1000 / 60;
const FRAMES = 3600;
const quick = process.argv.includes('--quick');
const SEEDS = quick ? [1] : [1, 2, 3];
const MATCH = { chars: /** @type {[string, string]} */ (['mack', 'kenji']), seed: 7 };

/** A CPU-vs-CPU input log, Hard against Hard. */
function record(/** @type {number} */ seed) {
  const s = sim.createMatch({ ...MATCH, seed });
  const cpus = [new Cpu(0, DIFFICULTIES.hard, sim, seed * 2 + 1), new Cpu(1, DIFFICULTIES.hard, sim, seed * 2 + 2)];
  /** @type {Array<[number, number]>} */
  const log = [];
  /** @type {number[]} */
  const hashes = [];
  for (let f = 0; f < FRAMES + 20; f++) {
    const inputs = /** @type {[number, number]} */ ([cpus[0].think(s), cpus[1].think(s)]);
    log.push(inputs);
    sim.step(s, inputs);
    hashes.push(hashState(s));
  }
  return { log, hashes };
}

/**
 * @param {Array<[number, number]>} log
 * @param {import('../src/engine/rollback/NetworkSimulator.js').NetworkConditions} conditions
 * @param {{ seed: number, mode: 'rollback'|'delay', delay: number, matchSeed: number }} o
 */
function play(log, conditions, { seed, mode, delay, matchSeed }) {
  let t = 0;
  const now = () => t;
  const [ta, tb] = createLinkedPair({ conditions, now, random: seededRandom(seed) });
  const make = (/** @type {0|1} */ side, /** @type {any} */ transport) => new RollbackSession({
    sim, state: sim.createMatch({ ...MATCH, seed: matchSeed }), localSide: side, transport, inputDelay: delay, maxRollback: 8, mode, now,
  });
  const a = make(0, ta);
  const b = make(1, tb);
  const inputFor = (/** @type {RollbackSession} */ s) => {
    const target = s.state.frame + 1 + s.inputDelay;
    return target - 1 < log.length ? log[target - 1][s.localSide] : 0;
  };
  let ticks = 0;
  let resimMsTotal = 0;
  while (a.confirmedFrame < FRAMES || b.confirmedFrame < FRAMES) {
    t += FRAME_MS;
    ticks++;
    for (const s of [a, b]) resimMsTotal += s.tick(inputFor(s)).resimMs;
    if (ticks > FRAMES * 4) throw new Error('did not finish');
  }
  return { a, b, ticks, resimMsTotal, seconds: ticks / 60 };
}

/** The delay a delay-based game needs to rarely wait: one-way latency plus most of the jitter, in frames. */
const delayFor = (/** @type {{ latencyMs: number, jitterMs: number }} */ c) => Math.max(1, Math.ceil((c.latencyMs / 2 + c.jitterMs * 0.8) / FRAME_MS));

const recordings = SEEDS.map(record);
/** @type {string[]} */
const rows = [];
/** @type {string[]} */
const delayRows = [];
for (const [key, preset] of Object.entries(PRESETS)) {
  const c = preset.conditions;
  const sum = { seconds: 0, rollbacks: 0, resimFrames: 0, longest: 0, predicted: 0, misses: 0, stalls: 0, skips: 0, up: 0, packets: 0, maxResimMs: 0, desyncs: 0, mismatches: 0 };
  const dsum = { seconds: 0, stalls: 0, desyncs: 0 };
  const ddsum = { seconds: 0, stalls: 0 };
  SEEDS.forEach((seed, i) => {
    const { log, hashes } = recordings[i];
    const r = play(log, c, { seed: 100 + seed, mode: 'rollback', delay: 2, matchSeed: seed });
    for (const s of [r.a, r.b]) {
      sum.rollbacks += s.stats.rollbacks;
      sum.resimFrames += s.stats.resimFrames;
      sum.longest = Math.max(sum.longest, s.stats.longestRollback);
      sum.predicted += s.stats.predictedFrames;
      sum.misses += s.stats.predictionMisses;
      sum.stalls += s.stats.stalls;
      sum.skips += s.stats.skips;
      sum.up += s.transport.stats.bytesSent;
      sum.packets += s.transport.stats.packetsSent;
      sum.maxResimMs = Math.max(sum.maxResimMs, s.stats.maxResimMs);
      if (s.desync) sum.desyncs++;
      // Every confirmed frame matches the same inputs simulated with no network.
      for (const [f, h] of s.frameHashes) if (f <= FRAMES && h !== hashes[f - 1]) sum.mismatches++;
    }
    sum.seconds += r.seconds * 2; // two players
    const d = play(log, c, { seed: 100 + seed, mode: 'delay', delay: 2, matchSeed: seed });
    dsum.seconds += d.seconds * 2;
    dsum.stalls += d.a.stats.stalls + d.b.stats.stalls;
    if (d.a.desync || d.b.desync) dsum.desyncs++;
    const dd = play(log, c, { seed: 100 + seed, mode: 'delay', delay: delayFor(c), matchSeed: seed });
    ddsum.seconds += dd.seconds * 2;
    ddsum.stalls += dd.a.stats.stalls + dd.b.stats.stalls;
  });
  const per = (/** @type {number} */ n) => (n / sum.seconds).toFixed(1);
  rows.push(`| ${preset.label} | ${c.latencyMs} / ${c.jitterMs} / ${(c.loss * 100).toFixed(1)}% | ${per(sum.rollbacks)} | ${per(sum.resimFrames)} | ${sum.longest} | ${((sum.misses / Math.max(1, sum.predicted)) * 100).toFixed(1)}% | ${per(sum.stalls)} | ${per(sum.skips)} | ${(sum.up / sum.seconds / 1024).toFixed(2)} kB/s, ${per(sum.packets)} pkt/s | ${sum.maxResimMs.toFixed(2)} ms | ${sum.desyncs + sum.mismatches === 0 ? 'none' : `${sum.desyncs} desyncs, ${sum.mismatches} mismatches`} |`);
  delayRows.push(`| ${preset.label} | ${per(sum.stalls)} | ${(dsum.stalls / dsum.seconds).toFixed(1)} | ${delayFor(c)} frames (${Math.round(delayFor(c) * FRAME_MS)} ms) | ${(ddsum.stalls / ddsum.seconds).toFixed(1)} |`);
}

// The worst case one tick can hit: a rollback the whole window (8 frames) deep.
const { log } = recordings[0];
const s = sim.createMatch({ ...MATCH, seed: 1 });
/** @type {any[]} */
const snaps = [];
for (let f = 0; f < 1800; f++) {
  sim.step(s, log[f]);
  if (f > 600 && f % 7 === 0) snaps.push(saveState(s));
}
const samples = [];
for (let round = 0; round < 20; round++) {
  const t0 = performance.now();
  for (const snap of snaps) {
    const st = loadState(snap);
    for (let k = 0; k < 8; k++) {
      sim.step(st, log[(st.frame + k) % log.length]);
      saveState(st);
      hashState(st);
    }
  }
  samples.push(((performance.now() - t0) / snaps.length) * 1000);
}
samples.sort((x, y) => x - y);
const median = samples[Math.floor(samples.length / 2)];

console.log(`Machine: ${os.cpus()[0]?.model ?? 'unknown CPU'} (${os.cpus().length} threads), ${(os.totalmem() / 2 ** 30).toFixed(0)} GB, ${os.platform()} ${os.release()}, Node ${process.version}`);
console.log(`Matches: ${SEEDS.length} × ${FRAMES} frames (one minute) per preset, CPU Hard vs Hard, input delay 2, rollback window 8; rates are per player per second.\n`);
console.log('| Network | RTT ms / jitter ms / loss | Rollbacks/s | Frames re-simulated/s | Longest | Guesses wrong | Stalls/s | Time-sync skips/s | Sent per player | Worst tick resim | Desyncs |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(r);
console.log('\nDelay-based on the same networks (the session waits instead of guessing):\n');
console.log('| Network | Rollback: stalls/s | Delay-based, 2 frames: stalls/s | Delay needed to rarely stall | Delay-based at that delay: stalls/s |');
console.log('|---|---|---|---|---|');
for (const r of delayRows) console.log(r);
console.log(`\nWorst-case rollback cost (load a state, re-simulate 8 frames, saving and hashing each): median ${median.toFixed(0)} µs over 20 rounds of ${snaps.length} rollbacks (${((median / 1000 / FRAME_MS) * 100).toFixed(1)}% of a 16.7 ms frame).`);
