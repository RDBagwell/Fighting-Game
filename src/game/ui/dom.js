/**
 * Tiny DOM helpers for the menus, and menu navigation that works the same
 * with a keyboard, a gamepad or a mouse/touch: menus are real buttons, so
 * clicks, taps, Tab and screen readers work natively; the arrow keys and
 * the gamepad's d-pad move focus between them.
 */

/**
 * Creates an element: h('button', { class: 'x', onclick }, 'Text', child).
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...(Node | string | null | undefined | false)} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Elements menu navigation moves between. */
const FOCUSABLE = 'button:not([disabled]), input, select, [tabindex="0"]';

/**
 * Moves focus to the previous or next control inside `root`. Left/right on
 * a range slider or a select change its value instead.
 * @param {HTMLElement} root
 * @param {'up'|'down'|'left'|'right'} dir
 */
export function moveFocus(root, dir) {
  const list = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(FOCUSABLE)]).filter((e) => e.offsetParent !== null);
  if (!list.length) return;
  const active = /** @type {HTMLElement | null} */ (document.activeElement);
  const i = active ? list.indexOf(active) : -1;
  if (active instanceof HTMLInputElement && active.type === 'range' && (dir === 'left' || dir === 'right')) {
    active.value = String(Number(active.value) + (dir === 'right' ? 1 : -1) * Number(active.step || 1));
    active.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (active instanceof HTMLSelectElement && (dir === 'left' || dir === 'right')) {
    const n = active.options.length;
    active.selectedIndex = (active.selectedIndex + (dir === 'right' ? 1 : n - 1)) % n;
    active.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const step = dir === 'up' || dir === 'left' ? -1 : 1;
  const next = i < 0 ? list[0] : list[(i + step + list.length) % list.length];
  next.focus();
}

/**
 * Focuses the first control (or the one marked `data-autofocus`).
 * @param {HTMLElement} root
 */
export function focusFirst(root) {
  const el = /** @type {HTMLElement | null} */ (root.querySelector('[data-autofocus]') ?? root.querySelector(FOCUSABLE));
  el?.focus({ preventScroll: true });
}

/**
 * Activates the focused control (gamepad "confirm").
 */
export function activateFocused() {
  const el = /** @type {HTMLElement | null} */ (document.activeElement);
  if (el && el !== document.body && typeof el.click === 'function') el.click();
}
