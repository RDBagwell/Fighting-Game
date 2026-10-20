/**
 * The game's canvas: a fixed 640×360 logical screen, scaled up by a whole
 * number so every pixel of the pixel art becomes an exact square of
 * device pixels (no blur, no uneven pixels).
 *
 * The backing canvas is 640k × 360k device pixels, where k is the largest
 * integer that fits the space available; drawing code works in logical
 * pixels through a k× transform, so sprites drawn with smoothing off stay
 * crisp and text is rendered at full resolution.
 *
 * Two exceptions, both to use the screen well:
 * - on high-density screens (2+ device pixels per CSS pixel: phones,
 *   tablets, retina laptops) the canvas is drawn one whole step larger and
 *   shown at exactly the space available. Each game pixel is then 3+
 *   device pixels give or take one, which the eye can't see at that
 *   density, and a phone gets the whole screen rather than a box in it;
 * - if the window is smaller than 640×360 device pixels it shrinks by a
 *   fraction (CSS `image-rendering: pixelated` keeps it sharp-edged).
 */
export const WIDTH = 640;
export const HEIGHT = 360;

export class Screen {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} container  The element whose size the game fills.
   */
  constructor(canvas, container) {
    this.canvas = canvas;
    this.container = container;
    this.ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { alpha: false }));
    this.scale = 1;
    /** CSS pixels kept free on the right (a side panel that sits beside the game). */
    this.reserveRight = 0;
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, this.container.clientWidth - this.reserveRight);
    const h = Math.max(1, this.container.clientHeight);
    const fit = Math.min((w * dpr) / WIDTH, (h * dpr) / HEIGHT);
    const dense = dpr >= 2 && fit > Math.floor(fit) + 0.05;
    const k = Math.max(1, dense ? Math.ceil(fit) : Math.floor(fit));
    this.scale = k;
    this.canvas.width = WIDTH * k;
    this.canvas.height = HEIGHT * k;
    // CSS size: exactly k device pixels per game pixel when it fits;
    // otherwise shrink to fit.
    const cssScale = fit >= 1 && !dense ? k / dpr : Math.min(w / WIDTH, h / HEIGHT);
    this.canvas.style.width = `${Math.round(WIDTH * cssScale)}px`;
    this.canvas.style.height = `${Math.round(HEIGHT * cssScale)}px`;
    this.cssWidth = WIDTH * cssScale;
    this.cssHeight = HEIGHT * cssScale;
    this.container.style.setProperty('--game-w', `${Math.round(WIDTH * cssScale)}px`);
    this.container.style.setProperty('--game-h', `${Math.round(HEIGHT * cssScale)}px`);
    this.container.style.setProperty('--reserve', `${this.reserveRight}px`);
  }

  /** Starts a frame: logical-pixel transform, smoothing off. */
  begin() {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
  }
}
