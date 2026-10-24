/**
 * One abstraction over keyboard, gamepads and touch, for two local players.
 *
 * Each player has a list of devices ('kbA', 'kbB', 'pad0', 'pad1',
 * 'touch'). Once per simulation frame, `sample(devices)` reads them and ORs
 * them into the input byte (bits.js). That byte is the only thing the
 * simulation (and, in session 2, the network) ever sees.
 *
 * Gamepads use the browser's "standard" mapping; `pad0` is the first
 * connected pad, `pad1` the second, whatever their raw indices. The left
 * stick counts as the d-pad past half deflection, in eight directions.
 *
 * Menus are separate: `menuPresses()` returns gamepad buttons newly pressed
 * since the last call (keyboard menus use normal DOM focus and keys).
 */
import { cleanInput, UP, DOWN, LEFT, RIGHT } from './bits.js';
import { ACTIONS, ACTION_BITS, DEFAULT_KEYS, DEFAULT_PAD, PAD_START, PAD_SELECT } from './bindings.js';

/** @typedef {'kbA'|'kbB'|'pad0'|'pad1'|'touch'} Device */
/** @typedef {'up'|'down'|'left'|'right'|'confirm'|'back'|'pause'|'select'} MenuAction */

const STICK_DEADZONE = 0.5;

export class InputManager {
  /**
   * @param {Window} win
   */
  constructor(win) {
    this.win = win;
    /** Physical keys held, by KeyboardEvent.code. */
    this.keys = new Set();
    /**
     * Keys pressed since the last frame was sampled. A tap shorter than a
     * frame (down and up between two samples) still counts as held for one
     * frame, so no press is ever lost.
     */
    this.latched = new Set();
    this.bindings = {
      kbA: structuredClone(DEFAULT_KEYS.kbA),
      kbB: structuredClone(DEFAULT_KEYS.kbB),
      pad: structuredClone(DEFAULT_PAD),
    };
    /** @type {Gamepad[]} Connected pads, in connection order. */
    this.pads = [];
    /** @type {{ bits: number, latched: number } | null} */
    this.touch = null;
    /** Buttons held on each pad at the last menuPresses() call. */
    this.prevMenu = [0, 0, 0, 0];
    /** @type {((code: string) => void) | null} A rebinding waiting for a key. */
    this.capture = null;
    /** The last kind of device used, for showing the right prompts. */
    this.lastDevice = /** @type {'keyboard'|'gamepad'|'touch'} */ ('keyboard');

    this.onKeyDown = (/** @type {KeyboardEvent} */ e) => {
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(e.code);
        return;
      }
      this.keys.add(e.code);
      this.latched.add(e.code);
      this.lastDevice = 'keyboard';
      // Arrow keys and space would scroll the page.
      if (e.code.startsWith('Arrow') || e.code === 'Space') {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (!target || !['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) e.preventDefault();
      }
    };
    this.onKeyUp = (/** @type {KeyboardEvent} */ e) => this.keys.delete(e.code);
    // Keys held when the window loses focus never get their keyup.
    this.onBlur = () => this.keys.clear();
    win.addEventListener('keydown', this.onKeyDown);
    win.addEventListener('keyup', this.onKeyUp);
    win.addEventListener('blur', this.onBlur);
  }

  destroy() {
    this.win.removeEventListener('keydown', this.onKeyDown);
    this.win.removeEventListener('keyup', this.onKeyUp);
    this.win.removeEventListener('blur', this.onBlur);
  }

  /** Reads the gamepads once per animation frame. */
  poll() {
    const nav = this.win.navigator;
    const list = typeof nav.getGamepads === 'function' ? nav.getGamepads() : [];
    this.pads = /** @type {Gamepad[]} */ (Array.from(list ?? []).filter((p) => p && p.connected));
    for (const p of this.pads) if (p.buttons.some((b) => b.pressed)) this.lastDevice = 'gamepad';
  }

  /** @param {number} n */
  pad(n) {
    return this.pads[n] ?? null;
  }

  /**
   * @param {Device} device
   * @returns {number}
   */
  deviceBits(device) {
    if (device === 'kbA' || device === 'kbB') {
      const binding = this.bindings[device];
      let bits = 0;
      for (const action of ACTIONS) {
        for (const code of binding[action]) if (this.keys.has(code) || this.latched.has(code)) bits |= ACTION_BITS[action];
      }
      return bits;
    }
    if (device === 'touch') {
      const bits = this.touch ? this.touch.bits | this.touch.latched : 0;
      if (bits) this.lastDevice = 'touch';
      return bits;
    }
    const pad = this.pad(device === 'pad0' ? 0 : 1);
    if (!pad) return 0;
    let bits = 0;
    for (const action of ACTIONS) {
      for (const index of this.bindings.pad[action]) if (pad.buttons[index]?.pressed) bits |= ACTION_BITS[action];
    }
    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    if (Math.hypot(x, y) > STICK_DEADZONE) {
      // Eight directions: each axis counts once it's past ~22.5° of the other.
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      if (ax > ay * 0.414) bits |= x < 0 ? LEFT : RIGHT;
      if (ay > ax * 0.414) bits |= y < 0 ? UP : DOWN;
    }
    return bits;
  }

  /**
   * One frame of input for a player: every device they use, ORed and
   * cleaned (left+right = neutral, up+down = up).
   * @param {Device[]} devices
   */
  sample(devices) {
    let bits = 0;
    for (const d of devices) bits |= this.deviceBits(d);
    return cleanInput(bits);
  }

  /** Call once per frame after sampling every player: forgets this frame's taps. */
  endFrame() {
    this.latched.clear();
    if (this.touch) this.touch.latched = 0;
  }

  /**
   * Gamepad menu buttons pressed since the last call, per pad.
   * @returns {Array<{ pad: number, action: MenuAction }>}
   */
  menuPresses() {
    /** @type {Array<{ pad: number, action: MenuAction }>} */
    const out = [];
    this.pads.forEach((pad, n) => {
      let held = 0;
      const b = (/** @type {number} */ i) => !!pad.buttons[i]?.pressed;
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      if (b(12) || y < -0.6) held |= 1;
      if (b(13) || y > 0.6) held |= 2;
      if (b(14) || x < -0.6) held |= 4;
      if (b(15) || x > 0.6) held |= 8;
      if (b(0)) held |= 16;
      if (b(1)) held |= 32;
      if (b(PAD_START)) held |= 64;
      if (b(PAD_SELECT)) held |= 128;
      const pressed = held & ~(this.prevMenu[n] ?? 0);
      this.prevMenu[n] = held;
      /** @type {MenuAction[]} */
      const names = ['up', 'down', 'left', 'right', 'confirm', 'back', 'pause', 'select'];
      names.forEach((name, i) => {
        if (pressed & (1 << i)) out.push({ pad: n, action: name });
      });
    });
    return out;
  }

  /**
   * Waits for the next key press (for rebinding). Escape cancels.
   * @returns {Promise<string | null>}
   */
  captureKey() {
    return new Promise((resolve) => {
      this.capture = (code) => resolve(code === 'Escape' ? null : code);
    });
  }

  /**
   * Waits for the next gamepad button (for rebinding); polled by the caller's
   * animation frame via poll(). Start cancels.
   * @param {number} padIndex
   * @param {() => boolean} [cancelled]
   * @returns {Promise<number | null>}
   */
  capturePadButton(padIndex, cancelled = () => false) {
    return new Promise((resolve) => {
      const before = (this.pad(padIndex)?.buttons ?? []).map((b) => b.pressed);
      const check = () => {
        if (cancelled()) return resolve(null);
        this.poll();
        const pad = this.pad(padIndex);
        if (pad) {
          const i = pad.buttons.findIndex((b, k) => b.pressed && !before[k]);
          if (i === PAD_START) return resolve(null);
          if (i >= 0) return resolve(i);
          pad.buttons.forEach((b, k) => (before[k] = b.pressed && before[k]));
        }
        this.win.requestAnimationFrame(check);
      };
      this.win.requestAnimationFrame(check);
    });
  }
}
