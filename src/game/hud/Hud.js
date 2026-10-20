/**
 * The match HUD, drawn on the canvas over the fight: health bars (with a
 * red "recent damage" bar that drains after a combo), the timer, round
 * wins, the super meters, combo counters and the announcer's text.
 * It reads the state; the only thing it remembers itself is the drain
 * animation of the red bars.
 */
import { WIDTH, HEIGHT } from '../../engine/render/Screen.js';

/**
 * Outlined text, readable on any background.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {object} o
 * @param {number} o.size
 * @param {string} [o.color]
 * @param {CanvasTextAlign} [o.align]
 * @param {number} [o.outline]
 */
export function outlined(ctx, text, x, y, { size, color = '#ffffff', align = 'left', outline = 3 }) {
  ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = outline;
  ctx.strokeStyle = '#140d1c';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export class Hud {
  constructor() {
    /** Health shown by the red bars, per side (drains towards the real value). */
    this.lag = [1, 1];
    this.lagHold = [0, 0];
  }

  reset() {
    this.lag = [1, 1];
    this.lagHold = [0, 0];
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @param {object} o
   * @param {[string, string]} o.names
   * @param {[string, string]} o.tags  "P1", "CPU"...
   * @param {Record<string, import('../../engine/sim/types.js').CharacterData>} o.characters
   * @param {number} o.roundsToWin
   */
  draw(ctx, s, { names, tags, characters, roundsToWin }) {
    const barW = 250;
    const barH = 12;
    const top = 14;
    for (let side = 0; side < 2; side++) {
      const f = s.fighters[side];
      const max = characters[f.char].stats.health;
      const ratio = f.health / max;
      // The red bar holds while a combo is going on, then drains.
      if (ratio < this.lag[side]) {
        if (f.combo > 0 || f.state === 'hitstun' || f.state === 'airHit') this.lagHold[side] = 20;
        else if (this.lagHold[side] > 0) this.lagHold[side]--;
        else this.lag[side] = Math.max(ratio, this.lag[side] - 0.01);
      } else this.lag[side] = ratio;

      const x0 = side === 0 ? 20 : WIDTH - 20 - barW;
      ctx.fillStyle = '#140d1c';
      ctx.fillRect(x0 - 2, top - 2, barW + 4, barH + 4);
      ctx.fillStyle = '#3a2836';
      ctx.fillRect(x0, top, barW, barH);
      const lagW = Math.round(barW * this.lag[side]);
      const hpW = Math.round(barW * ratio);
      ctx.fillStyle = '#d23b3b';
      ctx.fillRect(side === 0 ? x0 + barW - lagW : x0, top, lagW, barH);
      ctx.fillStyle = ratio > 0.3 ? '#f2d14a' : '#f28a3a';
      ctx.fillRect(side === 0 ? x0 + barW - hpW : x0, top, hpW, barH);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(side === 0 ? x0 + barW - hpW : x0, top, hpW, 2);

      outlined(ctx, names[side], side === 0 ? x0 : x0 + barW, top + barH + 13, { size: 11, align: side === 0 ? 'left' : 'right' });
      outlined(ctx, tags[side], side === 0 ? x0 + barW : x0, top + barH + 12, { size: 9, align: side === 0 ? 'right' : 'left', color: side === 0 ? '#ffb4a8' : '#a8c4ff' });

      // Round wins: pips beside the timer.
      for (let i = 0; i < roundsToWin; i++) {
        const px = side === 0 ? WIDTH / 2 - 36 - i * 10 : WIDTH / 2 + 30 + i * 10;
        ctx.fillStyle = '#140d1c';
        ctx.fillRect(px - 1, top + barH + 5, 8, 8);
        ctx.fillStyle = s.wins[side] > i ? '#f2d14a' : '#3a2836';
        ctx.fillRect(px, top + barH + 6, 6, 6);
      }

      // Super meter.
      const mW = 150;
      const mx = side === 0 ? 20 : WIDTH - 20 - mW;
      const my = HEIGHT - 18;
      const full = f.meter >= 1000;
      ctx.fillStyle = '#140d1c';
      ctx.fillRect(mx - 2, my - 2, mW + 4, 10);
      ctx.fillStyle = '#2a2236';
      ctx.fillRect(mx, my, mW, 6);
      const fill = Math.round((mW * f.meter) / 1000);
      ctx.fillStyle = full ? (Math.floor(s.frame / 6) % 2 ? '#7fe3ff' : '#c7f4ff') : '#3f8fd8';
      ctx.fillRect(side === 0 ? mx : mx + mW - fill, my, fill, 6);
      outlined(ctx, full ? 'SUPER READY' : 'SUPER', side === 0 ? mx : mx + mW, my - 5, { size: 9, align: side === 0 ? 'left' : 'right', color: full ? '#c7f4ff' : '#9fb3cc' });

      // Combo counter, on the attacker's side.
      const defender = s.fighters[1 - side];
      if (defender.combo >= 2) {
        const cx = side === 0 ? 24 : WIDTH - 24;
        const al = side === 0 ? 'left' : 'right';
        outlined(ctx, `${defender.combo} HITS`, cx, 92, { size: 20, align: al, color: '#ffe08a', outline: 4 });
        outlined(ctx, `${defender.comboDamage} damage`, cx, 106, { size: 10, align: al });
      }
    }

    // Timer.
    ctx.fillStyle = '#140d1c';
    ctx.fillRect(WIDTH / 2 - 22, 8, 44, 30);
    ctx.fillStyle = '#2a1f33';
    ctx.fillRect(WIDTH / 2 - 20, 10, 40, 26);
    const seconds = s.options.training ? '∞' : String(Math.ceil(s.timer / 60));
    outlined(ctx, seconds, WIDTH / 2, 31, { size: 20, align: 'center', color: s.timer < 600 && !s.options.training ? '#ff8a6a' : '#ffffff' });

    this.announce(ctx, s, names);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @param {[string, string]} names
   */
  announce(ctx, s, names) {
    let text = '';
    let sub = '';
    if (s.phase === 'intro') {
      const final = s.wins[0] === 1 && s.wins[1] === 1;
      text = s.phaseFrame < 70 ? (final ? 'FINAL ROUND' : `ROUND ${s.round}`) : 'FIGHT!';
    } else if (s.phase === 'fight' && s.phaseFrame < 30 && !s.options.training) {
      text = 'FIGHT!';
    } else if (s.phase === 'ko' || s.phase === 'timeout') {
      if (s.phaseFrame < 70) text = s.phase === 'ko' ? (s.roundWinner === 2 ? 'DOUBLE K.O.' : 'K.O.') : 'TIME';
      else text = s.roundWinner === 2 ? 'DRAW' : `${names[s.roundWinner].toUpperCase()} WINS`;
    } else if (s.phase === 'matchEnd') {
      text = s.matchWinner === 2 ? 'DRAW GAME' : `${names[s.matchWinner].toUpperCase()} WINS`;
      sub = s.matchWinner === 2 ? '' : 'THE MATCH';
    }
    if (!text) return;
    outlined(ctx, text, WIDTH / 2, HEIGHT / 2 - 20, { size: 40, align: 'center', color: '#fff3c4', outline: 6 });
    if (sub) outlined(ctx, sub, WIDTH / 2, HEIGHT / 2 + 4, { size: 16, align: 'center', outline: 4 });
  }
}
