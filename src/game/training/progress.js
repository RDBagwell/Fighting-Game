/**
 * Which tutorial lessons and combo trials the player has completed, kept
 * in this browser only (versioned localStorage key). Read back defensively:
 * a broken or missing store just means nothing completed yet.
 */
const KEY = 'dusk-duel-learn-v1';

/** @returns {{ trials: Record<string, true>, lessons: Record<string, true> }} */
export function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const pick = (/** @type {unknown} */ o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k, v]) => typeof k === 'string' && k.length < 40 && v === true));
    return { trials: pick(raw?.trials), lessons: pick(raw?.lessons) };
  } catch {
    return { trials: {}, lessons: {} };
  }
}

/**
 * @param {'trials'|'lessons'} kind
 * @param {string} id
 */
export function markDone(kind, id) {
  const p = loadProgress();
  p[kind][id] = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage blocked: progress lasts for this visit only.
  }
}
