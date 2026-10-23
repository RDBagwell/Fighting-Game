/**
 * The VS splash: both fighters, their names and titles, for two seconds
 * (any button skips it).
 */
import { WIDTH, HEIGHT } from '../../engine/render/Screen.js';
import { drawFrame } from '../../engine/render/sprites.js';
import { outlined } from '../hud/Hud.js';
import { drawBackdrop } from './backdrop.js';
import { MatchScene } from './match.js';
import { nextFight, LADDER_LENGTH } from '../arcade/ladder.js';
import { ARCADE } from '../data/arcade.js';

const LENGTH = 120;

export class VsScene {
  /**
   * @param {import('../App.js').App} app
   * @param {import('./select.js').MatchConfig} config
   */
  constructor(app, config) {
    this.app = app;
    this.config = config;
    this.name = 'vs';
    this.frames = 0;
    this.time = 0;
  }

  enter() {
    this.app.sfx.play('round');
    // Any key, click or tap skips.
    this.skip = () => this.next();
    this.app.ui.addEventListener('pointerdown', this.skip);
    this.keySkip = (/** @type {KeyboardEvent} */ e) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') this.next();
    };
    window.addEventListener('keydown', this.keySkip);
  }

  exit() {
    if (this.skip) this.app.ui.removeEventListener('pointerdown', this.skip);
    if (this.keySkip) window.removeEventListener('keydown', this.keySkip);
  }

  next() {
    if (this.done) return;
    this.done = true;
    this.app.setScene(new MatchScene(this.app, this.config));
  }

  /** @param {import('../../engine/input/InputManager.js').MenuAction} action */
  onMenu(action) {
    if (action === 'confirm') this.next();
    return true;
  }

  update() {
    this.frames++;
    if (this.frames >= LENGTH) this.next();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  render(ctx, dt) {
    this.time += dt;
    const app = this.app;
    drawBackdrop(app, ctx, 0, ['mack', 'kenji'], 1);
    const assets = /** @type {NonNullable<typeof app.assets>} */ (app.assets);
    const slide = Math.min(1, this.frames / 18);
    this.config.chars.forEach((id, side) => {
      const ch = app.sim.characters[id];
      ctx.fillStyle = side === 0 ? 'rgba(210,59,59,0.25)' : 'rgba(63,111,216,0.25)';
      ctx.fillRect(side === 0 ? 0 : WIDTH / 2, 0, WIDTH / 2, HEIGHT);
      const x = side === 0 ? -80 + slide * 240 : WIDTH + 80 - slide * 240;
      drawFrame(ctx, assets.sheets[id].idle, Math.floor(this.time * 8) % assets.sheets[id].idle.frames, Math.round(x), 300, {
        anchor: ch.sprites.anchor, scale: ch.sprites.scale * 2, flip: (side === 0 ? 1 : -1) !== ch.nativeFacing,
      });
      outlined(ctx, ch.name.toUpperCase(), side === 0 ? 30 : WIDTH - 30, 320, { size: 30, align: side === 0 ? 'left' : 'right', outline: 6 });
      outlined(ctx, ch.title, side === 0 ? 30 : WIDTH - 30, 340, { size: 12, align: side === 0 ? 'left' : 'right' });
    });
    outlined(ctx, 'VS', WIDTH / 2, HEIGHT / 2, { size: 56, align: 'center', color: '#f2d14a', outline: 8 });
    const arcade = this.config.arcade;
    if (arcade) {
      const next = nextFight(arcade.run);
      outlined(ctx, next.rival ? `FINAL FIGHT · YOUR RIVAL` : `FIGHT ${next.number} OF ${LADDER_LENGTH}`, WIDTH / 2, 40, { size: 20, align: 'center', color: next.rival ? '#ff7a59' : '#ffffff', outline: 5 });
      outlined(ctx, `CPU ${next.level.name}`, WIDTH / 2, 60, { size: 12, align: 'center' });
      if (next.rival) outlined(ctx, ARCADE[arcade.run.char].rivalIntro, WIDTH / 2, 84, { size: 13, align: 'center' });
    }
  }
}
