# Performance

What has been measured, on what, and how to reproduce it: the simulation's
cost (session 1), and the rollback netcode, its bandwidth and the
matchmaking server under load (session 2).

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

`npm run build` on 2026-10-20 (session 2):

| Part | Size | Gzipped |
|---|---|---|
| JavaScript | 306 KB | 97 KB |
| CSS | 12 KB | 3 KB |
| The 16 sprite sheets | 89 KB | (PNG) |

The whole `dist/` is 409 KB, well inside the 1 MB budget. Everything loads
before the title screen. Session 2 added 188 KB of JavaScript, mostly the
socket.io client and zod, which the online play and the replay validation
need. (Session 1's build was 118 KB.)

## Rollback netcode (session 2)

### Rollback frequency, cost and bandwidth per network preset

```sh
npm run netplay-stats
```

Two real `RollbackSession`s in one process, through the lab's simulated
network on a virtual 60 Hz clock: 3 one-minute matches of Hard CPU against
Hard CPU per preset, with input delay 2 and rollback window 8. Rates are
per player per second. Machine: Intel Xeon @ 2.80 GHz (4 threads), 16 GB,
Linux 6.18, Node 22.22.0. Run on 2026-10-20.

| Network | Round trip / jitter / loss | Rollbacks/s | Frames re-simulated/s | Longest | Guesses wrong | Stalls/s | Time-sync skips/s | Sent per player | Worst tick resim | Desyncs |
|---|---|---|---|---|---|---|---|---|---|---|
| Perfect (LAN) | 0 / 0 / 0% | 0.0 | 0.0 | 0 | 0.0% | 0.0 | 0.0 | 1.20 kB/s, 83.7 pkt/s | 0.00 ms | none |
| Same city | 20 / 4 / 0% | 0.0 | 0.0 | 0 | 0.0% | 0.0 | 0.0 | 1.26 kB/s, 83.7 pkt/s | 0.00 ms | none |
| Across the country | 80 / 10 / 0.5% | 3.4 | 3.4 | 2 | 5.6% | 0.0 | 0.0 | 1.50 kB/s, 83.6 pkt/s | 2.99 ms | none |
| Bad Wi-Fi | 60 / 60 / 8% | 2.5 | 5.4 | 5 | 6.6% | 0.0 | 0.0 | 1.61 kB/s, 83.4 pkt/s | 1.55 ms | none |
| Another continent | 180 / 20 / 1% | 3.0 | 13.6 | 6 | 6.2% | 0.0 | 0.0 | 1.91 kB/s, 83.6 pkt/s | 1.64 ms | none |

Delay-based netcode on the same networks, from the same run (the lab's
"Delay-based" mode):

| Network | Rollback: stalls/s | Delay-based at 2 frames: stalls/s | Delay needed to rarely stall | Delay-based at that delay: stalls/s |
|---|---|---|---|---|
| Perfect (LAN) | 0.0 | 0.0 | 1 frame (17 ms) | 0.0 |
| Same city | 0.0 | 0.0 | 1 frame (17 ms) | 0.0 |
| Across the country | 0.0 | 20.2 | 3 frames (50 ms) | 0.6 |
| Bad Wi-Fi | 0.0 | 32.2 | 5 frames (83 ms) | 3.5 |
| Another continent | 0.0 | 41.8 | 7 frames (117 ms) | 0.7 |

**Bandwidth per player: 1.2–1.9 kB/s of payload, about 84 packets a
second.**
- Of those packets, 60 are input packets: 16 bytes of header plus one byte
  per unacknowledged input, so more inputs ride along when the round trip
  is longer or packets are lost. The rest are checksums and pings.
- This is the game's own bytes. WebRTC adds its headers (SCTP, DTLS, UDP
  and IP) on every packet, and the relay adds WebSocket framing. Neither
  was measured here.
- An estimate, not a measurement: those headers come to roughly 60–80
  bytes a packet, about 5–7 kB/s in total.

**Re-simulation cost for the maximum window.** The same command times the
worst case on its own: load a state, then re-simulate 8 frames, saving and
hashing each.
- The median is **233 µs, 1.4% of a 16.7 ms frame**, over 20 rounds of
  172 rollbacks from a real match.
- The "Worst tick resim" column above is the slowest single tick seen in
  the matches, including JIT warm-up and GC.
- This costs more than session 1's 65–85 µs "load + 8 steps" because the
  session also saves and hashes every re-simulated frame.

**In the browser.** In the lab in headless Chromium (Bad Wi-Fi, about
6 s of play), the session reported 9 rollbacks, the longest 3 frames, and
a worst re-simulation of 0.3 ms. That's from a Playwright script that
reads `window.__game.scene.session.stats`; the e2e test
`tests/e2e/netplay.spec.js` checks that it stays under 16 ms.

### Matchmaking server under load

```sh
npm run load-test              # 0, 10, 25, 50, 100 rooms
npm run load-test -- 0 50 150  # or choose
```

**Setup.**
- N rooms of two players, every player relaying a realistic stream
  through the server: 60 input packets a second, plus checksums and pings,
  as `RollbackSession` sends them.
- That's the worst case. A match on the direct WebRTC path costs the
  server nothing per frame.
- The server runs in its own process with the production configuration
  (`tools/load-server.mjs`). The per-IP caps are raised there, because
  every client comes from 127.0.0.1.
- Each step settles for 5 s, then is measured for 15 s. CPU is the server
  process's user plus system time over wall time (100% = one core).
- Same machine as above, 2026-10-20.

| Rooms (2 players, all relayed) | Packets relayed/s | Server CPU | Server memory (RSS) | JS heap |
|---|---|---|---|---|
| 0 | 0 | 0.5% | 73 MB | 13.8 MB |
| 10 | 1,315 | 14.6% | 79 MB | 16.6 MB |
| 25 | 3,275 | 27.7% | 84 MB | 16.7 MB |
| 50 | 6,440 | 48.5% | 105 MB | 19.0 MB |
| 100 | 12,876 | 78.2% | 112 MB | 26.3 MB |

**About 0.8% of a core and 0.4 MB per fully relayed room** at 100 rooms
(1.5% per room at 10 rooms: there's a fixed cost, then it amortises). The
packet rate scaled linearly, so the clients kept up.

What it means for Render's free tier:
- The tier has 0.1 CPU and 512 MB
  ([Render's compute plans](https://render.com/docs/compute-plans); not
  measured here), so it could relay roughly a dozen matches at once.
- A free service also sleeps after 15 minutes without traffic, and the
  next visitor waits about a minute for it to wake
  ([Render: Deploy for Free](https://render.com/docs/free)). The online
  lobby says so while it connects.
- It could pair and signal far more, since direct matches cost nothing
  per frame.
- The 300-room cap (`MAX_ROOMS`) is a memory guard, not a CPU guarantee.
  On a free instance, CPU runs out first if many matches fall back to
  the relay.

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
