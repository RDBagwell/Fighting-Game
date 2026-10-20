/**
 * Draws a match: stage, fighters, projectiles, effects and HUD, from the
 * simulation state. It only reads the state (types.js, rule 2).
 *
 * The camera follows the midpoint between the fighters and stops at the
 * stage edges; it's derived from the state every frame, so it needs no
 * state of its own.
 */
import { WIDTH, HEIGHT } from '../../engine/render/Screen.js';
import { drawFrame } from '../../engine/render/sprites.js';
import { SUB } from '../../engine/sim/fixed.js';
import { GROUND_Y, drawDuskShrine, Petals } from '../stage/duskShrine.js';
import { chooseSprite } from './fighterView.js';
import { drawProjectile } from './effects.js';

/**
 * @typedef {object} RenderAssets
 * @property {Record<string, Record<string, import('../../engine/render/sprites.js').SpriteSheet>>} sheets  By character, then sheet name.
 * @property {import('../stage/duskShrine.js').DuskShrine} shrine
 * @property {{ background: HTMLImageElement | null, shop: HTMLImageElement | null }} licensed
 */

export class FightRenderer {
  /**
   * @param {RenderAssets} assets
   * @param {import('../../engine/sim/step.js').Simulation} sim
   */
  constructor(assets, sim) {
    this.assets = assets;
    this.sim = sim;
    this.petals = new Petals();
    this.time = 0;
  }

  /**
   * The camera's left edge in stage pixels.
   * @param {import('../../engine/sim/types.js').MatchState} s
   */
  cameraX(s) {
    const mid = (s.fighters[0].x + s.fighters[1].x) / 2 / SUB;
    const max = this.sim.config.stage.width - WIDTH;
    return Math.max(0, Math.min(max, Math.round(mid - WIDTH / 2)));
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX
   * @param {string} stage
   * @param {boolean} still
   */
  drawStage(ctx, camX, stage, still) {
    const lic = this.assets.licensed;
    if (stage === 'oak-woods' && lic.background) {
      // Robert's own licensed copy (never committed): drawn 1:1, its ground
      // line (y 480 of 576) on ours.
      ctx.fillStyle = '#1c2b2a';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(lic.background, -camX, GROUND_Y - 480);
      if (lic.shop) {
        const fw = lic.shop.width / 6;
        const frame = still ? 0 : Math.floor(this.time * 6) % 6;
        ctx.drawImage(lic.shop, frame * fw, 0, fw, lic.shop.height, 600 - camX, GROUND_Y - lic.shop.height * 2, fw * 2, lic.shop.height * 2);
      }
      return;
    }
    drawDuskShrine(ctx, this.assets.shrine, camX, this.time, still);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @param {object} o
   * @param {number} o.dt  Seconds since the last render
   * @param {boolean} o.reducedMotion
   * @param {import('./effects.js').Effects} o.effects
   * @param {(ctx: CanvasRenderingContext2D, camX: number) => void} [o.overlay]  Drawn over the fighters (hitboxes).
   * @param {(ctx: CanvasRenderingContext2D) => void} [o.hud]
   */
  draw(ctx, s, { dt, reducedMotion, effects, overlay, hud }) {
    this.time += dt;
    const camX = this.cameraX(s);
    const shake = effects.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    this.drawStage(ctx, camX, s.options.stage, reducedMotion);

    // Super flash: the world dims behind the fighter doing the super.
    if (s.flash >= 0) {
      ctx.fillStyle = 'rgba(10,6,20,0.55)';
      ctx.fillRect(-10, -10, WIDTH + 20, HEIGHT + 20);
    }

    // Shadows.
    for (const f of s.fighters) {
      const x = Math.round(f.x / SUB - camX);
      const lift = Math.min(1, -f.y / SUB / 120);
      ctx.fillStyle = `rgba(20,10,25,${0.35 - lift * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(x, GROUND_Y + 1, 22 - lift * 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // The fighter who is attacking is drawn in front.
    const order = s.fighters[1].state === 'move' && s.fighters[0].state !== 'move' ? [0, 1] : s.fighters[0].state === 'move' ? [1, 0] : [1, 0];
    for (const i of order) this.drawFighter(ctx, s, s.fighters[i], camX);

    for (const p of s.projectiles) {
      const look = this.sim.characters[p.char].moves[p.move].projectile?.look ?? 'kunai';
      drawProjectile(ctx, p, look, camX, GROUND_Y);
    }
    effects.draw(ctx, camX, GROUND_Y);
    overlay?.(ctx, camX);
    if (!reducedMotion) this.petals.draw(ctx, dt, reducedMotion);
    ctx.restore();
    effects.drawFlash(ctx, WIDTH, HEIGHT);
    hud?.(ctx);
  }

  /**
   * A see-through, recoloured fighter: the rollback lab's ghost of where
   * the prediction had put the opponent before a correction. Reads a
   * fighter-shaped snapshot (only the fields the sprite choice needs).
   * @param {CanvasRenderingContext2D} ctx
   * @param {Pick<import('../../engine/sim/types.js').FighterState, 'x' | 'y' | 'facing' | 'char' | 'state' | 'move' | 'moveFrame' | 'stateFrame' | 'vy' | 'crouching'>} f
   * @param {number} camX
   * @param {number} alpha
   */
  drawGhost(ctx, f, camX, alpha) {
    const ch = this.sim.characters[f.char];
    const choice = chooseSprite(/** @type {import('../../engine/sim/types.js').FighterState} */ (f), ch);
    const sheet = this.assets.sheets[f.char]?.[choice.sheet];
    if (!sheet) return;
    drawFrame(ctx, sheet, choice.frame, Math.round(f.x / SUB - camX), Math.round(GROUND_Y + f.y / SUB), {
      anchor: ch.sprites.anchor,
      scale: ch.sprites.scale,
      flip: f.facing !== ch.nativeFacing,
      squash: choice.squash,
      source: sheet.variant('ghost', '#e264ff', 0.85),
      alpha,
    });
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @param {import('../../engine/sim/types.js').FighterState} f
   * @param {number} camX
   */
  drawFighter(ctx, s, f, camX) {
    const ch = this.sim.characters[f.char];
    const choice = chooseSprite(f, ch);
    const sheet = this.assets.sheets[f.char]?.[choice.sheet];
    if (!sheet) return;
    const x = Math.round(f.x / SUB - camX);
    // Shake the defender during hit-stop, so the hit reads even while frozen.
    const jitter = s.freeze > 0 && (f.state === 'hitstun' || f.state === 'airHit') && f.stateFrame <= 1 ? (s.freeze % 2 ? 2 : -2) : 0;
    const y = Math.round(GROUND_Y + f.y / SUB);
    let source;
    if (choice.tint === 'flash') source = sheet.variant('flash', '#ffffff', 0.55);
    else if (choice.tint === 'guard') source = sheet.variant('guard', '#5aa8ff', 0.35);
    drawFrame(ctx, sheet, choice.frame, x + jitter, y, {
      anchor: ch.sprites.anchor,
      scale: ch.sprites.scale,
      flip: f.facing !== ch.nativeFacing,
      squash: choice.squash,
      source,
    });
  }
}
