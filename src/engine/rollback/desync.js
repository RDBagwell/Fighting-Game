/**
 * Desync debugging: replay a desync log and find the first frame where the
 * two sides stopped agreeing.
 *
 * A desync log (RollbackSession.desyncLog) holds one side's starting state,
 * both players' confirmed inputs frame by frame, and the checksums each
 * side reported. Because the simulation is deterministic, replaying the
 * inputs from the starting state reproduces that side's match exactly.
 *
 * - With **one log**, the replay is compared, frame by frame, with the hash
 *   this side recorded for every confirmed frame while it was playing. The
 *   replay is what the inputs *should* have produced, so the first frame
 *   where the recorded hash differs is the exact frame this side's live
 *   simulation went wrong (a corrupted or tampered state). The checksums the
 *   other side sent are checked the same way.
 * - With **both sides' logs**, both are replayed frame by frame and their
 *   states compared on every frame: the exact first frame that differs, and
 *   whether the inputs or the states disagreed first.
 *
 * Used by `npm run desync -- <log.json> [other-log.json]` (tools/desync.mjs)
 * and by tests/rollback.test.js.
 */
import { loadState, hashState } from '../sim/state.js';

/**
 * @typedef {object} DesyncLog
 * @property {string} kind
 * @property {number} version
 * @property {number} side
 * @property {number} startFrame
 * @property {import('../sim/types.js').MatchState} initial
 * @property {Array<[number, number]>} inputs
 * @property {Record<string, number>} localHashes
 * @property {Record<string, number>} remoteHashes
 * @property {Record<string, number>} [frameHashes]
 */

/**
 * Re-simulates a log, calling `each(frame, state)` after every frame.
 * @param {import('../sim/step.js').Simulation} sim
 * @param {DesyncLog} log
 * @param {(frame: number, state: import('../sim/types.js').MatchState) => boolean | void} [each]  Return true to stop.
 */
export function replayLog(sim, log, each) {
  const s = loadState(log.initial);
  for (const inputs of log.inputs) {
    sim.step(s, inputs);
    if (each && each(s.frame, s)) break;
  }
  return s;
}

/**
 * One log: the first frame where a live simulation stopped matching the
 * replay. `side: 'local'` means the side that wrote the log diverged (its
 * per-frame hashes), `'remote'` the other side (its checksums).
 * @param {import('../sim/step.js').Simulation} sim
 * @param {DesyncLog} log
 * @returns {{ frame: number, side: 'local' | 'remote', recorded: number, replayed: number } | null}
 */
export function firstBadFrame(sim, log) {
  /** @type {{ frame: number, side: 'local' | 'remote', recorded: number, replayed: number } | null} */
  let found = null;
  const frames = log.frameHashes ?? {};
  replayLog(sim, log, (frame, s) => {
    const mine = frames[String(frame)] ?? log.localHashes[String(frame)];
    const theirs = log.remoteHashes[String(frame)];
    if (mine === undefined && theirs === undefined) return false;
    const replayed = hashState(s);
    if (mine !== undefined && mine !== replayed) found = { frame, side: 'local', recorded: mine, replayed };
    else if (theirs !== undefined && theirs !== replayed) found = { frame, side: 'remote', recorded: theirs, replayed };
    return found !== null;
  });
  return found;
}

/**
 * Two logs (one per side): the first frame where they differ.
 * @param {import('../sim/step.js').Simulation} sim
 * @param {DesyncLog} a
 * @param {DesyncLog} b
 * @returns {{ frame: number, reason: 'inputs' | 'state' | 'start', detail: string } | null}
 */
export function firstDivergence(sim, a, b) {
  if (a.startFrame !== b.startFrame || hashState(a.initial) !== hashState(b.initial)) {
    return { frame: a.startFrame, reason: 'start', detail: 'The two sides started from different states.' };
  }
  const sa = loadState(a.initial);
  const sb = loadState(b.initial);
  const n = Math.min(a.inputs.length, b.inputs.length);
  for (let i = 0; i < n; i++) {
    const frame = a.startFrame + 1 + i;
    const ia = a.inputs[i];
    const ib = b.inputs[i];
    if (ia[0] !== ib[0] || ia[1] !== ib[1]) {
      return { frame, reason: 'inputs', detail: `Inputs differ: [${ia}] vs [${ib}]` };
    }
    sim.step(sa, ia);
    sim.step(sb, ib);
    if (hashState(sa) !== hashState(sb)) {
      return { frame, reason: 'state', detail: describeDifference(sa, sb) };
    }
  }
  return null;
}

/**
 * The first field that differs between two states, as a path.
 * @param {unknown} x
 * @param {unknown} y
 * @param {string} [path]
 * @returns {string}
 */
export function describeDifference(x, y, path = 'state') {
  if (typeof x !== typeof y) return `${path}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`;
  if (x && y && typeof x === 'object') {
    const keys = new Set([...Object.keys(x), ...Object.keys(/** @type {object} */ (y))]);
    for (const k of keys) {
      const d = describeDifference(/** @type {any} */ (x)[k], /** @type {any} */ (y)[k], `${path}.${k}`);
      if (d) return d;
    }
    return '';
  }
  return x === y ? '' : `${path}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`;
}
