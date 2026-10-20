/**
 * Types for the simulation: the state it advances and the data it reads.
 * JSDoc only (checked by `npm run typecheck`); this module exports nothing
 * at runtime.
 *
 * Two rules hold for everything in `MatchState`:
 *
 * 1. It is plain data: numbers, strings, booleans, arrays and plain
 *    objects. No classes, no images, no DOM, no functions, no Maps. So
 *    `JSON.stringify` round-trips it and `saveState` is a fast deep copy.
 * 2. Nothing outside `step()` writes to it during a match. Rendering,
 *    sound and the training displays only read it. (Training mode's
 *    "reset position" builds a new state, like loading one.)
 */

/**
 * A box in **pixels**, relative to the fighter's origin (the point between
 * their feet), as if facing right: x is the left edge (negative = behind),
 * y the top edge (negative = above the feet), then width and height.
 * @typedef {[number, number, number, number]} Box
 */

/**
 * @typedef {object} HitData  One hit of a move: when it's active, where, and what it does.
 * @property {[number, number]} frames  First and last active frame of this hit (move frames, 1-based).
 * @property {Box[]} boxes
 * @property {number} damage
 * @property {number} [chip=0]  Damage dealt through a block.
 * @property {number} hitstun  Frames the defender can't act after the hit frame.
 * @property {number} blockstun
 * @property {number} hitstop  Frames both fighters freeze on contact.
 * @property {'mid'|'high'|'low'|'unblockable'} guard  high = overhead (block standing), low = block crouching.
 * @property {number} push  Pixels the defender slides back (the attacker, if the defender is in the corner).
 * @property {[number, number]} [launch]  Sends the defender airborne: [vx, vy] in subpixels/frame (vx away from the attacker).
 * @property {boolean} [knockdown]  Knocks down (after the launch lands, or at once on the ground).
 */

/**
 * @typedef {object} ProjectileData
 * @property {number} frame  Move frame on which it spawns.
 * @property {number} x  Spawn offset forward, pixels.
 * @property {number} y  Spawn height (negative = up), pixels.
 * @property {number} vx  Speed, subpixels/frame.
 * @property {number} life  Frames before it disappears.
 * @property {Box} box  Its hitbox, relative to its centre.
 * @property {number} hits  How many times it can hit.
 * @property {number} [interval]  Frames between hits of a multi-hit projectile.
 * @property {Omit<HitData, 'frames'|'boxes'>} hit
 * @property {string} look  Which effect draws it.
 */

/**
 * @typedef {object} MoveData  Everything about one move. Frame numbers are 1-based:
 * frame 1 is the frame the move starts on. "startup 5" means the first hitbox is out on frame 5.
 * @property {string} name
 * @property {'normal'|'special'|'super'|'throw'} kind
 * @property {string} notation  How the move list writes the input: "5L", "236+M", "[4]6+H".
 * @property {'stand'|'crouch'|'air'} stance  Where it can be done (specials: stand covers crouch too).
 * @property {string} [button]  'L' | 'M' | 'H' (any of them: 'LMH').
 * @property {string} [motion]  A motion id from the motions table.
 * @property {number} [dir]  A required direction for command normals (numpad, e.g. 6 for 6M).
 * @property {number} startup
 * @property {number} active
 * @property {number} recovery
 * @property {Array<[string, number, number]>} anim  [sheet, frame, duration]; durations sum to the move's length.
 * @property {HitData[]} [hits]
 * @property {Array<{ frames: [number, number], boxes: Box[] }>} [hurt]  Extra hurtboxes (a limb that sticks out).
 * @property {Array<{ frames: [number, number], kind: 'strike'|'throw'|'all' }>} [invuln]
 * @property {Array<[number, number, number]>} [velocity]  [frame, vx, vy] set at that frame, subpixels (vx forward).
 * @property {number} [friction]  Subpixels/frame taken off |vx| each frame while grounded.
 * @property {{ on: 'hit'|'contact', into: string[], frames: [number, number] }} [cancel]
 * @property {number} [meterCost]
 * @property {number} [landing]  Landing recovery (air moves).
 * @property {{ box: Box, damage: number, techable: boolean, launch: [number, number], recovery: number }} [throw]
 * @property {ProjectileData} [projectile]
 * @property {number} [priority]  Which special wins when two motions match (higher first).
 * @property {string} [easy]  The easy-specials input that also does this move ('5', '2', '6', '4', 'H').
 * @property {string} [description]
 */

/**
 * @typedef {object} AnimLoop
 * @property {string} sheet
 * @property {number} len  Simulation frames per sprite frame.
 * @property {number} [frame]  Hold this one frame instead of looping.
 * @property {boolean} [reverse]
 */

/**
 * @typedef {object} CharacterData
 * @property {string} id
 * @property {string} name
 * @property {string} title
 * @property {string} style
 * @property {string} blurb
 * @property {1|-1} nativeFacing  Which way the sprite sheets face.
 * @property {{ dir: string, frameSize: number, anchor: [number, number], scale: number, sheets: Record<string, number>, color: string }} sprites
 * @property {{ health: number, walkForward: number, walkBack: number, jumpVx: number, jumpVy: number,
 *   dash: { frames: number, speed: number }, backdash: { frames: number, speed: number, invuln: number } }} stats
 * @property {Record<'stand'|'crouch'|'air'|'down', { push: Box, hurt: Box[] }>} boxes
 * @property {Record<string, AnimLoop>} anims
 * @property {Record<string, MoveData>} moves
 */

/**
 * @typedef {object} MotionData
 * @property {string[]} steps  Each step lists the numpad directions that satisfy it.
 * @property {number} window  The whole motion, ending with the button press, within this many frames.
 * @property {string} [charge]  Directions that count as holding the charge.
 * @property {number} [chargeFrames]
 * @property {string} name
 */

/**
 * @typedef {object} FighterState
 * @property {string} char
 * @property {number} side  0 = player 1, 1 = player 2
 * @property {number} x  Subpixels
 * @property {number} y  Subpixels; 0 = on the ground, negative = in the air
 * @property {number} vx
 * @property {number} vy
 * @property {1|-1} facing
 * @property {number} health
 * @property {number} meter
 * @property {string} state  stand | walkF | walkB | crouch | guard | jumpSquat | air | land | dashF | dashB |
 *   move | hitstun | blockstun | airHit | knockdown | wakeup | throwHold | thrown | recover | ko | win
 * @property {number} stateFrame  Frames spent in this state (1 on the first frame).
 * @property {number} stun  Frames left in hitstun, blockstun, knockdown, landing...
 * @property {string} move  Current move id ('' when not in a move).
 * @property {number} moveFrame
 * @property {number} contact  0 = the move hasn't touched, 1 = it hit, 2 = it was blocked.
 * @property {number} hitsDone  Bit i set = the move's hit i has connected.
 * @property {string} queued  A move cancelled into during hit-stop, starting when it ends.
 * @property {number} jumpDir  -1, 0, 1 (relative) for the jump in progress.
 * @property {boolean} airAttack  An air attack has been used this jump.
 * @property {boolean} knockdownOnLand
 * @property {boolean} crouching  Crouching when the current hitstun or blockstun began.
 * @property {number} combo  Hits taken in the current combo.
 * @property {number} comboDamage
 * @property {number} juggle  Hits taken while airborne in this combo.
 * @property {number} throwProtect  Frames in which this fighter can't be thrown.
 * @property {number} push  Subpixels of pushback still to slide (signed).
 * @property {boolean} pushTransfer  Pushback that hits a wall moves the opponent instead.
 * @property {number[]} hist  Input bytes, hist[0] = this frame; length = config.historyLength.
 * @property {number} used  Absolute frame of the newest button press already used.
 * @property {number} charge  Frames back has been held (charge moves).
 * @property {number} chargeGrace  Frames the charge survives after letting go.
 * @property {string} motion  The last motion recognised (for the input display).
 * @property {number} motionFrame
 * @property {boolean} easy  The current move came from the easy-specials button.
 * @property {number} refill  Training: frames since the combo ended (health refills).
 * @property {boolean} throwBack  The throw in progress is a back throw.
 */

/**
 * @typedef {object} ProjectileState
 * @property {number} owner
 * @property {string} char
 * @property {string} move
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {1|-1} facing
 * @property {number} age
 * @property {number} hitsLeft
 * @property {number} cooldown
 */

/**
 * @typedef {object} SimEvent  Things that happened this frame, for sound, effects and displays.
 * @property {string} type  round | fight | swing | hit | block | throw | tech | whiff-throw | ko | timeout |
 *   super | special | jump | land | dash | knockdown | projectile | clash | win | draw
 * @property {number} side  Who did it (the attacker), or -1.
 * @property {number} [x]  Subpixels
 * @property {number} [y]
 * @property {number} [damage]
 * @property {string} [move]
 * @property {number} [strength]  Hit-stop of the hit (bigger hits, bigger effects).
 */

/**
 * @typedef {object} MatchOptions
 * @property {[string, string]} chars
 * @property {number} [seed]
 * @property {boolean} [training]  No timer, no KO, health refills.
 * @property {boolean} [infiniteMeter]
 * @property {string} [stage]
 */

/**
 * @typedef {object} MatchState
 * @property {number} version
 * @property {number} frame  Frames simulated so far.
 * @property {number} rng
 * @property {'intro'|'fight'|'ko'|'timeout'|'matchEnd'} phase
 * @property {number} phaseFrame
 * @property {number} round
 * @property {[number, number]} wins
 * @property {number} timer  Frames left on the round clock.
 * @property {number} freeze  Hit-stop / super-freeze frames left.
 * @property {number} flash  Side whose super is flashing, or -1.
 * @property {number} roundWinner  -1 none yet, 0, 1, or 2 = draw.
 * @property {number} matchWinner  -1 undecided, 0, 1, 2 = draw.
 * @property {FighterState[]} fighters
 * @property {ProjectileState[]} projectiles
 * @property {SimEvent[]} events
 * @property {{ training: boolean, infiniteMeter: boolean, stage: string }} options
 */

export {};
