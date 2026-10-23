/**
 * The defensive mechanics, played through the real simulation: the parry
 * (M+H), the guard cancel (M+H while blocking, half the meter) and the
 * burst (L+M+H while being hit, once a round). config.js has their numbers.
 */
import { describe, it, expect } from 'vitest';
import { sim, setup, script, run, bits } from './helpers/harness.js';
import { moveLength } from '../src/engine/sim/frameData.js';
import { saveState, loadState, hashState } from '../src/engine/sim/state.js';
import { L, M, H } from '../src/engine/input/bits.js';

/** Mack's health: the default fighter's, before any damage. */
const FULL = sim.characters.mack.stats.health;

const cfg = sim.config;

/**
 * Steps until `until` is true (or `max` frames), collecting events.
 * @param {any} s
 * @param {(s: any, i: number) => [number, number]} inputs
 * @param {number} max
 */
function drive(s, inputs, max = 300) {
  /** @type {any[]} */
  const events = [];
  for (let i = 0; i < max; i++) {
    sim.step(s, inputs(s, i));
    events.push(...s.events.map((e) => ({ ...e, frame: s.frame })));
  }
  return events;
}

/**
 * A perfect parrier for player 2: presses M+H (crouching for lows) so the
 * parry starts just before each of the attacker's hits.
 * @param {any} s
 * @param {number} prev  Player 2's input last frame
 */
function parryBot(s, prev) {
  const [a, d] = s.fighters;
  if (a.state !== 'move' || !sim.isNeutral(d) || (prev & (M | H))) return 0;
  const mv = sim.characters[a.char].moves[a.move];
  for (let i = 0; i < (mv.hits ?? []).length; i++) {
    if (a.hitsDone & (1 << i)) continue;
    const ahead = mv.hits[i].frames[0] - a.moveFrame - (s.freeze > 0 ? 0 : 1);
    if (ahead >= 0 && ahead <= 2) return bits(mv.hits[i].guard === 'low' ? '2+MH' : '5+MH', d.facing);
  }
  return 0;
}

describe('parry', () => {
  it('catches a mid: no damage, both freeze, and the parrying fighter acts first by the rest of the move', () => {
    const s = setup({ chars: ['mack', 'mack'], x: [480, 510] });
    const mv = sim.characters.mack.moves['5M'];
    // 5M is active from frame 8; the parry is pressed on frame 5 (its window covers 5-10).
    const p1 = script('5+M 5*80', 1);
    const p2 = script('5*4 5+MH 5*80', -1);
    let parryFrame = -1;
    let attackerFree = -1;
    let defenderFree = -1;
    const events = drive(s, (st, i) => {
      if (parryFrame > 0 && st.freeze === 0) {
        if (defenderFree < 0 && sim.isActionable(st.fighters[1])) defenderFree = st.frame;
        if (attackerFree < 0 && sim.isActionable(st.fighters[0])) attackerFree = st.frame;
      }
      return [p1[i] ?? 0, p2[i] ?? 0];
    }, 80);
    const parry = events.find((e) => e.type === 'parry');
    parryFrame = parry?.frame ?? -1;
    expect(parry, 'parried').toBeDefined();
    expect(parry.side).toBe(1);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(s.fighters[1].health).toBe(FULL);
    expect(s.fighters[1].meter).toBe(cfg.parry.meter);

    // Replay it, measuring who can act first after the freeze.
    const t = setup({ chars: ['mack', 'mack'], x: [480, 510] });
    let after = -1;
    for (let i = 0; i < 80; i++) {
      const frozen = t.freeze > 0;
      sim.step(t, [p1[i] ?? 0, p2[i] ?? 0]);
      if (t.events.some((e) => e.type === 'parry')) after = 0;
      else if (after >= 0 && !frozen) {
        after++;
        if (defenderFree < 0 && sim.isActionable(t.fighters[1])) defenderFree = after;
        if (attackerFree < 0 && sim.isActionable(t.fighters[0])) attackerFree = after;
      }
    }
    expect(defenderFree).toBe(1);
    expect(attackerFree - defenderFree).toBe(moveLength(mv) - mv.startup);
  });

  it('a parried normal can’t be cancelled into a special', () => {
    const s = setup({ chars: ['mack', 'mack'], x: [480, 510] });
    const events = drive(s, (st, i) => [script('5+M 5*9 2 3 6+M 5*80', 1)[i] ?? 0, script('5*4 5+MH 5*80', -1)[i] ?? 0], 80);
    expect(events.some((e) => e.type === 'parry')).toBe(true);
    expect(events.some((e) => e.type === 'special')).toBe(false);
  });

  it('standing parries miss lows, crouching parries miss overheads', () => {
    const lowVsStand = setup({ x: [480, 510] });
    const e1 = drive(lowVsStand, (st, i) => [script('2+M 5*60', 1)[i] ?? 0, script('5*4 5+MH 5*60', -1)[i] ?? 0], 60);
    expect(e1.some((e) => e.type === 'parry')).toBe(false);
    expect(e1.some((e) => e.type === 'hit')).toBe(true);

    const lowVsCrouch = setup({ x: [480, 510] });
    const e2 = drive(lowVsCrouch, (st, i) => [script('2+M 5*60', 1)[i] ?? 0, script('5*4 2+MH 5*60', -1)[i] ?? 0], 60);
    expect(e2.some((e) => e.type === 'parry')).toBe(true);

    // 6M is Mack's overhead, active from frame 18.
    const overheadVsCrouch = setup({ x: [480, 510] });
    const e3 = drive(overheadVsCrouch, (st, i) => [script('6+M 5*60', 1)[i] ?? 0, script('5*14 2+MH 5*60', -1)[i] ?? 0], 60);
    expect(e3.some((e) => e.type === 'parry')).toBe(false);
    expect(e3.some((e) => e.type === 'hit')).toBe(true);
  });

  it('a parry that catches nothing can’t act for its whole length, and can be hit after its window', () => {
    const s = setup({ x: [480, 510] });
    run(s, script('5*30', 1), script('5+MH', -1));
    const length = cfg.parry.window + cfg.parry.recovery;
    const t = setup({ x: [480, 510] });
    let free = -1;
    for (let i = 0; i < 60 && free < 0; i++) {
      sim.step(t, [0, i === 0 ? bits('5+MH', -1) : 0]);
      if (i > 0 && sim.isActionable(t.fighters[1])) free = i + 1;
    }
    expect(free, 'acts on the frame after the parry ends').toBe(length + 1);

    // Mack's 5L (startup 5) punishes it: pressed as the parry is whiffed.
    const u = setup({ x: [480, 510] });
    const events = drive(u, (st, i) => [script('5*4 5+L 5*40', 1)[i] ?? 0, script('5+MH 5*40', -1)[i] ?? 0], 40);
    expect(events.some((e) => e.type === 'hit' && e.side === 0)).toBe(true);
  });

  it('a throw beats a parry', () => {
    const s = setup({ x: [480, 510] });
    const events = drive(s, (st, i) => [script('5*2 5+LM 5*60', 1)[i] ?? 0, script('5+MH 5*60', -1)[i] ?? 0], 60);
    expect(events.some((e) => e.type === 'throw')).toBe(true);
    expect(s.fighters[1].health).toBeLessThan(FULL);
  });

  it('catches a projectile, which is used up', () => {
    const s = setup({ chars: ['kenji', 'mack'], x: [300, 520] });
    let parried = false;
    let prev = 0;
    drive(s, (st, i) => {
      const p = st.projectiles[0];
      let p2 = 0;
      if (p && !parried && !(prev & (M | H)) && sim.isNeutral(st.fighters[1]) && Math.abs(p.x - st.fighters[1].x) < 45 * 256) p2 = bits('5+MH', -1);
      prev = p2;
      if (st.events.some((e) => e.type === 'parry')) parried = true;
      return [script('2 3 6+M 5*120', 1)[i] ?? 0, p2];
    }, 120);
    expect(parried).toBe(true);
    expect(s.fighters[1].health).toBe(FULL);
    expect(s.projectiles.length).toBe(0);
  });

  // A perfect parrier takes no damage from any strike: every hit of every
  // move can be parried, one parry per hit (multi-hit moves and supers too).
  for (const [charId, ch] of Object.entries(sim.characters)) {
    const moves = Object.entries(ch.moves).filter(([, m]) => m.hits && m.stance !== 'air' && m.kind !== 'guardCancel' && m.kind !== 'burst' && !m.projectile);
    it(`${charId}: every hit of every grounded strike can be parried`, () => {
      for (const [id, mv] of moves) {
        const s = setup({ chars: [charId, 'mack'], x: [480, 510], infiniteMeter: true });
        const attack = script(
          mv.motion === 'qcf' ? `2 3 6+${mv.button}` : mv.motion === 'qcb' ? `2 1 4+${mv.button}` : mv.motion === 'dp' ? `6 2 3+${mv.button}`
            : mv.motion === 'qcf2' ? `2 3 6 2 3 6+${mv.button}` : mv.motion === 'chargeBF' ? `1*45 6+${mv.button}`
              : mv.stance === 'crouch' ? `2+${mv.button}` : `${mv.dir ?? 5}+${mv.button}`, 1);
        let prev = 0;
        const events = drive(s, (st, i) => {
          const p2 = parryBot(st, prev);
          prev = p2;
          return [attack[i] ?? 0, p2];
        }, 200);
        expect(events.filter((e) => e.type === 'hit').length, `${charId} ${id} hits`).toBe(0);
        expect(events.filter((e) => e.type === 'parry').length, `${charId} ${id} parries`).toBe(mv.hits.length);
      }
    });
  }
});

describe('guard cancel', () => {
  /**
   * Mack blocks Kenji's 5H, then presses M+H once the hit-stop is over.
   * @param {number} meter
   */
  function blockThen(meter) {
    const s = setup({ chars: ['kenji', 'mack'], x: [480, 520] });
    s.fighters[1].meter = meter;
    let pressed = false;
    const events = drive(s, (st, i) => {
      let p2 = bits('4', -1);
      if (!pressed && st.fighters[1].state === 'blockstun' && st.freeze === 0) {
        p2 = bits('4+MH', -1);
        pressed = true;
      } else if (pressed) p2 = 0;
      return [script('5+H 5*80', 1)[i] ?? 0, p2];
    }, 80);
    return { s, events };
  }

  it('comes out of blockstun for half the meter, knocks down and builds no meter', () => {
    const { s, events } = blockThen(1000);
    expect(events.some((e) => e.type === 'block')).toBe(true);
    const gc = events.find((e) => e.type === 'guard-cancel');
    expect(gc?.side).toBe(1);
    const hit = events.find((e) => e.type === 'hit' && e.side === 1);
    expect(hit?.damage).toBe(cfg.guardCancel.damage);
    expect(s.fighters[1].meter).toBe(1000 - cfg.guardCancel.cost);
    expect(['knockdown', 'wakeup', 'stand']).toContain(s.fighters[0].state);
    expect(s.fighters[0].meter).toBe(Math.trunc(sim.characters.kenji.moves['5H'].hits[0].damage * cfg.meterGain.block / 100));
  });

  it('needs half the meter', () => {
    const { events } = blockThen(cfg.guardCancel.cost - 1);
    expect(events.some((e) => e.type === 'guard-cancel')).toBe(false);
  });

  it('is invincible: an attack it meets doesn’t hit it', () => {
    const s = setup({ chars: ['mack', 'mack'], x: [480, 510] });
    s.fighters[1].state = 'blockstun';
    s.fighters[1].stun = 10;
    s.fighters[1].meter = 1000;
    // Mack's 5L comes out on the same frame the guard cancel starts.
    const events = drive(s, (st, i) => [script('5+L 5*40', 1)[i] ?? 0, script('5+MH 5*40', -1)[i] ?? 0], 40);
    expect(events.some((e) => e.type === 'hit' && e.side === 0)).toBe(false);
    expect(events.some((e) => e.type === 'hit' && e.side === 1)).toBe(true);
  });

  it('M+H outside blockstun is a parry, not a guard cancel', () => {
    const s = setup({ x: [480, 510] });
    s.fighters[1].meter = 1000;
    const events = drive(s, (st, i) => [0, script('5+MH 5*30', -1)[i] ?? 0], 30);
    expect(events.some((e) => e.type === 'guard-cancel')).toBe(false);
    expect(s.fighters[1].meter).toBe(1000);
  });
});

describe('burst', () => {
  /**
   * Player 2 presses L+M+H on the first frame after hit-stop while being hit.
   * @param {any} s
   * @param {number[]} p1
   * @param {number} [max]
   */
  function burstWhenHit(s, p1, max = 120) {
    let pressed = false;
    return drive(s, (st, i) => {
      let p2 = 0;
      if (!pressed && ['hitstun', 'airHit'].includes(st.fighters[1].state) && st.freeze === 0) {
        p2 = bits('5+LMH', -1);
        pressed = true;
      }
      return [p1[i] ?? 0, p2];
    }, max);
  }

  it('breaks out of hitstun: knocks the attacker away without damage, once a round', () => {
    const s = setup({ chars: ['kenji', 'mack'], x: [480, 520] });
    const events = burstWhenHit(s, script('5+H 5*120', 1));
    const burst = events.find((e) => e.type === 'burst');
    expect(burst?.side).toBe(1);
    const knock = events.find((e) => e.type === 'hit' && e.side === 1);
    expect(knock?.damage).toBe(0);
    expect(s.fighters[0].health).toBe(sim.characters.kenji.stats.health);
    expect(s.fighters[1].burst).toBe(false);
    expect(s.fighters[1].meter, 'builds no meter').toBe(Math.trunc(sim.characters.kenji.moves['5H'].hits[0].damage * cfg.meterGain.taken / 100));
  });

  it('only once a round', () => {
    const s = setup({ chars: ['kenji', 'mack'], x: [480, 520] });
    s.fighters[1].burst = false;
    const events = burstWhenHit(s, script('5+H 5*120', 1));
    expect(events.some((e) => e.type === 'burst')).toBe(false);
  });

  it('can be blocked, and is then punishable', () => {
    // Kenji hits with 5L, then blocks the burst and punishes with 5L.
    const s = setup({ chars: ['kenji', 'mack'], x: [480, 510] });
    // Kenji blocks from the moment the burst starts, then punishes with 5L.
    let burstAt = -1;
    const events = drive(s, (st, i) => {
      if (burstAt < 0 && st.events.some((e) => e.type === 'burst')) burstAt = i;
      const p1 = i === 0 ? bits('5+L', 1) : burstAt < 0 ? 0 : i < burstAt + 45 ? bits('4', 1) : i === burstAt + 45 ? bits('5+L', 1) : 0;
      let p2 = 0;
      if (burstAt < 0 && st.fighters[1].state === 'hitstun' && st.fighters[1].stun <= 2 && st.freeze === 0) p2 = bits('5+LMH', -1);
      return [p1, p2];
    }, 100);
    expect(events.some((e) => e.type === 'burst')).toBe(true);
    expect(events.some((e) => e.type === 'block' && e.side === 1)).toBe(true);
    const punish = events.filter((e) => e.type === 'hit' && e.side === 0);
    expect(punish.length, 'the first 5L and the punish').toBe(2);
  });

  it('works in the air, out of a juggle', () => {
    // Mack's 2H launches; Kenji bursts while airborne.
    const s = setup({ chars: ['mack', 'kenji'], x: [480, 510] });
    let burstY = 0;
    let pressed = false;
    const events = drive(s, (st, i) => {
      if (st.events.some((e) => e.type === 'burst')) burstY = st.fighters[1].y;
      let p2 = 0;
      if (!pressed && st.fighters[1].state === 'airHit' && st.fighters[1].y < -20 * 256 && st.freeze === 0) {
        p2 = bits('5+LMH', -1);
        pressed = true;
      }
      return [script('2+H 5*120', 1)[i] ?? 0, p2];
    }, 120);
    expect(events.some((e) => e.type === 'burst')).toBe(true);
    expect(burstY).toBeLessThan(0);
    expect(s.fighters[1].y).toBe(0);
  });

  it('comes back each round, and in training once health refills', () => {
    const s = setup({ x: [480, 520] });
    s.fighters[1].burst = false;
    s.fighters[1].health = 0;
    s.phase = 'fight';
    run(s, script('5*400', 1), script('5*400', -1));
    expect(s.round).toBe(2);
    expect(s.fighters[1].burst).toBe(true);

    const t = setup({ x: [480, 520], training: true });
    t.fighters[1].burst = false;
    run(t, script(`5*${cfg.refillDelay + 2}`, 1), [0]);
    expect(t.fighters[1].burst).toBe(true);
  });
});

describe('rollback safety', () => {
  it('saving and loading mid-match carries on identically with parries, guard cancels and bursts in play', () => {
    const attacks = ['5+L', '5+M', '5+H', '2+L', '2+M', '6+M', '5', '6', '4'].map((t) => bits(t, 1));
    const defence = ['5+MH', '2+MH', '5+LMH', '4+MH', '4+MH'].map((t) => bits(t, -1));
    let seed = 12345;
    const rand = (n) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed >> 8) % n;
    };
    /** @type {Array<[number, number]>} */
    const inputs = [];
    for (let i = 0; i < 3000; i++) inputs.push([rand(3) ? attacks[rand(attacks.length)] : 0, rand(8) ? bits(rand(3) ? '4' : '1', -1) : defence[rand(defence.length)]]);
    const s = setup({ chars: ['deka', 'mav'], x: [480, 530], infiniteMeter: true });
    /** @type {Set<string>} */
    const seen = new Set();
    let saved = null;
    for (let i = 0; i < inputs.length; i++) {
      if (i === 1200) saved = saveState(s);
      sim.step(s, inputs[i]);
      for (const e of s.events) seen.add(e.type);
    }
    const t = loadState(saved);
    for (let i = 1200; i < inputs.length; i++) sim.step(t, inputs[i]);
    expect(hashState(t)).toBe(hashState(s));
    expect([...seen], [...seen].join()).toEqual(expect.arrayContaining(['parry', 'guard-cancel', 'burst']));
  });
});
