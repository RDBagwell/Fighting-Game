/**
 * Which sprite frame shows for a fighter on this simulation frame.
 *
 * Animation is driven by the simulation, not by a timer: a move's `anim`
 * table says which sheet frame shows on each of its frames, so the slash
 * appears exactly on the move's first active frame, in slow motion and
 * frame by frame too. Loops (idle, walking) are indexed by `stateFrame`.
 * Rendering only reads the state.
 */

/**
 * @typedef {object} SpriteChoice
 * @property {string} sheet
 * @property {number} frame
 * @property {number} squash  Vertical scale (crouching stand-ins)
 * @property {'flash'|'guard'|''} tint
 */

const CROUCH_SQUASH = 0.72;

/**
 * @param {import('../../engine/sim/types.js').FighterState} f
 * @param {import('../../engine/sim/types.js').CharacterData} ch
 * @returns {SpriteChoice}
 */
export function chooseSprite(f, ch) {
  const sheets = ch.sprites.sheets;
  /** @type {SpriteChoice} */
  const out = { sheet: 'idle', frame: 0, squash: 1, tint: '' };

  if (f.state === 'move') {
    const mv = ch.moves[f.move];
    let t = f.moveFrame;
    for (const [sheet, frame, duration] of mv.anim) {
      if (t <= duration) {
        out.sheet = sheet;
        out.frame = frame;
        break;
      }
      t -= duration;
    }
    if (mv.stance === 'crouch') out.squash = CROUCH_SQUASH;
    return out;
  }

  let key = f.state;
  if (f.state === 'air') key = f.vy < 0 ? 'jump' : 'fall';
  const anim = ch.anims[key] ?? ch.anims.stand;
  out.sheet = anim.sheet;
  const count = sheets[anim.sheet] ?? 1;
  if (anim.frame !== undefined) out.frame = anim.frame;
  else {
    const i = Math.floor(Math.max(0, f.stateFrame - 1) / anim.len);
    // One-shot animations hold their last frame; loops wrap.
    const once = ['hitstun', 'knockdown', 'ko', 'wakeup'].includes(key);
    const idx = once ? Math.min(i, count - 1) : i % count;
    out.frame = anim.reverse ? count - 1 - idx : idx;
  }

  switch (f.state) {
    case 'crouch':
      out.squash = CROUCH_SQUASH;
      break;
    case 'jumpSquat':
    case 'land':
      out.squash = 0.9;
      break;
    case 'guard':
      out.tint = 'guard';
      break;
    case 'blockstun':
      out.tint = 'guard';
      if (f.crouching) out.squash = CROUCH_SQUASH;
      break;
    case 'hitstun':
      if (f.crouching) out.squash = CROUCH_SQUASH;
      if (f.stateFrame <= 2) out.tint = 'flash';
      break;
    case 'airHit':
    case 'thrown':
      if (f.stateFrame <= 2) out.tint = 'flash';
      break;
    default:
      break;
  }
  return out;
}
