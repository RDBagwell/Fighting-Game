/**
 * The training dummy's defensive options: parry every hit, guard-cancel
 * out of blocks, burst on the second hit of a combo.
 */
import { describe, it, expect } from 'vitest';
import { sim, setup, script } from './helpers/harness.js';
import { Dummy } from '../src/game/training/Dummy.js';

/**
 * Player 1 plays `p1`; the dummy plays player 2.
 * @param {Dummy} dummy
 * @param {string} p1
 * @param {object} [o]
 */
function play(dummy, p1, o = {}) {
  const s = setup({ chars: ['mack', 'kenji'], x: [480, 515], training: true, ...o });
  const inputs = script(`${p1} 5*60`, 1);
  /** @type {string[]} */
  const events = [];
  for (const bits of inputs) {
    sim.step(s, [bits, dummy.think(s, bits)]);
    for (const e of s.events) events.push(`${e.type}:${e.side}`);
  }
  return { s, events };
}

describe('the training dummy', () => {
  it('parries every hit, including a combo and a five-hit super', () => {
    const dummy = new Dummy(sim);
    dummy.parry = true;
    const combo = play(dummy, '5+M 5*9 2 3 6+M');
    expect(combo.events.filter((e) => e === 'parry:1').length).toBe(1);
    expect(combo.events).not.toContain('hit:0');

    const superMove = play(dummy, '2 3 6 2 3 6+H 5*120', { infiniteMeter: true });
    expect(superMove.events.filter((e) => e === 'parry:1').length).toBe(sim.characters.mack.moves['236236H'].hits.length);
    expect(superMove.events).not.toContain('hit:0');
  });

  it('parries lows crouching', () => {
    const dummy = new Dummy(sim);
    dummy.parry = true;
    const { events } = play(dummy, '2+M');
    expect(events).toContain('parry:1');
  });

  it('guard-cancels out of a block when it has the meter', () => {
    const dummy = new Dummy(sim);
    dummy.block = 'all';
    dummy.guardCancel = true;
    expect(play(dummy, '5+H', { infiniteMeter: true }).events).toContain('guard-cancel:1');
    expect(play(dummy, '5+H').events).not.toContain('guard-cancel:1');
  });

  it('bursts on the second hit of a combo', () => {
    const dummy = new Dummy(sim);
    dummy.burst = true;
    const one = play(dummy, '5+M');
    expect(one.events).not.toContain('burst:1');
    const two = play(dummy, '5+M 5*9 2 3 6+M');
    expect(two.events).toContain('burst:1');
  });
});
