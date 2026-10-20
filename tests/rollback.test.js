/**
 * Rollback netcode: the same match played over a bad network must end in
 * exactly the same state as with no network at all, on both sides, under
 * every preset (inputs late, out of order, duplicated and partly lost).
 * Plus prediction, the rollback window, delay-based mode, time sync,
 * presentation and desync detection.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { sim } from './helpers/harness.js';
import { recordedMatch, runPair } from './helpers/rollback.js';
import { PRESETS } from '../src/engine/rollback/presets.js';
import { hashState } from '../src/engine/sim/state.js';
import { encodeInput, encodeChecksum, encodePing, decode, INPUT, PING } from '../src/engine/rollback/packets.js';
import { firstBadFrame, firstDivergence } from '../src/engine/rollback/desync.js';
import { EventPresenter } from '../src/engine/rollback/EventPresenter.js';

const FRAMES = 1800; // 30 seconds of a match
/** @type {ReturnType<typeof recordedMatch>} */
let match;
beforeAll(() => {
  match = recordedMatch(FRAMES + 20);
});

describe('packets', () => {
  it('round-trip, and anything malformed decodes to null', () => {
    const p = decode(encodeInput(120, 117, -1.5, 110, [1, 2, 3, 255]));
    expect(p).toEqual({ type: INPUT, frame: 120, ack: 117, advantage: -1.5, start: 110, inputs: [1, 2, 3, 255] });
    expect(decode(encodeInput(5, -1, 0, 1, [0]))).toMatchObject({ ack: -1 });
    expect(decode(encodeChecksum(30, 0xdeadbeef))).toEqual({ type: 2, frame: 30, hash: 0xdeadbeef });
    expect(decode(encodePing(PING, 1234.5))).toEqual({ type: PING, time: 1234.5 });
    const bad = [new Uint8Array(0), new Uint8Array(200), Uint8Array.of(9, 0, 0, 0, 0, 0, 0, 0, 0), 'text', null, {}, encodeInput(1, 1, 0, 1, [1]).subarray(0, 15)];
    for (const b of bad) expect(decode(b)).toBeNull();
    const wrongCount = encodeInput(1, 1, 0, 1, [1, 2]);
    wrongCount[15] = 5;
    expect(decode(wrongCount)).toBeNull();
  });
});

describe('rollback equivalence', () => {
  it.each(Object.entries(PRESETS))('%s: both sides end in exactly the no-network state', (name, preset) => {
    const { a, b } = runPair({ log: match.log, frames: FRAMES, conditions: preset.conditions, seed: 7 });
    expect(hashState(a.stateAfter(FRAMES))).toBe(match.hashes[FRAMES]);
    expect(hashState(b.stateAfter(FRAMES))).toBe(match.hashes[FRAMES]);
    expect(a.desync).toBeNull();
    expect(b.desync).toBeNull();
    if (preset.conditions.latencyMs > 40) expect(a.stats.rollbacks + b.stats.rollbacks).toBeGreaterThan(0);
  });

  it('survives duplication, heavy reordering and 20% loss', () => {
    const conditions = { latencyMs: 100, jitterMs: 150, loss: 0.2, duplicate: 0.2 };
    const { a, b } = runPair({ log: match.log, frames: FRAMES, conditions, seed: 3 });
    expect(hashState(a.stateAfter(FRAMES))).toBe(match.hashes[FRAMES]);
    expect(hashState(b.stateAfter(FRAMES))).toBe(match.hashes[FRAMES]);
  });

  it.each([0, 1, 4, 8])('works with %i frames of input delay', (d) => {
    const { a, b } = runPair({ log: match.log, frames: FRAMES, conditions: PRESETS.acrossCountry.conditions, delay: [d, d] });
    expect(hashState(a.stateAfter(FRAMES))).toBe(match.hashes[FRAMES]);
    expect(hashState(b.stateAfter(FRAMES))).toBe(match.hashes[FRAMES]);
  });

  it('delay-based mode (no prediction) reaches the same state and never rolls back', () => {
    const { a, b } = runPair({ log: match.log, frames: 900, conditions: PRESETS.badWifi.conditions, mode: 'delay', delay: [4, 4] });
    expect(hashState(a.stateAfter(900))).toBe(match.hashes[900]);
    expect(hashState(b.stateAfter(900))).toBe(match.hashes[900]);
    expect(a.stats.rollbacks + b.stats.rollbacks).toBe(0);
    expect(a.stats.stalls).toBeGreaterThan(0);
  });

  it('changing the input delay mid-match keeps both sides identical', () => {
    const { a, b } = runPair({
      log: match.log, frames: 1200, conditions: PRESETS.sameCity.conditions,
      each: (t, x, y) => {
        if (t === 300) x.setInputDelay(5);
        if (t === 500) y.setInputDelay(0);
        if (t === 700) x.setInputDelay(1);
      },
    });
    expect(hashState(/** @type {any} */ (a.stateAfter(1200)))).toBe(hashState(/** @type {any} */ (b.stateAfter(1200))));
    expect(a.desync).toBeNull();
  });
});

describe('prediction and the rollback window', () => {
  it('predicts by repeating the last input, and counts the misses', () => {
    const { a } = runPair({ log: match.log, frames: 900, conditions: PRESETS.acrossCountry.conditions });
    expect(a.stats.predictedFrames).toBeGreaterThan(100);
    expect(a.stats.predictionMisses).toBeGreaterThan(0);
    // Most predictions are right: inputs rarely change from one frame to the next.
    expect(a.stats.predictionMisses).toBeLessThan(a.stats.predictedFrames / 2);
  });

  it('never rolls back further than the window: it waits instead', () => {
    const slow = { latencyMs: 250, jitterMs: 30, loss: 0.02 };
    for (const maxRollback of [2, 4]) {
      const { a, b } = runPair({ log: match.log, frames: 900, conditions: slow, maxRollback });
      expect(a.stats.longestRollback).toBeLessThanOrEqual(maxRollback);
      expect(b.stats.longestRollback).toBeLessThanOrEqual(maxRollback);
      expect(a.stats.stalls + b.stats.stalls).toBeGreaterThan(0);
      expect(hashState(a.stateAfter(900))).toBe(match.hashes[900]);
    }
  });

  it('a rollback of the full window costs well under a frame', () => {
    const { a } = runPair({ log: match.log, frames: 900, conditions: PRESETS.anotherContinent.conditions });
    expect(a.stats.maxResimMs).toBeLessThan(16);
  });
});

describe('time sync', () => {
  it('a side that starts late or runs slow is caught up: the frame gap stays bounded', () => {
    for (const opts of [{ startLag: 30 }, { slowEvery: 50 }]) {
      const { a, frameGap } = runPair({ log: match.log, frames: 1500, conditions: PRESETS.sameCity.conditions, ...opts });
      const late = frameGap.slice(600);
      const worst = Math.max(...late.map(([x, y]) => Math.abs(x - y)));
      expect(worst).toBeLessThanOrEqual(6);
      expect(a.timeSync.skips).toBeGreaterThan(0);
    }
  });
});

describe('presentation', () => {
  it('each real event is presented exactly once, never again when frames are re-simulated', () => {
    const { a, presented } = runPair({ log: match.log, frames: FRAMES, conditions: PRESETS.badWifi.conditions, seed: 11 });
    expect(a.stats.rollbacks).toBeGreaterThan(10);
    expect(a.presenter.suppressed).toBeGreaterThan(0);
    // No event presented twice (same type, side and move within the presenter's tolerance).
    const seen = presented[0];
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length && seen[j].frame - seen[i].frame <= 2; j++) {
        const same = seen[i].type === seen[j].type && seen[i].side === seen[j].side && seen[i].move === seen[j].move;
        expect(same, JSON.stringify([seen[i], seen[j]])).toBe(false);
      }
    }
    // Every hit and block that really happened was presented.
    const real = match.events.filter((e) => (e.type === 'hit' || e.type === 'block') && e.frame <= FRAMES - 10);
    for (const e of real) {
      const found = seen.some((p) => p.type === e.type && p.side === e.side && p.move === e.move && Math.abs(p.frame - e.frame) <= 12);
      expect(found, JSON.stringify(e)).toBe(true);
    }
  });

  it('the presenter drops repeats and lets new events through', () => {
    const p = new EventPresenter();
    const hit = /** @type {any} */ ({ type: 'hit', side: 0, move: '5L' });
    expect(p.filter(10, [hit], false)).toHaveLength(1);
    expect(p.filter(10, [hit], true)).toHaveLength(0);
    expect(p.filter(11, [hit], true)).toHaveLength(0);
    expect(p.filter(11, [{ ...hit, type: 'block' }], true)).toHaveLength(1);
    expect(p.filter(40, [hit], false)).toHaveLength(1);
  });
});

describe('desync detection', () => {
  it('catches a corrupted state on the next checksum and the log names the exact frame', () => {
    const { a, b } = runPair({
      log: match.log, frames: 600, conditions: PRESETS.perfect.conditions, delay: [3, 3],
      each: (t, x, y) => {
        // Corrupt side B's live state just before it simulates frame 300.
        if (y.state.frame === 299 && !y.state.options.stage.endsWith('!')) {
          y.state.fighters[0].health -= 37;
          y.state.options.stage += '!'; // (only once)
        }
      },
    });
    expect(a.desync).not.toBeNull();
    expect(b.desync).not.toBeNull();
    expect(/** @type {any} */ (a.desync).frame).toBe(300);
    const fromB = firstBadFrame(sim, /** @type {any} */ (b.desyncLog()));
    // The corruption happened after frame 299 was hashed: frame 300 is the first wrong one.
    expect(fromB).toMatchObject({ frame: 300, side: 'local' });
    const fromA = firstBadFrame(sim, /** @type {any} */ (a.desyncLog()));
    expect(fromA).toMatchObject({ frame: 300, side: 'remote' });
    // The two logs' inputs agree throughout: the states diverged, not the inputs.
    expect(firstDivergence(sim, /** @type {any} */ (a.desyncLog()), /** @type {any} */ (b.desyncLog()))).toBeNull();
  });

  it('a clean match has no desync and its log replays to the same state', () => {
    const { a } = runPair({ log: match.log, frames: 600, conditions: PRESETS.badWifi.conditions });
    expect(a.desync).toBeNull();
    expect(firstBadFrame(sim, /** @type {any} */ (a.desyncLog()))).toBeNull();
  });
});
