/**
 * The rollback lab's canvas overlays: making the invisible visible.
 *
 * - **Rollback meter**: one bar per tick, its height the number of frames
 *   re-simulated that tick. A red bar is a stall (the peer was further
 *   behind than the rollback window), a yellow tick a frame given back by
 *   time sync.
 * - **Input timeline**: the opponent's last 60 frames. Each cell is one
 *   frame of their input: arrived before it was needed (no prediction),
 *   predicted correctly, predicted wrongly (that cell caused a rollback), or
 *   not arrived yet (still a guess). The bar under a cell is how late it
 *   arrived.
 * - **Stats line**: round trip, path, rollbacks and their cost.
 *
 * Every shape is told apart by more than colour: stalls are full-height,
 * misses have an X, guesses are hollow.
 */
import { WIDTH, HEIGHT } from '../../engine/render/Screen.js';
import { outlined } from '../hud/Hud.js';

export const TIMELINE_STYLE = {
  ontime: { color: '#3fbf7f', label: 'arrived in time' },
  right: { color: '#3e7be0', label: 'predicted right' },
  miss: { color: '#e5484d', label: 'predicted wrong (rollback)' },
  pending: { color: '#8a7f96', label: 'not arrived yet (a guess)' },
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../engine/rollback/RollbackSession.js').RollbackSession} s
 * @param {number} y  Top
 */
export function drawRollbackMeter(ctx, s, y) {
  const w = 2;
  const n = s.meter.length;
  const x0 = 12;
  ctx.fillStyle = 'rgba(12,8,18,0.75)';
  ctx.fillRect(x0 - 4, y - 4, 180 * w + 8, 40);
  const unit = 3;
  // Guide lines every 4 frames.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let k = 4; k <= 8; k += 4) ctx.fillRect(x0, y + 30 - k * unit, 180 * w, 1);
  for (let i = 0; i < n; i++) {
    const v = s.meter[i];
    const x = x0 + (180 - n + i) * w;
    if (v === -1) {
      ctx.fillStyle = '#e5484d';
      ctx.fillRect(x, y, w, 30);
    } else if (v === -2) {
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(x, y + 24, w, 6);
    } else if (v > 0) {
      ctx.fillStyle = v >= 6 ? '#ff9b5a' : '#c7f4ff';
      const hgt = Math.min(30, v * unit);
      ctx.fillRect(x, y + 30 - hgt, w, hgt);
    }
  }
  outlined(ctx, 'Rollback meter: frames re-simulated each tick (red = waiting, yellow = time sync)', x0, y - 6, { size: 8 });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../engine/rollback/RollbackSession.js').RollbackSession} s
 * @param {number} y
 */
export function drawInputTimeline(ctx, s, y) {
  const cell = 5;
  const count = 60;
  const x0 = 12;
  ctx.fillStyle = 'rgba(12,8,18,0.75)';
  ctx.fillRect(x0 - 4, y - 4, count * cell + 8, 26);
  const newest = s.state.frame + s.inputDelay;
  for (let i = 0; i < count; i++) {
    const f = newest - count + 1 + i;
    const x = x0 + i * cell;
    const a = s.arrivals.get(f);
    const confirmed = s.remote.has(f) || f <= s.lastRemote;
    /** @type {keyof typeof TIMELINE_STYLE} */
    let kind = 'pending';
    if (a) kind = a.miss ? 'miss' : a.predicted ? 'right' : 'ontime';
    else if (confirmed) kind = 'ontime';
    if (f > s.state.frame && !confirmed) continue; // not simulated, not arrived: nothing to show
    ctx.fillStyle = TIMELINE_STYLE[kind].color;
    if (kind === 'pending') {
      ctx.strokeStyle = TIMELINE_STYLE.pending.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 2, 9);
    } else {
      ctx.fillRect(x, y, cell - 1, 10);
    }
    if (kind === 'miss') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 1, y + 4, cell - 3, 1);
    }
    if (a && a.lateBy > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(x, y + 12, cell - 1, Math.min(6, a.lateBy));
    }
  }
  // The present frame.
  const px = x0 + (count - 1 - s.inputDelay) * cell;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px + 1, y - 3, 2, 2);
  outlined(ctx, 'Their inputs, frame by frame: green in time · blue guessed right · red guessed wrong · hollow still a guess', x0, y - 6, { size: 8 });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../engine/rollback/RollbackSession.js').RollbackSession} s
 * @param {{ path: string, rate: { rollbackFrames: number, kbUp: number, kbDown: number } }} o
 */
export function drawStatsLine(ctx, s, { path, rate }) {
  const st = s.stats;
  const text = [
    `RTT ${Math.round(s.rttMs)} ms`,
    path,
    s.mode === 'rollback' ? `delay ${s.inputDelay}f, window ${s.maxRollback}f` : `delay-based, ${s.inputDelay}f`,
    `${rate.rollbackFrames.toFixed(0)} frames rolled back/s (longest ${st.longestRollback})`,
    `${rate.kbUp.toFixed(1)} kB/s up`,
  ].join('  ·  ');
  outlined(ctx, `${text}  ·  Tab: the rollback lab`, WIDTH / 2, HEIGHT - 32, { size: 8, align: 'center', color: '#c7f4ff' });
}

/**
 * Frames to delay local input by, from the round trip: about half the
 * one-way latency in frames (the rest is hidden by rollback), between 1
 * and 4.
 * @param {number} rttMs
 */
export function autoInputDelay(rttMs) {
  const oneWayFrames = rttMs / 2 / (1000 / 60);
  return Math.max(1, Math.min(4, Math.round(oneWayFrames / 2)));
}
