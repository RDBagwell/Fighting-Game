# Frame data

Fighting games are built out of frames. At 60 frames a second, one frame
is 16.7 milliseconds, and almost every rule of the genre is a count of
them: how long an attack takes to come out, how long it can hit for, how
long the attacker is stuck afterwards, how long the defender is stunned.
Players learn these numbers ("frame data") because they decide who gets to
act first after every exchange.

This document explains how Dusk Duel models that, topic by topic: the
problem each piece solves, how it's implemented here (with links to the
code) and, where it helps, a frame-by-frame diagram. It's written so you
can follow it without having played a fighting game, and checked so that
someone who has will find the numbers honest: **every number below comes
from the same data the game runs on, and the tests measure each one in
the real simulation.**

**See it for yourself.** Open the game, choose **Training → Free training**, walk up
to the dummy and press **M** (K on the keyboard). The frame meter at the
top fills in frame by frame; the panel below it gives the move's numbers;
the green and red boxes show what can hit and be hit. Press **P** to pause
and **N** to advance one frame at a time.

Contents:

1. [Why the simulation must be deterministic](#1-why-the-simulation-must-be-deterministic)
2. [One frame, always the same length](#2-one-frame-always-the-same-length)
3. [Startup, active, recovery](#3-startup-active-recovery)
4. [Hitboxes and hurtboxes](#4-hitboxes-and-hurtboxes)
5. [Hitstun, blockstun and frame advantage](#5-hitstun-blockstun-and-frame-advantage)
6. [Hit-stop](#6-hit-stop)
7. [The input buffer](#7-the-input-buffer)
8. [Motion inputs](#8-motion-inputs)
9. [Blocking, throws and throw escapes](#9-blocking-throws-and-throw-escapes), and [parry, guard cancel and burst](#parry-guard-cancel-and-burst)
10. [Combos: cancels, damage scaling, the juggle limit](#10-combos-cancels-damage-scaling-the-juggle-limit)
11. [The training mode: showing the invisible](#11-the-training-mode-showing-the-invisible)
12. [How the numbers are kept honest](#12-how-the-numbers-are-kept-honest)
13. [The frame data](#13-the-frame-data)

---

## 1. Why the simulation must be deterministic

**The problem.** Three things this game needs all rest on one property:

- **Replays and training recordings** store only the inputs (one byte per
  player per frame) and replay them. That only works if the same inputs
  always produce the same fight.
- **Saving and loading state** (training-mode resets, rewinding) needs the
  whole game to be a value that can be copied and restored.
- **Rollback netcode** ([ROLLBACK.md](ROLLBACK.md)) predicts the remote player's input,
  carries on, and when the real input arrives and differs, *loads the state
  from that frame and re-simulates* up to the present, inside one display
  frame. Two machines that start from the same state and feed in the same
  inputs must arrive at bit-identical results, or they drift apart
  ("desync").

That property is **determinism**: the next state is a pure function of the
current state and the inputs.

```
state(frame n)  +  inputs(frame n)  ──step──►  state(frame n+1)
       ▲                                              │
       └──────── saveState / loadState ───────────────┘
```

**Here.** [`step(state, inputs)`](../src/engine/sim/step.js) advances one
frame. Its rules:

| Rule | Why | How it's enforced |
| --- | --- | --- |
| All game state in one plain object (`MatchState`, [types.js](../src/engine/sim/types.js)): numbers, strings, arrays, plain objects | So it can be copied, compared and serialised | No classes, images or DOM in it; tests check it survives `JSON.stringify` unchanged |
| Integer maths for positions and velocities | Floating point is deterministic for `+ − × ÷` on one machine, but trigonometry and the like can differ between JavaScript engines | Positions are integer **subpixels**, 256 per pixel ([fixed.js](../src/engine/sim/fixed.js)); a test checks every number in the state is an integer |
| A seeded RNG stored in the state | Randomness that replays | [rng.js](../src/engine/sim/rng.js), xorshift32; its state is `state.rng` |
| No clock, no `Math.random`, no iteration over object keys whose order could vary | The usual sources of hidden nondeterminism | The step reads only its arguments and frozen character data; move tables are sorted once at load |
| Rendering, sound and the training displays never write to the state | So what you see can't change what happens | The CPU and the training dummy produce *inputs*; resets build a new state like a load would |

`saveState` and `loadState` ([state.js](../src/engine/sim/state.js)) are a
fast deep copy of that plain object; `hashState` is a 32-bit checksum for
comparing two states cheaply. Online, both machines hash every confirmed
frame to detect a desync on the exact frame it happens.

The step works **in place** (it mutates the state it's given and returns
it): that keeps an ordinary frame free of allocation. Anything that needs
the previous frame saves it first, which is exactly what rollback does.

**Tested** in [tests/determinism.test.js](../tests/determinism.test.js): an
8,000-frame input log run twice gives identical JSON; a state saved
mid-match and loaded again finishes identically; a state round-tripped
through JSON does too; and a loop that rolls back six frames every seven
and re-simulates them always lands on the same hash.

**Measured** in [PERFORMANCE.md](PERFORMANCE.md): a step costs about
4.5 µs, saving or loading a state about 9 µs, and an 8-frame rollback
65–85 µs, under 1% of a frame.

---

## 2. One frame, always the same length

**The problem.** "5 frames of startup" has to mean 83 ms on every screen.
A game that advances by however much time passed since the last display
refresh runs differently at 30, 60 and 144 Hz.

**Here.** [`FixedStepLoop`](../src/engine/loop/FixedStepLoop.js) adds the
real time that passed to an accumulator and runs as many whole 1/60 s steps
as fit, then draws once. It draws **the latest frame**, without
interpolating between frames: this is pixel art, and drawing a fighter
between two simulated positions would show a frame that never existed (and
smear the hitbox overlay). A 144 Hz screen simply shows each frame two or
three times.

Slow motion feeds the accumulator less real time (½ or ¼), so it shows
exactly the same frames, more slowly. Frame stepping stops the accumulator
and runs exactly one step per press. A hidden tab pauses and forgets the
time spent away. ([tests/loop.test.js](../tests/loop.test.js))

---

## 3. Startup, active, recovery

**The problem.** An attack isn't instant. It winds up, then hits for a
moment, then leaves the attacker vulnerable while they recover. Those three
phases are what every decision in a fighting game is about: a faster
startup wins a race, a longer active window catches a jump, a longer
recovery can be punished.

**Here.** Every move is data in the character files
([mack.js](../src/game/data/characters/mack.js),
[kenji.js](../src/game/data/characters/kenji.js)). Mack's standing medium
attack, "Stepping Slash":

```js
'5M': {
  name: 'Stepping Slash', kind: 'normal', notation: '5M', stance: 'stand', button: 'M',
  startup: 8, active: 3, recovery: 14,
  velocity: [[1, px(2.5), 0], [8, 0, 0]],       // steps forward until it hits
  anim: [['attack1', 0, 3], ['attack1', 2, 4], ['attack1', 4, 3], ['attack1', 5, 7], ['attack1', 3, 7]],
  hits: [hit([8, 10], [[12, -86, 72, 22]], { damage: 55, hitstun: 18, blockstun: 14, hitstop: 10, push: 9 })],
  hurt: [{ frames: [8, 16], boxes: [[14, -84, 40, 18]] }],   // his arm can be hit while it's out
  cancel: { on: 'contact', into: ['special', 'super'], frames: [8, 16] },
}
```

The convention is the one players use. Frame 1 is the frame the move
starts; **startup** is the number of the first active frame (so 7 frames of
wind-up); **active** is how many frames a hitbox is out; **recovery** is the
frames after that before the fighter can act. The total is
startup + active + recovery − 1 = 24 frames.

```
frame:     1  2  3  4  5  6  7 | 8  9 10 | 11 12 13 14 15 16 17 18 19 20 21 22 23 24 | 25
           s  s  s  s  s  s  s | A  A  A | r  r  r  r  r  r  r  r  r  r  r  r  r  r  | free
           └──── startup 8 ────┘ active 3 └────────────── recovery 14 ──────────────┘
```

**Animation follows the frame data, not a timer.** The `anim` table says
which sprite frame shows on each simulation frame ([fighterView.js](../src/game/render/fighterView.js)):
three frames of wind-up pose, four of the drawn-back sword, and the slash
itself on frames 8–10, exactly when the hitbox is out. In slow motion or
frame by frame, the art and the boxes stay in step. The validator checks
every animation lasts exactly as long as its move and only uses frames the
sprite sheet has.

---

## 4. Hitboxes and hurtboxes

**The problem.** "Did it hit?" has to be precise, and visible in the
training mode. A sword reaches further than the body; a crouching fighter
is shorter; an attack that leaves an arm out should be hittable there.

**Here.** Each fighter has, on every frame ([boxes.js](../src/engine/sim/boxes.js)):

| Box | Meaning | In the overlay |
| --- | --- | --- |
| **Hurtbox** | Where they can be hit (several per frame: head, body, an outstretched arm) | Green, solid outline |
| **Hitbox** | Where the attack hits, on its active frames only | Red, hatched |
| **Throw box** | A throw's reach (checked against the opponent's pushbox) | Magenta, dashed |
| **Pushbox** | The body: two pushboxes never overlap | White, dotted |

The overlay tells boxes apart by line style as well as colour, so it reads
for colour-blind players and in a black-and-white print.

Boxes are written facing right, in pixels relative to the feet:
`[x, y, width, height]`, where y is negative upwards. The simulation turns
them into world rectangles in subpixels, mirrored for a fighter facing
left. A hit lands when any active hitbox overlaps any hurtbox. Hurtboxes
come from the stance (standing, crouching, airborne, knocked down) plus a
move's extra boxes on given frames: Kenji's Long Thrust (5M) reaches 134
pixels, but his sword arm is a hurtbox from frame 10 to 22, so an opponent
who stays just outside its range can hit the arm as it recovers. That's
**whiff punishing**, the heart of footsies, and it falls out of the data.

Both fighters' attacks are checked against the same frame's positions
before either is applied, so two attacks that connect on the same frame
**trade**.

---

## 5. Hitstun, blockstun and frame advantage

**The problem.** After an attack connects, both fighters are busy for a
while: the attacker finishing their recovery, the defender stunned. Whoever
is free first has the initiative. That difference, in frames, is **frame
advantage**, and it's the most important number in the genre.

**Here.** Each hit has a `hitstun` (frames the defender can't act after
being hit) and a `blockstun` (after blocking it). When a hit lands on the
attacker's frame *f* of a move that lasts *T* frames:

```
advantage = stun − (T − f)
```

Mack's 5M, hitting on its first active frame (f = 8, T = 24):

```
frame:      8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23  24  25  26  27
Mack:       A   A   A   r   r   r   r   r   r   r   r   r   r   r   r   r   r  free
on hit:     ×   h   h   h   h   h   h   h   h   h   h   h   h   h   h   h   h   h   h  free    hitstun 18
on block:   ×   b   b   b   b   b   b   b   b   b   b   b   b   b   b  free                   blockstun 14
```

On hit the defender is free on frame 27, Mack on 25: **+2 on hit**, Mack
acts two frames first. On block the defender is free on frame 23: **−2 on
block**, the defender acts first; if they have a 2-frame attack they can
punish (nobody here does, so 5M is "safe"). Mack's 5L is +1 on block: he
can keep pressing buttons and win the race, which is what makes him the
rushdown character. Kenji's 5H is −9 on block: anyone with a move faster
than 9 frames gets a free hit.

A move that **knocks down** reports the defender's whole time on the
ground and getting up ("KD +50"): that's how long the attacker has to set
something up. A launch adds the time in the air, following the
simulation's own gravity.

[frameData.js](../src/engine/sim/frameData.js) computes these numbers from
the data. The move list, the training mode, the tables at the end of this
document and the CPU (which uses them to decide what's punishable) all read
them from there.

**Measured, not just derived.** The training mode's frame meter doesn't
trust the formula: after every hit or block, it counts the frames until
each fighter can act and reports the difference ("P1 5M: +2 on hit").
[tests/frameData.test.js](../tests/frameData.test.js) does the same for
every grounded move of every character, on hit and on block, in the real
simulation, and fails if measured and derived differ by a single frame.
Writing that test found two mistakes in the first version of the formula
(see [section 12](#12-how-the-numbers-are-kept-honest)).

---

## 6. Hit-stop

**The problem.** A hit that resolves in one frame has no weight: the eye
can't register it. Every fighting game freezes both fighters for a few
frames on contact.

**Here.** Each hit has a `hitstop` (8 frames for light attacks up to 18 for
a super's last hit). On contact `state.freeze` is set and the next frames
advance nothing but the input history; the defender shakes in place and the
spark plays ([step.js](../src/engine/sim/step.js), `step`). Both fighters
freeze for the same frames, so hit-stop doesn't change frame advantage, and
the published numbers (like everyone's) leave it out.

Hit-stop is also when players input their cancels (section 10). A special
typed during the freeze is **queued** and starts on the first frame after
it, so the input buffer doesn't need to be as long as the freeze.

---

## 7. The input buffer

**The problem.** Humans can't hit a 1-frame window reliably. If you press
an attack 2 frames before your recovery ends, a game that only reads
buttons on the exact frame you're free just ignores you, and it feels
broken.

**Here.** Every frame, each fighter's input byte is pushed onto their
`hist` (the last 40 frames, kept in the state). A **press** is a rising
edge: the button is down at some age and wasn't the frame before. A press
counts for **4 frames** (`config.buffer`) after it happens:

```
frame:     10  11  12  13  14  15
5L:         r   r   r   r   r  free     ← recovery ends; first free frame is 15
button:        [L]                       ← pressed on frame 11, 4 frames early
result:                         5L starts on frame 15
```

Once a press starts something it's marked used (`fighter.used` holds its
frame), so one press never produces two moves. A press 6 frames early is
dropped: the buffer is a convenience, not a queue of everything you
pressed. ([motion.js](../src/engine/sim/motion.js),
[tests/motion.test.js](../tests/motion.test.js))

One more layer sits in front of the simulation: a key tapped faster than
one frame (down and up between two samples) would be invisible to a game
that only checks which keys are held. The
[InputManager](../src/engine/input/InputManager.js) latches every key
press until the next sample, so a tap always counts for at least one
frame.

---

## 8. Motion inputs

**The problem.** Special moves are done with a direction motion plus a
button: a quarter circle forward, a "dragon punch", holding back then
forward. They must be recognisable at human speed and sloppiness, but not
so loose that walking forward and pressing a button does a special by
accident.

**Here.** Directions are written in **numpad notation, relative to
facing**:

```
7 8 9        6 = forward, 4 = back, 2 = down, 5 = neutral
4 5 6        236 = down, down-forward, forward  ("quarter circle forward")
1 2 3        623 = forward, down, down-forward   ("dragon punch")
             [4]6 = hold back, then forward       ("charge")
```

Each fighter's input bytes store **absolute** directions (screen left and
right). They become forward and back using the fighter's facing at the
moment they're read, so when the fighters cross over, "forward" flips
automatically.

Motions are data ([motions.js](../src/game/data/motions.js)): a list of
steps, each a set of acceptable directions, and a **window**. The parser
reads the history *backwards* from the button press, looking for the last
step, then the one before it, and so on:

```
qcf: { steps: ['2', '3', '6'], window: 14 }

age:    14  13  12  11  10   9   8   7   6   5   4   3   2   1   0
input:   5   5   2   2   2   3   3   6   6   6   5   5   5   5   5+M
                                         ▲6  (found reading back from the press)
                                 ▲3
                     ▲2                          ✓ all three within 14 frames: 236+M
```

The leniency is in the data: extra frames between steps are fine, and the
button can come a few frames after the motion, as long as the whole thing
fits in the window. Too slow and it's just a normal attack.

- **Priority.** 6-2-3 contains 2-3, and a quarter circle done while walking
  forward (6, 2, 3, 6) contains 6-2-3. Like the classic games, the dragon
  punch wins (`priority` in the data); supers are checked before specials.
- **Charge.** Holding a back direction counts up `fighter.charge`, which
  survives 8 frames after letting go (`chargeGrace`); Kenji's Iai Rush
  needs 40 frames of charge, then forward and a button within 10 frames.
  Because the counter is relative to facing, crossing over loses the charge.
- **Dashes** are motions too: 6-5-6 within 12 frames, triggered on the
  second press of forward.
- **Easy specials** (touch screens): the Special button plus a direction
  does a mapped special without the motion, at 80% damage (`easy` in the
  data, `easyScale` in [config.js](../src/game/data/config.js)).

The input display in the training mode shows each frame's input and marks
the line where the game recognised a motion, so you can see whether you
were too slow or the motion was off.

---

## 9. Blocking, throws and throw escapes

**Blocking** is holding away from the opponent
([`canBlock`](../src/engine/sim/step.js)):

| Attack | Block standing (4) | Block crouching (1) |
| --- | --- | --- |
| Mid (most attacks) | ✓ | ✓ |
| Low (2L, 2M: sweeps and pokes at the feet) | ✗ | ✓ |
| High / overhead (6M, every jumping attack) | ✓ | ✗ |

That's the mix-up: the attacker chooses low or overhead, the defender has
to guess. "Away" is measured from where the attack comes from, not from
the way the defender faces, so a **cross-up** (a jump attack that lands
behind you) has to be blocked the other way. Holding back near an attack
that's coming blocks in place instead of walking away (**proximity
guard**), like the classics.

**Throws** (L+M) beat blocking: a throw box against the opponent's
pushbox, 5 frames of startup, a long recovery if it misses. A fighter can't
be thrown while airborne, in hitstun or blockstun, or for 6 frames after
leaving stun. When a throw connects, the defender has **10 frames** to
press L+M and escape it (a **tech**): both fighters bounce apart, even. Two
throws on the same frame also tech. Holding back while throwing throws the
opponent behind you.

([tests/combat.test.js](../tests/combat.test.js) covers each case.)

### Parry, guard cancel and burst

Three defensive rules shared by every character, with their numbers in
[config.js](../src/game/data/config.js) (`parry`, `guardCancel`, `burst`).

**Parry (M+H).** For its first **6 frames** a parry catches any strike or
projectile that would hit you: standing, highs and mids; crouching, lows
and mids. The hit does nothing. Both fighters freeze for 12 frames, then
you are free at once while the attacker finishes the move:

```
attacker:  s s s s s s s A r r r r r r r r r r r r r r r r |      (Mack 5M, parried on frame 8)
defender:          p p p P|free ........................ |      ← acts 16 frames first
                           └ the hit, parried: 12 frozen frames, not shown
```

So a parried move is as punishable as its rest (`total − hit frame`, 16
for Mack's 5M), which is the reward for reading it. A parry that catches
nothing is stuck for **20 more frames** (26 in all), long enough for most
moves to punish, and a throw beats it outright: mashing it loses. Multi-hit
moves need a parry per hit: after each one you are free, so press it again
for the next. The parrying fighter gains a little meter (50).

Like a throw, the parry is read from both buttons pressed within 3 frames
of each other (`findChordPress` in [motion.js](../src/engine/sim/motion.js));
L+M+H is not read as a parry.

**Guard cancel (M+H while blocking).** Costs half the meter. Each character
has their own guard-cancel move (`GC`, its own animation and hitbox), with
the same frame data for everyone: startup 6, invincible until its last
active frame, 40 damage and a knockdown, and **−21 on block**. It builds no
meter for either side. It's the way out of pressure; using it into a block
loses half a meter and the round's momentum.

**Burst (L+M+H while being hit).** Once a round (in training, it comes
back when your health refills). Each character's `burst`: invincible until
its last active frame, a hitbox all around you (reaching down, for a burst
in the air) that knocks the attacker away with no damage. It can be
**blocked**, and then it's −21: an attacker who expects it stops the combo,
blocks, and punishes. Its frame data is in the tables below.

[tests/defence.test.js](../tests/defence.test.js) plays all three in the
simulation: the parry window, the advantage after a parry, standing parries
missing lows, a whiffed parry being punished, a throw beating a parry, a
projectile parried, a **perfect parrier against every hit of every
grounded strike of every character**, guard cancel costs and invincibility,
bursts once a round, in the air, and blocked and punished, and a save and
load mid-match with all three in play.

---

## 10. Combos: cancels, damage scaling, the juggle limit

**Cancels.** A normal attack that makes contact can be interrupted by a
special during its cancel window (`cancel` in the data): 5M into Shippū
is a two-hit combo because Shippū starts inside 5M's hitstun. Specials can
cancel into the super; light attacks chain into light attacks.

```
5M:        s s s s s s s A ·· (cancel window, inputs read during hit-stop) ··
Shippū:                         s s s s s s s s s s s A
defender:                  h h h h h h h h h h h h h h h h h ×   ← still in hitstun when Shippū lands
```

**Damage scaling.** Each hit of a combo does less: 100%, 100%, 80%, 70%,
60%... down to 20% (`scaling` in [config.js](../src/game/data/config.js)).
Long combos still pay, but a short combo with a big ender isn't dwarfed.

**Juggle limit.** A launched opponent can be hit three times in the air
(the launcher counts); after that, attacks pass through them until they
land. Without it, a well-timed loop could keep someone in the air forever.

---

**Try it:** the combo trials (Title → Training → Combo trials) are this
section put to use. Each one is a cancel route from the move data, and a
test plays every trial through the real simulation to prove the combo
connects ([`tests/trials.test.js`](../tests/trials.test.js)).

## 11. The training mode: showing the invisible

Every feature has a one-line "What this shows" in the game's training menu.

| Tool | What this shows | Where |
| --- | --- | --- |
| Hitbox and hurtbox overlay | Where each attack can hit and where each fighter can be hit; a hit lands only when red touches green | [overlays.js](../src/game/training/overlays.js) |
| Frame data panel | The move's startup, active and recovery, its advantage on hit and block | same |
| Frame meter | Every frame of both fighters side by side: why one attack beat another, and who could act first afterwards; plus the *measured* advantage of the last exchange | [FrameMeter.js](../src/game/training/FrameMeter.js) |
| Input display | What the game received each frame, and which motions it recognised | [InputHistory.js](../src/game/training/InputHistory.js) |
| Dummy: stance, block (none, all, after first hit), throw escape | Whether a string has gaps (after first hit) and what is safe on block (all) | [Dummy.js](../src/game/training/Dummy.js) |
| Record and play back | Record the dummy doing something, then practise your answer to it | same |
| Reset: midscreen, left corner, right corner | Pushback works differently in the corner | [Training.js](../src/game/training/Training.js) |
| Pause, frame step, ½× and ¼× speed | When exactly boxes appear and disappear | [FixedStepLoop.js](../src/engine/loop/FixedStepLoop.js) |
| Move list | Every move's numbers, generated from the data | [menus.js](../src/game/scenes/menus.js) |

The frame meter colours each frame (startup green, active red, recovery
blue, hitstun yellow, blockstun amber, invincible white...) and the training
menu lists them with a letter each, so colour isn't the only cue. Hit-stop
frames are left out of the meter, the same convention as the published
numbers.

The dummy is only an input source, like the CPU: it reads the state and
returns an input byte. Blocking "all" reads the attack about to land and
blocks it correctly (low or high); "after first hit" lets the first hit
through and then blocks until things are quiet for 40 frames. Recordings
are stored relative to the dummy's facing, so a recording made on one side
plays back correctly from the other.

---

## 12. How the numbers are kept honest

- **One source.** Startup, active and recovery are written once per move;
  the validator ([tests/characters.test.js](../tests/characters.test.js))
  checks they agree with the hitboxes (the first hitbox frame *is* the
  startup), that the animation lasts exactly as long as the move, that every
  sprite frame exists, every box is well-formed and every reference (motion,
  cancel target, easy-special input) is real. It caught six animation
  lengths that were off by a frame while the characters were being written.
- **Derived advantage** comes from one function, used everywhere
  ([frameData.js](../src/engine/sim/frameData.js)).
- **Measured advantage**: [tests/frameData.test.js](../tests/frameData.test.js)
  plays all 26 grounded moves against a dummy, on hit and on block, and
  compares. When it was first written it caught two errors in the
  *formula*, not the game: a throw's advantage was off by one (the
  attacker's recovery starts counting on the frame the throw lands), and
  the second hit of a two-hit launcher was computed as if the opponent were
  still on the ground. Both were fixed in the formula, so the published
  numbers describe what the game actually does.
- **Live**: the training mode's meter measures every exchange as you play.

---

## 13. The frame data

Generated with `npm run framedata` ([tools/frame-data-table.mjs](../tools/frame-data-table.mjs)).
Startup is the first active frame; advantage assumes the move connects on
its first active frame (for a multi-hit move, its last hit on that hit's
first frame). Air attacks' advantage depends on how high they hit, and a
projectile's on how far it travelled, so they're marked "—". Hit-stop is
not counted (it freezes both fighters equally). Command grabs, like
throws, can't be blocked, so they have no block advantage.

#### Mack (Rushdown)

| Input | Move | Startup | Active | Recovery | On hit | On block | Damage | Guard |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `5L` | Quick Cut | 5 | 2 | 9 | +4 | +1 | 30 | mid |
| `5M` | Stepping Slash | 8 | 3 | 14 | +2 | -2 | 55 | mid |
| `5H` | Gale Cleave | 12 | 4 | 20 | -1 | -7 | 90 | mid |
| `2L` | Low Cut | 5 | 2 | 9 | +3 | ±0 | 25 | low |
| `2M` | Ankle Slash | 8 | 3 | 15 | ±0 | -4 | 45 | low |
| `2H` | Rising Gale | 9 | 4 | 24 | KD +50 | -13 | 70 | mid |
| `6M` | Falling Crescent | 18 | 3 | 14 | +4 | -2 | 60 | high |
| `j.L` | Air Cut | 5 | 4 | 10 | — | — | 35 | high |
| `j.M` | Diving Slash | 7 | 5 | 12 | — | — | 55 | high |
| `j.H` | Skyfall Cleave | 10 | 4 | 16 | — | — | 80 | high |
| `L+M (4L+M: back)` | Shoulder Throw | 5 | 2 | 22 | KD +47 | — | 110 | throw |
| `236+L` | Shippū (L) | 12 | 4 | 18 | -1 | -7 | 70 | mid |
| `236+M` | Shippū (M) | 12 | 4 | 18 | -1 | -7 | 80 | mid |
| `236+H` | Shippū (H) | 12 | 4 | 18 | KD +24 | -7 | 90 | mid |
| `623+L` | Tenkū (L) | 5 | 6 | 24 | KD +44 | -13 | 90 | mid |
| `623+M` | Tenkū (M) | 5 | 8 | 26 | KD +42 | -17 | 110 | mid |
| `623+H` | Tenkū (H) | 6 | 8 | 28 | KD +44 | -16 | 130 | mid |
| `236236+H` | Kazekiri: Hundred Gales | 6 | 15 | 30 | KD +45 | -16 | 330 | mid |
| `M+H (blocking)` | Guard Cancel | 6 | 4 | 30 | KD +12 | -21 | 40 | mid |
| `L+M+H (being hit)` | Burst | 8 | 6 | 36 | KD +32 | -21 | 0 | mid |

#### Kenji (Footsies and zoning)

| Input | Move | Startup | Active | Recovery | On hit | On block | Damage | Guard |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `5L` | Needle | 6 | 2 | 10 | +3 | ±0 | 28 | mid |
| `5M` | Long Thrust | 10 | 3 | 16 | ±0 | -5 | 60 | mid |
| `5H` | Crescent Moon | 13 | 4 | 22 | -1 | -9 | 95 | mid |
| `2L` | Shin Prick | 6 | 2 | 10 | +2 | -1 | 24 | low |
| `2M` | Low Thrust | 10 | 3 | 17 | +1 | -5 | 50 | low |
| `2H` | Rising Moon | 8 | 5 | 22 | KD +49 | -12 | 75 | mid |
| `6M` | Helm Splitter | 20 | 3 | 12 | +4 | -2 | 55 | high |
| `j.L` | Air Needle | 6 | 4 | 9 | — | — | 32 | high |
| `j.M` | Falling Thrust | 8 | 5 | 11 | — | — | 55 | high |
| `j.H` | Moon Drop | 11 | 4 | 15 | — | — | 80 | high |
| `L+M (4L+M: back)` | Hip Toss | 5 | 2 | 22 | KD +47 | — | 100 | throw |
| `236+L` | Kunai (L) | 13 | — | 27 | — | — | 65 | mid |
| `236+M` | Kunai (M) | 13 | — | 27 | — | — | 65 | mid |
| `236+H` | Kunai (H) | 13 | — | 27 | — | — | 65 | mid |
| `[4]6+L` | Iai Rush (L) | 9 | 4 | 20 | -1 | -7 | 80 | mid |
| `[4]6+M` | Iai Rush (M) | 10 | 4 | 20 | -1 | -7 | 90 | mid |
| `[4]6+H` | Iai Rush (H) | 11 | 4 | 20 | KD +22 | -7 | 100 | mid |
| `236236+H` | Tsukiotoshi: Falling Moon | 10 | — | 34 | — | — | 280 | mid |
| `M+H (blocking)` | Guard Cancel | 6 | 4 | 30 | KD +12 | -21 | 40 | mid |
| `L+M+H (being hit)` | Burst | 8 | 6 | 36 | KD +32 | -21 | 0 | mid |

#### Deka (Brawler)

| Input | Move | Startup | Active | Recovery | On hit | On block | Damage | Guard |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `5L` | Short Arc | 6 | 2 | 10 | +3 | ±0 | 35 | mid |
| `5M` | Crescent Cut | 9 | 3 | 15 | +1 | -3 | 65 | mid |
| `5H` | Moon Splitter | 13 | 4 | 22 | -3 | -9 | 105 | mid |
| `2L` | Shin Cut | 6 | 2 | 10 | +2 | -1 | 30 | low |
| `2M` | Low Crescent | 9 | 3 | 16 | -1 | -5 | 55 | low |
| `2H` | Rising Moon | 10 | 4 | 25 | KD +49 | -14 | 80 | mid |
| `6M` | Crashing Moon | 19 | 3 | 14 | +4 | -2 | 75 | high |
| `j.L` | Air Arc | 5 | 4 | 10 | — | — | 40 | high |
| `j.M` | Diving Crescent | 7 | 5 | 12 | — | — | 60 | high |
| `j.H` | Falling Moon | 10 | 4 | 16 | — | — | 90 | high |
| `L+M (4L+M: back)` | Headbutt Toss | 5 | 2 | 22 | KD +47 | — | 120 | throw |
| `236+L` | Crescent Rush (L) | 13 | 4 | 19 | -1 | -8 | 85 | mid |
| `236+M` | Crescent Rush (M) | 13 | 4 | 19 | -1 | -8 | 95 | mid |
| `236+H` | Crescent Rush (H) | 13 | 4 | 19 | KD +23 | -8 | 110 | mid |
| `623+L` | Rising Crescent (L) | 6 | 6 | 25 | KD +43 | -14 | 95 | mid |
| `623+M` | Rising Crescent (M) | 6 | 8 | 27 | KD +41 | -18 | 115 | mid |
| `623+H` | Rising Crescent (H) | 7 | 8 | 29 | KD +43 | -17 | 140 | mid |
| `236236+H` | Thousand Crescents | 7 | 16 | 31 | KD +43 | -18 | 325 | mid |
| `M+H (blocking)` | Guard Cancel | 6 | 4 | 30 | KD +12 | -21 | 40 | mid |
| `L+M+H (being hit)` | Burst | 8 | 6 | 36 | KD +32 | -21 | 0 | mid |

#### Elumlur (All-rounder)

| Input | Move | Startup | Active | Recovery | On hit | On block | Damage | Guard |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `5L` | Spark Cut | 5 | 2 | 10 | +3 | ±0 | 32 | mid |
| `5M` | Arc Slash | 9 | 3 | 15 | +1 | -3 | 64 | mid |
| `5H` | Cyclone Edge | 12 | 4 | 21 | -2 | -8 | 95 | mid |
| `2L` | Low Spark | 5 | 2 | 10 | +2 | -1 | 27 | low |
| `2M` | Ground Current | 9 | 3 | 16 | -1 | -5 | 50 | low |
| `2H` | Updraft | 9 | 4 | 24 | KD +50 | -13 | 72 | mid |
| `6M` | Thunderclap | 18 | 3 | 14 | +4 | -2 | 62 | high |
| `j.L` | Air Spark | 5 | 4 | 10 | — | — | 35 | high |
| `j.M` | Gale Turn | 7 | 5 | 12 | — | — | 55 | high |
| `j.H` | Falling Storm | 10 | 4 | 16 | — | — | 82 | high |
| `L+M (4L+M: back)` | Storm Grip | 5 | 2 | 22 | KD +47 | — | 110 | throw |
| `236+L` | Storm Wave (L) | 13 | — | 26 | — | — | 70 | mid |
| `236+M` | Storm Wave (M) | 13 | — | 26 | — | — | 70 | mid |
| `236+H` | Storm Wave (H) | 13 | — | 26 | — | — | 70 | mid |
| `623+L` | Thunder Rise (L) | 5 | 6 | 24 | KD +44 | -13 | 85 | mid |
| `623+M` | Thunder Rise (M) | 5 | 8 | 26 | KD +42 | -17 | 105 | mid |
| `623+H` | Thunder Rise (H) | 6 | 8 | 28 | KD +44 | -16 | 125 | mid |
| `236236+H` | Storm Arc | 8 | 18 | 30 | KD +49 | -16 | 300 | mid |
| `M+H (blocking)` | Guard Cancel | 6 | 4 | 30 | KD +12 | -21 | 40 | mid |
| `L+M+H (being hit)` | Burst | 8 | 6 | 36 | KD +32 | -21 | 0 | mid |

#### Mav (Heavy grappler)

| Input | Move | Startup | Active | Recovery | On hit | On block | Damage | Guard |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `5L` | Pommel Strike | 7 | 2 | 11 | +3 | -1 | 40 | mid |
| `5M` | Kingsguard Sweep | 11 | 3 | 17 | ±0 | -5 | 75 | mid |
| `5H` | Sovereign’s Arc | 15 | 4 | 24 | -4 | -10 | 110 | mid |
| `2L` | Low Pommel | 7 | 2 | 11 | +2 | -2 | 35 | low |
| `2M` | Royal Reap | 11 | 3 | 18 | -2 | -7 | 65 | low |
| `2H` | Rising Crown | 11 | 4 | 27 | KD +47 | -16 | 90 | mid |
| `6M` | Royal Chop | 21 | 3 | 15 | +3 | -3 | 90 | high |
| `j.L` | Air Pommel | 6 | 4 | 11 | — | — | 45 | high |
| `j.M` | Descending Sweep | 8 | 5 | 13 | — | — | 65 | high |
| `j.H` | Throne Breaker | 11 | 4 | 17 | — | — | 100 | high |
| `L+M (4L+M: back)` | Royal Toss | 5 | 2 | 22 | KD +47 | — | 125 | throw |
| `214+L` | Royal Decree (L) | 8 | 2 | 34 | KD +47 | — | 120 | throw |
| `214+M` | Royal Decree (M) | 9 | 2 | 34 | KD +47 | — | 130 | throw |
| `214+H` | Royal Decree (H) | 10 | 2 | 34 | KD +47 | — | 140 | throw |
| `236+L` | Crown Cleave (L) | 14 | 4 | 22 | -3 | -10 | 90 | mid |
| `236+M` | Crown Cleave (M) | 15 | 4 | 22 | -3 | -10 | 100 | mid |
| `236+H` | Crown Cleave (H) | 16 | 4 | 22 | KD +20 | -10 | 115 | mid |
| `236236+H` | Regicide | 9 | 14 | 32 | KD +42 | -19 | 320 | mid |
| `M+H (blocking)` | Guard Cancel | 6 | 4 | 30 | KD +12 | -21 | 40 | mid |
| `L+M+H (being hit)` | Burst | 8 | 6 | 36 | KD +32 | -21 | 0 | mid |

#### Reroe (Spear zoner)

| Input | Move | Startup | Active | Recovery | On hit | On block | Damage | Guard |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `5L` | Quick Jab | 6 | 2 | 10 | +3 | ±0 | 28 | mid |
| `5M` | Long Thrust | 10 | 3 | 15 | +1 | -3 | 62 | mid |
| `5H` | Hunter’s Arc | 13 | 4 | 22 | -3 | -9 | 85 | mid |
| `2L` | Low Jab | 6 | 2 | 10 | +2 | -1 | 24 | low |
| `2M` | Ground Thrust | 10 | 3 | 16 | -1 | -5 | 54 | low |
| `2H` | Skyward Spear | 9 | 4 | 24 | KD +50 | -13 | 66 | mid |
| `6M` | Falling Spear | 18 | 3 | 14 | +4 | -2 | 55 | high |
| `j.L` | Air Jab | 5 | 4 | 10 | — | — | 32 | high |
| `j.M` | Diving Sweep | 7 | 5 | 12 | — | — | 50 | high |
| `j.H` | Plunging Spear | 10 | 4 | 16 | — | — | 75 | high |
| `L+M (4L+M: back)` | Hunter’s Trip | 5 | 2 | 22 | KD +47 | — | 100 | throw |
| `236+L` | Hunting Spear (L) | 15 | — | 27 | — | — | 75 | mid |
| `236+M` | Hunting Spear (M) | 15 | — | 27 | — | — | 75 | mid |
| `236+H` | Hunting Spear (H) | 15 | — | 27 | — | — | 75 | mid |
| `214+L` | Fading Sweep (L) | 10 | 3 | 18 | -1 | -5 | 60 | mid |
| `214+M` | Fading Sweep (M) | 10 | 3 | 18 | -1 | -5 | 65 | mid |
| `214+H` | Fading Sweep (H) | 10 | 3 | 18 | -1 | -5 | 70 | mid |
| `236236+H` | Hunter’s Volley | 11 | — | 34 | — | — | 280 | mid |
| `M+H (blocking)` | Guard Cancel | 6 | 4 | 30 | KD +12 | -21 | 40 | mid |
| `L+M+H (being hit)` | Burst | 8 | 6 | 36 | KD +32 | -21 | 0 | mid |

The supers' damage is before scaling; Kazekiri's five hits are scaled as a
combo (330 listed, 253 dealt from a clean start).

The rules every character shares (gravity, buffer, knockdown and wake-up
times, scaling, juggle limit...) are in
[src/game/data/config.js](../src/game/data/config.js), each with a comment.
