/**
 * The input display: each player's recent inputs as a list, newest at the
 * top, each line a direction arrow, the buttons, and how many frames it
 * was held. When the simulation recognises a motion (236, 623, [4]6...),
 * the line where it completed is marked with the motion's name.
 *
 * It reads the same input bytes the simulation received, and the
 * simulation's own record of the last motion it recognised, so it shows
 * what the game understood, not just what was pressed.
 */
import { toNumpad, L, M, H, SP } from '../../engine/input/bits.js';
import { outlined } from '../hud/Hud.js';

const ARROWS = ['', '↙', '↓', '↘', '←', '•', '→', '↖', '↑', '↗'];
const MAX = 14;

export class InputHistory {
  constructor() {
    /** @type {Array<Array<{ bits: number, frames: number, motion: string, numpad: number }>>} */
    this.lines = [[], []];
    this.motionSeen = [-1, -1];
  }

  reset() {
    this.lines = [[], []];
  }

  /**
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @param {Record<string, import('../../engine/sim/types.js').MotionData>} motions
   */
  record(s, motions) {
    s.fighters.forEach((f, i) => {
      const bits = f.hist[0];
      const list = this.lines[i];
      const numpad = toNumpad(bits, f.facing);
      const top = list[0];
      if (top && top.bits === bits) top.frames++;
      else {
        list.unshift({ bits, frames: 1, motion: '', numpad });
        if (list.length > MAX) list.pop();
      }
      if (f.motionFrame !== this.motionSeen[i] && f.motionFrame === s.frame) {
        this.motionSeen[i] = f.motionFrame;
        list[0].motion = motions[f.motion]?.name ?? f.motion;
      }
    });
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} side
   * @param {number} x  Left edge (P1) or right edge (P2)
   * @param {number} y  Top
   */
  draw(ctx, side, x, y) {
    const list = this.lines[side];
    const w = 66;
    const left = side === 0 ? x : x - w;
    ctx.fillStyle = 'rgba(12,8,18,0.7)';
    ctx.fillRect(left, y, w, MAX * 12 + 6);
    list.forEach((line, i) => {
      const yy = y + 12 + i * 12;
      if (line.motion) {
        ctx.fillStyle = 'rgba(242,209,74,0.35)';
        ctx.fillRect(left + 1, yy - 9, w - 2, 12);
      }
      const buttons = [[L, 'L', '#ff9b8a'], [M, 'M', '#ffd27a'], [H, 'H', '#9be38a'], [SP, 'S', '#c9a6ff']]
        .filter(([bit]) => line.bits & /** @type {number} */ (bit));
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = line.numpad === 5 ? '#6f6478' : '#ffffff';
      ctx.fillText(ARROWS[line.numpad], left + 4, yy);
      let bx = left + 16;
      for (const [, name, color] of buttons) {
        ctx.fillStyle = /** @type {string} */ (color);
        ctx.fillText(/** @type {string} */ (name), bx, yy);
        bx += 8;
      }
      ctx.fillStyle = '#a99fb2';
      ctx.textAlign = 'right';
      ctx.font = '600 8px ui-monospace, monospace';
      ctx.fillText(line.motion ? line.motion : String(Math.min(line.frames, 99)), left + w - 4, yy);
    });
    outlined(ctx, side === 0 ? 'P1 inputs' : 'P2 inputs', side === 0 ? left : left + w, y - 3, { size: 8, align: side === 0 ? 'left' : 'right' });
  }
}
