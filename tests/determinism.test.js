/**
 * Determinism: the property everything else (replays, saving and loading,
 * session 2's rollback) depends on. The same inputs from the same state
 * must give exactly the same state, every time, including after the state
 * has been saved, copied, turned into JSON and loaded again.
 */
import { describe, it, expect } from 'vitest';
import { sim } from './helpers/harness.js';
import { saveState, loadState, hashState } from '../src/engine/sim/state.js';

/**
 * A recorded input log: a reproducible stream of plausible inputs (held
 * for a few frames at a time, like hands on a controller), from its own
 * small generator so the test never touches Math.random.
 * @param {number} frames
 * @param {number} seed
 */
function inputLog(frames, seed) {
  let r = seed;
  const next = () => (r = (Math.imul(r, 1103515245) + 12345) >>> 0);
  /** @type {Array<[number, number]>} */
  const log = [];
  /** @type {[number, number]} */
  const held = [0, 0];
  for (let i = 0; i < frames; i++) {
    for (let p = 0; p < 2; p++) if (next() % 5 === 0) held[p] = (next() >>> 8) & 0xff;
    log.push([held[0], held[1]]);
  }
  return log;
}

/**
 * @param {import('../src/engine/sim/types.js').MatchState} state
 * @param {Array<[number, number]>} log
 * @param {number} from
 * @param {number} to
 */
function play(state, log, from, to) {
  for (let i = from; i < to; i++) sim.step(state, log[i]);
  return state;
}

/** Every number in the state is an integer. */
function allIntegers(value, path = 'state') {
  if (typeof value === 'number') {
    expect(Number.isInteger(value), path).toBe(true);
  } else if (Array.isArray(value)) value.forEach((v, i) => allIntegers(v, `${path}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) allIntegers(v, `${path}.${k}`);
}

describe('determinism', () => {
  const log = inputLog(8000, 12345);

  it('the same input log gives exactly the same match, twice', () => {
    const a = play(sim.createMatch({ chars: ['mack', 'kenji'], seed: 99 }), log, 0, log.length);
    const b = play(sim.createMatch({ chars: ['mack', 'kenji'], seed: 99 }), log, 0, log.length);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(hashState(a)).toBe(hashState(b));
    // The log actually exercised the game.
    expect(a.round + a.wins[0] + a.wins[1]).toBeGreaterThan(2);
  });

  it('a state saved mid-match and loaded again carries on identically', () => {
    const full = sim.createMatch({ chars: ['kenji', 'mack'], seed: 3 });
    /** @type {import('../src/engine/sim/types.js').MatchState | null} */
    let saved = null;
    for (let i = 0; i < log.length; i++) {
      if (i === 2500) saved = saveState(full);
      sim.step(full, log[i]);
    }
    const resumed = play(loadState(/** @type {any} */ (saved)), log, 2500, log.length);
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(full));
  });

  it('saving copies: stepping on never changes a saved state, and it can be loaded twice', () => {
    const s = play(sim.createMatch({ chars: ['mack', 'mack'], seed: 1 }), log, 0, 1000);
    const saved = saveState(s);
    const before = JSON.stringify(saved);
    play(s, log, 1000, 1500);
    expect(JSON.stringify(saved)).toBe(before);
    const one = play(loadState(saved), log, 1000, 1500);
    const two = play(loadState(saved), log, 1000, 1500);
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    expect(JSON.stringify(one)).toBe(JSON.stringify(s));
  });

  it('a state survives JSON (what a replay file or a network packet would carry)', () => {
    const s = play(sim.createMatch({ chars: ['kenji', 'kenji'], seed: 5 }), log, 0, 3000);
    const fromJson = loadState(JSON.parse(JSON.stringify(saveState(s))));
    play(s, log, 3000, 5000);
    play(fromJson, log, 3000, 5000);
    expect(hashState(fromJson)).toBe(hashState(s));
    expect(JSON.stringify(fromJson)).toBe(JSON.stringify(s));
  });

  it('rolling back and re-simulating gives the same result (what session 2 will do every frame)', () => {
    const s = sim.createMatch({ chars: ['mack', 'kenji'], seed: 8 });
    const snapshots = [];
    for (let i = 0; i < 4000; i++) {
      snapshots.push(saveState(s));
      sim.step(s, log[i]);
      // Every 7 frames, roll back 6 frames and re-simulate them.
      if (i % 7 === 6) {
        const back = loadState(snapshots[i - 5]);
        play(back, log, i - 5, i + 1);
        expect(hashState(back)).toBe(hashState(s));
      }
    }
  });

  it('the state is plain data with integer numbers only', () => {
    const s = play(sim.createMatch({ chars: ['mack', 'kenji'], seed: 2 }), log, 0, 4000);
    allIntegers(s);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('different seeds still give the same fight (the RNG is in the state but the rules never roll dice)', () => {
    const a = play(sim.createMatch({ chars: ['mack', 'kenji'], seed: 1 }), log, 0, 2000);
    const b = play(sim.createMatch({ chars: ['mack', 'kenji'], seed: 2 }), log, 0, 2000);
    expect(a.fighters).toEqual(b.fighters);
  });
});
