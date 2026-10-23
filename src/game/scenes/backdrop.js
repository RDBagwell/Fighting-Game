/**
 * The animated backdrop behind the menus: the stage slowly panning, with
 * the two fighters idling in front of the torii gate.
 */
import { WIDTH, HEIGHT } from '../../engine/render/Screen.js';
import { drawFrame } from '../../engine/render/sprites.js';
import { drawDuskShrine, GROUND_Y } from '../stage/duskShrine.js';

/**
 * @param {import('../App.js').App} app
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} time  Seconds
 * @param {string[]} [chars]  Two face each other; one stands in the middle.
 * @param {number} [dim]  0..1 darkening, so menu text stays readable
 * @param {boolean} [pan]  Pan the camera slowly (false: it stays centred on the fighters).
 */
export function drawBackdrop(app, ctx, time, chars = ['mack', 'kenji'], dim = 0.35, pan = true) {
  const assets = /** @type {NonNullable<typeof app.assets>} */ (app.assets);
  const still = app.settings.reducedMotion;
  const span = app.sim.config.stage.width - WIDTH;
  const camX = still || !pan ? span / 2 : span / 2 + Math.sin(time * 0.08) * (span / 2 - 10);
  drawDuskShrine(ctx, assets.shrine, camX, time, still);
  const mid = app.sim.config.stage.width / 2 - camX;
  chars.forEach((id, side) => {
    const ch = app.sim.characters[id];
    const sheet = assets.sheets[id].idle;
    const frame = Math.floor(time * 8) % sheet.frames;
    const facing = side === 0 ? 1 : -1;
    const x = chars.length === 1 ? mid : mid + (side === 0 ? -90 : 90);
    drawFrame(ctx, sheet, frame, Math.round(x), GROUND_Y, {
      anchor: ch.sprites.anchor, scale: ch.sprites.scale, flip: facing !== ch.nativeFacing,
    });
  });
  ctx.fillStyle = `rgba(14,9,22,${dim})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/**
 * A character's idle frame on its own small canvas (the select screen's
 * portraits).
 * @param {import('../App.js').App} app
 * @param {string} id
 * @param {number} [size]
 */
export function portrait(app, id, size = 120) {
  const assets = /** @type {NonNullable<typeof app.assets>} */ (app.assets);
  const ch = app.sim.characters[id];
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.imageSmoothingEnabled = false;
  drawFrame(g, assets.sheets[id].idle, 0, size / 2, size - 4, { anchor: ch.sprites.anchor, scale: ch.sprites.scale, flip: ch.nativeFacing !== 1 });
  c.className = 'portrait';
  c.setAttribute('aria-hidden', 'true');
  return c;
}
