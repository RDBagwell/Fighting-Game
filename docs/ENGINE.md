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

## Rollback, replays and online play

Session 2 built these on the engine without changing the simulation:
everything they need is already a function of plain data.

- **Inputs** are one byte per player per frame (`bits.js`). That byte is
  what goes over the network and into a replay. Facing-relative directions
  are resolved inside the simulation, so the byte means the same on both
  machines.
- **The step** is `sim.step(state, [p1, p2])`. It's deterministic and
  integer-only, it reads nothing but its arguments and frozen data, and a
  golden-hash test pins how a recorded match plays out.
- **`saveState` / `loadState` / `hashState`** are a deep copy of about
  1.4 KB of plain data, and a 32-bit FNV-1a checksum.

How each feature uses them:

| What | How | Where |
|---|---|---|
| Rollback | A ring of `saveState` snapshots. On a wrong guess, `loadState` the frame before and re-run `step` up to the present, in the same tick | [`src/engine/rollback/`](../src/engine/rollback/), [ROLLBACK.md](ROLLBACK.md) |
| Sounds and effects | `state.events` holds only the current frame's events. The `EventPresenter` drops repeats from re-simulated frames | [`EventPresenter.js`](../src/engine/rollback/EventPresenter.js) |
| Desync detection | `hashState` of every confirmed frame, compared every 30 frames | [`RollbackSession.js`](../src/engine/rollback/RollbackSession.js), [`desync.js`](../src/engine/rollback/desync.js) |
| Replays | The match options and the input log, re-run through `step`, with snapshots every 3 s for seeking | [`src/game/replay/`](../src/game/replay/) |
| The same game on both machines | The server picks the seed. Both clients report their **game version** (a hash of the engine version and all data) when they connect, and the server only puts players of the same version together | [`shared/protocol.js`](../shared/protocol.js), `gameVersion` in [`replays.js`](../src/game/replay/replays.js) |

Non-simulation state never rolls back, because it was never in
`MatchState`: the HUD's red-bar drain, effects, the training meter and the
CPU's thinking. The CPU plays through inputs, so in the lab it sits on
the far side of the simulated network like a remote player.

The simulation runs on the main thread. At these costs that's fine on a
desktop ([PERFORMANCE.md](PERFORMANCE.md)), but a long rollback on a slow
phone hasn't been measured on a real device yet.
