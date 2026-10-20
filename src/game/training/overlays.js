/**
 * Training-mode overlays drawn on the canvas: the boxes, their legend, and
 * the frame data of the current move.
 *
 * Boxes are told apart by colour **and** line style, so the overlay works
 * for colour-blind players and in a black-and-white screenshot:
 *
 *   hurtbox   green, solid outline
 *   hitbox    red, solid fill with diagonal hatching
 *   throw box magenta, dashed outline
 *   pushbox   white, dotted outline
 *
 * A hurtbox that can't currently be hit (invincibility, knockdown) is drawn
 * faded with an "INV" tag.
 */
import { SUB } from '../../engine/sim/fixed.js';
import { summarise, formatAdvantage } from '../../engine/sim/frameData.js';
import { GROUND_Y } from '../stage/duskShrine.js';
import { outlined } from '../hud/Hud.js';

export const BOX_STYLE = {
  hurt: { color: '#3fd17f', label: 'Hurtbox: can be hit here', line: 'solid' },
  hit: { color: '#ff4d5e', label: 'Hitbox: the attack', line: 'hatched' },
  throw: { color: '#e264ff', label: 'Throw box', line: 'dashed' },
  push: { color: '#f2f2f2', label: 'Pushbox: the body', line: 'dotted' },
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../engine/sim/boxes.js').Rect} r
 * @param {number} camX
 */
function screenRect(ctx, r, camX) {
  const x = Math.round(r[0] / SUB - camX);
  const y = Math.round(GROUND_Y + r[1] / SUB);
  const w = Math.round((r[2] - r[0]) / SUB);
  const h = Math.round((r[3] - r[1]) / SUB);
  return { x, y, w, h };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {keyof typeof BOX_STYLE} kind
 * @param {number} [alpha]
 */
function drawBox(ctx, b, kind, alpha = 1) {
  const style = BOX_STYLE[kind];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 1;
  if (kind === 'hit') {
    ctx.fillStyle = 'rgba(255,77,94,0.30)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    ctx.beginPath();
    for (let d = -b.h; d < b.w; d += 5) {
      ctx.moveTo(b.x + d, b.y + b.h);
      ctx.lineTo(b.x + d + b.h, b.y);
    }
    ctx.globalAlpha = alpha * 0.8;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  } else {
    if (kind === 'hurt') {
      ctx.fillStyle = 'rgba(63,209,127,0.16)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    if (kind === 'throw') ctx.setLineDash([4, 3]);
    if (kind === 'push') ctx.setLineDash([1, 2]);
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  }
  ctx.restore();
}

/**
 * Draws every box of both fighters and the projectiles.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../engine/sim/step.js').Simulation} sim
 * @param {import('../../engine/sim/types.js').MatchState} s
 * @param {number} camX
 */
export function drawBoxes(ctx, sim, s, camX) {
  for (const f of s.fighters) {
    const boxes = sim.boxesOf(f);
    const ch = sim.characters[f.char];
    const mv = f.state === 'move' ? ch.moves[f.move] : null;
    const invincible = ['knockdown', 'wakeup', 'ko', 'thrown', 'throwHold'].includes(f.state)
      || (f.state === 'dashB' && f.stateFrame <= ch.stats.backdash.invuln)
      || !!mv?.invuln?.some((iv) => iv.kind !== 'throw' && f.moveFrame >= iv.frames[0] && f.moveFrame <= iv.frames[1]);
    drawBox(ctx, screenRect(ctx, boxes.push, camX), 'push');
    for (const r of boxes.hurt) {
      const b = screenRect(ctx, r, camX);
      drawBox(ctx, b, 'hurt', invincible ? 0.35 : 1);
      if (invincible) outlined(ctx, 'INV', b.x + 2, b.y + 9, { size: 8, color: '#ffffff' });
    }
    for (const { rect } of boxes.hit) drawBox(ctx, screenRect(ctx, rect, camX), 'hit');
    if (boxes.throwBox) drawBox(ctx, screenRect(ctx, boxes.throwBox, camX), 'throw');
    // The origin: a small cross at the feet.
    const ox = Math.round(f.x / SUB - camX);
    const oy = Math.round(GROUND_Y + f.y / SUB);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox - 3, oy, 7, 1);
    ctx.fillRect(ox, oy - 3, 1, 7);
  }
  for (const p of s.projectiles) drawBox(ctx, screenRect(ctx, sim.projectileBoxOf(p), camX), 'hit');
}

/**
 * The legend for the box colours and line styles.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 */
export function drawLegend(ctx, x, y) {
  const entries = /** @type {Array<keyof typeof BOX_STYLE>} */ (['hurt', 'hit', 'throw', 'push']);
  ctx.fillStyle = 'rgba(12,8,18,0.7)';
  ctx.fillRect(x, y, 134, entries.length * 12 + 6);
  entries.forEach((kind, i) => {
    const yy = y + 4 + i * 12;
    drawBox(ctx, { x: x + 4, y: yy, w: 14, h: 9 }, kind);
    ctx.font = '600 8px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(BOX_STYLE[kind].label, x + 22, yy + 8);
  });
}

/**
 * The frame data of a fighter's current (or last) move, from the data.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../engine/sim/step.js').Simulation} sim
 * @param {string} char
 * @param {string} moveId
 * @param {number} x
 * @param {number} y
 * @param {string} measured  The frame meter's measurement of the last hit or block.
 */
export function drawFrameData(ctx, sim, char, moveId, x, y, measured) {
  ctx.fillStyle = 'rgba(12,8,18,0.7)';
  ctx.fillRect(x, y, 228, 40);
  if (!moveId) {
    outlined(ctx, 'Frame data: do a move to see its numbers', x + 6, y + 14, { size: 9 });
    if (measured) outlined(ctx, `Measured: ${measured}`, x + 6, y + 30, { size: 9, color: '#f2d14a' });
    return;
  }
  const mv = sim.characters[char].moves[moveId];
  const d = summarise(mv, sim.config);
  outlined(ctx, `${mv.notation.split(' ')[0]}  ${mv.name}`, x + 6, y + 12, { size: 9, color: '#fff3c4' });
  const timing = mv.projectile && !mv.hits ? `Fires on frame ${d.startup} · Total ${d.total}` : `Startup ${d.startup} · Active ${d.active} · Recovery ${d.recovery}`;
  outlined(ctx, timing, x + 6, y + 23, { size: 9 });
  const hit = formatAdvantage(d.onHit.value, d.onHit.tag);
  const block = formatAdvantage(d.onBlock);
  const advantage = mv.stance === 'air' ? 'Advantage depends on height' : mv.kind === 'throw' ? `On hit ${hit}` : `On hit ${hit} · On block ${block}`;
  outlined(ctx, `${advantage} · ${d.damage} dmg · ${d.guard}`, x + 6, y + 34, { size: 9 });
  if (measured) outlined(ctx, `Measured: ${measured}`, x + 6, y + 50, { size: 9, color: '#f2d14a' });
}
