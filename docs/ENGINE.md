# The engine

How the code is laid out, how a frame flows through it, and where session
2's rollback netcode plugs in. The fighting-game concepts themselves are
explained in [FRAME-DATA.md](FRAME-DATA.md).

## Layout

```
src/engine/            reusable, knows nothing about Mack or Kenji
  sim/                 the deterministic simulation
    step.js            createSimulation({ characters, config, motions }) → { step, createMatch, ... }
    state.js           createMatch, saveState, loadState, hashState
    types.js           MatchState, FighterState, MoveData... (JSDoc types)
    motion.js          input history, the buffer, motion and charge parsing
    boxes.js           hit/hurt/throw/push boxes in world space
    frameData.js       startup/active/recovery and frame advantage, derived from data
    fixed.js, rng.js   integer subpixel maths; the seeded RNG
  loop/                FixedStepLoop: 60 Hz steps, frame stepping, slow motion
  input/               bits.js (the input byte), InputManager (keyboard, gamepads),
                       TouchControls, bindings (defaults, remapping)
  render/              Screen (integer-scaled canvas), sprites (sheets, tints)
  audio/               Sfx: Web Audio synthesis
  assets/              image loading
src/game/              this game
  data/                characters (moves, frame data, boxes), motions, config, stages, assets, credits
  sim.js               the engine's simulation with this game's data
  scenes/              title, select, VS, match, results, menus
  render/, hud/, stage/   the fight renderer, effects, HUD, the Dusk Shrine
  training/            dummy, frame meter, input display, overlays, the training controller
  cpu/                 the CPU (inputs only) and its per-character profiles
```

The simulation is created from data: `createSimulation` receives the
characters, the rules and the motion table, and returns the `step`
function and helpers. Adding a character is a data file, an entry in
[characters/index.js](../src/game/data/characters/index.js), its sprite
sheets in `public/sprites/` (listed in [ASSETS.md](../ASSETS.md)) and a CPU
profile; the validator tells you what's missing.

## One frame

```
FixedStepLoop ── every 1/60 s ──► MatchScene.update()
    InputManager.sample(P1 devices) ─┐
    P2: sample(P2 devices) | Cpu.think(state) | Dummy.think(state)   (all read-only)
    InputManager.endFrame()          │
    sim.step(state, [p1, p2]) ◄──────┘    the only writer of the state
    state.events → sound, effects (render-only)
    Training: frame meter, input display (read-only)
FixedStepLoop ── every display refresh ──► MatchScene.render()
    FightRenderer: stage, fighters (sprite frame from frame data), effects, HUD, overlays
```

## Notes for session 2: rollback, replays and online play

Everything rollback needs is already a function of plain data:

- **Inputs** are one byte per player per frame (`bits.js`). That byte is
  what goes over the network. Facing-relative directions are resolved
  inside the simulation, so the byte means the same on both machines.
- **The step** is `sim.step(state, [p1, p2])`. It's deterministic, uses
  integer maths only, reads nothing but its arguments and frozen data,
  and is tested to give identical states run twice, after save/load, after
  a JSON round trip, and under repeated rollback-and-resimulate.
- **Saving and loading** are `saveState` / `loadState` (a deep copy of
  ~1.4 KB of plain data). **Desync detection** is `hashState` (32-bit
  FNV-1a over the state in a fixed key order).
- **The budget**: a step is about 4.5 µs, a save or load about 9 µs, and
  re-simulating 8 frames from a loaded state 65–85 µs (Node and headless
  Chromium on a 2.8 GHz cloud Xeon; [PERFORMANCE.md](PERFORMANCE.md)). A
  rollback of 8 frames costs under 1% of a 16.7 ms frame there.

Where it plugs in:

1. **Input layer.** Replace the P2 branch of `MatchScene.update()` with a
   `Session` that returns the confirmed remote byte for a frame or a
   prediction (the usual "repeat the last input"). Local input should be
   delayed by a configurable 0–3 frames (input delay) before it's sent.
2. **Simulation layer.** Keep a ring of `saveState` snapshots, one per
   frame. When a remote input arrives for frame *f* and differs from the
   prediction, `loadState(snapshot[f])` and re-run `step` with the corrected
   inputs up to the present. Nothing else changes: the scene keeps
   rendering `state`.
3. **Events.** `state.events` holds only the current frame's events. During
   re-simulation, sound and effects must be suppressed (or deduplicated by
   frame and type) so a rolled-back hit doesn't play twice. The renderer's
   effects are already outside the state, so dropping them is safe.
4. **Non-simulation state** that must not roll back: the HUD's red-bar
   drain, effects, the training meter. All already live outside
   `MatchState`.
5. **Things to make deterministic across machines** before going online:
   the match seed (exchange it at connection), the stage, the characters,
   and the game version (put a data hash in the handshake: two builds with
   different frame data would desync instantly). The CPU uses its own RNG
   and isn't involved online.
6. **Replays** need no new engine code: store the seed, the characters and
   the input log, and run `step` over it (exactly what
   `tests/determinism.test.js` does).

Not done yet, and worth knowing: the simulation runs on the main thread;
at these costs that's fine, but rollback of many frames on a slow phone
should be measured there first.
