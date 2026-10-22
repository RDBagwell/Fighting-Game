/**
 * Sprite sheets: horizontal strips of equal frames, drawn by frame index
 * (chosen from the simulation's frame data, never from a timer), mirrored
 * when a fighter faces the other way, optionally squashed (the crouch
 * stand-in) or tinted.
 *
 * Tints are recoloured copies of a sheet made once in code: a white
 * silhouette for the hit flash, a blue wash for blocking. The original
 * art files are never modified (ASSETS.md).
 */

export class SpriteSheet {
  /**
   * @param {HTMLImageElement | HTMLCanvasElement} image
   * @param {number} frameSize  Frame width
   * @param {number} [frameHeight]  Frame height (default: square)
   */
  constructor(image, frameSize, frameHeight = frameSize) {
    this.image = image;
    this.frameSize = frameSize;
    this.frameHeight = frameHeight;
    this.frames = Math.max(1, Math.floor(image.width / frameSize));
    /** @type {Map<string, HTMLCanvasElement>} */
    this.variants = new Map();
  }

  /**
   * A tinted copy: `amount` 1 = a flat silhouette in `color`.
   * @param {string} key
   * @param {string} color
   * @param {number} amount  0..1
   */
  variant(key, color, amount) {
    const cached = this.variants.get(key);
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = this.image.width;
    c.height = this.image.height;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.drawImage(this.image, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = amount;
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    this.variants.set(key, c);
    return c;
  }
}

/**
 * @typedef {object} DrawOptions
 * @property {[number, number]} anchor  The point in the frame placed at (x, y) (the feet).
 * @property {number} scale  Screen pixels per sheet pixel (whole numbers keep pixels even).
 * @property {boolean} [flip]  Mirror horizontally.
 * @property {number} [squash]  Vertical scale (crouching), 1 = none.
 * @property {HTMLCanvasElement | HTMLImageElement} [source]  A tinted variant instead of the sheet's image.
 * @property {number} [alpha]
 */

/**
 * Draws one frame with its anchor at (x, y), in logical pixels.
 * @param {CanvasRenderingContext2D} ctx
 * @param {SpriteSheet} sheet
 * @param {number} frame
 * @param {number} x
 * @param {number} y
 * @param {DrawOptions} o
 */
export function drawFrame(ctx, sheet, frame, x, y, o) {
  const size = sheet.frameSize;
  const fh = sheet.frameHeight;
  const f = Math.max(0, Math.min(sheet.frames - 1, frame));
  const squash = o.squash ?? 1;
  const w = Math.round(size * o.scale);
  const h = Math.round(fh * o.scale * squash);
  const ax = o.flip ? size - o.anchor[0] : o.anchor[0];
  const left = Math.round(x - ax * o.scale);
  const top = Math.round(y - o.anchor[1] * o.scale * squash);
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.flip) {
    ctx.translate(left + w, top);
    ctx.scale(-1, 1);
    ctx.drawImage(o.source ?? sheet.image, f * size, 0, size, fh, 0, 0, w, h);
  } else {
    ctx.drawImage(o.source ?? sheet.image, f * size, 0, size, fh, left, top, w, h);
  }
  ctx.restore();
}

/**
 * Where a character's frame is anchored: the character's feet point, plus
 * that sheet's correction for art drawn higher or lower in its frames, plus
 * that frame's correction where the art steps the feet sideways.
 * @param {import('../sim/types.js').SpriteData} sprites
 * @param {string} sheet
 * @param {number} [frame]
 * @returns {[number, number]}
 */
export function anchorFor(sprites, sheet, frame) {
  const off = sprites.offsets?.[sheet] ?? [0, 0];
  const shift = frame === undefined ? 0 : (sprites.frameShift?.[`${sheet}:${frame}`] ?? 0);
  if (!off[0] && !off[1] && !shift) return sprites.anchor;
  return [sprites.anchor[0] + off[0] + shift, sprites.anchor[1] + off[1]];
}
