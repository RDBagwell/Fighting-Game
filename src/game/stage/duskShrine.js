/**
 * The Dusk Shrine: an original stage drawn entirely in code, replacing the
 * Oak Woods background (which can't be redistributed; ASSETS.md).
 *
 * Layered parallax, back to front, each layer pre-drawn once into an
 * offscreen canvas and scrolled at its own rate as the camera moves:
 *
 *   sky and sun        0.00  (fixed)
 *   far mountains      0.15
 *   pagoda ridge       0.45
 *   courtyard          1.00  (moves with the fighters: torii gate, lanterns)
 *   petals             render-time animation, in front
 *
 * Shapes come from a small fixed-seed generator so the stage looks the
 * same every time. This is rendering only: nothing here is in the
 * simulation, so it may use floating point and Math.sin freely.
 */
import { WIDTH, HEIGHT } from '../../engine/render/Screen.js';

export const GROUND_Y = 320;

/** @param {number} seed */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * @param {number} w
 * @param {number} h
 */
function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { canvas: c, g: /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')) };
}

/**
 * A pixel-stepped ridge line (so the silhouettes read as pixel art).
 * @param {CanvasRenderingContext2D} g
 * @param {number} w
 * @param {number} base
 * @param {number} amp
 * @param {() => number} rnd
 * @param {string} color
 * @param {number} [stepX]
 */
function ridge(g, w, base, amp, rnd, color, stepX = 4) {
  g.fillStyle = color;
  let y = base - amp * rnd();
  let target = y;
  for (let x = 0; x < w; x += stepX) {
    if (Math.abs(y - target) < 2) target = base - amp * (0.2 + 0.8 * rnd());
    y += Math.sign(target - y) * Math.min(Math.abs(target - y), 2 + rnd() * 3);
    g.fillRect(x, Math.round(y), stepX, HEIGHT - Math.round(y));
  }
}

/**
 * @param {number} stageWidth
 */
export function buildDuskShrine(stageWidth) {
  const rnd = seeded(20221020);

  // Sky: banded gradient (bands rather than a smooth ramp, to suit the pixel art).
  const sky = layer(WIDTH, HEIGHT);
  const bands = ['#191632', '#231b3f', '#2f1f4b', '#432656', '#5c2d5d', '#7a345e', '#9c3f5c', '#c25455', '#e0704c', '#f2934e', '#f8b65e'];
  const bandH = Math.ceil(250 / bands.length);
  bands.forEach((c, i) => {
    sky.g.fillStyle = c;
    sky.g.fillRect(0, i * bandH, WIDTH, bandH + 1);
  });
  sky.g.fillStyle = bands[bands.length - 1];
  sky.g.fillRect(0, bands.length * bandH, WIDTH, HEIGHT);
  // The setting sun, in rings.
  const sunX = 430;
  const sunY = 205;
  /** @type {Array<[number, string]>} */
  const rings = [[64, 'rgba(255,200,120,0.10)'], [50, 'rgba(255,190,110,0.16)'], [38, '#ffd27a'], [34, '#ffe29a']];
  for (const [r, c] of rings) {
    sky.g.fillStyle = c;
    for (let y = -r; y <= r; y += 2) {
      const half = Math.round(Math.sqrt(r * r - y * y));
      sky.g.fillRect(sunX - half, sunY + y, half * 2, 2);
    }
  }
  // Thin cloud streaks across the sun.
  sky.g.fillStyle = 'rgba(122,52,94,0.75)';
  for (const [x, y, w] of [[360, 196, 120], [400, 210, 90], [300, 120, 140], [80, 90, 110], [500, 70, 80]]) sky.g.fillRect(x, y, w, 2);
  // A few early stars.
  sky.g.fillStyle = '#e8dcff';
  for (let i = 0; i < 40; i++) sky.g.fillRect(Math.floor(rnd() * WIDTH), Math.floor(rnd() * 110), 1, 1);

  // Far mountains.
  const farW = Math.ceil(WIDTH + (stageWidth - WIDTH) * 0.15) + 8;
  const far = layer(farW, HEIGHT);
  ridge(far.g, farW, 210, 80, rnd, '#4a2a5a', 4);
  ridge(far.g, farW, 240, 50, rnd, '#3a2150', 4);
  far.g.fillStyle = 'rgba(240,140,90,0.18)'; // haze where the mountains meet the light
  far.g.fillRect(0, 236, farW, 10);

  // Pagoda ridge: a hill line with a five-tier pagoda and trees.
  const midW = Math.ceil(WIDTH + (stageWidth - WIDTH) * 0.45) + 8;
  const mid = layer(midW, HEIGHT);
  ridge(mid.g, midW, 262, 26, rnd, '#2b1838', 6);
  const pg = mid.g;
  pg.fillStyle = '#21122c';
  const px0 = Math.round(midW * 0.62);
  for (let t = 0; t < 5; t++) {
    const y = 250 - t * 22;
    const w = 56 - t * 8;
    pg.fillRect(px0 - w / 2, y, w, 6); // roof
    pg.fillRect(px0 - w / 2 - 4, y + 2, 4, 2); // upturned eaves
    pg.fillRect(px0 + w / 2, y + 2, 4, 2);
    pg.fillRect(px0 - (w - 16) / 2, y + 6, w - 16, 16); // wall
  }
  pg.fillRect(px0 - 1, 250 - 5 * 22 - 18, 2, 22); // spire
  pg.fillStyle = '#f2934e'; // lit windows
  for (let t = 0; t < 4; t++) pg.fillRect(px0 - 3, 256 - t * 22, 6, 4);
  // Tree clumps.
  for (let i = 0; i < 18; i++) {
    const tx = Math.floor(rnd() * midW);
    const th = 20 + Math.floor(rnd() * 26);
    pg.fillStyle = i % 2 ? '#24142f' : '#1d0f27';
    for (let k = 0; k < th; k += 3) {
      const half = Math.round((th - k) * 0.35) + 2;
      pg.fillRect(tx - half, 270 - k, half * 2, 3);
    }
  }

  // The courtyard: stone floor, wall, torii gate, lanterns, pines.
  const near = layer(stageWidth, HEIGHT);
  const g = near.g;
  // Back wall of the shrine grounds.
  g.fillStyle = '#3b2230';
  g.fillRect(0, 268, stageWidth, 52);
  g.fillStyle = '#4a2b3a';
  for (let x = 0; x < stageWidth; x += 32) g.fillRect(x, 268, 30, 4);
  g.fillStyle = '#2a1722';
  g.fillRect(0, 264, stageWidth, 4);
  // Pines behind the wall.
  for (const tx of [60, 230, 790, 960]) {
    g.fillStyle = '#1a0f1c';
    g.fillRect(tx - 3, 200, 6, 70);
    for (let k = 0; k < 4; k++) {
      const w = 54 - k * 10;
      g.fillRect(tx - w / 2, 214 - k * 16, w, 10);
    }
  }
  // Torii gate, centred on the stage.
  const cx = Math.round(stageWidth / 2);
  g.fillStyle = '#b8352c';
  g.fillRect(cx - 74, 170, 10, 120); // pillars
  g.fillRect(cx + 64, 170, 10, 120);
  g.fillRect(cx - 84, 182, 168, 7); // nuki (lower beam)
  g.fillStyle = '#1e1016';
  g.fillRect(cx - 104, 160, 208, 9); // kasagi (top beam)
  g.fillRect(cx - 110, 156, 10, 5);
  g.fillRect(cx + 100, 156, 10, 5);
  g.fillStyle = '#d6493b';
  g.fillRect(cx - 98, 169, 196, 6);
  g.fillStyle = '#e7c46a'; // plaque
  g.fillRect(cx - 7, 175, 14, 14);
  g.fillStyle = '#8a2a24';
  g.fillRect(cx - 74, 286, 10, 4);
  g.fillRect(cx + 64, 286, 10, 4);
  // Stone lanterns (flames drawn live).
  const lanterns = [150, 340, stageWidth - 340, stageWidth - 150];
  for (const lx of lanterns) {
    g.fillStyle = '#6d6273';
    g.fillRect(lx - 10, 300, 20, 6);
    g.fillRect(lx - 3, 278, 6, 22);
    g.fillRect(lx - 12, 266, 24, 4);
    g.fillStyle = '#4c4352';
    g.fillRect(lx - 8, 270, 16, 10);
    g.fillRect(lx - 14, 262, 28, 4);
    g.fillRect(lx - 4, 256, 8, 6);
  }
  // Stone floor.
  g.fillStyle = '#5a4552';
  g.fillRect(0, GROUND_Y - 14, stageWidth, HEIGHT - GROUND_Y + 14);
  g.fillStyle = '#6b5462';
  g.fillRect(0, GROUND_Y - 14, stageWidth, 3);
  for (let row = 0; row < 4; row++) {
    const y = GROUND_Y - 8 + row * 12;
    g.fillStyle = row % 2 ? '#4f3c49' : '#554150';
    g.fillRect(0, y, stageWidth, 12);
    g.fillStyle = '#3e2f3a';
    const off = row % 2 ? 0 : 24;
    for (let x = -off; x < stageWidth; x += 48 + row * 8) g.fillRect(x, y, 2, 12);
    g.fillRect(0, y, stageWidth, 1);
  }
  // The walkway under the gate.
  g.fillStyle = 'rgba(255,200,140,0.07)';
  g.fillRect(cx - 120, GROUND_Y - 14, 240, 54);

  return { sky: sky.canvas, far: far.canvas, mid: mid.canvas, near: near.canvas, lanterns, stageWidth };
}

/** @typedef {ReturnType<typeof buildDuskShrine>} DuskShrine */

/**
 * Draws the stage for a camera position (left edge of the screen, in
 * stage pixels).
 * @param {CanvasRenderingContext2D} ctx
 * @param {DuskShrine} st
 * @param {number} camX
 * @param {number} time  Seconds, for the lantern flicker (render-only).
 * @param {boolean} still  Reduced motion: no flicker.
 */
export function drawDuskShrine(ctx, st, camX, time, still) {
  ctx.drawImage(st.sky, 0, 0);
  ctx.drawImage(st.far, -Math.round(camX * 0.15), 0);
  ctx.drawImage(st.mid, -Math.round(camX * 0.45), 0);
  ctx.drawImage(st.near, -Math.round(camX), 0);
  for (const [i, lx] of st.lanterns.entries()) {
    const x = Math.round(lx - camX);
    if (x < -40 || x > WIDTH + 40) continue;
    const flick = still ? 0 : Math.round(Math.sin(time * 9 + i * 1.7) + Math.sin(time * 23 + i));
    ctx.fillStyle = 'rgba(255,170,80,0.18)';
    ctx.fillRect(x - 12, 264 + flick, 24, 18);
    ctx.fillStyle = '#ffcf6a';
    ctx.fillRect(x - 4, 272, 8, 6 + flick);
    ctx.fillStyle = '#fff2b8';
    ctx.fillRect(x - 2, 274, 4, 3);
  }
}

/**
 * Drifting petals in front of everything (render-only; fewer and slower
 * with reduced motion).
 */
export class Petals {
  constructor() {
    const rnd = seeded(77);
    this.items = Array.from({ length: 22 }, () => ({ x: rnd() * WIDTH, y: rnd() * HEIGHT, v: 0.2 + rnd() * 0.4, p: rnd() * 6.28 }));
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt  Seconds
   * @param {boolean} still
   */
  draw(ctx, dt, still) {
    if (still) return;
    ctx.fillStyle = '#f6a6b8';
    for (const p of this.items) {
      p.p += dt * 2;
      p.y += p.v * dt * 40;
      p.x += Math.sin(p.p) * dt * 16 - dt * 10;
      if (p.y > HEIGHT) p.y = -4;
      if (p.x < -4) p.x = WIDTH + 4;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 1);
    }
  }
}
