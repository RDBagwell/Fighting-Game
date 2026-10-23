/**
 * Arcade mode's story: each character's rival (the sixth and last fight of
 * the ladder), the line shown before that fight, and a short ending of
 * captioned panels. Plain text, so anyone can rewrite it: tests check
 * that every character has an ending and a rival from the roster.
 *
 * @typedef {object} EndingPanel
 * @property {string} text
 * @property {string[]} cast  Who stands on stage: one character (centred) or two (facing each other).
 * @property {'dusk'|'night'|'dawn'} [light]  The panel's light (default dusk).
 *
 * @typedef {object} ArcadeStory
 * @property {string} rival
 * @property {string} rivalIntro  Shown on the VS screen before the rival fight.
 * @property {EndingPanel[]} ending
 */

/** @type {Record<string, ArcadeStory>} */
export const ARCADE = {
  mack: {
    rival: 'kenji',
    rivalIntro: 'Kenji is waiting at the shrine. He’s always waiting.',
    ending: [
      { cast: ['mack', 'kenji'], text: 'Kenji lowers his blade. “You’ve never waited for anything in your life, have you?”' },
      { cast: ['mack', 'kenji'], text: '“Waiting is how you lose,” says Mack. But for once he doesn’t run off to the next fight.' },
      { cast: ['mack', 'kenji'], light: 'night', text: 'They sit on the shrine steps long after dark, arguing about patience.' },
      { cast: ['kenji'], light: 'dawn', text: 'At dawn Mack is gone. A note on the steps says only: “Rematch. Soon.”' },
    ],
  },
  kenji: {
    rival: 'mack',
    rivalIntro: 'Mack is already running at you. He never could wait.',
    ending: [
      { cast: ['kenji', 'mack'], text: 'Mack charges one last time. Kenji waits, and waits, and then is already past him.' },
      { cast: ['kenji', 'mack'], text: '“How do you always know?” Mack asks from the ground. “You always tell me,” says Kenji.' },
      { cast: ['kenji'], light: 'night', text: 'Kenji goes back to training alone in the courtyard, as he has for twenty years.' },
      { cast: ['kenji', 'mack'], light: 'dawn', text: 'The next morning, there are two sets of footprints in the courtyard.' },
    ],
  },
  deka: {
    rival: 'mav',
    rivalIntro: 'The Iron King himself has come to see who hits harder.',
    ending: [
      { cast: ['deka', 'mav'], text: 'The Iron King’s guard breaks on the last crescent. The crowd goes silent.' },
      { cast: ['deka', 'mav'], text: '“Name your reward,” says Mav. Deka asks for the one thing a king can’t give: a harder fight.' },
      { cast: ['deka', 'mav'], light: 'night', text: 'Mav laughs until the torii shakes, and offers him command of the royal guard instead.' },
      { cast: ['deka'], light: 'dawn', text: 'Deka turns it down. Somewhere, someone still hits harder than he does. He means to find them.' },
    ],
  },
  elumlur: {
    rival: 'reroe',
    rivalIntro: 'The huntress who has followed you for three provinces steps out of the trees.',
    ending: [
      { cast: ['elumlur', 'reroe'], text: 'Reroe’s last spear goes wide as lightning splits the sky over the shrine.' },
      { cast: ['elumlur', 'reroe'], text: '“You’ve tracked me for three provinces,” says Elumlur. “Why?”' },
      { cast: ['elumlur', 'reroe'], light: 'night', text: '“The storm follows you,” she says. “I wanted to see what it was following.”' },
      { cast: ['elumlur'], light: 'dawn', text: 'By morning the sky is clear. For the first time in years, Elumlur stays somewhere a second day.' },
    ],
  },
  mav: {
    rival: 'deka',
    rivalIntro: 'Deka has come to the palace gates. He says he hits harder than any king.',
    ending: [
      { cast: ['mav', 'deka'], text: 'Deka swings with everything he has. Mav takes it, and doesn’t fall.' },
      { cast: ['mav', 'deka'], text: '“A king who can’t take a hit,” says Mav, “has no business wearing the crown.”' },
      { cast: ['mav', 'deka'], light: 'night', text: 'He offers Deka a place at his court. To everyone’s surprise, Deka accepts.' },
      { cast: ['mav', 'deka'], light: 'dawn', text: 'The kingdom has never been safer. Its sparring yard has never been louder.' },
    ],
  },
  reroe: {
    rival: 'kenji',
    rivalIntro: 'Kenji’s blade reaches further than any spear. He’s the one prey she hasn’t caught.',
    ending: [
      { cast: ['reroe', 'kenji'], text: 'Kenji’s blade reaches further than any spear she has faced. This time, it isn’t enough.' },
      { cast: ['reroe', 'kenji'], text: '“Most people run when they see me coming,” says Reroe. “You waited.”' },
      { cast: ['reroe', 'kenji'], light: 'night', text: '“Patience is a kind of hunting too,” says Kenji, and bows.' },
      { cast: ['reroe'], light: 'dawn', text: 'She leaves the shrine at first light, already tracking the next challenge into the hills.' },
    ],
  },
};
