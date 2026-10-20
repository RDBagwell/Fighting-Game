/**
 * The simulation: `step(state, inputs)` advances a match by exactly one
 * frame (1/60 s).
 *
 *   inputs: [p1 byte, p2 byte]  ──►  step  ──►  the same state object, one frame later
 *
 * It is **deterministic**: the same state and the same inputs always give
 * the same next state, on any machine. It reads only its arguments and the
 * constant character data; it uses integer maths (fixed.js), its own seeded
 * RNG (rng.js), no clock, no Math.random, and never iterates over object
 * keys whose order could vary. That is what lets the game save and load
 * states, replay a match from its inputs, and (session 2) roll back and
 * re-simulate frames when a remote input arrives late.
 *
 * The state is advanced **in place** and returned, which keeps a step cheap
 * (no allocation for an idle frame). Anything that needs the previous frame
 * calls `saveState` first; rollback will do exactly that.
 *
 * One frame, in order:
 *
 *   1. record each player's input in their history (the input buffer);
 *   2. hit-stop or super freeze: nothing moves; cancels can still be input;
 *   3. throws in progress: tech or finish;
 *   4. each fighter: advance their state (move frames, stun counters),
 *      then act on input if they can, then move;
 *   5. pushboxes, walls, the maximum distance between the fighters;
 *   6. projectiles;
 *   7. hit detection for both fighters at once (so attacks can trade),
 *      then throws;
 *   8. the round: timer, KO, time-out, next round.
 *
 * docs/FRAME-DATA.md explains the frame counting this relies on.
 */
import { SUB, div, clamp } from './fixed.js';
import { cleanInput, toNumpad, SP, H } from '../input/bits.js';
import {
  pushHistory, findPress, findButtonPress, findThrowPress, matchMotion, matchCharge, matchDash, updateCharge, currentDir,
} from './motion.js';
import { fighterBoxes, overlaps, overlapCentre, projectileBox, toWorld } from './boxes.js';
import { createFighter, createMatch } from './state.js';
import { moveLength } from './frameData.js';

/** @typedef {import('./types.js').MatchState} MatchState */
/** @typedef {import('./types.js').FighterState} FighterState */
/** @typedef {import('./types.js').CharacterData} CharacterData */
/** @typedef {import('./types.js').MoveData} MoveData */
/** @typedef {import('./types.js').HitData} HitData */

/** Grounded states in which a fighter is free to act. */
const NEUTRAL = ['stand', 'walkF', 'walkB', 'crouch', 'guard'];
/** States that count down `stun` and end in 'stand'. */
const STUNNED = ['hitstun', 'blockstun', 'land', 'recover', 'wakeup'];
/** States in which a fighter can't be hit at all. */
const INVULNERABLE = ['knockdown', 'wakeup', 'ko', 'thrown', 'throwHold', 'win'];
/** States in which a fighter can be thrown. */
const THROWABLE = ['stand', 'walkF', 'walkB', 'crouch', 'guard', 'jumpSquat', 'dashF', 'dashB', 'move', 'land', 'recover'];

/**
 * @param {FighterState} f
 */
export function isNeutral(f) {
  return NEUTRAL.includes(f.state);
}

/**
 * Free to act on the ground: what frame advantage is measured against.
 * @param {FighterState} f
 */
export function isActionable(f) {
  return isNeutral(f) && f.y === 0;
}

/**
 * Builds the simulation for a set of characters and rules. The returned
 * functions close over that constant data; everything that changes is in
 * the state.
 *
 * @param {object} setup
 * @param {Record<string, CharacterData>} setup.characters
 * @param {import('./state.js').SimConfig} setup.config
 * @param {Record<string, import('./types.js').MotionData>} setup.motions
 */
export function createSimulation({ characters, config: cfg, motions }) {
  /**
   * Per character: the specials and supers in the order they're tried
   * (supers first, then by priority, then by id, all fixed at load),
   * the normals by stance and button, and the throw.
   * @type {Record<string, { specials: string[], normals: Array<{ id: string, stance: string, button: string, dir: number }>, throwMove: string }>}
   */
  const tables = {};
  for (const id of Object.keys(characters).sort()) {
    const ch = characters[id];
    const ids = Object.keys(ch.moves).sort();
    const specials = ids
      .filter((m) => ch.moves[m].kind === 'special' || ch.moves[m].kind === 'super')
      .sort((a, b) => {
        const ma = ch.moves[a];
        const mb = ch.moves[b];
        const ka = ma.kind === 'super' ? 1 : 0;
        const kb = mb.kind === 'super' ? 1 : 0;
        if (ka !== kb) return kb - ka;
        if ((mb.priority ?? 0) !== (ma.priority ?? 0)) return (mb.priority ?? 0) - (ma.priority ?? 0);
        return a < b ? -1 : 1;
      });
    // Command normals (with a direction) are checked before plain ones.
    const normals = ids
      .filter((m) => ch.moves[m].kind === 'normal')
      .map((m) => ({ id: m, stance: ch.moves[m].stance, button: ch.moves[m].button ?? '', dir: ch.moves[m].dir ?? 0 }))
      .sort((a, b) => (b.dir ? 1 : 0) - (a.dir ? 1 : 0) || (a.id < b.id ? -1 : 1));
    const throwMove = ids.find((m) => ch.moves[m].kind === 'throw') ?? '';
    tables[id] = { specials, normals, throwMove };
  }

  const wallLeft = cfg.stage.wall * SUB;
  const wallRight = (cfg.stage.width - cfg.stage.wall) * SUB;

  // ─── small helpers ────────────────────────────────────────────────

  /** @param {FighterState} f */
  const charOf = (f) => characters[f.char];
  /** @param {FighterState} f */
  const moveOf = (f) => charOf(f).moves[f.move];

  /**
   * @param {FighterState} f
   * @param {string} name
   */
  function setState(f, name) {
    if (f.state !== name) {
      f.state = name;
      f.stateFrame = 1;
    }
  }

  /**
   * @param {MatchState} s
   * @param {string} type
   * @param {number} side
   * @param {Partial<import('./types.js').SimEvent>} [extra]
   */
  function emit(s, type, side, extra) {
    s.events.push({ type, side, ...extra });
  }

  /**
   * Does `f` have a projectile on screen?
   * @param {MatchState} s
   * @param {number} side
   */
  function hasProjectile(s, side) {
    for (const p of s.projectiles) if (p.owner === side) return true;
    return false;
  }

  /**
   * Is the opponent about to hit `f`? Holding back near an attack then
   * blocks in place ("proximity guard") instead of walking away.
   * @param {MatchState} s
   * @param {FighterState} f
   * @param {FighterState} opp
   */
  function threatened(s, f, opp) {
    const range = cfg.proximityGuard * SUB;
    if (opp.state === 'move') {
      const mv = moveOf(opp);
      if (mv.hits && mv.hits.length && opp.moveFrame <= mv.startup + mv.active - 1 && Math.abs(opp.x - f.x) <= range) return true;
    }
    for (const p of s.projectiles) {
      if (p.owner !== f.side && Math.abs(p.x - f.x) <= range && Math.sign(f.x - p.x) === p.facing) return true;
    }
    return false;
  }

  // ─── starting moves ───────────────────────────────────────────────

  /**
   * @param {MatchState} s
   * @param {FighterState} f
   * @param {string} id
   * @param {number} age  Age of the press that started it (-1: none)
   * @param {boolean} [easy]
   */
  function startMove(s, f, id, age, easy = false) {
    const ch = charOf(f);
    const mv = ch.moves[id];
    f.state = 'move';
    f.stateFrame = 1;
    f.move = id;
    f.moveFrame = 1;
    f.contact = 0;
    f.hitsDone = 0;
    f.easy = easy;
    if (age >= 0) f.used = s.frame - age;
    if (mv.stance === 'air') f.airAttack = true;
    else if (f.y === 0) f.vx = 0;
    if (mv.motion) {
      f.motion = mv.motion;
      f.motionFrame = s.frame;
    }
    if (mv.kind === 'super') {
      if (!s.options.infiniteMeter) f.meter -= mv.meterCost ?? cfg.meterMax;
      s.freeze = Math.max(s.freeze, cfg.superFreeze);
      s.flash = f.side;
      emit(s, 'super', f.side, { move: id, x: f.x, y: f.y });
    } else if (mv.kind === 'special') {
      emit(s, 'special', f.side, { move: id });
    }
    applyMoveFrame(s, f, mv);
  }

  /**
   * What happens on the current frame of a move: velocity changes,
   * projectiles, the swing sound.
   * @param {MatchState} s
   * @param {FighterState} f
   * @param {MoveData} mv
   */
  function applyMoveFrame(s, f, mv) {
    const t = f.moveFrame;
    for (const [frame, vx, vy] of mv.velocity ?? []) {
      if (frame === t) {
        f.vx = vx * f.facing;
        if (vy !== 0) {
          f.vy = vy;
          if (f.y === 0) f.y = -1;
        }
      }
    }
    if (mv.hits && mv.hits.length && t === mv.hits[0].frames[0]) emit(s, 'swing', f.side, { move: f.move });
    if (mv.throw && t === mv.startup) emit(s, 'swing', f.side, { move: f.move });
    const pr = mv.projectile;
    if (pr && t === pr.frame) {
      s.projectiles.push({
        owner: f.side,
        char: f.char,
        move: f.move,
        x: f.x + pr.x * SUB * f.facing,
        y: f.y + pr.y * SUB,
        vx: pr.vx * f.facing,
        facing: f.facing,
        age: 0,
        hitsLeft: pr.hits,
        cooldown: 0,
      });
      emit(s, 'projectile', f.side, { move: f.move });
    }
  }

  /**
   * Looks for a special or super whose input is in the buffer.
   * @param {MatchState} s
   * @param {FighterState} f
   * @param {'ground'|'air'} where
   * @param {string[] | null} only  Restrict to these kinds or move ids (cancels).
   * @returns {{ id: string, age: number, easy: boolean } | null}
   */
  function findSpecial(s, f, where, only) {
    const ch = charOf(f);
    const t = tables[f.char];
    /** @param {string} id @param {MoveData} mv */
    const allowed = (id, mv) => {
      if ((mv.stance === 'air') !== (where === 'air')) return false;
      if (only && !only.includes(mv.kind) && !only.includes(id)) return false;
      if (mv.kind === 'super' && !s.options.infiniteMeter && f.meter < (mv.meterCost ?? cfg.meterMax)) return false;
      if (mv.projectile && hasProjectile(s, f.side)) return false;
      return true;
    };
    for (const id of t.specials) {
      const mv = ch.moves[id];
      if (!allowed(id, mv) || !mv.motion || !mv.button) continue;
      const press = findButtonPress(f, s.frame, mv.button, cfg.buffer);
      if (!press) continue;
      const motion = motions[mv.motion];
      const ok = motion.charge ? matchCharge(f, motion, press.age) : matchMotion(f.hist, f.facing, motion, press.age);
      if (ok) return { id, age: press.age, easy: false };
    }
    // Easy specials: the SP button plus a direction (or plus H for the super).
    const age = findPress(f, s.frame, SP, cfg.buffer);
    if (age >= 0) {
      const dir = toNumpad(f.hist[age], f.facing);
      const key = (f.hist[age] & H) !== 0 ? 'H' : dir <= 3 ? '2' : dir === 4 || dir === 7 ? '4' : dir === 6 || dir === 9 ? '6' : '5';
      for (const id of t.specials) {
        const mv = ch.moves[id];
        if (mv.easy === key && allowed(id, mv)) return { id, age, easy: true };
      }
    }
    return null;
  }

  /**
   * The normal for a button press, given the stance and direction.
   * @param {FighterState} f
   * @param {string} button
   * @param {number} dir
   * @param {'ground'|'air'} where
   * @param {string[] | null} only
   */
  function findNormal(f, button, dir, where, only) {
    const stance = where === 'air' ? 'air' : dir <= 3 ? 'crouch' : 'stand';
    for (const n of tables[f.char].normals) {
      if (n.button !== button || n.stance !== stance) continue;
      if (n.dir && n.dir !== dir) continue;
      if (only && !only.includes(n.id) && !only.includes('normal')) continue;
      return n.id;
    }
    return '';
  }

  // ─── deciding what to do ──────────────────────────────────────────

  /**
   * A grounded fighter who is free to act.
   * @param {MatchState} s
   * @param {FighterState} f
   * @param {boolean} threat
   */
  function decideGround(s, f, threat) {
    const special = findSpecial(s, f, 'ground', null);
    if (special) return startMove(s, f, special.id, special.age, special.easy);

    const t = tables[f.char];
    if (t.throwMove) {
      const age = findThrowPress(f, s.frame, cfg.buffer);
      if (age >= 0) {
        const dir = toNumpad(f.hist[age], f.facing);
        f.throwBack = dir === 4 || dir === 1 || dir === 7;
        return startMove(s, f, t.throwMove, age);
      }
    }

    const press = findButtonPress(f, s.frame, 'LMH', cfg.buffer);
    if (press) {
      const id = findNormal(f, press.button, toNumpad(f.hist[press.age], f.facing), 'ground', null);
      if (id) return startMove(s, f, id, press.age);
    }

    if (matchDash(f, motions.dashForward)) {
      setState(f, 'dashF');
      f.stateFrame = 1;
      emit(s, 'dash', f.side);
      return;
    }
    if (matchDash(f, motions.dashBack)) {
      setState(f, 'dashB');
      f.stateFrame = 1;
      emit(s, 'dash', f.side);
      return;
    }

    const dir = currentDir(f);
    if (dir >= 7) {
      setState(f, 'jumpSquat');
      f.jumpDir = dir - 8;
      return;
    }
    if (dir <= 3) return setState(f, 'crouch');
    if (dir === 6) return setState(f, 'walkF');
    if (dir === 4) return setState(f, threat ? 'guard' : 'walkB');
    setState(f, 'stand');
  }

  /**
   * An airborne fighter who hasn't attacked yet this jump.
   * @param {MatchState} s
   * @param {FighterState} f
   */
  function decideAir(s, f) {
    const special = findSpecial(s, f, 'air', null);
    if (special) return startMove(s, f, special.id, special.age, special.easy);
    const press = findButtonPress(f, s.frame, 'LMH', cfg.buffer);
    if (press) {
      const id = findNormal(f, press.button, 5, 'air', null);
      if (id) startMove(s, f, id, press.age);
    }
  }

  /**
   * Cancelling the current move into another (normal into special, special
   * into super, light into light). Only on contact and within the move's
   * cancel frames. During a freeze the new move is queued and starts on
   * the first frame after it.
   * @param {MatchState} s
   * @param {FighterState} f
   * @param {boolean} frozen
   */
  function tryCancel(s, f, frozen) {
    if (f.state !== 'move' || f.queued) return;
    const mv = moveOf(f);
    const c = mv.cancel;
    if (!c || f.contact === 0 || (c.on === 'hit' && f.contact !== 1)) return;
    if (f.moveFrame < c.frames[0] || f.moveFrame > c.frames[1]) return;
    const where = f.y < 0 ? 'air' : 'ground';
    /** @type {{ id: string, age: number, easy: boolean } | null} */
    let next = findSpecial(s, f, where, c.into);
    if (!next) {
      const press = findButtonPress(f, s.frame, 'LMH', cfg.buffer);
      if (press) {
        const id = findNormal(f, press.button, toNumpad(f.hist[press.age], f.facing), where, c.into);
        if (id && c.into.includes(id)) next = { id, age: press.age, easy: false };
      }
    }
    if (!next) return;
    if (frozen) {
      f.queued = next.id;
      f.used = s.frame - next.age;
      f.easy = next.easy;
      const qm = charOf(f).moves[next.id];
      if (qm.motion) {
        f.motion = qm.motion;
        f.motionFrame = s.frame;
      }
    } else {
      startMove(s, f, next.id, next.age, next.easy);
    }
  }

  // ─── advancing a fighter ──────────────────────────────────────────

  /**
   * @param {MatchState} s
   * @param {FighterState} f
   */
  function endMove(s, f) {
    f.move = '';
    f.moveFrame = 0;
    f.easy = false;
    if (f.y < 0) {
      setState(f, 'air');
      f.airAttack = true;
    } else {
      setState(f, 'stand');
      f.vx = 0;
    }
  }

  /**
   * Moves the fighter's own state machine on by one frame. Returns after
   * any transition; acting on input comes after.
   * @param {MatchState} s
   * @param {FighterState} f
   */
  function advance(s, f) {
    const ch = charOf(f);
    switch (f.state) {
      case 'move': {
        f.moveFrame++;
        const mv = moveOf(f);
        if (f.moveFrame > moveLength(mv)) endMove(s, f);
        else applyMoveFrame(s, f, mv);
        break;
      }
      case 'knockdown':
        if (f.stun === 0) {
          if (f.health === 0 && !s.options.training) setState(f, 'ko');
          else {
            setState(f, 'wakeup');
            f.stun = cfg.wakeupFrames;
          }
        } else f.stun--;
        break;
      case 'jumpSquat':
        if (f.stateFrame > cfg.jumpSquat) {
          // The direction is read on the last frame, so 8 then 9 jumps forward.
          const dir = currentDir(f);
          const jd = dir >= 7 ? dir - 8 : f.jumpDir;
          setState(f, 'air');
          f.airAttack = false;
          f.vx = jd * f.facing * ch.stats.jumpVx;
          f.vy = ch.stats.jumpVy;
          f.y = -1;
          emit(s, 'jump', f.side);
        }
        break;
      case 'dashF':
      case 'dashB': {
        const d = f.state === 'dashF' ? ch.stats.dash : ch.stats.backdash;
        if (f.stateFrame > d.frames) {
          setState(f, 'stand');
          f.vx = 0;
        }
        break;
      }
      default:
        if (STUNNED.includes(f.state)) {
          if (f.stun === 0) {
            if (f.state === 'hitstun' || f.state === 'blockstun' || f.state === 'wakeup') f.throwProtect = cfg.throwProtect;
            setState(f, 'stand');
            f.crouching = false;
          } else f.stun--;
        }
    }
  }

  /**
   * Velocity for the current state, then position, gravity and landing.
   * @param {MatchState} s
   * @param {FighterState} f
   * @param {FighterState} opp
   */
  function move(s, f, opp) {
    const ch = charOf(f);
    switch (f.state) {
      case 'walkF': f.vx = f.facing * ch.stats.walkForward; break;
      case 'walkB': f.vx = -f.facing * ch.stats.walkBack; break;
      case 'stand': case 'crouch': case 'guard': case 'jumpSquat': case 'land': case 'recover':
      case 'hitstun': case 'blockstun': case 'knockdown': case 'wakeup': case 'throwHold': case 'thrown': case 'win':
        if (f.y === 0) f.vx = 0;
        break;
      case 'dashF':
      case 'dashB': {
        const d = f.state === 'dashF' ? ch.stats.dash : ch.stats.backdash;
        const dir = f.state === 'dashF' ? f.facing : -f.facing;
        f.vx = dir * div(d.speed * (d.frames - f.stateFrame + 1), d.frames);
        break;
      }
      case 'move': {
        const mv = moveOf(f);
        if (f.y === 0 && mv.friction && f.vx !== 0) {
          const v = Math.max(0, Math.abs(f.vx) - mv.friction);
          f.vx = Math.sign(f.vx) * v;
        }
        break;
      }
      default:
        break;
    }

    f.x += f.vx;
    if (f.y < 0) {
      f.vy += cfg.gravity;
      f.y += f.vy;
      if (f.y >= 0) land(s, f);
    }

    if (f.push !== 0) {
      const stepSize = Math.min(Math.abs(f.push), cfg.pushStep * SUB) * Math.sign(f.push);
      f.push -= stepSize;
      const target = f.x + stepSize;
      f.x = clamp(target, wallLeft, wallRight);
      if (f.x !== target) {
        // Pushed into the corner: the rest of the pushback moves the attacker instead.
        if (f.pushTransfer) {
          opp.push -= target - f.x + f.push;
          opp.pushTransfer = false;
        }
        f.push = 0;
      }
    }
    // `| 0` turns -0 (from e.g. -1 * 0) into 0. They behave the same in
    // arithmetic, but JSON writes both as 0, and a loaded state must equal
    // the saved one exactly.
    f.vx |= 0;
    f.vy |= 0;
    f.push |= 0;
  }

  /**
   * @param {MatchState} s
   * @param {FighterState} f
   */
  function land(s, f) {
    f.y = 0;
    f.vy = 0;
    if (f.state === 'airHit') {
      f.vx = 0;
      if (f.health === 0 && !s.options.training) {
        setState(f, 'ko');
      } else if (f.knockdownOnLand) {
        setState(f, 'knockdown');
        f.stun = cfg.knockdownFrames;
        emit(s, 'knockdown', f.side, { x: f.x, y: 0 });
      } else {
        setState(f, 'land');
        f.stun = cfg.landRecovery - 1;
      }
      f.knockdownOnLand = false;
      return;
    }
    if (f.state === 'ko') {
      f.vx = 0;
      return;
    }
    if (f.state === 'move') {
      const mv = moveOf(f);
      if (mv.stance !== 'air') {
        f.vx = 0; // a rising special coming back down finishes on the ground
        return;
      }
      const recovery = mv.landing ?? cfg.landRecovery;
      f.move = '';
      f.moveFrame = 0;
      setState(f, 'land');
      f.stun = recovery - 1;
      f.vx = 0;
      emit(s, 'land', f.side);
      return;
    }
    f.vx = 0;
    setState(f, 'land');
    f.stun = cfg.landRecovery - 1;
    emit(s, 'land', f.side);
  }

  /**
   * One fighter's frame: advance, act, move.
   * @param {MatchState} s
   * @param {FighterState} f
   * @param {FighterState} opp
   * @param {boolean} acting  The round is live (not the intro or after a KO).
   * @param {boolean} threat
   */
  function updateFighter(s, f, opp, acting, threat) {
    f.stateFrame++;
    updateCharge(f, cfg.chargeGrace);
    if (f.throwProtect > 0) f.throwProtect--;

    if (f.queued) {
      const id = f.queued;
      f.queued = '';
      startMove(s, f, id, -1, f.easy);
    } else if (f.state !== 'throwHold' && f.state !== 'thrown') {
      advance(s, f);
    }

    if (acting) {
      if (isNeutral(f)) decideGround(s, f, threat);
      else if (f.state === 'air' && !f.airAttack) decideAir(s, f);
      else if (f.state === 'move') tryCancel(s, f, false);
    } else if (isNeutral(f)) {
      setState(f, 'stand');
    }

    move(s, f, opp);

    if (f.combo > 0 && (isNeutral(f) || f.state === 'air' || f.state === 'move' || f.state === 'jumpSquat')) {
      f.combo = 0;
      f.comboDamage = 0;
      f.juggle = 0;
    }
  }

  // ─── the two fighters together ────────────────────────────────────

  /**
   * Pushboxes never overlap; walls; the fighters can't get further apart
   * than the screen allows.
   * @param {MatchState} s
   */
  function separate(s) {
    const [a, b] = s.fighters;
    for (const f of s.fighters) f.x = clamp(f.x, wallLeft, wallRight);
    const pa = fighterBoxes(a, charOf(a)).push;
    const pb = fighterBoxes(b, charOf(b)).push;
    if (overlaps(pa, pb) && a.state !== 'thrown' && b.state !== 'thrown') {
      const aLeft = a.x < b.x || (a.x === b.x && a.facing === 1);
      const left = aLeft ? a : b;
      const right = aLeft ? b : a;
      const lBox = aLeft ? pa : pb;
      const rBox = aLeft ? pb : pa;
      const amount = lBox[2] - rBox[0];
      let moveLeft = Math.ceil(amount / 2);
      let moveRight = amount - moveLeft;
      if (left.x - moveLeft < wallLeft) {
        const short = wallLeft - (left.x - moveLeft);
        moveLeft -= short;
        moveRight += short;
      }
      if (right.x + moveRight > wallRight) {
        const short = right.x + moveRight - wallRight;
        moveRight -= short;
        moveLeft += short;
      }
      left.x -= moveLeft;
      right.x += moveRight;
    }
    const max = cfg.stage.maxSeparation * SUB;
    const dx = b.x - a.x;
    if (Math.abs(dx) > max) {
      const excess = Math.abs(dx) - max;
      const dir = Math.sign(dx); // b is on this side of a
      const aAway = Math.sign(a.vx) === -dir;
      const bAway = Math.sign(b.vx) === dir;
      if (aAway && !bAway) a.x += dir * excess;
      else if (bAway && !aAway) b.x -= dir * excess;
      else {
        const half = Math.ceil(excess / 2);
        a.x += dir * half;
        b.x -= dir * (excess - half);
      }
    }
  }

  /**
   * Fighters on the ground who are free (or recovering) face each other.
   * @param {MatchState} s
   */
  function updateFacing(s) {
    const [a, b] = s.fighters;
    for (const [f, o] of [[a, b], [b, a]]) {
      if (f.y !== 0) continue;
      if (!(isNeutral(f) || f.state === 'land' || f.state === 'wakeup' || f.state === 'recover' || f.state === 'jumpSquat')) continue;
      if (f.x < o.x) f.facing = 1;
      else if (f.x > o.x) f.facing = -1;
    }
  }

  /**
   * Can `d` block this hit, coming from the `away` direction's opposite?
   * Holding away from the attack (not "back" by facing, which is wrong
   * for a cross-up), standing for overheads, crouching for lows.
   * @param {FighterState} d
   * @param {HitData} h
   * @param {number} away  +1: the attack pushes towards +x
   */
  function canBlock(d, h, away) {
    if (h.guard === 'unblockable') return false;
    if (d.y !== 0) return false;
    if (!(isNeutral(d) || d.state === 'blockstun')) return false;
    const bits = cleanInput(d.hist[0]);
    const dir = toNumpad(bits, away); // relative to the attack: 6 = holding away
    const holdingAway = dir === 6 || dir === 3 || dir === 9;
    if (!holdingAway) return false;
    const crouching = dir === 3;
    if (h.guard === 'low' && !crouching) return false;
    if (h.guard === 'high' && crouching) return false;
    return true;
  }

  /**
   * Can `d` be struck right now?
   * @param {FighterState} d
   */
  function strikeable(d) {
    if (INVULNERABLE.includes(d.state)) return false;
    if (d.state === 'airHit' && d.juggle >= cfg.juggleLimit) return false;
    if (d.state === 'dashB' && d.stateFrame <= charOf(d).stats.backdash.invuln) return false;
    if (d.state === 'move') {
      for (const iv of moveOf(d).invuln ?? []) {
        if ((iv.kind === 'strike' || iv.kind === 'all') && d.moveFrame >= iv.frames[0] && d.moveFrame <= iv.frames[1]) return false;
      }
    }
    return true;
  }

  /**
   * @param {FighterState} d
   */
  function throwable(d) {
    if (d.y !== 0 || d.throwProtect > 0 || !THROWABLE.includes(d.state)) return false;
    if (d.state === 'move') {
      const mv = moveOf(d);
      if (mv.stance === 'air') return false;
      for (const iv of mv.invuln ?? []) {
        if ((iv.kind === 'throw' || iv.kind === 'all') && d.moveFrame >= iv.frames[0] && d.moveFrame <= iv.frames[1]) return false;
      }
    }
    return true;
  }

  /**
   * Applies one hit. `away` is the direction the defender is pushed.
   * @param {MatchState} s
   * @param {number} side  The attacker
   * @param {HitData} h
   * @param {number} away
   * @param {[number, number]} point  Where to draw the spark
   * @param {boolean} easy
   * @param {boolean} fromProjectile
   * @param {string} moveId
   */
  function applyHit(s, side, h, away, point, easy, fromProjectile, moveId) {
    const a = s.fighters[side];
    const d = s.fighters[1 - side];
    const gain = cfg.meterGain;
    if (canBlock(d, h, away)) {
      const chip = h.chip ?? 0;
      d.health = Math.max(s.options.training ? 1 : 0, d.health - chip);
      d.crouching = d.state === 'crouch' || (d.state === 'blockstun' && d.crouching) || currentDir(d) <= 3;
      setState(d, 'blockstun');
      d.stateFrame = 1;
      d.stun = h.blockstun;
      d.move = '';
      d.vx = 0;
      d.push = away * h.push * SUB;
      d.pushTransfer = !fromProjectile;
      a.meter = Math.min(cfg.meterMax, a.meter + div(h.damage * gain.block, 100));
      if (!fromProjectile && a.contact === 0) a.contact = 2;
      emit(s, 'block', side, { x: point[0], y: point[1], strength: h.hitstop, move: moveId });
    } else {
      const scaleIndex = Math.min(d.combo, cfg.scaling.length - 1);
      let damage = div(h.damage * cfg.scaling[scaleIndex], 100);
      if (easy) damage = div(damage * cfg.easyScale, 100);
      damage = Math.max(1, damage);
      d.health = Math.max(s.options.training ? 1 : 0, d.health - damage);
      d.combo++;
      d.comboDamage += damage;
      d.refill = 0;
      const airborne = d.y < 0 || d.state === 'airHit' || d.state === 'air';
      const wasCrouching = d.state === 'crouch' || (d.state === 'move' && moveOf(d).stance === 'crouch') || (d.state === 'hitstun' && d.crouching);
      d.move = '';
      d.moveFrame = 0;
      d.queued = '';
      if (h.launch || airborne) {
        const [vx, vy] = h.launch ?? cfg.airReset;
        if (d.state !== 'airHit') d.juggle = 0;
        d.juggle++;
        setState(d, 'airHit');
        d.stateFrame = 1;
        d.vx = away * vx;
        d.vy = vy;
        if (d.y === 0) d.y = -1;
        d.knockdownOnLand = !!h.knockdown || !!h.launch;
      } else if (h.knockdown) {
        setState(d, 'knockdown');
        d.stateFrame = 1;
        d.stun = cfg.knockdownFrames;
        d.vx = 0;
        emit(s, 'knockdown', d.side, { x: d.x, y: 0 });
      } else {
        setState(d, 'hitstun');
        d.stateFrame = 1;
        d.stun = h.hitstun;
        d.crouching = wasCrouching;
        d.vx = 0;
      }
      d.push = airborne || h.launch ? 0 : away * h.push * SUB;
      d.pushTransfer = !fromProjectile;
      a.meter = Math.min(cfg.meterMax, a.meter + div(damage * gain.hit, 100));
      d.meter = Math.min(cfg.meterMax, d.meter + div(damage * gain.taken, 100));
      if (!fromProjectile) a.contact = 1;
      emit(s, 'hit', side, { x: point[0], y: point[1], damage, strength: h.hitstop, move: moveId });
    }
    s.freeze = Math.max(s.freeze, h.hitstop);
  }

  /**
   * Both fighters' attacks are checked against the positions on this
   * frame before either is applied, so two attacks that connect on the
   * same frame trade.
   * @param {MatchState} s
   */
  function detectHits(s) {
    const boxes = s.fighters.map((f) => fighterBoxes(f, charOf(f)));
    /** @type {Array<{ side: number, hit: number, point: [number, number], data: HitData, move: string, easy: boolean }>} */
    const strikes = [];
    /** @type {number[]} */
    const throws = [];

    for (let side = 0; side < 2; side++) {
      const a = s.fighters[side];
      const d = s.fighters[1 - side];
      if (a.state !== 'move') continue;
      const mv = moveOf(a);
      if (strikeable(d)) {
        const done = new Set();
        for (const { rect, hit } of boxes[side].hit) {
          if (done.has(hit) || (a.hitsDone & (1 << hit))) continue;
          for (const hurt of boxes[1 - side].hurt) {
            if (overlaps(rect, hurt)) {
              strikes.push({ side, hit, point: overlapCentre(rect, hurt), data: /** @type {HitData[]} */ (mv.hits)[hit], move: a.move, easy: a.easy });
              done.add(hit);
              break;
            }
          }
        }
      }
      const tb = boxes[side].throwBox;
      if (mv.throw && tb && a.contact === 0 && throwable(d) && overlaps(tb, boxes[1 - side].push)) throws.push(side);
    }

    // Both strikes were found on the same positions; applying the first
    // can't cancel the second (a trade), so each carries its own data.
    for (const { side, hit, point, data, move: id, easy } of strikes) {
      const a = s.fighters[side];
      const d = s.fighters[1 - side];
      a.hitsDone |= 1 << hit;
      const away = Math.sign(d.x - a.x) || a.facing;
      applyHit(s, side, data, away, point, easy, false, id);
    }

    // Projectiles: against each other, then against fighters.
    for (let i = 0; i < s.projectiles.length; i++) {
      for (let j = i + 1; j < s.projectiles.length; j++) {
        const p = s.projectiles[i];
        const q = s.projectiles[j];
        if (p.owner === q.owner || p.hitsLeft <= 0 || q.hitsLeft <= 0) continue;
        const pd = /** @type {import('./types.js').ProjectileData} */ (characters[p.char].moves[p.move].projectile);
        const qd = /** @type {import('./types.js').ProjectileData} */ (characters[q.char].moves[q.move].projectile);
        const pr = projectileBox(p, pd);
        const qr = projectileBox(q, qd);
        if (overlaps(pr, qr)) {
          p.hitsLeft--;
          q.hitsLeft--;
          const [cx, cy] = overlapCentre(pr, qr);
          emit(s, 'clash', -1, { x: cx, y: cy });
        }
      }
    }
    for (const p of s.projectiles) {
      if (p.hitsLeft <= 0 || p.cooldown > 0) continue;
      const d = s.fighters[1 - p.owner];
      if (!strikeable(d)) continue;
      const data = /** @type {import('./types.js').ProjectileData} */ (characters[p.char].moves[p.move].projectile);
      const rect = projectileBox(p, data);
      for (const hurt of boxes[1 - p.owner].hurt) {
        if (overlaps(rect, hurt)) {
          const h = /** @type {HitData} */ ({ ...data.hit, frames: [0, 0], boxes: [] });
          applyHit(s, p.owner, h, p.facing, overlapCentre(rect, hurt), false, true, p.move);
          p.hitsLeft--;
          p.cooldown = data.interval ?? 0;
          break;
        }
      }
    }
    s.projectiles = s.projectiles.filter((p) => p.hitsLeft > 0);

    // Throws (a fighter who was just struck is no longer throwable).
    const live = throws.filter((side) => throwable(s.fighters[1 - side]) && s.fighters[side].state === 'move');
    if (live.length === 2) {
      tech(s);
    } else if (live.length === 1) {
      const side = live[0];
      const a = s.fighters[side];
      const d = s.fighters[1 - side];
      a.contact = 1;
      setState(a, 'throwHold');
      a.stateFrame = 1;
      a.stun = cfg.techWindow;
      a.vx = 0;
      setState(d, 'thrown');
      d.stateFrame = 1;
      d.stun = cfg.techWindow;
      d.move = '';
      d.vx = 0;
      d.push = 0;
      emit(s, 'throw', side, { x: d.x, y: -60 * SUB });
    }
  }

  /**
   * A throw escape: both fighters bounce apart, even.
   * @param {MatchState} s
   */
  function tech(s) {
    const [a, b] = s.fighters;
    for (const f of [a, b]) {
      const o = f === a ? b : a;
      f.move = '';
      f.moveFrame = 0;
      setState(f, 'recover');
      f.stateFrame = 1;
      f.stun = cfg.techRecoil;
      f.vx = 0;
      f.push = (Math.sign(f.x - o.x) || -f.facing) * cfg.techPush * SUB;
      f.pushTransfer = false;
    }
    emit(s, 'tech', -1, { x: Math.trunc((a.x + b.x) / 2), y: -60 * SUB });
  }

  /**
   * Throws in progress: the defender can escape by pressing throw during
   * the tech window; otherwise the throw lands when it closes.
   * @param {MatchState} s
   */
  function updateThrows(s) {
    for (const a of s.fighters) {
      if (a.state !== 'throwHold') continue;
      const d = s.fighters[1 - a.side];
      const since = a.stateFrame; // frames since the throw connected
      const age = findThrowPress(d, s.frame, Math.min(cfg.buffer + since, cfg.historyLength - 5));
      if (age >= 0 && age <= since + 2) {
        d.used = s.frame - age;
        tech(s);
        return;
      }
      if (a.stun === 0) {
        const mv = moveOf(a);
        const th = /** @type {NonNullable<MoveData['throw']>} */ (mv.throw);
        d.health = Math.max(s.options.training ? 1 : 0, d.health - th.damage);
        d.combo = 1;
        d.comboDamage = th.damage;
        d.refill = 0;
        let dir = /** @type {number} */ (a.facing);
        if (a.throwBack) {
          // Back throw: the defender ends up behind, thrown the other way.
          d.x = clamp(a.x - a.facing * 40 * SUB, wallLeft, wallRight);
          dir = -a.facing;
          a.facing = a.facing === 1 ? -1 : 1;
        }
        setState(d, 'airHit');
        d.stateFrame = 1;
        d.juggle = cfg.juggleLimit;
        d.knockdownOnLand = true;
        d.vx = dir * th.launch[0];
        d.vy = th.launch[1];
        d.y = -1;
        a.move = '';
        a.moveFrame = 0;
        setState(a, 'recover');
        a.stateFrame = 1;
        a.stun = th.recovery;
        a.meter = Math.min(cfg.meterMax, a.meter + div(th.damage * cfg.meterGain.hit, 100));
        emit(s, 'hit', a.side, { x: d.x, y: -50 * SUB, damage: th.damage, strength: 12, move: 'throw' });
        s.freeze = Math.max(s.freeze, 8);
      } else {
        a.stun--;
        d.stun = a.stun;
      }
    }
  }

  /**
   * @param {MatchState} s
   */
  function updateProjectiles(s) {
    const left = 0;
    const right = cfg.stage.width * SUB;
    for (const p of s.projectiles) {
      const data = /** @type {import('./types.js').ProjectileData} */ (characters[p.char].moves[p.move].projectile);
      p.age++;
      p.x += p.vx;
      if (p.cooldown > 0) p.cooldown--;
      if (p.age > data.life || p.x < left || p.x > right) p.hitsLeft = 0;
    }
    s.projectiles = s.projectiles.filter((p) => p.hitsLeft > 0);
  }

  // ─── the round ────────────────────────────────────────────────────

  /**
   * @param {MatchState} s
   */
  function nextRound(s) {
    const meters = s.fighters.map((f) => f.meter);
    s.fighters = s.fighters.map((f, i) => createFighter(characters[f.char], i, cfg, meters[i]));
    s.projectiles = [];
    s.round++;
    s.phase = 'intro';
    s.phaseFrame = 0;
    s.timer = cfg.roundFrames;
    s.roundWinner = -1;
    s.freeze = 0;
    s.flash = -1;
  }

  /**
   * @param {MatchState} s
   */
  function updateRound(s) {
    const [a, b] = s.fighters;
    s.phaseFrame++;
    switch (s.phase) {
      case 'intro':
        if (s.phaseFrame === 1) emit(s, 'round', -1);
        if (s.phaseFrame >= cfg.introFrames) {
          s.phase = 'fight';
          s.phaseFrame = 0;
          emit(s, 'fight', -1);
        }
        break;
      case 'fight': {
        if (s.options.training) break;
        if (s.timer > 0) s.timer--;
        const deadA = a.health === 0;
        const deadB = b.health === 0;
        if (deadA || deadB) {
          s.phase = 'ko';
          s.phaseFrame = 0;
          s.roundWinner = deadA && deadB ? 2 : deadA ? 1 : 0;
          for (const f of s.fighters) {
            if (f.health === 0 && f.y === 0 && f.state !== 'knockdown') {
              setState(f, 'ko');
              f.move = '';
              f.vx = 0;
            }
          }
          s.projectiles = [];
          emit(s, 'ko', s.roundWinner === 2 ? -1 : s.roundWinner);
        } else if (s.timer === 0) {
          s.phase = 'timeout';
          s.phaseFrame = 0;
          // Compare health as a share of each fighter's maximum (integer cross-multiply).
          const ra = a.health * characters[b.char].stats.health;
          const rb = b.health * characters[a.char].stats.health;
          s.roundWinner = ra === rb ? 2 : ra > rb ? 0 : 1;
          emit(s, 'timeout', s.roundWinner === 2 ? -1 : s.roundWinner);
        }
        break;
      }
      case 'ko':
      case 'timeout': {
        const length = s.phase === 'ko' ? cfg.koFrames : cfg.timeoutFrames;
        if (s.phaseFrame === Math.trunc(length / 2) && s.roundWinner !== 2) {
          const w = s.fighters[s.roundWinner];
          if (isNeutral(w) && w.y === 0) setState(w, 'win');
        }
        if (s.phaseFrame >= length) {
          if (s.roundWinner === 2) {
            s.wins[0]++;
            s.wins[1]++;
          } else s.wins[s.roundWinner]++;
          const doneA = s.wins[0] >= cfg.roundsToWin;
          const doneB = s.wins[1] >= cfg.roundsToWin;
          if (doneA || doneB) {
            s.phase = 'matchEnd';
            s.phaseFrame = 0;
            s.matchWinner = doneA && doneB ? 2 : doneA ? 0 : 1;
            emit(s, s.matchWinner === 2 ? 'draw' : 'win', s.matchWinner === 2 ? -1 : s.matchWinner);
          } else {
            nextRound(s);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Training mode: health refills once a combo is over, meter can be
   * infinite. Part of the simulation, so it stays deterministic.
   * @param {MatchState} s
   */
  function updateTraining(s) {
    for (const f of s.fighters) {
      if (s.options.infiniteMeter) f.meter = cfg.meterMax;
      if (!s.options.training) continue;
      if (isNeutral(f) && f.combo === 0) {
        f.refill++;
        if (f.refill >= cfg.refillDelay) f.health = charOf(f).stats.health;
      }
    }
  }

  // ─── the step ─────────────────────────────────────────────────────

  /**
   * Advances the match by one frame, in place, and returns it.
   * @param {MatchState} s
   * @param {ArrayLike<number>} inputs  One input byte per player (bits.js).
   * @returns {MatchState}
   */
  function step(s, inputs) {
    s.events.length = 0;
    s.frame++;
    for (let i = 0; i < 2; i++) pushHistory(s.fighters[i].hist, cleanInput(inputs[i] ?? 0));

    if (s.phase === 'matchEnd') {
      s.phaseFrame++;
      const [a, b] = s.fighters;
      updateFighter(s, a, b, false, false);
      updateFighter(s, b, a, false, false);
      separate(s);
      const w = s.fighters[s.matchWinner];
      if (w && isNeutral(w)) setState(w, 'win');
      return s;
    }

    if (s.freeze > 0) {
      s.freeze--;
      if (s.freeze === 0) s.flash = -1;
      if (s.phase === 'fight') for (const f of s.fighters) tryCancel(s, f, true);
      return s;
    }

    const [a, b] = s.fighters;
    const live = s.phase === 'fight';
    if (live) updateThrows(s);
    updateFacing(s);
    const threats = [threatened(s, a, b), threatened(s, b, a)];
    updateFighter(s, a, b, live, threats[0]);
    updateFighter(s, b, a, live, threats[1]);
    separate(s);
    updateFacing(s);
    updateProjectiles(s);
    if (live) detectHits(s);
    updateTraining(s);
    updateRound(s);
    return s;
  }

  return {
    step,
    characters,
    config: cfg,
    motions,
    /** @param {import('./types.js').MatchOptions} options */
    createMatch: (options) => createMatch(characters, cfg, options),
    isActionable,
    isNeutral,
    /** @param {FighterState} f */
    boxesOf: (f) => fighterBoxes(f, charOf(f)),
    /** @param {import('./types.js').ProjectileState} p */
    projectileBoxOf: (p) => {
      const data = /** @type {import('./types.js').ProjectileData} */ (characters[p.char].moves[p.move].projectile);
      return toWorld(data.box, p.x, p.y, p.facing);
    },
  };

}

/** @typedef {ReturnType<typeof createSimulation>} Simulation */
