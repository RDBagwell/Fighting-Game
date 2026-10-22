/**
 * Rounds, the timer, KOs, time-outs, best of three, and training mode's
 * rules (no timer, no KO, health refills).
 */
import { describe, it, expect } from 'vitest';
import { sim, setup, script, run } from './helpers/harness.js';

const cfg = sim.config;

/**
 * Steps with no input. Hit-stop frames don't advance the round's phases,
 * so waiting out a KO allows for them.
 * @param {import('../src/engine/sim/types.js').MatchState} s
 * @param {number} n
 */
const idle = (s, n) => {
  for (let i = 0; i < n; i++) sim.step(s, [0, 0]);
};

describe('rounds', () => {
  it('a round starts with an intro in which nobody can act, then the fight', () => {
    const s = sim.createMatch({ chars: ['mack', 'kenji'] });
    expect(s.phase).toBe('intro');
    run(s, script('6*50', 1), [0]);
    expect(s.fighters[0].x).toBe(sim.createMatch({ chars: ['mack', 'kenji'] }).fighters[0].x);
    idle(s, cfg.introFrames);
    expect(s.phase).toBe('fight');
  });

  it('the timer counts down 99 seconds of frames; at zero, more health wins', () => {
    const s = setup({ chars: ['mack', 'kenji'], x: [300, 700] });
    // Kenji has more health left (510 to 500) but a smaller share of his
    // 1050 maximum: health is compared as a share, so Mack wins.
    s.fighters[0].health = 500;
    s.fighters[1].health = 510;
    idle(s, cfg.roundFrames);
    expect(s.timer).toBe(0);
    expect(s.phase).toBe('timeout');
    expect(s.roundWinner).toBe(0);
    idle(s, cfg.timeoutFrames);
    expect(s.wins).toEqual([1, 0]);
    expect(s.phase).toBe('intro');
    expect(s.round).toBe(2);
  });

  it('equal health at time-out is a draw round: both score', () => {
    const s = setup({ chars: ['mack', 'mack'], x: [300, 700] });
    idle(s, cfg.roundFrames + cfg.timeoutFrames);
    expect(s.wins).toEqual([1, 1]);
  });

  it('a KO ends the round; meter carries over to the next', () => {
    const s = setup({ x: [480, 510] });
    s.fighters[1].health = 10;
    s.fighters[0].meter = 300;
    run(s, script('5+H 5*20', 1), [0]);
    expect(s.phase).toBe('ko');
    expect(s.roundWinner).toBe(0);
    idle(s, cfg.koFrames + 30);
    expect(s.wins).toEqual([1, 0]);
    expect(s.round).toBe(2);
    expect(s.fighters[1].health).toBe(sim.characters.mack.stats.health);
    expect(s.fighters[0].meter).toBeGreaterThanOrEqual(300);
  });

  it('nothing can hit a KO\'d fighter', () => {
    const s = setup({ x: [480, 510] });
    s.fighters[1].health = 10;
    run(s, script('5+H 5*30 5+L 5*30', 1), [0]);
    expect(s.fighters[1].health).toBe(0);
    expect(s.fighters[1].combo).toBeLessThanOrEqual(1);
  });

  it('best of three: two round wins take the match', () => {
    const s = setup({ x: [480, 510] });
    for (let round = 0; round < 2; round++) {
      s.phase = 'fight';
      s.fighters[1].health = 10;
      s.fighters[0].x = 480 * 256;
      s.fighters[1].x = 510 * 256;
      run(s, script('5+H 5*20', 1), [0]);
      idle(s, cfg.koFrames + 30);
    }
    expect(s.phase).toBe('matchEnd');
    expect(s.matchWinner).toBe(0);
    expect(s.wins).toEqual([2, 0]);
  });

  it('a double KO is a draw round', () => {
    const s = setup({ x: [480, 510] });
    s.fighters[0].health = 5;
    s.fighters[1].health = 5;
    // Both press 5L on the same frame: the hits trade.
    run(s, script('5+L 5*10', 1), script('5+L 5*10', -1));
    expect(s.roundWinner).toBe(2);
    idle(s, cfg.koFrames + 30);
    expect(s.wins).toEqual([1, 1]);
  });

  it('knocked-down fighters get up after the knockdown and wake-up frames', () => {
    const s = setup({ x: [480, 510] });
    run(s, script('2+H 5*20', 1), [0]);
    let frames = 0;
    while (!sim.isActionable(s.fighters[1]) && frames < 300) {
      sim.step(s, [0, 0]);
      frames++;
    }
    expect(frames).toBeGreaterThan(cfg.knockdownFrames + cfg.wakeupFrames);
  });
});

describe('training mode', () => {
  it('has no timer and no KO, and refills health after a combo', () => {
    const s = setup({ x: [480, 510], training: true });
    s.fighters[1].health = 5;
    run(s, script('5+H 5*20', 1), [0]);
    expect(s.fighters[1].health).toBe(1);
    expect(s.phase).toBe('fight');
    idle(s, 200);
    expect(s.fighters[1].health).toBe(sim.characters.mack.stats.health);
    expect(s.timer).toBe(cfg.roundFrames);
  });

  it('infinite meter keeps the meter full', () => {
    const s = setup({ x: [300, 700], training: true, infiniteMeter: true });
    run(s, script('2 3 6 2 3 6+H 5*60', 1), [0]);
    expect(s.fighters[0].meter).toBe(cfg.meterMax);
  });
});
