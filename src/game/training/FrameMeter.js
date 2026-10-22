/**
 * The frame meter: two rows of cells, one per frame, showing what each
 * fighter was doing on every frame (startup, active, recovery, stun...).
 * Laid side by side, they show why one attack beat another: whose active
 * frames came first, and how many frames one fighter was free before the
 * other.
 *
 * It also measures frame advantage the honest way: after a hit or block,
 * it counts the frames until each fighter can act again, and reports the
 * difference. tests/frameData.test.js checks this agrees with the data.
 *
 * Hit-stop frames are skipped (both fighters are frozen; they don't change
 * anything), the same convention as the published numbers.
 */
import { classifyFrame } from '../../engine/sim/frameData.js';
import { isActionable } from '../../engine/sim/step.js';
import { formatAdvantage } from '../../engine/sim/frameData.js';
import { outlined } from '../hud/Hud.js';
import { WIDTH } from '../../engine/render/Screen.js';

/** @typedef {ReturnType<typeof classifyFrame>} FrameKind */

/** Colours and the letter drawn in each cell, so colour isn't the only cue. */
export const FRAME_STYLE = /** @type {Record<FrameKind, { color: string, label: string, mark: string }>} */ ({
  idle: { color: '#2b2433', label: 'Free to act', mark: '' },
  startup: { color: '#3fbf7f', label: 'Startup', mark: 's' },
  active: { color: '#e5484d', label: 'Active', mark: 'A' },
  recovery: { color: '#3e7be0', label: 'Recovery', mark: 'r' },
  hitstun: { color: '#f2c94c', label: 'Hitstun', mark: 'h' },
  blockstun: { color: '#c79b2c', label: 'Blockstun', mark: 'b' },
  down: { color: '#8a6d7a', label: 'Knocked down', mark: 'd' },
  movement: { color: '#7e8aa3', label: 'Moving / jumping', mark: '' },
  throw: { color: '#c86bd8', label: 'Throw', mark: 't' },
  invuln: { color: '#ffffff', label: 'Invincible', mark: 'i' },
  parry: { color: '#7fe8ff', label: 'Parrying', mark: 'p' },
});

const LENGTH = 88;

export class FrameMeter {
  /**
   * @param {import('../../engine/sim/step.js').Simulation} sim
   */
  constructor(sim) {
    this.sim = sim;
    /** @type {Array<[FrameKind, FrameKind]>} */
    this.frames = [];
    this.quiet = 0;
    /** Measurement of the last hit or block. */
    /** @type {{ attacker: number, type: string, move: string, char: string, start: number, free: [number, number] } | null} */
    this.pending = null;
    /** @type {{ attacker: number, type: string, move: string, char: string, value: number } | null} */
    this.last = null;
    /** Startup of the last move player 1 started, as it happened. */
    this.lastStartup = { move: '', frames: 0 };
    this.p1Started = 0;
  }

  reset() {
    this.frames = [];
    this.quiet = 0;
    this.pending = null;
  }

  /**
   * Record one simulated frame. `frozen`: it was a hit-stop frame.
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @param {boolean} frozen
   */
  record(s, frozen) {
    // Contact: start measuring advantage.
    for (const e of s.events) {
      if ((e.type === 'hit' || e.type === 'block') && e.side >= 0 && e.move !== 'throw') {
        const a = s.fighters[e.side];
        this.pending = { attacker: e.side, type: e.type, move: e.move ?? '', char: a.char, start: s.frame, free: [-1, -1] };
      }
    }
    if (frozen) return;

    const kinds = /** @type {[FrameKind, FrameKind]} */ (s.fighters.map((f) => classifyFrame(f, this.sim.characters[f.char], this.sim.config.parry.window)));
    const idle = kinds[0] === 'idle' && kinds[1] === 'idle';
    if (idle) this.quiet++;
    else {
      // A new exchange after a pause starts a fresh meter.
      if (this.quiet > 20) this.frames = [];
      this.quiet = 0;
    }
    if (!idle || this.quiet <= 20) {
      this.frames.push(kinds);
      if (this.frames.length > LENGTH) this.frames.shift();
    }

    // Startup as it happened, for the display.
    const p1 = s.fighters[0];
    if (p1.state === 'move' && p1.moveFrame === 1) this.p1Started = s.frame;

    if (this.pending) {
      const p = this.pending;
      s.fighters.forEach((f, i) => {
        if (p.free[i] < 0 && isActionable(f)) p.free[i] = s.frame;
      });
      if (p.free[0] >= 0 && p.free[1] >= 0) {
        const value = p.free[1 - p.attacker] - p.free[p.attacker];
        this.last = { attacker: p.attacker, type: p.type, move: p.move, char: p.char, value };
        this.pending = null;
      } else if (s.frame - p.start > 300) {
        this.pending = null;
      }
    }
  }

  /** "+2 on block (5M)" for the last measured exchange. */
  describeLast() {
    if (!this.last) return '';
    const { value, type, move, attacker } = this.last;
    return `P${attacker + 1} ${move}: ${formatAdvantage(value)} on ${type}`;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} y  Top of the meter
   */
  draw(ctx, y) {
    const cell = 6;
    const x0 = Math.round((WIDTH - LENGTH * cell) / 2);
    ctx.fillStyle = 'rgba(12,8,18,0.82)';
    ctx.fillRect(x0 - 26, y - 4, LENGTH * cell + 52, 2 * (cell + 3) + 18);
    outlined(ctx, 'P1', x0 - 22, y + cell + 1, { size: 8, color: '#ffb4a8' });
    outlined(ctx, 'P2', x0 - 22, y + 2 * cell + 4, { size: 8, color: '#a8c4ff' });
    for (let row = 0; row < 2; row++) {
      const yy = y + row * (cell + 3);
      for (let i = 0; i < LENGTH; i++) {
        const kind = this.frames[i]?.[row];
        const x = x0 + i * cell;
        ctx.fillStyle = kind ? FRAME_STYLE[kind].color : '#18121f';
        ctx.fillRect(x, yy, cell - 1, cell + 1);
        if (kind === 'invuln') {
          ctx.fillStyle = '#18121f';
          ctx.fillRect(x + 2, yy + 2, cell - 5, cell - 3);
        }
      }
    }
    // Readout under the meter: startup and advantage of the last exchange.
    const counts = this.counts(0);
    const parts = [];
    if (counts.startup) parts.push(`Startup ${counts.startup}`);
    if (counts.active) parts.push(`Active ${counts.active}`);
    if (counts.recovery) parts.push(`Recovery ${counts.recovery}`);
    const adv = this.describeLast();
    if (adv) parts.push(`Advantage ${adv}`);
    outlined(ctx, parts.join('  ·  ') || 'Attack the dummy: the meter fills in frame by frame', WIDTH / 2, y + 2 * (cell + 3) + 11, { size: 9, align: 'center' });
  }

  /**
   * Startup/active/recovery of the last move a fighter did on the meter,
   * counted from the cells (what actually happened, hit-stop excluded).
   * @param {number} row
   */
  counts(row) {
    let startup = 0;
    let active = 0;
    let recovery = 0;
    // Walk back from the end to the start of the last move.
    let i = this.frames.length - 1;
    while (i >= 0 && ['idle', 'movement', 'hitstun', 'blockstun', 'down'].includes(this.frames[i][row])) i--;
    const end = i;
    while (i >= 0 && ['startup', 'active', 'recovery', 'invuln', 'throw'].includes(this.frames[i][row])) i--;
    for (let k = i + 1; k <= end; k++) {
      const kind = this.frames[k][row];
      if (kind === 'startup' || (kind === 'invuln' && !active)) startup++;
      else if (kind === 'active') {
        if (recovery) {
          // a second burst of active frames after a gap counts as active too
          active += recovery;
          recovery = 0;
        }
        active++;
      } else recovery++;
    }
    // Published startup counts the first active frame.
    return { startup: active ? startup + 1 : 0, active, recovery };
  }
}
