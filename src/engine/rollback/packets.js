/**
 * The peer-to-peer wire format: tiny binary packets, the same bytes over a
 * WebRTC data channel, the server's relay, or the lab's simulated network.
 *
 * Rollback sends only inputs, never state, so a packet is a handful of
 * bytes. Every packet is self-contained and safe to lose, duplicate or
 * reorder (the data channel is unordered with no retransmits, like UDP).
 *
 *   INPUT     type 1 | frame u32 | ack u32 | advantage i16 | start u32 | count u8 | inputs u8 × count
 *   CHECKSUM  type 2 | frame u32 | hash u32
 *   PING      type 3 | time f64
 *   PONG      type 4 | time f64
 *
 * INPUT carries the sender's inputs for frames start .. start+count-1 (the
 * newest ones plus every older one the peer hasn't acknowledged: the
 * redundancy that covers packet loss), `ack` = the last frame of the
 * receiver's inputs the sender has received without a gap, `frame` = the
 * frame the sender has simulated up to, and `advantage` = how many frames
 * the sender thinks it is ahead (×10), for time sync.
 *
 * `decode` treats every packet as hostile: anything with the wrong length,
 * an unknown type or an impossible field returns null and is dropped.
 */

export const INPUT = 1;
export const CHECKSUM = 2;
export const PING = 3;
export const PONG = 4;

/** Most inputs one packet may carry. */
export const MAX_INPUTS = 64;
/** "Nothing received yet" for ack fields. */
export const NONE = 0xffffffff;

/**
 * @typedef {{ type: 1, frame: number, ack: number, advantage: number, start: number, inputs: number[] }} InputPacket
 * @typedef {{ type: 2, frame: number, hash: number }} ChecksumPacket
 * @typedef {{ type: 3 | 4, time: number }} PingPacket
 * @typedef {InputPacket | ChecksumPacket | PingPacket} Packet
 */

/**
 * @param {number} frame
 * @param {number} ack  -1 for none
 * @param {number} advantage  frames, may be fractional
 * @param {number} start
 * @param {ArrayLike<number>} inputs
 */
export function encodeInput(frame, ack, advantage, start, inputs) {
  const n = Math.min(inputs.length, MAX_INPUTS);
  const buf = new Uint8Array(16 + n);
  const v = new DataView(buf.buffer);
  v.setUint8(0, INPUT);
  v.setUint32(1, frame >>> 0, true);
  v.setUint32(5, ack < 0 ? NONE : ack >>> 0, true);
  v.setInt16(9, Math.max(-32768, Math.min(32767, Math.round(advantage * 10))), true);
  v.setUint32(11, start >>> 0, true);
  v.setUint8(15, n);
  for (let i = 0; i < n; i++) buf[16 + i] = inputs[i] & 0xff;
  return buf;
}

/**
 * @param {number} frame
 * @param {number} hash
 */
export function encodeChecksum(frame, hash) {
  const buf = new Uint8Array(9);
  const v = new DataView(buf.buffer);
  v.setUint8(0, CHECKSUM);
  v.setUint32(1, frame >>> 0, true);
  v.setUint32(5, hash >>> 0, true);
  return buf;
}

/**
 * @param {3 | 4} type
 * @param {number} time
 */
export function encodePing(type, time) {
  const buf = new Uint8Array(9);
  const v = new DataView(buf.buffer);
  v.setUint8(0, type);
  v.setFloat64(1, time, true);
  return buf;
}

/**
 * @param {ArrayBuffer | ArrayBufferView | unknown} data
 * @returns {Packet | null}
 */
export function decode(data) {
  /** @type {Uint8Array} */
  let buf;
  if (data instanceof Uint8Array) buf = data;
  else if (data instanceof ArrayBuffer) buf = new Uint8Array(data);
  else if (ArrayBuffer.isView(data)) buf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  else return null;
  if (buf.length < 9 || buf.length > 16 + MAX_INPUTS) return null;
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const type = v.getUint8(0);
  if (type === INPUT) {
    if (buf.length < 16) return null;
    const n = v.getUint8(15);
    if (n < 1 || n > MAX_INPUTS || buf.length !== 16 + n) return null;
    const ackRaw = v.getUint32(5, true);
    const inputs = Array.from(buf.subarray(16, 16 + n));
    return { type: INPUT, frame: v.getUint32(1, true), ack: ackRaw === NONE ? -1 : ackRaw, advantage: v.getInt16(9, true) / 10, start: v.getUint32(11, true), inputs };
  }
  if (buf.length !== 9) return null;
  if (type === CHECKSUM) return { type: CHECKSUM, frame: v.getUint32(1, true), hash: v.getUint32(5, true) };
  if (type === PING || type === PONG) {
    const time = v.getFloat64(1, true);
    if (!Number.isFinite(time)) return null;
    return { type, time };
  }
  return null;
}
