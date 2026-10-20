/**
 * The lab's network presets. These are settings for the simulated network,
 * chosen to be typical of each situation (round trip, jitter, loss); they
 * are not measurements. Same style as Netcode Pong's presets.
 *
 * @type {Record<string, { label: string, conditions: import('./NetworkSimulator.js').NetworkConditions }>}
 */
export const PRESETS = {
  perfect: { label: 'Perfect (LAN)', conditions: { latencyMs: 0, jitterMs: 0, loss: 0 } },
  sameCity: { label: 'Same city', conditions: { latencyMs: 20, jitterMs: 4, loss: 0 } },
  acrossCountry: { label: 'Across the country', conditions: { latencyMs: 80, jitterMs: 10, loss: 0.005 } },
  badWifi: { label: 'Bad Wi-Fi', conditions: { latencyMs: 60, jitterMs: 60, loss: 0.08 } },
  anotherContinent: { label: 'Another continent', conditions: { latencyMs: 180, jitterMs: 20, loss: 0.01 } },
};
