/**
 * Frame data: the numbers the game publishes (move list, training mode,
 * docs/FRAME-DATA.md) come from src/engine/sim/frameData.js. Here every
 * grounded move is played against a dummy in the real simulation, and the
 * advantage is measured frame by frame: the frame each fighter can act
 * again after the last hit. Derived and measured must agree exactly.
 */
import { describe, it, expect } from 'vitest';
import { sim, setup, script, bits, inputFor } from './helpers/harness.js';
import { summarise, activeRange, moveLength } from '../src/engine/sim/frameData.js';
import { isActionable } from '../src/engine/sim/step.js';
import { fighterBoxes } from '../src/engine/sim/boxes.js';

const cfg = sim.config;

/**
 * @param {string} charId
 * @param {string} moveId
 * @param {boolean} block
 */
function measure(charId, moveId, block) {
  const mv = sim.characters[charId].moves[moveId];
  const s = setup({ chars: [charId, 'mack'], x: [480, 510], infiniteMeter: true });
  const attack = script(inputFor(mv), 1);
  const last = (mv.hits ?? []).reduce((a, h) => (h.frames[0] > a.frames[0] ? h : a), (mv.hits ?? [])[0]);
  const guard = last ? last.guard : 'mid';
  const hold = bits(guard === 'low' ? '1' : '4', -1);
  let contactMoveFrame = -1;
  let attackerFree = -1;
  let defenderFree = -1;
  let started = false;
  for (let i = 0; i < 600; i++) {
    const p1 = i < attack.length ? attack[i] : 0;
    const p2 = block && started ? hold : 0;
    const moveFrame = s.fighters[0].moveFrame;
    sim.step(s, [p1, p2]);
    if (s.fighters[0].state === 'move' || s.fighters[0].state === 'throwHold') started = true;
    for (const e of s.events) {
      if (e.side === 0 && (e.type === 'hit' || e.type === 'block' || e.type === 'throw')) {
        if (e.type !== 'hit' || mv.kind !== 'throw') contactMoveFrame = e.type === 'throw' ? moveFrame + 1 : s.fighters[0].moveFrame || moveFrame + 1;
        attackerFree = -1;
        defenderFree = -1;
      }
    }
    if (contactMoveFrame > 0 && s.freeze === 0) {
      if (attackerFree < 0 && isActionable(s.fighters[0])) attackerFree = s.frame;
      if (defenderFree < 0 && isActionable(s.fighters[1])) defenderFree = s.frame;
      if (attackerFree > 0 && defenderFree > 0) break;
    }
  }
  return { contactMoveFrame, advantage: defenderFree - attackerFree, attackerFree, defenderFree };
}

const grounded = [];
for (const [charId, ch] of Object.entries(sim.characters)) {
  for (const [moveId, mv] of Object.entries(ch.moves)) {
    if (mv.stance === 'air' || mv.projectile) continue;
    grounded.push([charId, moveId]);
  }
}

describe('frame advantage: derived from data = measured in the simulation', () => {
  it.each(grounded)('%s %s on hit', (charId, moveId) => {
    const mv = sim.characters[charId].moves[moveId];
    const derived = summarise(mv, cfg);
    const m = measure(charId, moveId, false);
    const lastHit = mv.hits ? Math.max(...mv.hits.map((h) => h.frames[0])) : mv.startup;
    expect(m.contactMoveFrame, 'connected on its first active frame').toBe(lastHit);
    expect(m.advantage).toBe(derived.onHit.value);
  });

  // Throws (including command grabs) can't be blocked.
  it.each(grounded.filter(([c, m]) => !sim.characters[c].moves[m].throw))('%s %s on block', (charId, moveId) => {
    const mv = sim.characters[charId].moves[moveId];
    const derived = summarise(mv, cfg);
    const m = measure(charId, moveId, true);
    const lastHit = Math.max(...(mv.hits ?? []).map((h) => h.frames[0]));
    expect(m.contactMoveFrame).toBe(lastHit);
    expect(m.advantage).toBe(derived.onBlock);
  });
});

describe('boxes and active frames', () => {
  it('hitboxes exist only on active frames, and every active frame has one', () => {
    for (const [charId, ch] of Object.entries(sim.characters)) {
      for (const [moveId, mv] of Object.entries(ch.moves)) {
        if (!mv.hits) continue;
        const s = setup({ chars: [charId, 'mack'], x: [200, 900] });
        const f = s.fighters[0];
        f.state = 'move';
        f.move = moveId;
        const range = /** @type {[number, number]} */ (activeRange(mv));
        for (let t = 1; t <= moveLength(mv); t++) {
          f.moveFrame = t;
          const boxes = fighterBoxes(f, ch);
          const live = mv.hits.some((h) => t >= h.frames[0] && t <= h.frames[1]);
          expect(boxes.hit.length > 0, `${charId} ${moveId} frame ${t}`).toBe(live);
          if (t < range[0] || t > range[1]) expect(boxes.hit.length, `${charId} ${moveId} frame ${t}`).toBe(0);
        }
      }
    }
  });

  it('a hitbox mirrors with facing', () => {
    const s = setup({ chars: ['mack', 'mack'], x: [500, 600] });
    const f = s.fighters[0];
    f.state = 'move';
    f.move = '5L';
    f.moveFrame = 5;
    const right = fighterBoxes(f, sim.characters.mack).hit[0].rect;
    f.facing = -1;
    const left = fighterBoxes(f, sim.characters.mack).hit[0].rect;
    expect(right[0] - f.x).toBe(f.x - left[2]);
    expect(right[1]).toBe(left[1]);
  });
});
