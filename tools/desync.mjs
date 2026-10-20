/**
 * Replays a desync log and reports the first frame that differs.
 *
 *   npm run desync -- desync-a.json              one side's log
 *   npm run desync -- desync-a.json desync-b.json   both sides' logs
 *
 * A log is what the game saves when a desync is detected (the "Save desync
 * log" button), or RollbackSession.desyncLog(). See src/engine/rollback/desync.js.
 */
import fs from 'node:fs';
import { sim } from '../src/game/sim.js';
import { firstBadFrame, firstDivergence } from '../src/engine/rollback/desync.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: npm run desync -- <log.json> [other-side-log.json]');
  process.exit(2);
}
const logs = files.map((f) => {
  const log = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (log.kind !== 'dusk-duel-desync-log' || log.version !== 1) {
    console.error(`${f} is not a desync log (version 1).`);
    process.exit(2);
  }
  return log;
});

for (const [i, log] of logs.entries()) {
  const bad = firstBadFrame(sim, log);
  const who = `${files[i]} (player ${log.side + 1}, ${log.inputs.length} confirmed frames from frame ${log.startFrame + 1})`;
  if (!bad) console.log(`${who}: the replay matches every recorded hash.`);
  else console.log(`${who}: first differing frame ${bad.frame}: ${bad.side === 'local' ? 'this side' : 'the other side'} recorded ${bad.recorded.toString(16)}, the replay gives ${bad.replayed.toString(16)}.`);
}
if (logs.length === 2) {
  const d = firstDivergence(sim, logs[0], logs[1]);
  console.log(d ? `The two logs first differ at frame ${d.frame} (${d.reason}): ${d.detail}` : 'The two logs agree on every input and replay to identical states.');
}
