/**
 * The training dummy. Like the CPU, it is only an input source: each frame
 * it reads the state and returns an input byte for player 2.
 *
 * - Stance: stand, crouch, or keep jumping.
 * - Block: none, all, or "after the first hit" (lets the first hit of a
 *   string through, then blocks the rest: shows whether a string has gaps).
 *   Blocking reads the attack about to hit and blocks it correctly (low,
 *   overhead), like a perfect player would.
 * - Throw escape: on or off.
 * - Record and play back: while recording, player 1's controller drives
 *   the dummy; playback loops the recording. Recordings are stored
 *   relative to the dummy's facing, so they play back correctly from
 *   either side.
 */
import { fromNumpad, toRelative, fromRelative, L, M } from '../../engine/input/bits.js';
import { SUB } from '../../engine/sim/fixed.js';
import { activeRange } from '../../engine/sim/frameData.js';

/** @typedef {'stand'|'crouch'|'jump'} Stance */
/** @typedef {'none'|'all'|'after-first'} BlockMode */

export const MAX_RECORDING = 60 * 10;

export class Dummy {
  /**
   * @param {import('../../engine/sim/step.js').Simulation} sim
   * @param {number} [side]
   */
  constructor(sim, side = 1) {
    this.sim = sim;
    this.side = side;
    /** @type {Stance} */
    this.stance = 'stand';
    /** @type {BlockMode} */
    this.block = 'none';
    this.techThrows = false;
    /** @type {'idle'|'recording'|'playing'} */
    this.mode = 'idle';
    /** @type {number[]} Relative input bytes. */
    this.recording = [];
    this.playhead = 0;
    /** "After first hit": blocking is armed once a hit lands, until things calm down. */
    this.armed = false;
    this.calm = 0;
  }

  startRecording() {
    this.mode = 'recording';
    this.recording = [];
  }

  stopRecording() {
    this.mode = 'idle';
  }

  startPlayback() {
    if (!this.recording.length) return false;
    this.mode = 'playing';
    this.playhead = 0;
    return true;
  }

  stopPlayback() {
    this.mode = 'idle';
  }

  /**
   * Is the opponent's attack about to land on us? Returns the guard of
   * the threatening hit, or ''.
   * @param {import('../../engine/sim/types.js').MatchState} s
   */
  threat(s) {
    const me = s.fighters[this.side];
    const opp = s.fighters[1 - this.side];
    const dist = Math.abs(opp.x - me.x) / SUB;
    if (opp.state === 'move' && dist < 260) {
      const mv = this.sim.characters[opp.char].moves[opp.move];
      const range = activeRange(mv);
      if (range && opp.moveFrame <= range[1]) {
        const next = (mv.hits ?? []).find((h) => h.frames[1] >= opp.moveFrame);
        if (next) return next.guard;
      }
    }
    for (const p of s.projectiles) {
      if (p.owner !== this.side && Math.sign(me.x - p.x) === p.facing && Math.abs(p.x - me.x) / SUB < 220) return 'mid';
    }
    return '';
  }

  /**
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @param {number} p1Bits  Player 1's input (drives the dummy while recording).
   * @returns {number}
   */
  think(s, p1Bits) {
    const me = s.fighters[this.side];
    if (this.mode === 'recording') {
      if (this.recording.length < MAX_RECORDING) this.recording.push(toRelative(p1Bits, me.facing));
      else this.mode = 'idle';
      return p1Bits;
    }
    if (this.mode === 'playing') {
      const bits = fromRelative(this.recording[this.playhead], me.facing);
      this.playhead = (this.playhead + 1) % this.recording.length;
      return bits;
    }

    if (me.state === 'thrown' && this.techThrows) return L | M;

    // "After first hit": arm when hit, disarm after a calm second.
    if (me.state === 'hitstun' || me.state === 'airHit') {
      this.armed = true;
      this.calm = 0;
    } else if (this.sim.isNeutral(me) && !this.threat(s)) {
      this.calm++;
      if (this.calm > 40) this.armed = false;
    }

    const guard = this.threat(s);
    const blocking = (this.block === 'all' || (this.block === 'after-first' && this.armed)) && (guard || me.state === 'blockstun');
    if (blocking && guard !== 'unblockable') {
      const crouch = guard === 'low' || (guard !== 'high' && this.stance === 'crouch');
      return fromNumpad(crouch ? 1 : 4, me.facing);
    }
    if (this.stance === 'crouch') return fromNumpad(2, me.facing);
    if (this.stance === 'jump') return fromNumpad(8, me.facing);
    return 0;
  }
}
