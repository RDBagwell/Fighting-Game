# Performance

What has been measured so far, on what, and what it means for session 2's
rollback netcode.

**Read this first:** every number below was measured in a cloud container
(an Intel Xeon @ 2.80 GHz with 4 cores, no GPU), in Node and in headless
Chromium. The simulation's CPU time is meaningful there: it's plain
JavaScript with no rendering. **Frame rates and rendering costs are not
measured here** (headless Chromium draws the canvas in software), and no
phone has been measured yet. Real-device numbers are Robert's to take,
with the steps at the end.

## The budget

| What | Budget | Why |
| --- | --- | --- |
| One simulation step | ≤ 0.1 ms on desktop | Rollback re-simulates several frames inside one 16.7 ms display frame, on top of rendering |
| saveState + loadState | ≤ 0.05 ms each | Rollback saves a state every frame and loads one on every misprediction |
| A rollback of 8 frames (load + 8 steps) | ≤ 1 ms on desktop, ≤ 4 ms on a mid-range phone | 8 frames ≈ 133 ms of latency hidden, more than most online matches need |
| Download | ≤ 1 MB | A portfolio visitor on a phone shouldn't wait |

## Measured

Command:

```sh
npm run bench                    # Node only
node tools/bench.mjs --browser   # also headless Chromium, through the Vite dev server
```

[`tools/bench.mjs`](../tools/bench.mjs) records the inputs of four
CPU-vs-CPU matches on Hard (both fighters walking, attacking, blocking,
throwing kunai, using supers), then replays them into the simulation alone,
so the CPU's own thinking isn't counted. It times each operation in batches
(100 calls, or 50 for steps, 20 for rollbacks) and reports the mean, the
median and the 99th percentile across batches. States for saving, loading
and hashing are snapshots taken mid-fight.

> Measured 2026-10-20: Node v22.22.0 and headless Chromium 141.0.7390.37,
> Intel Xeon @ 2.80 GHz × 4 (cloud container), Linux. Workload: 14,129
> frames; 120 snapshots. A mid-fight state is 1,395 bytes as JSON.

### Node v22.22.0

| Operation | Mean | Median | 99th percentile | Worst batch |
| --- | --- | --- | --- | --- |
| One simulation step | 4.55 µs | 4.16 µs | 18.98 µs | 39.90 µs |
| saveState | 9.14 µs | 8.80 µs | 12.65 µs | 14.36 µs |
| loadState | 9.22 µs | 8.72 µs | 16.35 µs | 19.26 µs |
| hashState | 9.64 µs | 9.41 µs | 12.70 µs | 12.70 µs |
| Rollback of 8 frames (load + 8 steps) | 65.55 µs | 63.33 µs | 87.78 µs | 0.10 ms |

### Headless Chromium 141

| Operation | Mean | Median | 99th percentile | Worst batch |
| --- | --- | --- | --- | --- |
| One simulation step | 4.40 µs | 4.00 µs | 14.00 µs | 20.00 µs |
| saveState | 7.74 µs | 8.00 µs | 10.00 µs | 11.00 µs |
| loadState | 8.52 µs | 8.00 µs | 18.00 µs | 25.00 µs |
| hashState | 23.11 µs | 21.00 µs | 35.00 µs | 47.00 µs |
| Rollback of 8 frames (load + 8 steps) | 83.02 µs | 75.00 µs | 0.16 ms | 0.17 ms |

The Chromium figures are rounded to whole microseconds because the
browser coarsens `performance.now()` (a protection against timing attacks);
averaging over batches is what makes them usable at all. Two earlier runs
the same day gave the same picture (step 4.2–4.8 µs, save and load 8–11 µs,
an 8-frame rollback 66–83 µs).

### What the numbers mean

- **A step costs about 4.5 µs**, roughly 1/3,700 of a 60 Hz frame. Even
  the worst batch seen (40 µs) is a quarter of a percent of the frame.
- **Saving or loading a state costs about 9 µs**: the state is ~1.4 KB of
  plain data (types.js), copied by a small hand-written deep copy
  ([`clonePlain`](../src/engine/sim/state.js)) rather than `structuredClone`.
- **An 8-frame rollback costs 65–85 µs**: under 1% of a frame here. A
  mid-range phone is perhaps 3–5× slower at this kind of code (an
  estimate, not a measurement), which would still be well under 0.5 ms.
- **Hashing** (for desync detection) is slower in Chromium than in Node
  (23 µs against 10 µs); it would run once per confirmed frame, not per
  re-simulated one, so it doesn't multiply with rollback.

So the rollback budget is generous: the simulation is not where session 2's
frame time will go. Rendering, the browser's input latency and network
jitter are the things to watch.

### Download

`npm run build` on 2026-10-20: the JavaScript bundle is 118 KB (40 KB
gzipped) and the CSS 9 KB (3 KB gzipped); the 16 sprite sheets add up to
89 KB. About 250 KB in all, well inside the 1 MB budget. Everything loads before the title screen.

## Measuring on real devices (Robert)

1. `npm run build && npx vite preview --host` and open the printed network
   address on the phone (same Wi-Fi), or use the GitHub Pages build.
2. For the simulation's cost on that device, open the browser's remote
   devtools (Chrome: `chrome://inspect`; Safari: Develop menu) and run
   in the console, on the title screen:

   ```js
   const { sim } = window.__game;
   const s = sim.createMatch({ chars: ['mack', 'kenji'], seed: 1 });
   let t = performance.now();
   for (let i = 0; i < 20000; i++) sim.step(s, [i & 0xff, (i * 7) & 0xff]);
   console.log((performance.now() - t) / 20000 * 1000, 'µs per step');
   ```

3. For the frame rate, use the devtools Performance panel during a CPU
   match and note the device, browser and any dropped frames here.
