/**
 * Matchmaking: private rooms, the quick-match queue, character select over
 * the network, rematch, and disconnects (pause, reconnect, forfeit).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { startServer, privateRoom, startedMatch, sleep, waitFor } from './helpers.js';

/** @type {import('./helpers.js').TestEnv} */
let env;
afterEach(async () => {
  await env?.close();
});

describe('private rooms', () => {
  it('codes are 6 unambiguous characters, and joining tolerates case and dashes', async () => {
    env = await startServer();
    const a = env.connect();
    const b = env.connect();
    await Promise.all([a.connected, b.connected]);
    const { code } = await a.request('createRoom');
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    const typed = `${code.slice(0, 3).toLowerCase()}-${code.slice(3)}`;
    const joined = await b.request('joinRoom', { code: typed });
    expect(joined).toMatchObject({ ok: true, code, seat: 1 });
    const room = await a.waitForRoom((r) => r.status === 'select');
    expect(room.seats.map((s) => s.taken)).toEqual([true, true]);
  });

  it('character select over the network: both pick and ready, then the match starts with a server seed', async () => {
    env = await startServer();
    const { a, b } = await privateRoom(env);
    await a.request('select', { char: 'kenji', ready: false });
    const seen = await b.waitForRoom((r) => r.seats[0].char === 'kenji');
    expect(seen.status).toBe('select');
    await a.request('select', { char: 'kenji', ready: true });
    await b.request('select', { char: 'mack', ready: true });
    const ra = await a.waitForRoom((r) => r.status === 'playing');
    const rb = await b.waitForRoom((r) => r.status === 'playing');
    expect(ra.match).toEqual(rb.match);
    expect(ra.match?.chars).toEqual(['kenji', 'mack']);
    expect(ra.you).toBe(0);
    expect(rb.you).toBe(1);
  });

  it('rematch: after the match, both ask, and a new match starts with a new seed', async () => {
    env = await startServer();
    const { a, b } = await startedMatch(env);
    const first = /** @type {import('../../shared/protocol.js').MatchInfo} */ (a.room?.match);
    expect((await a.request('rematch')).ok).toBe(false); // not over yet
    await a.request('matchOver', { id: first.id });
    await b.waitForRoom((r) => r.status === 'over');
    await a.request('rematch');
    const waiting = await b.waitForRoom((r) => r.seats[0].rematch);
    expect(waiting.status).toBe('over');
    await b.request('rematch');
    const next = await a.waitForRoom((r) => r.status === 'playing' && r.match?.id === first.id + 1);
    expect(next.match?.chars).toEqual(first.chars);
    expect(next.match?.seed).not.toBe(first.seed);
  });

  it('change characters goes back to the select screen', async () => {
    env = await startServer();
    const { a, b } = await startedMatch(env);
    await a.request('matchOver', { id: /** @type {any} */ (a.room?.match).id });
    await a.request('changeCharacters');
    await b.waitForRoom((r) => r.status === 'select' && !r.seats[0].ready && !r.seats[1].ready);
  });
});

describe('quick match', () => {
  it('pairs two players into a fresh room with different seats', async () => {
    env = await startServer();
    const a = env.connect();
    const b = env.connect();
    await Promise.all([a.connected, b.connected]);
    expect(await a.request('quickMatch')).toMatchObject({ ok: true, queued: true });
    await b.request('quickMatch');
    await waitFor(() => a.seated.length === 1 && b.seated.length === 1, 2000, 'seated');
    expect(a.seated[0].code).toBe(b.seated[0].code);
    expect(a.seated[0].seat).not.toBe(b.seated[0].seat);
    await a.waitForRoom((r) => r.status === 'select' && r.mode === 'quick');
  });

  it('never pairs a player with themselves', async () => {
    env = await startServer();
    const a = env.connect();
    await a.connected;
    await a.request('quickMatch');
    await a.request('quickMatch');
    await sleep(100);
    expect(a.seated).toHaveLength(0);
    expect(env.server.manager.queue.size).toBe(1);
  });

  it('never pairs anyone with a dead socket', async () => {
    env = await startServer();
    const ghost = env.connect();
    await ghost.connected;
    await ghost.request('quickMatch');
    ghost.socket.disconnect();
    await sleep(50);
    const b = env.connect();
    const c = env.connect();
    await Promise.all([b.connected, c.connected]);
    await b.request('quickMatch');
    await sleep(50);
    expect(b.seated).toHaveLength(0);
    await c.request('quickMatch');
    await waitFor(() => b.seated.length === 1 && c.seated.length === 1, 2000, 'b and c seated');
    expect(b.seated[0].code).toBe(c.seated[0].code);
    expect(ghost.seated).toHaveLength(0);
  });

  it('a place in the queue survives a dropped connection (with its ticket)', async () => {
    env = await startServer();
    const a = env.connect();
    await a.connected;
    const { ticket } = await a.request('quickMatch');
    a.socket.disconnect();
    await sleep(50);
    const back = env.connect();
    await back.connected;
    expect(await back.request('quickMatch', { ticket })).toMatchObject({ ok: true, queued: true });
    expect(await env.connect().request('quickMatch', { ticket: 'B'.repeat(43) }).catch(() => ({ ok: false }))).toMatchObject({ ok: false });
    const b = env.connect();
    await b.connected;
    await b.request('quickMatch');
    await waitFor(() => back.seated.length === 1 && b.seated.length === 1, 2000, 'paired');
  });
});

describe('disconnects', () => {
  it('pauses the match, resumes when the player comes back with their token', async () => {
    env = await startServer({ config: { reconnectGraceMs: 5000 } });
    const { a, b, code, tokens } = await startedMatch(env);
    b.socket.disconnect();
    const paused = await a.waitForRoom((r) => r.status === 'paused');
    expect(paused.pause?.seat).toBe(1);
    expect(paused.pause?.forfeitInMs).toBeGreaterThan(4000);
    const back = env.connect();
    await back.connected;
    expect(await back.request('resume', { code, token: tokens[1] })).toMatchObject({ ok: true, seat: 1 });
    await a.waitForRoom((r) => r.status === 'playing' && r.seats[1].connected);
  });

  it('forfeits the match if the player isn\'t back in time', async () => {
    env = await startServer({ config: { reconnectGraceMs: 300, sweepIntervalMs: 50 } });
    const { a, b } = await startedMatch(env);
    b.socket.disconnect();
    const over = await a.waitForRoom((r) => r.status === 'over', 3000);
    expect(over.forfeited).toBe(1);
  });

  it('leaving on purpose forfeits at once', async () => {
    env = await startServer();
    const { a, b } = await startedMatch(env);
    await b.request('leaveRoom');
    const over = await a.waitForRoom((r) => r.status === 'over');
    expect(over.forfeited).toBe(1);
  });
});
