/**
 * Full online matches through the real server, under simulated bad
 * networks (tests/harness/harness.js).
 */
import { describe, it, expect } from 'vitest';
import { playOnline } from './harness.js';
import { PRESETS } from '../../src/engine/rollback/presets.js';

describe('netplay harness (real server, relay path)', () => {
  it('a full match completes under "Bad Wi-Fi" with no desync', async () => {
    const r = await playOnline({ conditions: PRESETS.badWifi.conditions, seed: 2 });
    expect(r.a.state.phase).toBe('matchEnd');
    expect(r.b.state.phase).toBe('matchEnd');
    expect(r.a.desync).toBeNull();
    expect(r.b.desync).toBeNull();
    expect(r.sameState).toBe(true);
    expect(r.a.state.matchWinner).toBe(r.b.state.matchWinner);
    expect(r.a.stats.rollbacks).toBeGreaterThan(0);
    // Checksums were really exchanged and compared.
    expect(r.a.remoteHashes.size).toBeGreaterThan(10);
  }, 180_000);

  it('the relay fallback carries every packet when there is no direct path', async () => {
    const r = await playOnline({ conditions: PRESETS.sameCity.conditions, seed: 3, maxTicks: 1200 });
    expect(r.kinds).toEqual(['relay', 'relay']);
    expect(r.relayed.packets).toBeGreaterThan(2000);
    expect(r.sameState).toBe(true);
  }, 120_000);

  it('time sync keeps the frame difference bounded when one side runs slow', async () => {
    const r = await playOnline({ conditions: PRESETS.acrossCountry.conditions, seed: 4, maxTicks: 2400, slowEvery: 40 });
    const late = r.gaps.slice(600);
    expect(Math.max(...late.map(Math.abs))).toBeLessThanOrEqual(8);
    expect(r.a.timeSync.skips).toBeGreaterThan(0);
    expect(r.sameState).toBe(true);
  }, 120_000);
});
