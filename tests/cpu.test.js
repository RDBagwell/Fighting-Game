/**
 * The CPU plays through inputs only. It reads the state and returns an
 * input byte; it never writes to the state. These tests freeze the state
 * object before every call (any write would throw), play whole CPU
 * matches, and check that difficulty matters.
 */
import { describe, it, expect } from 'vitest';
import { sim } from './helpers/harness.js';
import { Cpu, DIFFICULTIES } from '../src/game/cpu/Cpu.js';
import { saveState } from '../src/engine/sim/state.js';
import { roster } from '../src/game/data/characters/index.js';
import { PROFILES } from '../src/game/cpu/profiles.js';

/** @param {any} v */
function deepFreeze(v) {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
}

/**
 * @param {[string, string]} chars
 * @param {['easy'|'normal'|'hard', 'easy'|'normal'|'hard']} levels
 * @param {number} seed
 */
function cpuMatch(chars, levels, seed) {
  const s = sim.createMatch({ chars, seed });
  const cpus = [new Cpu(0, DIFFICULTIES[levels[0]], sim, seed * 2 + 1), new Cpu(1, DIFFICULTIES[levels[1]], sim, seed * 2 + 2)];
  const stats = { frames: 0, hits: 0, blocks: 0, specials: 0, kos: 0, parries: [0, 0], guardCancels: [0, 0], bursts: [0, 0] };
  while (s.phase !== 'matchEnd' && stats.frames < 60 * 60 * 8) {
    const inputs = [cpus[0].think(s), cpus[1].think(s)];
    sim.step(s, inputs);
    stats.frames++;
    for (const e of s.events) {
      if (e.type === 'hit') stats.hits++;
      if (e.type === 'block') stats.blocks++;
      if (e.type === 'special' || e.type === 'super') stats.specials++;
      if (e.type === 'ko') stats.kos++;
      if (e.type === 'parry') stats.parries[e.side]++;
      if (e.type === 'guard-cancel') stats.guardCancels[e.side]++;
      if (e.type === 'burst') stats.bursts[e.side]++;
    }
  }
  return { s, stats };
}

describe('the CPU', () => {
  it('only ever produces inputs: it never writes to the state', () => {
    const s = sim.createMatch({ chars: ['mack', 'kenji'], seed: 4 });
    const cpus = [new Cpu(0, DIFFICULTIES.hard, sim, 1), new Cpu(1, DIFFICULTIES.hard, sim, 2)];
    for (let i = 0; i < 3000; i++) {
      const frozen = deepFreeze(saveState(s));
      const before = JSON.stringify(frozen);
      const inputs = cpus.map((c) => c.think(frozen));
      expect(JSON.stringify(frozen)).toBe(before);
      for (const b of inputs) expect(Number.isInteger(b) && b >= 0 && b <= 255).toBe(true);
      sim.step(s, inputs);
    }
  });

  it('plays whole matches: it attacks, blocks, uses specials and wins by KO', () => {
    const total = { hits: 0, blocks: 0, specials: 0, kos: 0 };
    for (const chars of /** @type {Array<[string, string]>} */ ([['mack', 'kenji'], ['kenji', 'mack'], ['mack', 'mack']])) {
      const { s, stats } = cpuMatch(chars, ['normal', 'normal'], 3);
      expect(s.phase, chars.join(' v ')).toBe('matchEnd');
      for (const k of /** @type {Array<keyof typeof total>} */ (Object.keys(total))) total[k] += stats[k];
    }
    expect(total.hits).toBeGreaterThan(60);
    expect(total.blocks).toBeGreaterThan(10);
    expect(total.specials).toBeGreaterThan(10);
    expect(total.kos).toBeGreaterThanOrEqual(6);
  });

  it('every character has a CPU profile whose moves exist, and plays whole matches with its specials', () => {
    for (const char of roster) {
      const p = PROFILES[char];
      expect(p, char).toBeDefined();
      for (const pun of p.punishes) expect(sim.characters[char].moves[pun.move], `${char} punish ${pun.move}`).toBeDefined();
      const opponent = char === 'mack' ? 'kenji' : 'mack';
      const { s, stats } = cpuMatch([char, opponent], ['normal', 'normal'], 5);
      expect(s.phase, `${char} v ${opponent}`).toBe('matchEnd');
      expect(stats.hits, `${char}: hits`).toBeGreaterThan(15);
      expect(stats.specials, `${char}: specials`).toBeGreaterThan(2);
    }
  });

  it('Hard parries, guard-cancels and bursts; Easy never parries or guard-cancels', () => {
    const hard = [0, 0, 0];
    const easy = [0, 0];
    for (const [i, chars] of /** @type {Array<[string, string]>} */ ([['mack', 'kenji'], ['deka', 'mav'], ['elumlur', 'reroe'], ['kenji', 'deka'], ['mav', 'mack'], ['reroe', 'elumlur']]).entries()) {
      const { stats } = cpuMatch(chars, ['hard', 'easy'], 40 + i);
      hard[0] += stats.parries[0];
      hard[1] += stats.guardCancels[0];
      hard[2] += stats.bursts[0];
      easy[0] += stats.parries[1];
      easy[1] += stats.guardCancels[1];
    }
    for (const [i, chars] of /** @type {Array<[string, string]>} */ ([['mack', 'kenji'], ['deka', 'mav'], ['elumlur', 'reroe']]).entries()) {
      const { stats } = cpuMatch(chars, ['hard', 'hard'], 60 + i);
      hard[0] += stats.parries[0] + stats.parries[1];
      hard[1] += stats.guardCancels[0] + stats.guardCancels[1];
      hard[2] += stats.bursts[0] + stats.bursts[1];
    }
    expect(hard.every((n) => n > 0), `hard: ${hard}`).toBe(true);
    expect(easy, 'easy').toEqual([0, 0]);
  });

  it('a CPU match is reproducible from its seeds', () => {
    const a = cpuMatch(['mack', 'kenji'], ['hard', 'easy'], 11);
    const b = cpuMatch(['mack', 'kenji'], ['hard', 'easy'], 11);
    expect(JSON.stringify(a.s)).toBe(JSON.stringify(b.s));
  });

  it('Hard beats Easy most of the time', () => {
    let hardWins = 0;
    const games = 10;
    for (let seed = 1; seed <= games; seed++) {
      const hardSide = seed % 2;
      /** @type {['easy'|'normal'|'hard', 'easy'|'normal'|'hard']} */
      const levels = hardSide === 0 ? ['hard', 'easy'] : ['easy', 'hard'];
      const chars = /** @type {[string, string]} */ (seed % 4 < 2 ? ['mack', 'kenji'] : ['kenji', 'mack']);
      const { s } = cpuMatch(chars, levels, seed);
      if (s.matchWinner === hardSide) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(8);
  });
});
