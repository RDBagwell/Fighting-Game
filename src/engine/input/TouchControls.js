/**
 * Touch controls for phones: a floating stick on the left half of the
 * screen (it appears where the thumb lands) and attack buttons on the right.
 * They produce the same input byte as a keyboard or a gamepad.
 *
 * "Easy specials" adds a Special button: Special alone, or with a
 * direction, does a special move without the motion; Special + H is the
 * super (bits.js, SP). That's what makes the game playable with thumbs.
 */
import { UP, DOWN, LEFT, RIGHT, L, M, H, SP } from './bits.js';

const STICK_RADIUS = 46; // CSS pixels of thumb travel for full deflection
const DEADZONE = 14;

export class TouchControls {
  /**
   * @param {HTMLElement} parent
   * @param {object} options
   * @param {boolean} options.easy  Show the Special button.
   * @param {() => void} options.onPause
   */
  constructor(parent, { easy, onPause }) {
    this.bits = 0;
    /** Buttons pressed since the last frame (a very quick tap still counts). */
    this.latched = 0;
    this.stickBits = 0;
    this.buttonBits = 0;
    /** @type {number | null} */
    this.stickPointer = null;
    this.origin = { x: 0, y: 0 };

    const root = document.createElement('div');
    root.className = 'touch';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="touch-stick-zone"><div class="touch-stick"><div class="touch-knob"></div></div></div>
      <div class="touch-buttons">
        <button type="button" data-bits="${L}" class="tb tb-l">L</button>
        <button type="button" data-bits="${M}" class="tb tb-m">M</button>
        <button type="button" data-bits="${H}" class="tb tb-h">H</button>
        <button type="button" data-bits="${L | M}" class="tb tb-throw">Throw</button>
        <button type="button" data-bits="${SP}" class="tb tb-sp">Special</button>
      </div>
      <button type="button" class="touch-pause" aria-label="Pause">II</button>`;
    parent.appendChild(root);
    this.root = root;
    this.zone = /** @type {HTMLElement} */ (root.querySelector('.touch-stick-zone'));
    this.stick = /** @type {HTMLElement} */ (root.querySelector('.touch-stick'));
    this.knob = /** @type {HTMLElement} */ (root.querySelector('.touch-knob'));
    this.setEasy(easy);

    this.zone.addEventListener('pointerdown', (e) => {
      if (this.stickPointer !== null) return;
      e.preventDefault();
      this.stickPointer = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);
      const r = this.zone.getBoundingClientRect();
      this.origin = { x: e.clientX, y: e.clientY };
      this.stick.style.left = `${e.clientX - r.left}px`;
      this.stick.style.top = `${e.clientY - r.top}px`;
      this.stick.classList.add('active');
      this.moveStick(e.clientX, e.clientY);
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickPointer) this.moveStick(e.clientX, e.clientY);
    });
    const release = (/** @type {PointerEvent} */ e) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.stickBits = 0;
      this.stick.classList.remove('active');
      this.knob.style.transform = '';
      this.update();
    };
    this.zone.addEventListener('pointerup', release);
    this.zone.addEventListener('pointercancel', release);

    /** Buttons held, by pointer: a thumb can slide from one button to the next. */
    const held = new Map();
    root.querySelectorAll('.tb').forEach((el) => {
      const b = /** @type {HTMLElement} */ (el);
      const bit = Number(b.dataset.bits);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.releasePointerCapture?.(e.pointerId);
        held.set(e.pointerId, bit);
        b.classList.add('down');
        this.refreshButtons(held);
      });
      b.addEventListener('pointerenter', (e) => {
        if (!held.has(e.pointerId)) return;
        held.set(e.pointerId, bit);
        root.querySelectorAll('.tb').forEach((o) => o.classList.toggle('down', [...held.values()].includes(Number(/** @type {HTMLElement} */ (o).dataset.bits))));
        this.refreshButtons(held);
      });
      const up = (/** @type {PointerEvent} */ e) => {
        held.delete(e.pointerId);
        root.querySelectorAll('.tb').forEach((o) => o.classList.toggle('down', [...held.values()].includes(Number(/** @type {HTMLElement} */ (o).dataset.bits))));
        this.refreshButtons(held);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    });
    root.querySelector('.touch-pause')?.addEventListener('click', () => onPause());
  }

  /**
   * @param {Map<number, number>} held
   */
  refreshButtons(held) {
    this.buttonBits = 0;
    for (const bit of held.values()) this.buttonBits |= bit;
    this.latched |= this.buttonBits;
    this.update();
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  moveStick(x, y) {
    let dx = x - this.origin.x;
    let dy = y - this.origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > STICK_RADIUS) {
      dx = (dx / dist) * STICK_RADIUS;
      dy = (dy / dist) * STICK_RADIUS;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let bits = 0;
    if (dist > DEADZONE) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      // Eight directions; diagonals take a slightly wider wedge than on a
      // pad because thumbs are imprecise and crouch-blocking (down-back) matters.
      if (ax > ay * 0.5) bits |= dx < 0 ? LEFT : RIGHT;
      if (ay > ax * 0.5) bits |= dy < 0 ? UP : DOWN;
    }
    this.stickBits = bits;
    this.update();
  }

  update() {
    this.bits = this.stickBits | this.buttonBits;
  }

  /** @param {boolean} easy */
  setEasy(easy) {
    this.root.classList.toggle('easy', easy);
  }

  /** @param {boolean} visible */
  setVisible(visible) {
    this.root.classList.toggle('visible', visible);
    if (!visible) {
      this.stickBits = 0;
      this.buttonBits = 0;
      this.update();
    }
  }
}
