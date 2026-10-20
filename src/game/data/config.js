/**
 * The rules every character shares. Pixels unless a comment says
 * subpixels (1/256 px, see src/engine/sim/fixed.js); time in frames
 * (1/60 s). docs/FRAME-DATA.md explains why each exists.
 */
import { px } from '../../engine/sim/fixed.js';

/** @type {import('../../engine/sim/state.js').SimConfig} */
export const config = {
  // The stage is wider than the 640-pixel screen; the camera follows.
  stage: { width: 1024, wall: 20, maxSeparation: 560, start: 110 },
  roundsToWin: 2,
  roundFrames: 99 * 60,
  introFrames: 110,
  koFrames: 180,
  timeoutFrames: 150,

  gravity: px(0.5), // subpixels/frame²
  jumpSquat: 4, // grounded frames before leaving the ground
  landRecovery: 4, // frames (including the landing frame) before acting after a jump

  knockdownFrames: 26,
  wakeupFrames: 18, // invulnerable while getting up
  throwProtect: 6, // frames after hitstun, blockstun or wake-up in which you can't be thrown

  techWindow: 10, // frames after a throw connects in which pressing throw escapes it
  techRecoil: 18,
  techPush: 36,

  buffer: 4, // a button press counts for this many frames after it happens
  historyLength: 40, // input frames kept per fighter (longest motion window + buffer)
  chargeGrace: 8, // a charge survives this long after letting go

  juggleLimit: 3, // hits on an airborne opponent per combo (the launcher counts)
  scaling: [100, 100, 80, 70, 60, 50, 40, 30, 20], // % damage by hit number in a combo
  easyScale: 80, // % damage for specials done with the easy-specials button

  meterMax: 1000,
  meterGain: { hit: 60, block: 30, taken: 40 }, // % of damage dealt/blocked/taken
  superFreeze: 40,

  pushStep: 3, // pushback slides at most this many pixels a frame
  airReset: [px(1.5), px(-4)], // knock-away of a normal hit on an airborne fighter (subpixels/frame)
  proximityGuard: 170,
  refillDelay: 60, // training: frames after a combo before health refills
};
