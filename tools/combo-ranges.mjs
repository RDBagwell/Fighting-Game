/**
 * Which normal-into-special cancels really combo, and from how far: each
 * character's cancellable normals into each of its specials, at distances
 * from 40 to 200 pixels, against an opponent who holds down-back as soon
 * as the normal hits (so anything that isn't a true combo gets blocked).
 * The cancel is tried at every timing and the best kept.
 *
 *   node tools/combo-ranges.mjs [character]
 *
 * The CPU profiles' comboEnders (src/game/cpu/profiles.js) are set from
 * this: past the distance where a special stops combining, the CPU doesn't
 * cancel into it.
 */
import { sim, setup, script, bits, inputFor } from '../tests/helpers/harness.js';

const FROM = 40;
const TO = 200;
const STEP = 10;
const chars = process.argv[2] ? [process.argv[2]] : Object.keys(sim.characters);

/**
 * 'H' combo, 'b' blocked, '·' the special missed, ' ' the normal itself missed.
 * @param {string} char
 * @param {string} opener
 * @param {string} ender
 * @param {number} distance
 */
function tryCancel(char, opener, ender, distance) {
  const moves = sim.characters[char].moves;
  let best = '·';
  for (let wait = 1; wait <= 14 && best !== 'H'; wait++) {
    const s = setup({ chars: [char, 'mack'], x: [400, 400 + distance] });
    const p1 = [...script(inputFor(moves[opener]), 1), ...Array(wait).fill(0), ...script(inputFor(moves[ender]), 1), ...Array(90).fill(0)];
    let openerHit = false;
    /** @type {string | null} */
    let result = null;
    for (const input of p1) {
      sim.step(s, [input, openerHit ? bits('1', -1) : 0]);
      for (const e of s.events) {
        if (e.side !== 0) continue;
        if (e.move === opener && e.type === 'hit') openerHit = true;
        if (e.move === ender && (e.type === 'hit' || e.type === 'block') && result === null) result = e.type;
      }
    }
    if (!openerHit) return ' ';
    if (result === 'hit') best = 'H';
    else if (result === 'block') best = 'b';
  }
  return best;
}

for (const char of chars) {
  const moves = sim.characters[char].moves;
  const enders = Object.keys(moves).filter((id) => moves[id].kind === 'special' && moves[id].motion !== 'chargeBF' && moves[id].motion !== 'dp');
  console.log(`\n${sim.characters[char].name}: distance ${FROM} to ${TO} in steps of ${STEP}. H combo, b blocked, · missed, blank: the normal misses`);
  for (const opener of ['5L', '2L', '5M', '2M', '5H']) {
    if (!moves[opener]?.cancel) continue;
    for (const ender of enders) {
      let row = '';
      for (let d = FROM; d <= TO; d += STEP) row += tryCancel(char, opener, ender, d);
      console.log(`${`${opener} > ${ender}`.padEnd(12)} ${row}`);
    }
  }
}
