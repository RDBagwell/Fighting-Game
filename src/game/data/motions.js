/**
 * Motion inputs, in numpad notation relative to facing (6 = forward):
 *
 *   7 8 9
 *   4 5 6      236 = down, down-forward, forward ("quarter-circle forward")
 *   1 2 3      623 = forward, down, down-forward ("dragon punch")
 *
 * Each step lists the directions that satisfy it. `window` is the leniency:
 * the whole motion plus the button must fit in that many frames. Reading
 * back from the button press, the parser looks for the last step, then the
 * one before it, and so on (src/engine/sim/motion.js).
 *
 * @type {Record<string, import('../../engine/sim/types.js').MotionData>}
 */
export const motions = {
  qcf: { name: '236', steps: ['2', '3', '6'], window: 14 },
  qcb: { name: '214', steps: ['2', '1', '4'], window: 14 },
  dp: { name: '623', steps: ['6', '2', '3'], window: 14 },
  qcf2: { name: '236236', steps: ['2', '3', '6', '2', '3', '6'], window: 30 },
  // Charge: hold back (1, 4 or 7) for 40 frames, then forward and a button within 10.
  chargeBF: { name: '[4]6', charge: '147', chargeFrames: 40, steps: ['69'], window: 10 },
  // Dashes: tap forward (or back) twice, through neutral, within 12 frames.
  dashForward: { name: '66', steps: ['6', '5', '6'], window: 12 },
  dashBack: { name: '44', steps: ['4', '5', '4'], window: 12 },
};
