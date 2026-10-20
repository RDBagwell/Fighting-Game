/**
 * Transports: how rollback packets travel. The session only needs two
 * calls, `send(bytes)` and `receive()` (everything that arrived since the
 * last call), so the same session runs over:
 *
 * - a WebRTC data channel (online, direct: src/game/online/PeerLink.js);
 * - the server's WebSocket relay (online, when a direct path fails);
 * - an in-memory pair through simulated networks (the offline rollback lab
 *   and the tests: `createLinkedPair`);
 * - any of those with a simulated bad network added on top (`withSimulator`,
 *   what the lab's sliders control during a real online match).
 *
 * Every transport counts the bytes and packets it carries, for the lab's
 * bandwidth figure.
 *
 * @typedef {object} Transport
 * @property {(data: Uint8Array) => void} send
 * @property {() => Uint8Array[]} receive
 * @property {string} kind  'direct' | 'relay' | 'simulated'
 * @property {{ bytesSent: number, bytesReceived: number, packetsSent: number, packetsReceived: number }} stats
 */
import { NetworkSimulator } from './NetworkSimulator.js';

/** @returns {Transport['stats']} */
export function emptyStats() {
  return { bytesSent: 0, bytesReceived: 0, packetsSent: 0, packetsReceived: 0 };
}

/**
 * Two transports joined back to back, each direction through its own
 * simulated network.
 * @param {object} o
 * @param {import('./NetworkSimulator.js').NetworkConditions} o.conditions
 * @param {() => number} o.now  ms
 * @param {() => number} [o.random]
 * @returns {[Transport & { net: NetworkSimulator<Uint8Array> }, Transport & { net: NetworkSimulator<Uint8Array> }]}
 */
export function createLinkedPair({ conditions, now, random = Math.random }) {
  /** @type {NetworkSimulator<Uint8Array>} */
  const aToB = new NetworkSimulator(conditions, random);
  /** @type {NetworkSimulator<Uint8Array>} */
  const bToA = new NetworkSimulator(conditions, random);
  /**
   * @param {NetworkSimulator<Uint8Array>} out
   * @param {NetworkSimulator<Uint8Array>} incoming
   */
  const end = (out, incoming) => {
    const stats = emptyStats();
    return {
      kind: 'simulated',
      stats,
      net: out,
      /** @param {Uint8Array} data */
      send(data) {
        stats.bytesSent += data.length;
        stats.packetsSent++;
        // Copy: the receiver must never share a buffer with the sender.
        out.transmit(now(), data.slice());
      },
      receive() {
        const got = incoming.pump(now());
        for (const d of got) {
          stats.bytesReceived += d.length;
          stats.packetsReceived++;
        }
        return got;
      },
    };
  };
  return [end(aToB, bToA), end(bToA, aToB)];
}

/**
 * Adds a simulated bad network on top of a real transport (both
 * directions get half each: outgoing and incoming are each delayed by a
 * quarter of the round trip, so the added RTT is what the slider says).
 * @param {Transport} base
 * @param {object} o
 * @param {import('./NetworkSimulator.js').NetworkConditions} o.conditions
 * @param {() => number} o.now
 * @param {() => number} [o.random]
 * @returns {Transport & { nets: NetworkSimulator<Uint8Array>[], setConditions: (c: import('./NetworkSimulator.js').NetworkConditions) => void }}
 */
export function withSimulator(base, { conditions, now, random = Math.random }) {
  const half = (/** @type {import('./NetworkSimulator.js').NetworkConditions} */ c) => ({ ...c, latencyMs: c.latencyMs / 2, jitterMs: c.jitterMs / 2, loss: 1 - Math.sqrt(1 - c.loss) });
  /** @type {NetworkSimulator<Uint8Array>} */
  const out = new NetworkSimulator(half(conditions), random);
  /** @type {NetworkSimulator<Uint8Array>} */
  const incoming = new NetworkSimulator(half(conditions), random);
  return {
    kind: base.kind,
    stats: base.stats,
    nets: [out, incoming],
    setConditions(c) {
      out.conditions = half(c);
      incoming.conditions = half(c);
    },
    send(data) {
      out.transmit(now(), data);
      for (const d of out.pump(now())) base.send(d);
    },
    receive() {
      for (const d of out.pump(now())) base.send(d);
      for (const d of base.receive()) incoming.transmit(now(), d);
      return incoming.pump(now());
    },
  };
}
