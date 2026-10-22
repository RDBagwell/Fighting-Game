/**
 * Combo trials: short combos to learn each character, easiest first.
 *
 * Each trial is the list of moves that must hit, in order, as one combo
 * (the opponent never gets out of hitstun between them), and a `demo`:
 * the inputs that do it, in numpad notation (src/engine/input/script.js),
 * which the Demonstrate button plays. tests/trials.test.js plays every
 * demo through the real simulation and checks it completes the trial, so
 * a balance change that breaks a trial fails the tests.
 *
 * @typedef {object} Trial
 * @property {string} id
 * @property {string} name
 * @property {string[]} steps  Move ids, in order.
 * @property {string} demo  Inputs that complete it, starting from the trial's start position.
 * @property {string} tip  One or two sentences on what to do and why it works.
 * @property {Record<number, string>} [stepNotes]  Extra advice for a step, by index.
 * @property {boolean} [meter]  Starts with a full super meter.
 */

/** Pixels between the fighters when a trial (re)starts: close enough for every first hit. */
export const TRIAL_GAP = 50;

/** @type {Record<string, Trial[]>} */
export const TRIALS = {
  mack: [
    {
      id: 'mack-1', name: 'Cancel into a special', steps: ['5M', '236M'],
      demo: '5+M 5*9 2 3 6+M 5*40',
      tip: 'Press Medium, and while it hits, do Shippū. A special can interrupt (cancel) a normal the moment it connects, so the two hits join into a combo.',
    },
    {
      id: 'mack-2', name: 'From a low', steps: ['2M', '236L'],
      demo: '2+M 5*9 2 3 6+L 5*40',
      tip: 'The same cancel from a crouching Medium, which hits low. Roll from down straight into the motion: you are already holding down.',
    },
    {
      id: 'mack-3', name: 'Chain lights', steps: ['2L', '5L', '236M'],
      demo: '2+L 5*4 5+L 5*9 2 3 6+M 5*40',
      tip: 'Lights chain into each other (a light can cancel into another light), then cancel the second one into Shippū.',
    },
    {
      id: 'mack-4', name: 'Heavy confirm', steps: ['5H', '236H'],
      demo: '5+H 5*13 2 3 6+H 5*40',
      tip: 'Heavy is slow to come out but cancels like any normal. Start the motion as soon as the Heavy connects.',
    },
    {
      id: 'mack-5', name: 'Rising finish', steps: ['2H', '623M'],
      demo: '2+H 5*10 6 2 3+M 5*60',
      tip: 'Crouching Heavy launches, and only cancels on hit. Finish with Tenkū: forward, down, down-forward and Medium.',
    },
    {
      id: 'mack-6', name: 'Super finish', steps: ['5M', '236M', '236236H'], meter: true,
      demo: '5+M 5*9 2 3 6+M 5*10 2 3 6 2 3 6+H 5*80',
      tip: 'Shippū can itself be cancelled into the super when it hits. Your meter is full for this trial.',
    },
  ],
  kenji: [
    {
      id: 'kenji-1', name: 'Cancel into a kunai', steps: ['5M', '236M'],
      demo: '5+M 5*12 2 3 6+M 5*60',
      tip: 'Press Medium, and while it hits, throw a kunai. Up close, the kunai hits before the opponent recovers.',
    },
    {
      id: 'kenji-2', name: 'Two lights', steps: ['5L', '5L', '236L'],
      demo: '5+L 5*5 5+L 5*10 2 3 6+L 5*60',
      tip: 'Lights chain into each other; cancel the second into a light kunai.',
    },
    {
      id: 'kenji-3', name: 'Low lights', steps: ['2L', '2L', '236M'],
      demo: '2+L 5*5 2+L 5*10 2 3 6+M 5*60',
      tip: 'The same from crouching: two low lights, then roll from down into the kunai motion.',
    },
    {
      id: 'kenji-4', name: 'Rising Moon', steps: ['2H', '236H'],
      demo: '2+H 5*10 2 3 6+H 5*60',
      tip: 'Crouching Heavy, then a heavy kunai. Crouching Heavy only cancels when it hits.',
    },
    {
      id: 'kenji-5', name: 'The charge combo', steps: ['5M', '46M'],
      demo: '4*40 4+M 4*12 6+M 5*60',
      stepNotes: { 0: 'Hold back for ⅔ of a second first, and keep holding it while you press Medium.' },
      tip: 'Iai Rush needs back held first. Hold back, press Medium without letting go of back, then press forward and Medium as it hits.',
    },
    {
      id: 'kenji-6', name: 'Super finish', steps: ['5M', '46M', '236236H'], meter: true,
      demo: '4*40 4+M 4*12 6+M 5*10 2 3 6 2 3 6+H 5*80',
      stepNotes: { 0: 'Hold back first, and keep holding it while you press Medium.' },
      tip: 'The charge combo, then cancel Iai Rush into the super as it hits. Your meter is full for this trial.',
    },
  ],
  deka: [
    {
      id: 'deka-1', name: 'Cancel into a rush', steps: ['5M', '236M'],
      demo: '5+M 5*12 2 3 6+M 5*80',
      tip: 'Press Medium, and while it hits, do Crescent Rush. The rush carries Deka forward, so it reaches even if Medium pushed them back.',
    },
    {
      id: 'deka-2', name: 'From a low', steps: ['2M', '236L'],
      demo: '2+M 5*11 2 3 6+L 5*80',
      tip: 'The same cancel from a crouching Medium, which hits low. Roll from down straight into the motion: you are already holding down.',
    },
    {
      id: 'deka-3', name: 'Chain lights', steps: ['2L', '5L', '236M'],
      demo: '2+L 5*9 5+L 5*9 2 3 6+M 5*80',
      tip: 'Lights chain into each other, then cancel the second one into Crescent Rush.',
    },
    {
      id: 'deka-4', name: 'Heavy confirm', steps: ['5H', '236H'],
      demo: '5+H 5*15 2 3 6+H 5*80',
      tip: 'Heavy is slow but cancels like any normal. Start the motion as soon as it connects.',
    },
    {
      id: 'deka-5', name: 'Rising finish', steps: ['2H', '623M'],
      demo: '2+H 5*13 6 2 3+M 5*80',
      tip: 'Crouching Heavy launches, and only cancels on hit. Finish with Rising Crescent: forward, down, down-forward and Medium.',
    },
    {
      id: 'deka-6', name: 'Super finish', steps: ['5M', '236M', '236236H'], meter: true,
      demo: '5+M 5*12 2 3 6+M 5*16 2 3 6 2 3 6+H 5*80',
      tip: 'Crescent Rush can be cancelled into the super when it hits. Your meter is full for this trial.',
    },
  ],
  elumlur: [
    {
      id: 'elumlur-1', name: 'Cancel into a wave', steps: ['5M', '236M'],
      demo: '5+M 5*11 2 3 6+M 5*80',
      tip: 'Press Medium, and while it hits, throw a Storm Wave. Up close the wave hits before the opponent recovers.',
    },
    {
      id: 'elumlur-2', name: 'From a low', steps: ['2M', '236H'],
      demo: '2+M 5*10 2 3 6+H 5*80',
      tip: 'Crouching Medium hits low and reaches far. Cancel it into the fast Heavy wave.',
    },
    {
      id: 'elumlur-3', name: 'Chain lights', steps: ['2L', '5L', '236M'],
      demo: '2+L 5*8 5+L 5*8 2 3 6+M 5*80',
      tip: 'Lights chain into each other, then cancel the second one into Storm Wave.',
    },
    {
      id: 'elumlur-4', name: 'Heavy confirm', steps: ['5H', '236H'],
      demo: '5+H 5*14 2 3 6+H 5*80',
      tip: 'The wide Heavy slash cancels like any normal. Start the motion as soon as it connects.',
    },
    {
      id: 'elumlur-5', name: 'Rising finish', steps: ['2H', '623M'],
      demo: '2+H 5*12 6 2 3+M 5*80',
      tip: 'Crouching Heavy launches, and only cancels on hit. Finish with Thunder Rise: forward, down, down-forward and Medium.',
    },
    {
      id: 'elumlur-6', name: 'Super finish', steps: ['5H', '236236H'], meter: true,
      demo: '5+H 5*13 2 3 6 2 3 6+H 5*80',
      tip: 'Cancel the Heavy straight into Storm Arc. Your meter is full for this trial.',
    },
  ],
  mav: [
    {
      id: 'mav-1', name: 'Cancel into a cleave', steps: ['5M', '236M'],
      demo: '5+M 5*13 2 3 6+M 5*80',
      tip: 'Press Medium, and while it hits, do Crown Cleave. Mav is slow, so the cancel window is later than you might expect.',
    },
    {
      id: 'mav-2', name: 'From a low', steps: ['2M', '236L'],
      demo: '2+M 5*13 2 3 6+L 5*80',
      tip: 'The same cancel from a crouching Medium, which hits low.',
    },
    {
      id: 'mav-3', name: 'Chain lights', steps: ['2L', '5L', '236M'],
      demo: '2+L 5*10 5+L 5*11 2 3 6+M 5*80',
      tip: 'Lights chain into each other, then cancel the second one into Crown Cleave.',
    },
    {
      id: 'mav-4', name: 'Heavy confirm', steps: ['5H', '236H'],
      demo: '5+H 5*16 2 3 6+H 5*80',
      tip: 'The slowest Heavy in the game, and the hardest hitting. Start the motion as soon as it connects.',
    },
    {
      id: 'mav-5', name: 'Launch and cleave', steps: ['2H', '236H'],
      demo: '2+H 5*14 2 3 6+H 5*80',
      tip: 'Crouching Heavy launches, and only cancels on hit. Catch them in the air with a heavy Crown Cleave.',
    },
    {
      id: 'mav-6', name: 'Super finish', steps: ['5M', '236M', '236236H'], meter: true,
      demo: '5+M 5*13 2 3 6+M 5*17 2 3 6 2 3 6+H 5*80',
      tip: 'Crown Cleave can be cancelled into the super when it hits. Your meter is full for this trial.',
    },
  ],
  reroe: [
    {
      id: 'reroe-1', name: 'Cancel into a spear', steps: ['5M', '236M'],
      demo: '5+M 5*11 2 3 6+M 5*80',
      tip: 'Press Medium, and while it hits, throw a Hunting Spear. Up close the spear hits before the opponent recovers.',
    },
    {
      id: 'reroe-2', name: 'Sweep away', steps: ['2M', '214M'],
      demo: '2+M 5*13 2 1 4+M 5*80',
      tip: 'Crouching Medium, then Fading Sweep: down, down-back, back and Medium. Reroe hops back as it hits, back to spear range.',
    },
    {
      id: 'reroe-3', name: 'Chain lights', steps: ['2L', '5L', '214L'],
      demo: '2+L 5*9 5+L 5*11 2 1 4+L 5*80',
      tip: 'Lights chain into each other, then cancel the second one into Fading Sweep.',
    },
    {
      id: 'reroe-4', name: 'Heavy confirm', steps: ['5H', '236H'],
      demo: '5+H 5*15 2 3 6+H 5*80',
      tip: 'The long Heavy thrust cancels like any normal; follow it with the fastest spear.',
    },
    {
      id: 'reroe-5', name: 'Launch and sweep', steps: ['2H', '214H'],
      demo: '2+H 5*12 2 1 4+H 5*80',
      tip: 'Crouching Heavy launches, and only cancels on hit. Catch them with a heavy Fading Sweep.',
    },
    {
      id: 'reroe-6', name: 'Super finish', steps: ['2M', '214M', '236236H'], meter: true,
      demo: '2+M 5*13 2 1 4+M 5*13 2 3 6 2 3 6+H 5*80',
      tip: 'Fading Sweep can be cancelled into the super when it hits. Your meter is full for this trial.',
    },
  ],
};
