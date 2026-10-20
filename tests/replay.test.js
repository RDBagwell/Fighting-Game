/**
 * Replays: a replay is the starting options plus both players' inputs, so
 * playing it back must reproduce the match exactly, seeking must land on
 * the same state as playing straight through, and anything malformed or
 * from another version of the game must be refused.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { sim } from './helpers/harness.js';
import { recordedMatch, runPair, MATCH } from './helpers/rollback.js';
import { PRESETS } from '../src/engine/rollback/presets.js';
import { hashState } from '../src/engine/sim/state.js';
import {
  makeReplay, replayFromSession, initialState, encodeReplay, decodeReplay,
  snapshotReplay, seekState, SNAPSHOT_EVERY, gameVersion, REPLAY_FORMAT,
  saveReplay, listReplays, deleteReplay,
} from '../src/game/replay/replays.js';

const OPTIONS = { chars: /** @type {[string, string]} */ (['mack', 'kenji']), seed: MATCH.seed ?? 21, stage: 'dusk-shrine' };
const META = { mode: /** @type {const} */ ('cpu'), names: /** @type {[string, string]} */ (['Mack', 'Kenji']) };
const FRAMES = 1500;
const recorded = recordedMatch(FRAMES);

/** @param {import('../src/game/replay/replays.js').Replay} r */
function playThrough(r) {
  const s = initialState(sim, r);
  for (const inp of r.inputs) sim.step(s, inp);
  return s;
}

/** Splits an encoded replay and re-encodes its header after `edit`. */
function withHeader(/** @type {string} */ text, /** @type {(h: any) => void} */ edit) {
  const [prefix, header, inputs] = text.split('.');
  const json = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
  edit(json);
  return `${prefix}.${Buffer.from(JSON.stringify(json)).toString('base64url')}.${inputs}`;
}

describe('replays', () => {
  const replay = makeReplay(sim, OPTIONS, recorded.log, META);

  it('plays back to the identical final state', () => {
    expect(hashState(playThrough(replay))).toBe(recorded.hashes[FRAMES]);
  });

  it('survives encoding and decoding unchanged', () => {
    const text = encodeReplay(replay);
    const back = decodeReplay(text, sim);
    expect(back.header).toEqual(replay.header);
    expect(back.inputs).toEqual(replay.inputs);
    expect(hashState(playThrough(back))).toBe(recorded.hashes[FRAMES]);
    // Small enough to share: a 25-second CPU match.
    expect(text.length).toBeLessThan(8000);
  });

  it('seeking lands on the same state as playing straight through', () => {
    const { snapshots, final } = snapshotReplay(sim, replay);
    expect(hashState(final)).toBe(recorded.hashes[FRAMES]);
    expect(snapshots.length).toBe(Math.ceil(FRAMES / SNAPSHOT_EVERY));
    for (const f of [0, 1, 179, 180, 181, 777, 1234, FRAMES - 1, FRAMES]) {
      expect(hashState(seekState(sim, replay, snapshots, f)), `frame ${f}`).toBe(recorded.hashes[f]);
    }
    // Backwards and forwards again, and out-of-range targets clamp.
    expect(hashState(seekState(sim, replay, snapshots, 900))).toBe(recorded.hashes[900]);
    expect(hashState(seekState(sim, replay, snapshots, 300))).toBe(recorded.hashes[300]);
    expect(hashState(seekState(sim, replay, snapshots, -5))).toBe(recorded.hashes[0]);
    expect(hashState(seekState(sim, replay, snapshots, FRAMES + 99))).toBe(recorded.hashes[FRAMES]);
    // Seeking never disturbs the snapshots.
    expect(hashState(seekState(sim, replay, snapshots, 500))).toBe(recorded.hashes[500]);
  });

  it('a replay of an online match (Bad Wi-Fi) matches both players’ final state', () => {
    const { a, b } = runPair({ log: recorded.log, frames: 900, conditions: PRESETS.badWifi.conditions, seed: 4 });
    const r = replayFromSession(sim, a, OPTIONS, { mode: 'online', names: ['A', 'B'] });
    const final = playThrough(decodeReplay(encodeReplay(r), sim));
    expect(hashState(final)).toBe(hashState(a.stateAfter(final.frame) ?? final));
    expect(hashState(final)).toBe(recorded.hashes[final.frame]);
    expect(b.log.slice(0, r.inputs.length)).toEqual(r.inputs);
  });
});

describe('loaded replays are untrusted input', () => {
  const good = encodeReplay(makeReplay(sim, OPTIONS, recorded.log.slice(0, 300), META));
  /** @param {string} text */
  const reject = (text, message = /damaged|not a Dusk Duel|different version/) => expect(() => decodeReplay(text, sim)).toThrow(message);

  it('accepts the good one', () => {
    expect(decodeReplay(good, sim).inputs.length).toBe(300);
    expect(decodeReplay(`  ${good}\n`, sim).inputs.length).toBe(300);
  });

  it('rejects things that are not replays', () => {
    for (const bad of ['', 'hello', 'DD1.', 'DD1..', 'DD1.a.b.c', '{"format":1}', 'x'.repeat(2_000_001)]) reject(bad);
    // @ts-expect-error not a string
    reject(42);
  });

  it('rejects a different replay format or game version', () => {
    reject(good.replace(/^DD1\./, 'DD9.'), /different version of the replay format/);
    reject(withHeader(good, (h) => { h.game = h.game === '00000000' ? '00000001' : '00000000'; }), /different version of the game/);
    reject(withHeader(good, (h) => { h.format = REPLAY_FORMAT + 1; }), /damaged/);
  });

  it('rejects a malformed header', () => {
    const edits = [
      (/** @type {any} */ h) => { h.extra = 1; },
      (/** @type {any} */ h) => { delete h.seed; },
      (/** @type {any} */ h) => { h.seed = -1; },
      (/** @type {any} */ h) => { h.frames = 0; },
      (/** @type {any} */ h) => { h.frames = 1e9; },
      (/** @type {any} */ h) => { h.mode = 'ranked'; },
      (/** @type {any} */ h) => { h.names = ['x'.repeat(41), 'y']; },
      (/** @type {any} */ h) => { h.chars = ['mack']; },
      (/** @type {any} */ h) => { h.chars = ['mack', '__proto__']; },
      (/** @type {any} */ h) => { h.stage = 'moon'; },
    ];
    for (const edit of edits) reject(withHeader(good, edit), /damaged|character/);
    const [p, , inputs] = good.split('.');
    reject(`${p}.${Buffer.from('not json').toString('base64url')}.${inputs}`);
    reject(`${p}.!!!.${inputs}`);
  });

  it('rejects input data that does not match the header', () => {
    const [p, header] = good.split('.');
    const rle = (/** @type {number[]} */ bytes) => `${p}.${header}.${Buffer.from(bytes).toString('base64url')}`;
    reject(rle([]));                  // no inputs
    reject(rle([255, 0, 0]));         // too few frames
    reject(rle([255, 0, 0, 255, 0, 0])); // too many (510 > 300)
    reject(rle([0, 0, 0]));           // a zero-length run
    reject(rle([100, 0]));            // not whole triplets
    reject(`${p}.${header}.@@@`);
    expect(decodeReplay(rle([200, 0, 0, 100, 1, 2]), sim).inputs[250]).toEqual([1, 2]);
  });

  it('the game version changes when the rules change', () => {
    const v = gameVersion(sim);
    const changed = { ...sim, config: { ...sim.config, roundFrames: (sim.config.roundFrames ?? 0) + 1 } };
    expect(gameVersion(/** @type {any} */ (changed))).not.toBe(v);
  });
});

describe('replays kept on this device', () => {
  /** @type {Map<string, string>} */
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = /** @type {any} */ ({
      getItem: (/** @type {string} */ k) => store.get(k) ?? null,
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => { store.set(k, v); },
    });
  });

  it('keeps the newest twelve, and deletes', () => {
    const r = makeReplay(sim, OPTIONS, recorded.log.slice(0, 120), META);
    const ids = [];
    for (let i = 0; i < 14; i++) ids.push(saveReplay(r).id);
    const list = listReplays();
    expect(list.length).toBe(12);
    expect(list[0].id).toBe(ids[13]);
    expect(decodeReplay(list[0].data, sim).inputs.length).toBe(120);
    deleteReplay(ids[13]);
    expect(listReplays().map((x) => x.id)).not.toContain(ids[13]);
  });

  it('survives corrupt or missing storage', () => {
    store.set('dusk-duel-replays-v1', '{not json');
    expect(listReplays()).toEqual([]);
    store.set('dusk-duel-replays-v1', JSON.stringify([{ id: 1 }, null, { id: 'a', data: 'DD1.x.y' }]));
    expect(listReplays().length).toBe(1);
    globalThis.localStorage = /** @type {any} */ ({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(listReplays()).toEqual([]);
    expect(() => saveReplay(makeReplay(sim, OPTIONS, recorded.log.slice(0, 10), META))).not.toThrow();
  });
});
