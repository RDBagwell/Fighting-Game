/**
 * A rough balance check: every character against every other, Hard CPU
 * against Hard CPU, both sides, several seeds. Prints each character's win
 * rate and the full table as Markdown.
 *
 *   node tools/cpu-matrix.mjs [matches per pairing per side, default 6]
 *
 * This measures the CPU playing each character, not the characters
 * themselves: a character the CPU plays badly will look weak. It catches
 * a character that is wildly off, not fine balance.
 */
import { sim } from '../src/game/sim.js';
import { roster } from '../src/game/data/characters/index.js';
import { Cpu, DIFFICULTIES } from '../src/game/cpu/Cpu.js';

const N = Number(process.argv[2] ?? 6);
/** @type {Record<string, Record<string, number>>} */
const wins = {};
/** @type {Record<string, number>} */
const total = {};
for (const a of roster) {
  wins[a] = {};
  total[a] = 0;
  for (const b of roster) wins[a][b] = 0;
}
let games = 0;
for (const a of roster) {
  for (const b of roster) {
    if (a === b) continue;
    for (let seed = 1; seed <= N; seed++) {
      const s = sim.createMatch({ chars: [a, b], seed });
      const cpus = [new Cpu(0, DIFFICULTIES.hard, sim, seed * 7 + 1), new Cpu(1, DIFFICULTIES.hard, sim, seed * 7 + 2)];
      let f = 0;
      while (s.phase !== 'matchEnd' && f++ < 60 * 60 * 10) sim.step(s, [cpus[0].think(s), cpus[1].think(s)]);
      games++;
      if (s.matchWinner === 0) wins[a][b]++;
      else if (s.matchWinner === 1) wins[b][a]++;
    }
  }
}
for (const a of roster) total[a] = Object.values(wins[a]).reduce((x, y) => x + y, 0);
const per = (roster.length - 1) * N * 2;
console.log(`${games} matches, Hard vs Hard, ${N} per pairing per side.\n`);
console.log('| Character | Win rate |');
console.log('|---|---|');
for (const a of [...roster].sort((x, y) => total[y] - total[x])) console.log(`| ${sim.characters[a].name} | ${Math.round((total[a] / per) * 100)}% (${total[a]}/${per}) |`);
console.log(`\n| Wins of row vs column | ${roster.map((r) => sim.characters[r].name).join(' | ')} |`);
console.log(`|---|${roster.map(() => '---').join('|')}|`);
for (const a of roster) console.log(`| ${sim.characters[a].name} | ${roster.map((b) => (a === b ? '—' : `${wins[a][b]}/${N * 2}`)).join(' | ')} |`);
