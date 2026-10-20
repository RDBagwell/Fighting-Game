/**
 * The path rollback packets take between the two players: a direct WebRTC
 * data channel when one can be made, the server's relay otherwise.
 *
 * - The data channel is **unordered with no retransmits** (`maxRetransmits:
 *   0`): it behaves like UDP. A late packet is useless to rollback, and the
 *   input packets carry their own redundancy, so retransmitting would only
 *   add delay.
 * - Finding a direct path uses **public STUN servers** (Google's and
 *   Cloudflare's), which tell each browser its public address. That is the
 *   only third-party contact (see the privacy note in the README).
 * - There's no TURN server (a relay for WebRTC itself, not on a free tier),
 *   so when the two networks won't connect directly (symmetric NATs, strict
 *   firewalls), packets go through the matchmaking server's WebSocket
 *   instead. The game works either way, with more latency on the relay.
 * - The match never waits for WebRTC: packets go over the relay from the
 *   first frame, and switch to the data channel the moment it opens.
 *
 * It's a Transport (src/engine/rollback/transport.js): `send`, `receive`,
 * `kind` ('direct' or 'relay'), `stats`.
 */
import { emptyStats } from '../../engine/rollback/transport.js';

export const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];

/** Give up on a direct connection after this long. */
const DIRECT_TIMEOUT_MS = 10_000;

export class PeerLink {
  /**
   * @param {import('./OnlineClient.js').OnlineClient} client
   * @param {0 | 1} seat  Seat 0 makes the offer.
   * @param {{ allowDirect?: boolean }} [o]
   */
  constructor(client, seat, { allowDirect = true } = {}) {
    this.client = client;
    this.seat = seat;
    /** @type {'relay' | 'direct'} */
    this.kind = 'relay';
    /** 'connecting' → 'direct' or 'relay-only'. */
    this.directState = /** @type {'connecting' | 'direct' | 'relay-only'} */ ('connecting');
    this.stats = emptyStats();
    /** @type {Uint8Array[]} */
    this.inbox = [];
    /** @type {RTCPeerConnection | null} */
    this.pc = null;
    /** @type {RTCDataChannel | null} */
    this.channel = null;
    client.onRelay = (data) => this.inbox.push(data);
    client.onSignal = (s) => this.onSignal(s);
    if (allowDirect && typeof RTCPeerConnection === 'function') this.startDirect();
    else this.directState = 'relay-only';
    this.timer = setTimeout(() => {
      if (this.directState === 'connecting') this.giveUp();
    }, DIRECT_TIMEOUT_MS);
  }

  startDirect() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.client.signal('ice', JSON.stringify(e.candidate));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.giveUp();
    };
    if (this.seat === 0) {
      this.attach(pc.createDataChannel('inputs', { ordered: false, maxRetransmits: 0 }));
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => this.client.signal('offer', JSON.stringify(pc.localDescription)))
        .catch(() => this.giveUp());
    } else {
      pc.ondatachannel = (e) => this.attach(e.channel);
    }
  }

  /** @param {RTCDataChannel} ch */
  attach(ch) {
    ch.binaryType = 'arraybuffer';
    ch.onopen = () => {
      this.channel = ch;
      this.kind = 'direct';
      this.directState = 'direct';
    };
    ch.onclose = () => {
      if (this.channel === ch) this.giveUp();
    };
    ch.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) this.inbox.push(new Uint8Array(e.data));
    };
  }

  /**
   * @param {{ kind: string, data: string }} s
   */
  async onSignal(s) {
    const pc = this.pc;
    if (!pc) return;
    try {
      const value = JSON.parse(s.data);
      if (s.kind === 'offer' && this.seat === 1) {
        await pc.setRemoteDescription(value);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.client.signal('answer', JSON.stringify(pc.localDescription));
      } else if (s.kind === 'answer' && this.seat === 0) {
        await pc.setRemoteDescription(value);
      } else if (s.kind === 'ice') {
        await pc.addIceCandidate(value);
      }
    } catch {
      // A malformed or out-of-order signal: ignore it; the timeout falls back to the relay.
    }
  }

  giveUp() {
    if (this.directState === 'relay-only') return;
    this.directState = 'relay-only';
    this.kind = 'relay';
    this.channel = null;
    try {
      this.pc?.close();
    } catch {
      // ignore
    }
    this.pc = null;
  }

  /** @param {Uint8Array} data */
  send(data) {
    this.stats.bytesSent += data.length;
    this.stats.packetsSent++;
    const ch = this.channel;
    if (ch && ch.readyState === 'open') {
      try {
        ch.send(/** @type {Uint8Array<ArrayBuffer>} */ (data));
        return;
      } catch {
        this.giveUp();
      }
    }
    this.client.relay(data);
  }

  receive() {
    const got = this.inbox;
    this.inbox = [];
    for (const d of got) {
      this.stats.bytesReceived += d.length;
      this.stats.packetsReceived++;
    }
    return got;
  }

  close() {
    clearTimeout(this.timer);
    this.giveUp();
    this.client.onRelay = null;
    this.client.onSignal = null;
  }
}
