/**
 * Prints every move's frame data as Markdown tables (for docs/FRAME-DATA.md),
 * computed from the character data by src/engine/sim/frameData.js: the
 * same numbers the move list and the training mode show.
 *
 *   npm run framedata
 */
import { sim } from '../src/game/sim.js';
import { summarise, formatAdvantage } from '../src/engine/sim/frameData.js';

for (const ch of Object.values(sim.characters)) {
  console.log(`#### ${ch.name} (${ch.style})\n`);
  console.log('| Input | Move | Startup | Active | Recovery | On hit | On block | Damage | Guard |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const m of Object.values(ch.moves)) {
    const d = summarise(m, sim.config);
    const air = m.stance === 'air';
    const proj = !!m.projectile;
    console.log(`| \`${m.notation}\` | ${m.name} | ${d.startup} | ${proj && !m.hits ? '—' : d.active} | ${d.recovery} | ${air || proj ? '—' : formatAdvantage(d.onHit.value, d.onHit.tag)} | ${air || proj || m.kind === 'throw' || m.throw ? '—' : formatAdvantage(d.onBlock)} | ${d.damage} | ${d.guard} |`);
  }
  console.log('');
}
