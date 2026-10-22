/**
 * The move list's "how to do it" texts: every move of every character
 * gets readable instructions, built from the player's own bindings.
 */
import { describe, it, expect } from 'vitest';
import { sim } from './helpers/harness.js';
import { howTo } from '../src/game/ui/howTo.js';
import { DEFAULT_KEYS, DEFAULT_PAD } from '../src/engine/input/bindings.js';

const controls = { kbA: DEFAULT_KEYS.kbA, pad: DEFAULT_PAD };
const how = (/** @type {string} */ char, /** @type {string} */ id, c = controls) => howTo(sim.characters[char].moves[id], sim.motions, c);

describe('how to do a move', () => {
  it('a quarter-circle special, on keyboard and controller', () => {
    const t = how('mack', '236M');
    expect(t.arrows).toBe('↓ ↘ → + Medium');
    expect(t.keyboard).toBe('S, S+D, D, then K');
    expect(t.pad).toBe('↓ ↘ →, then Y / △');
    expect(t.words).toBe('Roll down, down-forward, forward, then Medium');
    expect(t.easy).toEqual({ keyboard: 'I alone', pad: 'RB / R1 alone' });
  });

  it('a dragon-punch motion, a charge move and the super', () => {
    expect(how('mack', '623L').keyboard).toBe('D, S, S+D, then J');
    expect(how('mack', '623L').easy?.keyboard).toBe('I + A');
    expect(how('kenji', '46M').keyboard).toBe('Hold A for ⅔ of a second, then D + K');
    expect(how('kenji', '46M').pad).toBe('Hold ← for ⅔ of a second, then → + Y / △');
    expect(how('mack', '236236H').keyboard).toBe('S, S+D, D, S, S+D, D, then L');
    expect(how('mack', '236236H').easy).toEqual({ keyboard: 'I + L', pad: 'RB / R1 + B / ○' });
  });

  it('normals: standing, crouching, a command normal, in the air, and the throw', () => {
    expect(how('mack', '5L').keyboard).toBe('J');
    expect(how('mack', '2H').keyboard).toBe('Hold S + L');
    expect(how('mack', '6M').keyboard).toBe('D + K');
    expect(how('mack', 'j.H').keyboard).toBe('W, then L in the air');
    expect(how('mack', 'throw').keyboard).toBe('U (or J+K together); hold A to throw backwards');
    expect(how('mack', 'throw').pad).toBe('A / ✕ (or X / □ + Y / △); hold ← to throw backwards');
  });

  it('uses the player’s remapped keys', () => {
    const kbA = { ...DEFAULT_KEYS.kbA, down: ['ArrowDown'], right: ['ArrowRight'], M: ['KeyX'] };
    expect(how('mack', '236M', { kbA, pad: DEFAULT_PAD }).keyboard).toBe('Down, Down+Right, Right, then X');
  });

  it('every move of every character has complete instructions', () => {
    for (const [char, ch] of Object.entries(sim.characters)) {
      for (const [id, mv] of Object.entries(ch.moves)) {
        const t = howTo(mv, sim.motions, controls);
        for (const [k, v] of Object.entries(t)) {
          if (k === 'easy') continue;
          expect(v, `${char} ${id} ${k}`).toMatch(/\S/);
          expect(v, `${char} ${id} ${k}`).not.toMatch(/\?|undefined/);
        }
      }
    }
  });
});
