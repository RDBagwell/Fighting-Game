/**
 * Hit feedback that lives outside the simulation: hit sparks, guard
 * sparks, dust, screen shake and flashes, plus the projectile and super
 * effects drawn with canvas shapes (ASSETS.md).
 *
 * Effects start from the simulation's events and advance once per
 * simulation step (so slow motion and frame stepping slow them too), but
 * they are never part of the state: they may use Math.random, and losing
 * them changes nothing about the fight. (Session 2: when rollback
 * re-simulates frames, their events must not spawn effects twice.)
 *
 * Reduced motion: no screen shake, no full-screen flash, fewer particles.
 */
import { SUB } from '../../engine/sim/fixed.js';

/**
 * @typedef {object} Particle
 * @property {number} x  Stage pixels
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} life
 * @property {number} max
 * @property {string} color
 * @property {'line'|'ring'|'dot'|'text'} kind
 * @property {number} size
 * @property {string} [text]
 */

export class Effects {
  constructor() {
    /** @type {Particle[]} */
    this.parts = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.reducedMotion = false;
  }

  clear() {
    this.parts.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  /**
   * @param {import('../../engine/sim/types.js').SimEvent[]} events
   * @param {import('../../engine/sim/types.js').MatchState} state
   */
  onEvents(events, state) {
    for (const e of events) {
      const x = (e.x ?? 0) / SUB;
      const y = (e.y ?? 0) / SUB;
      const strength = e.strength ?? 10;
      switch (e.type) {
        case 'hit':
          this.burst(x, y, strength >= 12 ? 14 : 9, strength >= 12 ? '#fff3c4' : '#ffe08a', 'line', 3 + strength / 4);
          this.parts.push({ x, y, vx: 0, vy: 0, life: 8, max: 8, color: '#ffffff', kind: 'ring', size: 6 + strength });
          if (!this.reducedMotion) this.shake = Math.max(this.shake, Math.min(6, strength / 3));
          break;
        case 'block':
          this.parts.push({ x, y, vx: 0, vy: 0, life: 10, max: 10, color: '#8fd3ff', kind: 'ring', size: 10 + strength / 2 });
          this.burst(x, y, 5, '#bfe8ff', 'dot', 2);
          break;
        case 'tech':
          this.parts.push({ x, y, vx: 0, vy: 0, life: 14, max: 14, color: '#ffffff', kind: 'ring', size: 22 });
          this.text(x, y - 10, 'TECH', '#ffffff');
          break;
        case 'clash':
          this.burst(x, y, 10, '#e7f0ff', 'line', 4);
          break;
        case 'parry':
          this.parts.push({ x, y, vx: 0, vy: 0, life: 14, max: 14, color: '#7fe8ff', kind: 'ring', size: 26 });
          this.burst(x, y, 8, '#d9f8ff', 'line', 4);
          this.text(x, y - 14, 'PARRY', '#9df0ff');
          if (!this.reducedMotion) {
            this.flash = 3;
            this.flashColor = '#bff4ff';
          }
          break;
        case 'guard-cancel':
          this.parts.push({ x, y: y - 60, vx: 0, vy: 0, life: 16, max: 16, color: '#ffb46a', kind: 'ring', size: 40 });
          this.text(x, y - 130, 'GUARD CANCEL', '#ffc98a');
          break;
        case 'burst':
          this.parts.push({ x, y: y - 70, vx: 0, vy: 0, life: 22, max: 22, color: '#ffffff', kind: 'ring', size: 80 });
          this.parts.push({ x, y: y - 70, vx: 0, vy: 0, life: 16, max: 16, color: '#ff8adf', kind: 'ring', size: 50 });
          this.burst(x, y - 70, 16, '#ffd1f2', 'line', 6);
          this.text(x, y - 140, 'BURST', '#ffb3ec');
          if (!this.reducedMotion) {
            this.flash = 5;
            this.flashColor = '#ffe3f6';
            this.shake = Math.max(this.shake, 4);
          }
          break;
        case 'knockdown':
        case 'land':
        case 'dash': {
          const f = state.fighters[e.type === 'knockdown' ? e.side : Math.max(0, e.side)];
          const fx = e.type === 'knockdown' ? x : f.x / SUB;
          this.dust(fx, e.type === 'knockdown' ? 8 : 3);
          break;
        }
        case 'super':
          if (!this.reducedMotion) {
            this.flash = 6;
            this.flashColor = '#fff6d8';
          }
          this.parts.push({ x: x, y: y / 1 - 60, vx: 0, vy: 0, life: 30, max: 30, color: '#ffd76a', kind: 'ring', size: 60 });
          break;
        case 'ko':
          if (!this.reducedMotion) {
            this.flash = 10;
            this.flashColor = '#ffffff';
            this.shake = 8;
          }
          break;
        default:
          break;
      }
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} n
   * @param {string} color
   * @param {'line'|'dot'} kind
   * @param {number} speed
   */
  burst(x, y, n, color, kind, speed) {
    const count = this.reducedMotion ? Math.ceil(n / 2) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.5 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 9, max: 9, color, kind, size: 2 });
    }
  }

  /** @param {number} x @param {number} n */
  dust(x, n) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x: x + (Math.random() - 0.5) * 30, y: -2, vx: (Math.random() - 0.5) * 1.5, vy: -Math.random() * 0.8, life: 18, max: 18, color: '#b9a4ad', kind: 'dot', size: 2 });
    }
  }

  /** @param {number} x @param {number} y @param {string} text @param {string} color */
  text(x, y, text, color) {
    this.parts.push({ x, y, vx: 0, vy: -0.6, life: 40, max: 40, color, kind: 'text', size: 10, text });
  }

  /** Advances one simulation step. */
  update() {
    for (const p of this.parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.85;
      p.vy *= 0.85;
      p.life--;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.6);
    if (this.flash > 0) this.flash--;
  }

  /** The current shake offset in pixels. */
  shakeOffset() {
    if (this.shake <= 0 || this.reducedMotion) return { x: 0, y: 0 };
    const s = Math.round(this.shake);
    return { x: Math.round((Math.random() * 2 - 1) * s), y: Math.round((Math.random() * 2 - 1) * s * 0.5) };
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX
   * @param {number} groundY
   */
  draw(ctx, camX, groundY) {
    for (const p of this.parts) {
      const t = p.life / p.max;
      const x = Math.round(p.x - camX);
      const y = Math.round(groundY + p.y);
      ctx.globalAlpha = Math.min(1, t * 1.5);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.kind === 'line') {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(Math.round(x - p.vx * 3), Math.round(y - p.vy * 3));
        ctx.stroke();
      } else if (p.kind === 'ring') {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, p.size * (1.2 - t), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'text' && p.text) {
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, x, y);
      } else {
        ctx.fillRect(x, y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   */
  drawFlash(ctx, w, h) {
    if (this.flash <= 0) return;
    ctx.globalAlpha = Math.min(0.6, this.flash / 12);
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

/**
 * Projectiles drawn in code: Kenji's kunai and his super's crescent, and
 * Elumlur's storm wave. (Reroe's spear is a sprite: FightRenderer.)
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../engine/sim/types.js').ProjectileState} p
 * @param {string} look
 * @param {number} camX
 * @param {number} groundY
 */
export function drawProjectile(ctx, p, look, camX, groundY) {
  const x = Math.round(p.x / SUB - camX);
  const y = Math.round(groundY + p.y / SUB);
  const d = p.facing;
  if (look === 'kunai') {
    ctx.fillStyle = 'rgba(160,200,255,0.35)';
    ctx.fillRect(d === 1 ? x - 26 : x + 6, y - 1, 20, 2);
    ctx.fillStyle = '#dfe8f5';
    ctx.beginPath();
    ctx.moveTo(x + 10 * d, y);
    ctx.lineTo(x - 2 * d, y - 4);
    ctx.lineTo(x - 2 * d, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a2a2a';
    ctx.fillRect(d === 1 ? x - 9 : x + 2, y - 1, 7, 2);
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(d === 1 ? x - 12 : x + 9, y - 2, 3, 4);
  } else if (look === 'wave') {
    // A small crescent of cyan storm energy, flickering.
    const pulse = (p.age % 4) / 4;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(d, 1);
    ctx.fillStyle = `rgba(63,230,240,${0.35 + 0.15 * pulse})`;
    ctx.beginPath();
    ctx.arc(-2, 0, 18, -Math.PI / 2, Math.PI / 2);
    ctx.arc(-10, 0, 16, Math.PI / 2, -Math.PI / 2, true);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(-2, 0, 14, -Math.PI / 2, Math.PI / 2);
    ctx.arc(-7, 0, 13, Math.PI / 2, -Math.PI / 2, true);
    ctx.fill();
    ctx.restore();
  } else {
    // A crescent of light: an outer glow and a thinner bright core,
    // translucent so the fighters stay visible through it.
    const pulse = (p.age % 6) / 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(d, 1);
    ctx.fillStyle = `rgba(255,220,140,${0.22 + 0.12 * pulse})`;
    ctx.beginPath();
    ctx.arc(-4, 0, 36, -Math.PI / 2, Math.PI / 2);
    ctx.arc(-18, 0, 32, Math.PI / 2, -Math.PI / 2, true);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,246,210,0.75)';
    ctx.beginPath();
    ctx.arc(-4, 0, 30, -Math.PI / 2, Math.PI / 2);
    ctx.arc(-12, 0, 27, Math.PI / 2, -Math.PI / 2, true);
    ctx.fill();
    ctx.restore();
  }
}
