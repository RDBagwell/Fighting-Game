/**
 * Player settings, kept in localStorage. Everything read back is
 * validated (unknown keys dropped, wrong types replaced by defaults), so
 * a broken or old save can't break the game. If storage is unavailable
 * (private mode, blocked), the defaults simply apply for the session.
 */
import { DEFAULT_KEYS, DEFAULT_PAD, sanitiseBinding } from '../engine/input/bindings.js';

const KEY = 'dusk-duel-settings-v1';

/**
 * @typedef {object} Settings
 * @property {number} volume  0..1
 * @property {boolean} muted
 * @property {boolean} reducedMotion  No screen shake, flashes or petals.
 * @property {'auto'|'on'|'off'} touch  Touch controls ("auto": on touch screens).
 * @property {boolean} easySpecials  Show the Special button on touch controls.
 * @property {boolean} swapPads  Versus: player 1 uses the second gamepad.
 * @property {'easy'|'normal'|'hard'} cpu
 * @property {{ boxes: boolean, frameMeter: boolean, inputs: boolean, frameData: boolean }} training
 * @property {{ kbA: import('../engine/input/bindings.js').KeyBinding, kbB: import('../engine/input/bindings.js').KeyBinding, pad: import('../engine/input/bindings.js').PadBinding }} controls
 */

/** @returns {Settings} */
export function defaultSettings() {
  const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    volume: 0.7,
    muted: false,
    reducedMotion: prefersReduced,
    touch: 'auto',
    easySpecials: true,
    swapPads: false,
    cpu: 'normal',
    training: { boxes: true, frameMeter: true, inputs: true, frameData: true },
    controls: { kbA: structuredClone(DEFAULT_KEYS.kbA), kbB: structuredClone(DEFAULT_KEYS.kbB), pad: structuredClone(DEFAULT_PAD) },
  };
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
export function sanitiseSettings(raw) {
  const d = defaultSettings();
  const src = raw && typeof raw === 'object' ? /** @type {Record<string, any>} */ (raw) : {};
  const bool = (/** @type {unknown} */ v, /** @type {boolean} */ def) => (typeof v === 'boolean' ? v : def);
  const training = src.training && typeof src.training === 'object' ? src.training : {};
  const controls = src.controls && typeof src.controls === 'object' ? src.controls : {};
  return {
    volume: typeof src.volume === 'number' && src.volume >= 0 && src.volume <= 1 ? src.volume : d.volume,
    muted: bool(src.muted, d.muted),
    reducedMotion: bool(src.reducedMotion, d.reducedMotion),
    touch: ['auto', 'on', 'off'].includes(src.touch) ? src.touch : d.touch,
    easySpecials: bool(src.easySpecials, d.easySpecials),
    swapPads: bool(src.swapPads, d.swapPads),
    cpu: ['easy', 'normal', 'hard'].includes(src.cpu) ? src.cpu : d.cpu,
    training: {
      boxes: bool(training.boxes, d.training.boxes),
      frameMeter: bool(training.frameMeter, d.training.frameMeter),
      inputs: bool(training.inputs, d.training.inputs),
      frameData: bool(training.frameData, d.training.frameData),
    },
    controls: {
      kbA: sanitiseBinding(controls.kbA, DEFAULT_KEYS.kbA),
      kbB: sanitiseBinding(controls.kbB, DEFAULT_KEYS.kbB),
      pad: sanitiseBinding(controls.pad, DEFAULT_PAD),
    },
  };
}

/** @returns {Settings} */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitiseSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultSettings();
  }
}

/** @param {Settings} settings */
export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings last for this visit only.
  }
}
