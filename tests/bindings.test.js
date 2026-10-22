/**
 * Stored control bindings: settings saved before an action existed get
 * its default, unless that key is already used for something else.
 */
import { describe, it, expect } from 'vitest';
import { sanitiseBinding, DEFAULT_KEYS, DEFAULT_PAD, ACTIONS, ACTION_BITS } from '../src/engine/input/bindings.js';
import { L, M, H } from '../src/engine/input/bits.js';

describe('control bindings', () => {
  it('parry is M+H and burst is L+M+H', () => {
    expect(ACTION_BITS.parry).toBe(M | H);
    expect(ACTION_BITS.burst).toBe(L | M | H);
  });

  it('no default key or pad button does two things', () => {
    for (const binding of [DEFAULT_KEYS.kbA, DEFAULT_KEYS.kbB, DEFAULT_PAD]) {
      const all = ACTIONS.flatMap((a) => binding[a]);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('old settings without parry or burst get the defaults', () => {
    const old = Object.fromEntries(ACTIONS.filter((a) => a !== 'parry' && a !== 'burst').map((a) => [a, DEFAULT_KEYS.kbA[a]]));
    const out = sanitiseBinding(old, DEFAULT_KEYS.kbA);
    expect(out.parry).toEqual(DEFAULT_KEYS.kbA.parry);
    expect(out.burst).toEqual(DEFAULT_KEYS.kbA.burst);
  });

  it('a new default the player already uses elsewhere is left out', () => {
    const old = Object.fromEntries(ACTIONS.filter((a) => a !== 'parry' && a !== 'burst').map((a) => [a, DEFAULT_KEYS.kbB[a]]));
    old.L = ['KeyM']; // the player moved Light to M, which is now a parry default
    const out = sanitiseBinding(old, DEFAULT_KEYS.kbB);
    expect(out.L).toEqual(['KeyM']);
    expect(out.parry).toEqual(['Numpad6']);
  });
});
