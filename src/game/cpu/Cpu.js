/**
 * The CPU opponent. It plays like a player: every frame it reads the match
 * state and returns an input byte, exactly what a keyboard or a gamepad
 * would produce. It never writes to the state (tests/cpu.test.js runs it
 * on a frozen state to prove it), so the same simulation, frame data and
 * rules apply to it as to you.
 *
 * What makes it feel human:
 *
 * - **Reaction time.** It sees the opponent as they were `reaction` frames
 *   ago (a small ring of snapshots), so it can't block or anti-air the
 *   instant a move starts.
 * - **Inputs take time.** A special is typed as its motion over several
 *   frames; a block is held for a while.
 * - **Probabilities by difficulty**: how often it blocks, anti-airs,
 *   punishes, finishes combos, and how often it just makes a mistake
 *   (a random jump, a whiffed button, a dropped input).
 *
 * It has its own seeded random generator, separate from the simulation's,
 * so a CPU match is reproducible from its seed but the simulation's own
 * determinism doesn't depend on the CPU.
 */
import { fromNumpad, BUTTON_BITS } from '../../engine/input/bits.js';
import { SUB } from '../../engine/sim/fixed.js';
import { moveLength, activeRange } from '../../engine/sim/frameData.js';
import { PROFILES } from './profiles.js';

/**
 * @typedef {object} Difficulty
 * @property {string} name
 * @property {number} reaction  Frames between something happening and the CPU seeing it.
 * @property {number} block  Chance to block an attack it sees coming.
 * @property {number} antiAir
 * @property {number} punish  Chance to punish an unsafe move.
 * @property {number} combo  Chance to cancel a hit into a special.
 * @property {number} mistake  Chance per decision to do something silly instead.
 * @property {number} aggression  How often it attacks rather than waits in neutral.
 * @property {number} tech  Chance to escape a throw.
 * @property {number} think  Frames between neutral decisions.
 */

/** @type {Record<'easy'|'normal'|'hard', Difficulty>} */
export const DIFFICULTIES = {
  easy: { name: 'Easy', reaction: 26, block: 0.2, antiAir: 0.12, punish: 0, combo: 0.15, mistake: 0.25, aggression: 0.35, tech: 0.05, think: 22 },
  normal: { name: 'Normal', reaction: 17, block: 0.5, antiAir: 0.45, punish: 0.35, combo: 0.55, mistake: 0.1, aggression: 0.5, tech: 0.25, think: 14 },
  hard: { name: 'Hard', reaction: 11, block: 0.82, antiAir: 0.75, punish: 0.85, combo: 0.9, mistake: 0.03, aggression: 0.6, tech: 0.5, think: 8 },
};

/**
 * What the CPU remembers seeing of its opponent on one frame.
 * @typedef {object} Seen
 * @property {string} state
 * @property {string} move
 * @property {number} moveFrame
 * @property {number} x  Pixels
 * @property {number} y
 * @property {number} vx
 * @property {number} projectileDist  Pixels to the nearest incoming projectile (Infinity: none)
 */

/** A planned input: a numpad direction and buttons, for some frames. */
/** @typedef {{ dir: number, buttons: number, frames: number }} Step */

export class Cpu {
  /**
   * @param {number} side
   * @param {Difficulty} difficulty
   * @param {import('../../engine/sim/step.js').Simulation} sim
   * @param {number} [seed]
   */
  constructor(side, difficulty, sim, seed = 1) {
    this.side = side;
    this.level = difficulty;
    this.sim = sim;
    this.rng = (seed ^ 0x5bd1e995) >>> 0 || 1;
    /** @type {Seen[]} */
    this.seen = [];
    /** @type {Step[]} */
    this.plan = [];
    this.wait = 0;
    this.lastCancelFrame = -1;
    this.techTried = false;
  }

  random() {
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 4294967296;
  }

  /** @param {number} chance */
  roll(chance) {
    return this.random() < chance;
  }

  /**
   * Queues inputs written in numpad notation: "2 3 6+M", "4*12".
   * @param {string} script
   */
  queue(script) {
    for (const part of script.trim().split(/\s+/)) {
      const [token, count = '1'] = part.split('*');
      const [dir, buttons = ''] = token.split('+');
      let b = 0;
      for (const name of ['L', 'M', 'H', 'SP']) if (buttons.includes(name)) b |= BUTTON_BITS[/** @type {'L'} */ (name)];
      this.plan.push({ dir: Number(dir), buttons: b, frames: Number(count) });
    }
  }

  /**
   * Reach of a move (pixels in front of the origin), from its hitboxes.
   * @param {string} char
   * @param {string} move
   */
  reach(char, move) {
    const mv = this.sim.characters[char].moves[move];
    if (!mv) return 0;
    if (mv.throw) return mv.throw.box[0] + mv.throw.box[2];
    let r = 0;
    for (const h of mv.hits ?? []) for (const b of h.boxes) r = Math.max(r, b[0] + b[2]);
    // Moves that travel reach further.
    for (const [, vx] of mv.velocity ?? []) r += Math.max(0, vx / SUB) * Math.min(10, mv.startup);
    return r;
  }

  /**
   * The input byte for this frame. Reads `state`, never writes it.
   * @param {import('../../engine/sim/types.js').MatchState} state
   * @returns {number}
   */
  think(state) {
    const me = state.fighters[this.side];
    const opp = state.fighters[1 - this.side];
    let projectileDist = Infinity;
    for (const p of state.projectiles) {
      if (p.owner !== this.side && Math.sign(me.x - p.x) === p.facing) projectileDist = Math.min(projectileDist, Math.abs(p.x - me.x) / SUB);
    }
    this.seen.push({ state: opp.state, move: opp.move, moveFrame: opp.moveFrame, x: opp.x / SUB, y: opp.y / SUB, vx: opp.vx / SUB, projectileDist });
    if (this.seen.length > 40) this.seen.shift();
    if (state.phase !== 'fight') {
      this.plan = [];
      return 0;
    }

    const view = this.seen[Math.max(0, this.seen.length - 1 - this.level.reaction)];
    const dist = Math.abs(view.x - me.x / SUB);
    const profile = PROFILES[me.char];

    // Thrown: maybe escape (a guess more than a reaction, like a person).
    if (me.state === 'thrown') {
      if (!this.techTried) {
        this.techTried = true;
        if (this.roll(this.level.tech)) {
          this.plan = [];
          this.queue('5+LM');
        }
      }
      return this.output(me);
    }
    this.techTried = false;

    // Our move hit: cancel into a special (the combo), typed during hit-stop.
    if (me.state === 'move' && me.contact === 1 && this.lastCancelFrame !== me.moveFrame) {
      const mv = this.sim.characters[me.char].moves[me.move];
      if (mv.kind === 'normal' && mv.cancel && this.plan.length === 0) {
        this.lastCancelFrame = me.moveFrame;
        if (this.roll(this.level.combo)) {
          const finisher = me.meter >= 1000 && this.roll(0.5) ? profile.superInput : profile.comboEnder;
          this.queue(finisher);
        }
      }
    }

    if (this.plan.length) return this.output(me);
    if (state.freeze > 0) return 0;
    if (!this.sim.isNeutral(me) && me.state !== 'blockstun') return this.output(me);
    if (this.wait > 0) {
      this.wait--;
      // While waiting, keep reacting to threats below.
    }

    // ── Threats, as seen `reaction` frames ago ─────────────────────────
    const oppCh = this.sim.characters[opp.char];
    const oppMove = view.state === 'move' ? oppCh.moves[view.move] : null;
    const airborne = view.y < -20 || view.state === 'air';
    const approaching = Math.sign(me.x / SUB - view.x) === Math.sign(view.vx) || Math.abs(view.vx) < 0.1;

    if (airborne && dist < 210 && approaching) {
      if (this.roll(this.level.antiAir)) return this.act(me, profile.antiAir);
      if (this.roll(this.level.block)) return this.act(me, '4*16');
    }
    if (oppMove && oppMove.kind !== 'throw') {
      const range = activeRange(oppMove);
      const lastActive = range ? range[1] : (oppMove.projectile?.frame ?? 0);
      if (view.moveFrame <= lastActive && dist < 220 && this.roll(this.level.block)) {
        const guard = (oppMove.hits ?? [])[0]?.guard;
        // Low or mid: crouch-block. An overhead fools it unless it reads it.
        const stand = guard === 'high' && this.roll(0.6);
        return this.act(me, stand ? '4*14' : '1*14');
      }
      // Punish: the opponent is recovering from a move that leaves them open.
      const total = moveLength(oppMove);
      const left = total - view.moveFrame - this.level.reaction;
      if (range && view.moveFrame > range[1] && left > 6 && this.roll(this.level.punish)) {
        const punish = profile.punishes.find((p) => this.reach(me.char, p.move) + 16 >= dist && this.sim.characters[me.char].moves[p.move].startup <= left);
        if (punish) return this.act(me, me.meter >= 1000 && punish.super ? profile.superInput : punish.input);
      }
    }
    if (view.projectileDist < 160 && this.roll(this.level.block)) return this.act(me, '4*10');
    if (view.state === 'knockdown' || view.state === 'wakeup') {
      return this.act(me, dist > 70 ? '6*8' : this.roll(0.5) ? '5*6' : '1*10');
    }

    // ── Neutral ────────────────────────────────────────────────────────
    if (this.wait > 0) return this.output(me);
    this.wait = Math.round(this.level.think * (0.6 + this.random() * 0.8));

    if (this.roll(this.level.mistake)) {
      const silly = ['8', '9*30', '5+H', '4*20', '2+M', '6 5 6'];
      return this.act(me, silly[Math.floor(this.random() * silly.length)]);
    }
    const options = profile.neutral.filter((o) => dist >= o.min && dist <= o.max && (!o.meter || me.meter >= 1000) && (!o.noProjectile || !state.projectiles.some((p) => p.owner === this.side)));
    const attack = options.length && this.roll(this.level.aggression);
    if (attack) {
      let pick = this.random() * options.reduce((sum, o) => sum + o.weight, 0);
      for (const o of options) {
        pick -= o.weight;
        if (pick <= 0) return this.act(me, o.input);
      }
    }
    // Footsies: drift to the preferred range, sometimes back off.
    if (dist > profile.preferred + 30) return this.act(me, this.roll(0.25) ? '6 5 6' : '6*10');
    if (dist < profile.preferred - 40) return this.act(me, this.roll(0.5) ? '4*10' : '1*8');
    return this.act(me, this.roll(0.5) ? '5*6' : '4*6');
  }

  /**
   * @param {import('../../engine/sim/types.js').FighterState} me
   * @param {string} script
   */
  act(me, script) {
    this.plan = [];
    this.queue(script);
    return this.output(me);
  }

  /**
   * The next planned input, in absolute bits for the current facing.
   * @param {import('../../engine/sim/types.js').FighterState} me
   */
  output(me) {
    const step = this.plan[0];
    if (!step) return 0;
    step.frames--;
    if (step.frames <= 0) this.plan.shift();
    return fromNumpad(step.dir, me.facing, step.buttons);
  }
}
