/**
 * The headless netplay harness: the real matchmaking server, two
 * in-process clients (the game's own OnlineClient, PeerLink and
 * RollbackSession), and a simulated bad network between each client and
 * the server. Two CPUs play a full match through it.
 *
 * Node has no WebRTC, so packets take the relay path through the server
 * (which is also the path that must work when a direct connection fails).
 * The simulated network runs on a virtual clock that advances one frame
 * (16.7 ms) per tick, and each tick waits for the real sockets to deliver,
 * so a minute of play takes seconds.
 *
 * Used by tests/harness/netplay.test.js and tools/netplay-stats.mjs.
 */
import { createServer } from '../../server/app.js';
import { testConfig } from '../server/helpers.js';
import { OnlineClient } from '../../src/game/online/OnlineClient.js';
import { PeerLink } from '../../src/game/online/PeerLink.js';
import { RollbackSession } from '../../src/engine/rollback/RollbackSession.js';
import { withSimulator } from '../../src/engine/rollback/transport.js';
import { seededRandom } from '../../src/engine/rollback/NetworkSimulator.js';
import { Cpu, DIFFICULTIES } from '../../src/game/cpu/Cpu.js';
import { hashState } from '../../src/engine/sim/state.js';
import { sim } from '../../src/game/sim.js';

export const FRAME_MS = 1000 / 60;
const ORIGIN = 'http://localhost:5173';

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {() => boolean} predicate
 * @param {number} [timeout]
 */
async function until(predicate, timeout = 5000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('harness: timed out');
    await sleep(5);
  }
}

/**
 * Plays one match. Returns both sessions and what happened.
 * @param {object} o
 * @param {import('../../src/engine/rollback/NetworkSimulator.js').NetworkConditions} o.conditions
 * @param {number} [o.seed]
 * @param {number} [o.maxTicks]
 * @param {number} [o.inputDelay]
 * @param {number} [o.slowEvery]  Client B misses one tick in this many (a slower clock).
 * @param {(tick: number, a: RollbackSession, b: RollbackSession) => void} [o.each]
 */
export async function playOnline({ conditions, seed = 1, maxTicks = 9000, inputDelay = 2, slowEvery = 0, each }) {
  // The harness runs ticks several times faster than real time, so the
  // per-socket event limit (a real-time budget, tested in tests/server/) is
  // lifted here; everything else is the production configuration.
  const server = createServer({ log: () => {}, config: testConfig({ limits: { socketEvents: { capacity: 1e6, windowMs: 1000 } } }) });
  const port = await server.listen(0);
  const url = `http://127.0.0.1:${port}`;
  // socket.io-client in Node: send the Origin header the browser would.
  const clients = [0, 1].map(() => {
    const c = new OnlineClient(url);
    c.socket.io.opts.extraHeaders = { origin: ORIGIN };
    c.socket.disconnect().connect();
    return c;
  });
  try {
    await until(() => clients.every((c) => c.status === 'online'));
    const created = await clients[0].createRoom();
    await clients[1].joinRoom(/** @type {string} */ (created.code));
    await until(() => clients.every((c) => c.room?.status === 'select'));
    await clients[0].select('mack', true);
    await clients[1].select('kenji', true);
    await until(() => clients.every((c) => c.room?.status === 'playing' && c.room.match));
    const match = /** @type {import('../../shared/protocol.js').MatchInfo} */ (clients[0].room?.match);

    let t = 0;
    const now = () => t;
    const random = seededRandom(seed);
    const sessions = clients.map((c, seat) => {
      const link = new PeerLink(c, /** @type {0 | 1} */ (seat), { allowDirect: false });
      const transport = withSimulator(link, { conditions, now, random });
      const state = sim.createMatch({ chars: match.chars, seed: match.seed, stage: match.stage });
      return new RollbackSession({ sim, state, localSide: seat, transport, inputDelay, now });
    });
    const cpus = [new Cpu(0, DIFFICULTIES.hard, sim, seed * 3), new Cpu(1, DIFFICULTIES.normal, sim, seed * 3 + 1)];
    const [a, b] = sessions;
    /** @type {number[]} */
    const gaps = [];
    let ticks = 0;
    for (; ticks < maxTicks; ticks++) {
      t += FRAME_MS;
      sessions.forEach((s, i) => {
        if (i === 1 && slowEvery && ticks % slowEvery === 0) return;
        s.tick(cpus[i].think(s.state));
      });
      gaps.push(a.state.frame - b.state.frame);
      each?.(ticks, a, b);
      // Let the real sockets carry this tick's packets through the server.
      await new Promise((r) => setImmediate(r));
      if (ticks % 4 === 0) await sleep(1);
      const done = (/** @type {RollbackSession} */ s) => s.state.phase === 'matchEnd' && s.confirmedFrame >= s.state.frame - 1;
      if (done(a) && done(b)) break;
    }
    // Compare the two sides on the last frame both have confirmed.
    const common = Math.min(a.confirmedFrame, b.confirmedFrame);
    const ha = a.stateAfter(common);
    const hb = b.stateAfter(common);
    return {
      a, b, ticks, gaps, match,
      sameState: !!ha && !!hb && hashState(ha) === hashState(hb),
      common,
      relayed: { ...server.sockets.relayed },
      kinds: [a.transport.kind, b.transport.kind],
    };
  } finally {
    for (const c of clients) c.close();
    await server.close();
  }
}
