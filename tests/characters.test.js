/**
 * The character data validator: every move refers to sprite frames that
 * exist, its animation lasts exactly as long as the move, its boxes are
 * well-formed, its frame data agrees with its hitboxes, and every
 * reference (motions, cancels, easy specials) points at something real.
 * A typo in a data file fails here, not in a match.
 */
import { describe, it, expect } from 'vitest';
import { sim } from './helpers/harness.js';
import { moveLength, activeRange } from '../src/engine/sim/frameData.js';

/** @param {unknown} b */
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isInteger) && b[2] > 0 && b[3] > 0;

describe.each(Object.entries(sim.characters))('%s', (id, ch) => {
  it('has an id matching its key, health, and sprite sheets', () => {
    expect(ch.id).toBe(id);
    expect(ch.stats.health).toBeGreaterThan(0);
    for (const [, frames] of Object.entries(ch.sprites.sheets)) expect(frames).toBeGreaterThan(0);
  });

  it('every animation loop uses a real sheet and frame', () => {
    for (const [name, a] of Object.entries(ch.anims)) {
      expect(ch.sprites.sheets[a.sheet], `${name}: sheet ${a.sheet}`).toBeDefined();
      expect(a.len, name).toBeGreaterThan(0);
      if (a.frame !== undefined) expect(a.frame, name).toBeLessThan(ch.sprites.sheets[a.sheet]);
    }
  });

  it('stance boxes are well-formed', () => {
    for (const [stance, b] of Object.entries(ch.boxes)) {
      expect(isBox(b.push), `${stance} push`).toBe(true);
      for (const h of b.hurt) expect(isBox(h), `${stance} hurt`).toBe(true);
    }
  });

  it.each(Object.keys(ch.moves))('move %s is valid', (moveId) => {
    const mv = ch.moves[moveId];
    const total = moveLength(mv);
    expect(mv.startup).toBeGreaterThan(0);
    expect(mv.active).toBeGreaterThan(0);
    expect(mv.recovery).toBeGreaterThanOrEqual(0);

    // Animation: real sheets and frames, and exactly as long as the move.
    let length = 0;
    for (const [sheet, frame, duration] of mv.anim) {
      expect(ch.sprites.sheets[sheet], `sheet ${sheet}`).toBeDefined();
      expect(frame, `${sheet} frame ${frame}`).toBeLessThan(ch.sprites.sheets[sheet]);
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(duration).toBeGreaterThan(0);
      length += duration;
    }
    expect(length, 'animation length = move length').toBe(total);

    // Frame data agrees with the boxes.
    const range = activeRange(mv);
    if (range) {
      expect(range[0], 'startup = first active frame').toBe(mv.startup);
      expect(range[1] - range[0] + 1, 'active frames').toBe(mv.active);
    }
    if (mv.projectile) {
      expect(mv.projectile.frame).toBe(mv.startup);
      expect(isBox(mv.projectile.box)).toBe(true);
    }
    expect(range || mv.projectile, 'a move needs hits, a throw or a projectile').toBeTruthy();

    for (const h of mv.hits ?? []) {
      expect(h.frames[0]).toBeLessThanOrEqual(h.frames[1]);
      expect(h.frames[1]).toBeLessThanOrEqual(total);
      expect(h.boxes.length).toBeGreaterThan(0);
      for (const b of h.boxes) expect(isBox(b)).toBe(true);
      expect(['mid', 'high', 'low', 'unblockable']).toContain(h.guard);
      expect(h.damage).toBeGreaterThan(0);
      expect(h.hitstop).toBeGreaterThan(0);
    }
    for (const e of mv.hurt ?? []) {
      expect(e.frames[1]).toBeLessThanOrEqual(total);
      for (const b of e.boxes) expect(isBox(b)).toBe(true);
    }
    for (const iv of mv.invuln ?? []) expect(iv.frames[1]).toBeLessThanOrEqual(total);
    for (const [frame] of mv.velocity ?? []) expect(frame).toBeLessThanOrEqual(total);
    if (mv.throw) expect(isBox(mv.throw.box)).toBe(true);

    // References.
    if (mv.motion) expect(sim.motions[mv.motion], mv.motion).toBeDefined();
    if (mv.kind === 'special' || mv.kind === 'super') {
      expect(mv.motion && mv.button, 'specials need a motion and a button').toBeTruthy();
    }
    for (const target of mv.cancel?.into ?? []) {
      expect(['normal', 'special', 'super'].includes(target) || !!ch.moves[target], `cancel into ${target}`).toBe(true);
    }
    if (mv.cancel) expect(mv.cancel.frames[1]).toBeLessThanOrEqual(total);
  });

  it('has the fundamentals: normals in every stance, two specials with motions, a super, a throw, an overhead and a low', () => {
    const moves = Object.values(ch.moves);
    for (const stance of ['stand', 'crouch', 'air']) expect(moves.some((m) => m.kind === 'normal' && m.stance === stance)).toBe(true);
    const motionsUsed = new Set(moves.filter((m) => m.kind === 'special').map((m) => m.motion));
    expect(motionsUsed.size).toBeGreaterThanOrEqual(2);
    expect(moves.filter((m) => m.kind === 'super').length).toBe(1);
    expect(moves.some((m) => m.kind === 'throw')).toBe(true);
    expect(moves.some((m) => m.stance !== 'air' && m.hits?.some((h) => h.guard === 'high'))).toBe(true);
    expect(moves.some((m) => m.hits?.some((h) => h.guard === 'low'))).toBe(true);
  });

  it('each easy-specials input does exactly one move', () => {
    const keys = Object.values(ch.moves).map((m) => m.easy).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('H');
  });
});

describe('the roster', () => {
  it('motion inputs are well-formed', () => {
    for (const [id, m] of Object.entries(sim.motions)) {
      expect(m.steps.length, id).toBeGreaterThan(0);
      for (const step of m.steps) expect(step, id).toMatch(/^[1-9]+$/);
      expect(m.window + sim.config.buffer, `${id} fits in the history`).toBeLessThan(sim.config.historyLength);
    }
  });
});

describe('the server knows the roster', () => {
  it('shared/protocol.js CHARACTERS matches the game’s characters (an online pick the server refuses would be a dead end)', async () => {
    const { CHARACTERS } = await import('../shared/protocol.js');
    const { characters } = await import('../src/game/data/characters/index.js');
    expect([...CHARACTERS].sort()).toEqual(Object.keys(characters).sort());
  });
});
