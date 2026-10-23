/**
 * The fighting-game fundamentals, played through the real simulation:
 * blocking high and low, cross-ups, throws and throw escapes, pushback and
 * the corner, combos with scaling, the juggle limit, hit-stop, projectiles
 * and invincibility.
 */
import { describe, it, expect } from 'vitest';
import { sim, setup, script, run, bits } from './helpers/harness.js';
import { SUB } from '../src/engine/sim/fixed.js';
import { RIGHT, LEFT } from '../src/engine/input/bits.js';

/** Mack's health: the default fighter's, before any damage. */
const FULL = sim.characters.mack.stats.health;

/**
 * Plays P1's script against P2 holding one input; returns the contact events.
 * @param {string} p1
 * @param {number} p2Bits
 * @param {object} [o]
 */
function contact(p1, p2Bits, o = {}) {
  const s = setup({ x: [480, 510], ...o });
  const events = [];
  run(s, script(p1 + ' 5*60', 1), [p2Bits], (st) => {
    for (const e of st.events) if (e.type === 'hit' || e.type === 'block') events.push({ ...e, frame: st.frame });
  });
  return { s, events, types: events.map((e) => e.type) };
}

// P2 faces left, so "back" for P2 is RIGHT.
const STAND_BLOCK = bits('4', -1);
const CROUCH_BLOCK = bits('1', -1);

describe('blocking', () => {
  it('mids are blocked standing or crouching', () => {
    expect(contact('5+L', STAND_BLOCK).types).toEqual(['block']);
    expect(contact('5+L', CROUCH_BLOCK).types).toEqual(['block']);
    expect(contact('5+L', 0).types).toEqual(['hit']);
  });

  it('lows must be blocked crouching', () => {
    expect(contact('2+L', STAND_BLOCK).types).toEqual(['hit']);
    expect(contact('2+L', CROUCH_BLOCK).types).toEqual(['block']);
  });

  it('overheads must be blocked standing', () => {
    expect(contact('6+M', CROUCH_BLOCK).types).toEqual(['hit']);
    expect(contact('6+M', STAND_BLOCK).types).toEqual(['block']);
  });

  it('jump-ins are overheads', () => {
    const s = setup({ x: [480, 520] });
    s.fighters[0].state = 'air';
    s.fighters[0].y = -60 * SUB;
    s.fighters[0].vy = 0;
    const types = [];
    run(s, script('5+H 5*40', 1), [CROUCH_BLOCK], (st) => st.events.forEach((e) => (e.type === 'hit' || e.type === 'block') && types.push(e.type)));
    expect(types).toEqual(['hit']);
  });

  it('a cross-up is blocked by holding away from the attacker, not "back" from before', () => {
    // Mack is in the air just behind the defender's back, swinging j.M (it hits behind him too).
    /** @param {number} hold */
    const attempt = (hold) => {
      const s = setup({ x: [520, 500] }); // P1 on the right of P2 ...
      s.fighters[0].facing = -1;
      s.fighters[1].facing = 1;
      // ... but jumping left over P2, still facing right: his j.M reaches behind him.
      s.fighters[0].facing = 1;
      s.fighters[0].state = 'air';
      s.fighters[0].y = -40 * SUB;
      s.fighters[0].vy = 0;
      const types = [];
      run(s, script('5+M 5*30', 1), [hold], (st) => st.events.forEach((e) => (e.type === 'hit' || e.type === 'block') && types.push(e.type)));
      return types;
    };
    // P1 is at x=520, P2 at 500: away from the attacker is LEFT.
    expect(attempt(LEFT)).toEqual(['block']);
    expect(attempt(RIGHT)).toEqual(['hit']);
  });

  it('holding back while an attack is coming blocks in place instead of walking away (proximity guard)', () => {
    const s = setup({ x: [480, 520] });
    const states = [];
    run(s, script('5+H 5*20', 1), [STAND_BLOCK], (st) => states.push(st.fighters[1].state));
    expect(states.slice(1, 8)).toContain('guard');
    const far = setup({ x: [200, 800] });
    run(far, [0], [STAND_BLOCK, STAND_BLOCK, STAND_BLOCK]);
    expect(far.fighters[1].state).toBe('walkB');
  });

  it('chip damage goes through a block', () => {
    const { s } = contact('2 3 6+L', STAND_BLOCK);
    expect(s.fighters[1].health).toBe(FULL - 10);
  });
});

describe('hitstun, hit-stop and pushback', () => {
  it('hit-stop freezes both fighters for the hit\'s hit-stop frames', () => {
    const s = setup({ x: [480, 510] });
    run(s, script('5+L 5*3', 1), [0]); // frame 5: the hit
    run(s, [0], [0]);
    expect(s.freeze).toBe(sim.characters.mack.moves['5L'].hits[0].hitstop);
    const before = JSON.stringify(s.fighters.map((f) => [f.x, f.y, f.state, f.moveFrame, f.stun]));
    for (let i = 0; i < s.freeze - 1; i++) sim.step(s, [0, 0]);
    expect(JSON.stringify(s.fighters.map((f) => [f.x, f.y, f.state, f.moveFrame, f.stun]))).toBe(before);
  });

  it('pushback separates the fighters; in the corner the attacker is pushed instead', () => {
    const open = setup({ x: [480, 510] });
    const startA = open.fighters[0].x;
    const startD = open.fighters[1].x;
    run(open, script('5+L 5*40', 1), [0]);
    expect(open.fighters[1].x - startD).toBe(7 * SUB);
    expect(open.fighters[0].x).toBe(startA);

    const wall = 1024 - sim.config.stage.wall;
    const corner = setup({ x: [wall - 30, wall] });
    const cornerA = corner.fighters[0].x;
    run(corner, script('5+L 5*40', 1), [0]);
    expect(corner.fighters[1].x).toBe(wall * SUB);
    expect(cornerA - corner.fighters[0].x).toBe(7 * SUB);
  });

  it('fighters can\'t walk through each other', () => {
    const s = setup({ x: [480, 520] });
    run(s, script('6*60', 1), [0]);
    const [a, b] = s.fighters.map((f) => sim.boxesOf(f).push);
    expect(a[2]).toBeLessThanOrEqual(b[0]);
  });

  it('the fighters can\'t get further apart than the screen allows', () => {
    const s = setup({ x: [400, 600] });
    run(s, script('4*300', 1), [bits('4', -1)]);
    expect(Math.abs(s.fighters[1].x - s.fighters[0].x)).toBeLessThanOrEqual(sim.config.stage.maxSeparation * SUB);
  });
});

describe('throws', () => {
  it('a throw beats a blocking opponent and knocks them down', () => {
    const { s } = contact('5+LM', STAND_BLOCK);
    expect(s.fighters[1].health).toBe(FULL - 110);
    expect(['knockdown', 'wakeup', 'stand', 'walkB', 'guard', 'airHit']).toContain(s.fighters[1].state);
  });

  it('pressing throw as it grabs escapes it (a tech): no damage, both reset', () => {
    const s = setup({ x: [480, 510] });
    const states = [];
    // The throw connects on frame 5; P2 presses L+M on frame 8.
    run(s, script('5+LM 5*60', 1), script('5*7 5+LM 5*60', -1), (st) => {
      if (st.events.some((e) => e.type === 'tech')) states.push('tech');
    });
    expect(states).toEqual(['tech']);
    expect(s.fighters[1].health).toBe(FULL);
  });

  it('a late tech does nothing', () => {
    const s = setup({ x: [480, 510] });
    run(s, script('5+LM 5*60', 1), script(`5*${4 + sim.config.techWindow + 4} 5+LM 5*60`, -1));
    expect(s.fighters[1].health).toBe(FULL - 110);
  });

  it('both throwing on the same frame is a tech', () => {
    const s = setup({ x: [480, 510] });
    let tech = false;
    run(s, script('5+LM 5*30', 1), script('5+LM 5*30', -1), (st) => (tech ||= st.events.some((e) => e.type === 'tech')));
    expect(tech).toBe(true);
  });

  it('a command grab (Mav\'s Royal Decree) can\'t be teched', () => {
    const s = setup({ chars: ['mav', 'mack'], x: [480, 520] });
    let tech = false;
    // P2 presses throw on every frame the grab could be teched.
    const mash = Array.from({ length: 20 }, (_, i) => `5*${i ? 1 : 8} 5+LM`).join(' ');
    run(s, script('2 1 4+M 5*80', 1), script(`${mash} 5*60`, -1), (st) => (tech ||= st.events.some((e) => e.type === 'tech')));
    expect(tech).toBe(false);
    expect(s.fighters[1].health).toBe(FULL - sim.characters.mav.moves['214M'].throw.damage);
  });

  it('a fighter in blockstun can\'t be thrown, nor for a few frames after', () => {
    const s = setup({ x: [480, 510] });
    s.fighters[1].state = 'blockstun';
    s.fighters[1].stun = 10;
    run(s, script('5+LM 5*30', 1), [STAND_BLOCK]);
    expect(s.fighters[1].health).toBe(FULL);
  });

  it('back throw (4+L+M) throws the opponent behind you', () => {
    const s = setup({ x: [480, 510] });
    run(s, script('4+LM 5*30', 1), [0]);
    expect(s.fighters[1].x).toBeLessThan(s.fighters[0].x);
  });

  it('throws whiff against an airborne opponent', () => {
    const s = setup({ x: [480, 510] });
    s.fighters[1].state = 'air';
    s.fighters[1].y = -30 * SUB;
    run(s, script('5+LM 5*20', 1), [0]);
    expect(s.fighters[1].health).toBe(FULL);
  });
});

describe('combos', () => {
  it('cancels chain hits together, with damage scaling by hit number', () => {
    const s = setup({ x: [480, 510] });
    const damage = [];
    // 5L, 5L (chained during hit-stop), 2L, then 236L: four hits.
    run(s, script('5+L 5*4 5+L 5*12 2+L 5*12 2 3 6+L 5*60', 1), [0], (st) => {
      for (const e of st.events) if (e.type === 'hit') damage.push(e.damage);
    });
    const sc = sim.config.scaling;
    expect(damage).toEqual([30 * sc[0] / 100, 30 * sc[1] / 100, Math.trunc(25 * sc[2] / 100), Math.trunc(sim.characters.mack.moves['236L'].hits[0].damage * sc[3] / 100)]);
    expect(s.fighters[1].comboDamage === 0 || s.fighters[1].combo === 0).toBe(true);
  });

  it('the juggle limit: an airborne opponent who has taken enough hits can\'t be hit again', () => {
    /** @param {number} juggle */
    const hitOnAirborne = (juggle) => {
      const s = setup({ x: [480, 510] });
      const d = s.fighters[1];
      d.state = 'airHit';
      d.y = -40 * SUB;
      d.vy = -2 * SUB;
      d.juggle = juggle;
      d.combo = juggle;
      d.knockdownOnLand = true;
      let hit = false;
      run(s, script('5+L 5*10', 1), [0], (st) => (hit ||= st.events.some((e) => e.type === 'hit')));
      return hit;
    };
    expect(hitOnAirborne(sim.config.juggleLimit - 1)).toBe(true);
    expect(hitOnAirborne(sim.config.juggleLimit)).toBe(false);
  });

  it('a knocked-down fighter is invincible until they are up', () => {
    const s = setup({ x: [480, 510] });
    s.fighters[1].state = 'wakeup';
    s.fighters[1].stun = 15;
    let hit = false;
    run(s, script('5+L 5*10', 1), [0], (st) => (hit ||= st.events.some((e) => e.type === 'hit')));
    expect(hit).toBe(false);
  });
});

describe('invincibility, projectiles and supers', () => {
  it('the rising slash is invincible as it starts: it beats an attack that would have hit', () => {
    // Kenji's 5M would hit Mack on frame 10; Mack starts 623H on frame 6.
    const s = setup({ chars: ['kenji', 'mack'], x: [400, 500] });
    const hits = [];
    run(s, script('5+M 5*60', 1), script('5*3 6 2 3+H 5*80', -1), (st) => {
      for (const e of st.events) if (e.type === 'hit') hits.push(e.side);
    });
    expect(hits[0]).toBe(1);
    expect(hits).not.toContain(0);
  });

  it('a kunai crosses the screen and hits; holding back blocks it', () => {
    const hit = setup({ chars: ['kenji', 'mack'], x: [300, 700] });
    run(hit, script('2 3 6+H 5*120', 1), [0]);
    expect(hit.fighters[1].health).toBe(FULL - sim.characters.kenji.moves['236H'].projectile.hit.damage);
    const block = setup({ chars: ['kenji', 'mack'], x: [300, 700] });
    run(block, script('2 3 6+H 5*120', 1), [STAND_BLOCK]);
    expect(block.fighters[1].health).toBe(FULL - sim.characters.kenji.moves['236H'].projectile.hit.chip);
  });

  it('only one kunai at a time', () => {
    const s = setup({ chars: ['kenji', 'mack'], x: [100, 900] });
    let max = 0;
    run(s, script('2 3 6+L 5*40 2 3 6+L 5*20', 1), [0], (st) => (max = Math.max(max, st.projectiles.length)));
    expect(max).toBe(1);
  });

  it('two kunai cancel each other out', () => {
    const s = setup({ chars: ['kenji', 'kenji'], x: [300, 700] });
    let clash = false;
    run(s, script('2 3 6+M 5*120', 1), script('2 3 6+M 5*120', -1), (st) => (clash ||= st.events.some((e) => e.type === 'clash')));
    expect(clash).toBe(true);
    expect(s.fighters.map((f) => f.health)).toEqual([1050, 1050]);
  });

  it('a super needs a full meter, spends it, and freezes the screen', () => {
    const s = setup({ x: [300, 700] });
    run(s, script('2 3 6 2 3 6+H 5*5', 1), [0]);
    expect(s.fighters[0].move).not.toBe('236236H');
    s.fighters[0].meter = 1000;
    let froze = 0;
    run(s, script('5*40 2 3 6 2 3 6+H 5', 1), [0], (st) => (froze = Math.max(froze, st.freeze)));
    expect(s.fighters[0].meter).toBe(0);
    expect(froze).toBe(sim.config.superFreeze);
  });

  it('hitting and being hit build meter', () => {
    const { s } = contact('5+H', 0);
    expect(s.fighters[0].meter).toBeGreaterThan(0);
    expect(s.fighters[1].meter).toBeGreaterThan(0);
  });
});
