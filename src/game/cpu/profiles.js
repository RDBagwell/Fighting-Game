/**
 * How the CPU plays each character: its preferred distance, its anti-air,
 * its punishes, and its neutral options by distance (pixels between the
 * fighters), as input scripts in numpad notation. The CPU (Cpu.js) chooses
 * among them with its difficulty's probabilities; the moves themselves
 * are the same data and rules a player uses.
 *
 * @typedef {object} NeutralOption
 * @property {number} min
 * @property {number} max
 * @property {string} input
 * @property {number} weight
 * @property {boolean} [meter]  Only with a full meter.
 * @property {boolean} [noProjectile]  Only when its last projectile is gone.
 *
 * @typedef {object} Profile
 * @property {number} preferred
 * @property {string} antiAir
 * @property {string} comboEnder
 * @property {string} superInput
 * @property {Array<{ move: string, input: string, super?: boolean }>} punishes  Best first.
 * @property {NeutralOption[]} neutral
 */

/** @type {Record<string, Profile>} */
export const PROFILES = {
  mack: {
    preferred: 85,
    antiAir: '6 2 3+M',
    comboEnder: '2 3 6+M',
    superInput: '2 3 6 2 3 6+H',
    punishes: [
      { move: '5H', input: '5+H', super: true },
      { move: '236H', input: '2 3 6+H' },
      { move: '5M', input: '5+M' },
      { move: '2L', input: '2+L' },
    ],
    neutral: [
      { min: 0, max: 55, input: '5+LM', weight: 2 },
      { min: 0, max: 70, input: '2+L', weight: 2 },
      { min: 0, max: 75, input: '5+L 5*6 5+L', weight: 2 },
      { min: 30, max: 90, input: '6+M', weight: 1 },
      { min: 50, max: 105, input: '2+M', weight: 3 },
      { min: 50, max: 100, input: '5+M', weight: 2 },
      { min: 80, max: 150, input: '2 3 6+M', weight: 2 },
      { min: 120, max: 300, input: '6 5 6', weight: 3 },
      { min: 120, max: 210, input: '9 5*24 5+H', weight: 1 },
      { min: 0, max: 120, input: '2 3 6 2 3 6+H', weight: 1, meter: true },
    ],
  },
  kenji: {
    preferred: 135,
    antiAir: '2+H',
    comboEnder: '2 3 6+L',
    superInput: '2 3 6 2 3 6+H',
    punishes: [
      { move: '5H', input: '5+H', super: true },
      { move: '5M', input: '5+M' },
      { move: '2M', input: '2+M' },
      { move: '5L', input: '5+L' },
    ],
    neutral: [
      { min: 0, max: 55, input: '5+LM', weight: 2 },
      { min: 0, max: 75, input: '2+L', weight: 1 },
      { min: 40, max: 110, input: '6+M', weight: 1 },
      { min: 80, max: 145, input: '5+M', weight: 3 },
      { min: 80, max: 135, input: '2+M', weight: 3 },
      { min: 70, max: 130, input: '5+H', weight: 1 },
      { min: 170, max: 900, input: '2 3 6+M', weight: 4, noProjectile: true },
      { min: 220, max: 900, input: '2 3 6+L', weight: 2, noProjectile: true },
      { min: 140, max: 260, input: '1*42 6+M', weight: 1 },
      { min: 130, max: 210, input: '9 5*22 5+H', weight: 1 },
      { min: 150, max: 600, input: '2 3 6 2 3 6+H', weight: 1, meter: true, noProjectile: true },
    ],
  },
  deka: {
    preferred: 90,
    antiAir: '6 2 3+M',
    comboEnder: '2 3 6+M',
    superInput: '2 3 6 2 3 6+H',
    punishes: [
      { move: '5H', input: '5+H', super: true },
      { move: '236H', input: '2 3 6+H' },
      { move: '5M', input: '5+M' },
      { move: '2L', input: '2+L' },
    ],
    neutral: [
      { min: 0, max: 55, input: '5+LM', weight: 2 },
      { min: 0, max: 70, input: '2+L', weight: 2 },
      { min: 30, max: 90, input: '6+M', weight: 2 },
      { min: 50, max: 105, input: '2+M', weight: 3 },
      { min: 50, max: 100, input: '5+M', weight: 2 },
      { min: 60, max: 110, input: '5+H', weight: 1 },
      { min: 80, max: 150, input: '2 3 6+M', weight: 2 },
      { min: 120, max: 300, input: '6 5 6', weight: 3 },
      { min: 120, max: 210, input: '9 5*24 5+H', weight: 1 },
      { min: 0, max: 120, input: '2 3 6 2 3 6+H', weight: 1, meter: true },
    ],
  },
  elumlur: {
    preferred: 100,
    antiAir: '6 2 3+M',
    comboEnder: '2 3 6+M',
    superInput: '2 3 6 2 3 6+H',
    punishes: [
      { move: '5H', input: '5+H', super: true },
      { move: '5M', input: '5+M' },
      { move: '2M', input: '2+M' },
      { move: '5L', input: '5+L' },
    ],
    neutral: [
      { min: 0, max: 55, input: '5+LM', weight: 2 },
      { min: 0, max: 70, input: '2+L', weight: 1 },
      { min: 40, max: 105, input: '6+M', weight: 1 },
      { min: 70, max: 115, input: '5+M', weight: 3 },
      { min: 70, max: 110, input: '2+M', weight: 3 },
      { min: 60, max: 110, input: '5+H', weight: 1 },
      { min: 160, max: 900, input: '2 3 6+M', weight: 3, noProjectile: true },
      { min: 220, max: 900, input: '2 3 6+L', weight: 2, noProjectile: true },
      { min: 130, max: 210, input: '9 5*22 5+H', weight: 1 },
      { min: 0, max: 140, input: '2 3 6 2 3 6+H', weight: 1, meter: true },
    ],
  },
  mav: {
    preferred: 95,
    antiAir: '2+H',
    comboEnder: '2 3 6+M',
    superInput: '2 3 6 2 3 6+H',
    punishes: [
      { move: '5H', input: '5+H', super: true },
      { move: '214H', input: '2 1 4+H' },
      { move: '5M', input: '5+M' },
      { move: '2L', input: '2+L' },
    ],
    neutral: [
      { min: 0, max: 55, input: '2 1 4+M', weight: 2 },
      { min: 0, max: 50, input: '5+LM', weight: 1 },
      { min: 0, max: 75, input: '2+L', weight: 1 },
      { min: 40, max: 100, input: '6+M', weight: 1 },
      { min: 60, max: 115, input: '5+M', weight: 3 },
      { min: 60, max: 115, input: '2+M', weight: 3 },
      { min: 70, max: 125, input: '5+H', weight: 2 },
      { min: 90, max: 160, input: '2 3 6+M', weight: 2 },
      { min: 130, max: 300, input: '6 5 6', weight: 2 },
      { min: 0, max: 120, input: '2 3 6 2 3 6+H', weight: 1, meter: true },
    ],
  },
  reroe: {
    preferred: 112,
    antiAir: '2+H',
    comboEnder: '2 3 6+M',
    superInput: '2 3 6 2 3 6+H',
    punishes: [
      { move: '5H', input: '5+H', super: true },
      { move: '5M', input: '5+M' },
      { move: '2M', input: '2+M' },
      { move: '5L', input: '5+L' },
    ],
    neutral: [
      { min: 0, max: 55, input: '5+LM', weight: 1 },
      { min: 0, max: 80, input: '2 1 4+M', weight: 3 },
      { min: 0, max: 85, input: '2+L', weight: 1 },
      { min: 40, max: 110, input: '6+M', weight: 1 },
      { min: 80, max: 125, input: '5+M', weight: 3 },
      { min: 80, max: 125, input: '2+M', weight: 3 },
      { min: 70, max: 120, input: '5+H', weight: 1 },
      { min: 170, max: 900, input: '2 3 6+M', weight: 4, noProjectile: true },
      { min: 230, max: 900, input: '2 3 6+L', weight: 2, noProjectile: true },
      { min: 150, max: 600, input: '2 3 6 2 3 6+H', weight: 1, meter: true, noProjectile: true },
    ],
  },
};
