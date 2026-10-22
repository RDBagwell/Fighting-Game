/**
 * Frame data, derived from the move data.
 *
 * The move list, the training mode's frame data display, docs/FRAME-DATA.md
 * and the tests all get startup, active, recovery and frame advantage from
 * here, computed from the same numbers the simulation runs on. So the
 * published frame data can't drift from what the game actually does, and
 * `tests/frameData.test.js` checks that by playing every move against a
 * dummy and measuring the advantage frame by frame.
 *
 * Conventions (the ones fighting-game players use):
 *
 * - Frame 1 is the frame the move starts on. **Startup** is the number of
 *   the first active frame (startup 5 = active from frame 5, so 4 frames of
 *   wind-up).
 * - **Active**: frames on which a hitbox is out.
 * - **Recovery**: frames after the last active frame before the fighter
 *   can act again.
 * - Total = startup + active + recovery − 1.
 * - **Frame advantage** = how many frames earlier the attacker can act than
 *   the defender, when the move connects on its first active frame (for a
 *   multi-hit move, its last hit on that hit's first frame). +2 on block:
 *   the attacker acts 2 frames first. Negative: the defender does, and if
 *   the defender has an attack faster than that, the move is punishable.
 *
 *   attacker:  [startup....][active][recovery.......]| can act
 *   defender:               hit ►[hitstun..............]| can act
 *                                                  └ advantage ┘
 */

/** @typedef {import('./types.js').MoveData} MoveData */
/** @typedef {import('./types.js').HitData} HitData */

/**
 * Frames from the start of a move to its last frame.
 * @param {MoveData} mv
 */
export function moveLength(mv) {
  return mv.startup + mv.active + mv.recovery - 1;
}

/**
 * The first and last active frame according to the move's hitboxes (or its
 * throw), or null for a move with neither (a projectile's frames are its
 * own). The validator checks this against startup/active.
 * @param {MoveData} mv
 * @returns {[number, number] | null}
 */
export function activeRange(mv) {
  if (mv.hits && mv.hits.length) {
    let first = Infinity;
    let last = -Infinity;
    for (const h of mv.hits) {
      first = Math.min(first, h.frames[0]);
      last = Math.max(last, h.frames[1]);
    }
    return [first, last];
  }
  if (mv.throw) return [mv.startup, mv.startup + mv.active - 1];
  return null;
}

/**
 * Frames a fighter launched from the ground with vertical speed `vy` spends
 * in the air, following the simulation's own integration (y starts at -1,
 * then each frame vy += gravity, y += vy, landing when y >= 0).
 * @param {number} vy
 * @param {number} gravity
 */
export function airtime(vy, gravity) {
  let y = -1;
  let v = vy;
  for (let n = 1; n < 1000; n++) {
    v += gravity;
    y += v;
    if (y >= 0) return n;
  }
  return 1000;
}

/**
 * @typedef {object} Advantage
 * @property {number | null} value  Frames (null: depends on distance, e.g. a projectile).
 * @property {'' | 'KD'} tag  KD = knocks down (the number then counts the defender's time
 *   on the ground and getting up: what the attacker has to set something up).
 */

/**
 * Frames the defender spends in the air after the move's last hit, when
 * every hit lands on its first active frame against a grounded defender.
 * Follows the defender through the earlier hits: a launch, then a second
 * launch from wherever they are by then (the simulation's own integration).
 * @param {MoveData} mv
 * @param {import('./state.js').SimConfig} cfg
 */
export function launchAirtime(mv, cfg) {
  const hits = [...(mv.hits ?? [])].sort((a, b) => a.frames[0] - b.frames[0]);
  let y = 0;
  let v = 0;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (h.launch || y < 0) {
      v = h.launch ? h.launch[1] : cfg.airReset[1];
      if (y === 0) y = -1;
    }
    const next = hits[i + 1];
    const frames = next ? next.frames[0] - h.frames[0] : 1000;
    for (let n = 1; n <= frames && y < 0; n++) {
      v += cfg.gravity;
      y += v;
      if (y >= 0) {
        if (!next) return n;
        y = 0;
        v = 0;
      }
    }
  }
  return 0;
}

/**
 * Advantage on hit for one hit landing on its first active frame.
 * @param {MoveData} mv
 * @param {HitData} h
 * @param {import('./state.js').SimConfig} cfg
 * @returns {Advantage}
 */
export function hitAdvantage(mv, h, cfg) {
  const after = moveLength(mv) - h.frames[0]; // attacker's frames still to go
  const down = cfg.knockdownFrames + cfg.wakeupFrames + 1;
  // Every launch ends in a knockdown when it lands (juggles aside).
  if (h.launch) return { value: launchAirtime(mv, cfg) + down - after, tag: 'KD' };
  if (h.knockdown) return { value: down - after, tag: 'KD' };
  return { value: h.hitstun - after, tag: '' };
}

/**
 * @param {MoveData} mv
 * @param {HitData} h
 * @returns {number}
 */
export function blockAdvantage(mv, h) {
  return h.blockstun - (moveLength(mv) - h.frames[0]);
}

/**
 * The hit that decides a move's advantage: the last one.
 * @param {MoveData} mv
 */
function decidingHit(mv) {
  return mv.hits && mv.hits.length ? mv.hits.reduce((a, b) => (b.frames[0] >= a.frames[0] ? b : a)) : null;
}

/**
 * Everything the move list and the frame data display show about a move.
 * @param {MoveData} mv
 * @param {import('./state.js').SimConfig} cfg
 */
export function summarise(mv, cfg) {
  const h = decidingHit(mv);
  /** @type {Advantage} */
  let onHit = { value: null, tag: '' };
  /** @type {number | null} */
  let onBlock = null;
  if (h && !mv.projectile) {
    onHit = hitAdvantage(mv, h, cfg);
    onBlock = h.guard === 'unblockable' ? null : blockAdvantage(mv, h);
  } else if (mv.throw) {
    const th = mv.throw;
    // Connects on its first active frame, then the tech window runs out and
    // the throw lands on the frame after: the defender is launched (and
    // falls on that same frame) and knocked down, while the attacker's
    // recovery also starts counting on that frame.
    const defender = cfg.techWindow + airtime(th.launch[1], cfg.gravity) + cfg.knockdownFrames + cfg.wakeupFrames + 1;
    const attacker = cfg.techWindow + th.recovery;
    onHit = { value: defender - attacker, tag: 'KD' };
  }
  const damage = (mv.hits ?? []).reduce((sum, x) => sum + x.damage, 0) + (mv.projectile ? mv.projectile.hit.damage * mv.projectile.hits : 0) + (mv.throw ? mv.throw.damage : 0);
  const guard = h ? h.guard : mv.projectile ? mv.projectile.hit.guard : mv.throw ? 'throw' : '';
  return {
    startup: mv.projectile && !h ? mv.projectile.frame : mv.startup,
    active: mv.active,
    recovery: mv.recovery,
    total: moveLength(mv),
    onHit,
    onBlock,
    damage,
    guard,
    hits: (mv.hits ?? []).length || (mv.projectile ? mv.projectile.hits : 0),
  };
}

/**
 * "+2", "-6", "KD +31", "±0", "—".
 * @param {number | null} value
 * @param {string} [tag]
 */
export function formatAdvantage(value, tag = '') {
  if (value === null) return tag ? tag : '—';
  const n = value > 0 ? `+${value}` : value === 0 ? '±0' : `${value}`;
  return tag === 'KD' ? `KD ${n}` : n;
}

/**
 * What a fighter is doing on this frame, for the frame meter.
 * @param {import('./types.js').FighterState} f
 * @param {import('./types.js').CharacterData} ch
 * @param {number} [parryWindow]  Frames a parry catches hits (config.parry.window).
 * @returns {'idle'|'startup'|'active'|'recovery'|'hitstun'|'blockstun'|'down'|'movement'|'throw'|'invuln'|'parry'}
 */
export function classifyFrame(f, ch, parryWindow = 0) {
  switch (f.state) {
    case 'parry':
      return f.stateFrame <= parryWindow ? 'parry' : 'recovery';
    case 'move': {
      const mv = ch.moves[f.move];
      const t = f.moveFrame;
      const range = activeRange(mv);
      const invuln = (mv.invuln ?? []).some((iv) => iv.kind !== 'throw' && t >= iv.frames[0] && t <= iv.frames[1]);
      if (range && t >= range[0] && t <= range[1]) {
        const live = (mv.hits ?? []).some((h) => t >= h.frames[0] && t <= h.frames[1]) || !!mv.throw;
        return live ? 'active' : 'recovery';
      }
      if (mv.projectile && t === mv.projectile.frame) return 'active';
      const beforeActive = range ? t < range[0] : mv.projectile ? t < mv.projectile.frame : true;
      if (invuln) return 'invuln';
      return beforeActive ? 'startup' : 'recovery';
    }
    case 'hitstun':
    case 'airHit':
      return 'hitstun';
    case 'blockstun':
      return 'blockstun';
    case 'knockdown':
    case 'wakeup':
    case 'ko':
      return 'down';
    case 'throwHold':
    case 'thrown':
      return 'throw';
    case 'recover':
    case 'land':
      return 'recovery';
    case 'jumpSquat':
    case 'air':
    case 'dashF':
      return 'movement';
    case 'dashB':
      return f.stateFrame <= ch.stats.backdash.invuln ? 'invuln' : 'movement';
    default:
      return 'idle';
  }
}
