/**
 * Runs two rollback sessions against each other, in one process, through
 * simulated networks on a virtual clock. The players' inputs come from a
 * recorded input log, frame by frame, so the result can be compared with
 * the same log simulated without any network at all.
 */
import { sim } from './harness.js';
import { RollbackSession } from '../../src/engine/rollback/RollbackSession.js';
import { createLinkedPair } from '../../src/engine/rollback/transport.js';
import { seededRandom } from '../../src/engine/rollback/NetworkSimulator.js';
import { Cpu, DIFFICULTIES } from '../../src/game/cpu/Cpu.js';
import { hashState } from '../../src/engine/sim/state.js';

export const FRAME_MS = 1000 / 60;
export const MATCH = /** @type {import('../../src/engine/sim/types.js').MatchOptions} */ ({ chars: ['mack', 'kenji'], seed: 21 });

/**
 * A CPU-vs-CPU input log (Hard against Normal: lots of attacks, blocks,
 * jumps and specials) and the hash of the state after every frame when
 * it's simulated with no network.
 * @param {number} frames
 */
export function recordedMatch(frames) {
  const s = sim.createMatch(MATCH);
  const cpus = [new Cpu(0, DIFFICULTIES.hard, sim, 5), new Cpu(1, DIFFICULTIES.normal, sim, 6)];
  /** @type {Array<[number, number]>} */
  const log = [];
  /** @type {number[]} */
  const hashes = [hashState(s)];
  /** @type {Array<{ frame: number, type: string, side: number, move: string }>} */
  const events = [];
  for (let f = 1; f <= frames; f++) {
    const inputs = /** @type {[number, number]} */ ([cpus[0].think(s), cpus[1].think(s)]);
    log.push(inputs);
    sim.step(s, inputs);
    hashes.push(hashState(s));
    for (const e of s.events) events.push({ frame: f, type: e.type, side: e.side, move: e.move ?? '' });
  }
  return { log, hashes, events };
}

/**
 * @param {object} o
 * @param {Array<[number, number]>} o.log
 * @param {number} o.frames  Run until both sides have confirmed this frame.
 * @param {import('../../src/engine/rollback/NetworkSimulator.js').NetworkConditions} o.conditions
 * @param {number} [o.seed]
 * @param {[number, number]} [o.delay]
 * @param {number} [o.maxRollback]
 * @param {'rollback'|'delay'} [o.mode]
 * @param {number} [o.startLag]  Ticks the second side starts late.
 * @param {number} [o.slowEvery]  The second side misses one tick in this many (a slow clock).
 * @param {(t: number, a: RollbackSession, b: RollbackSession) => void} [o.each]
 */
export function runPair({ log, frames, conditions, seed = 1, delay = [2, 2], maxRollback = 8, mode = 'rollback', startLag = 0, slowEvery = 0, each }) {
  let t = 0;
  const now = () => t;
  const [ta, tb] = createLinkedPair({ conditions, now, random: seededRandom(seed) });
  const a = new RollbackSession({ sim, state: sim.createMatch(MATCH), localSide: 0, transport: ta, inputDelay: delay[0], maxRollback, mode, now });
  const b = new RollbackSession({ sim, state: sim.createMatch(MATCH), localSide: 1, transport: tb, inputDelay: delay[1], maxRollback, mode, now });
  /** @type {Array<Array<{ frame: number, type: string, side: number, move: string }>>} */
  const presented = [[], []];
  /** @type {Array<number[]>} */
  const frameGap = [];
  /**
   * The input byte a session will schedule this tick: the log's input for
   * the frame it lands on (the next frame plus the input delay).
   * @param {RollbackSession} s
   */
  const inputFor = (s) => {
    const target = s.state.frame + 1 + s.inputDelay;
    return target - 1 < log.length ? log[target - 1][s.localSide] : 0;
  };
  for (let tick = 0; tick < frames * 6; tick++) {
    t += FRAME_MS;
    [a, b].forEach((s, i) => {
      if (i === 1 && tick < startLag) return;
      if (i === 1 && slowEvery && tick % slowEvery === 0) return;
      const r = s.tick(inputFor(s));
      // The frame the presented events belong to: the frames simulated this tick, newest last.
      for (const e of r.events) presented[i].push({ frame: s.state.frame, type: e.type, side: e.side, move: e.move ?? '' });
    });
    frameGap.push([a.state.frame, b.state.frame]);
    each?.(tick, a, b);
    if (a.confirmedFrame >= frames && b.confirmedFrame >= frames) break;
  }
  return { a, b, presented, frameGap, ticks: frameGap.length };
}
