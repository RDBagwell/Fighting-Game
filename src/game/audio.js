/**
 * Which sound each simulation event makes, and which music track each
 * scene plays (docs/AUDIO.md).
 */

/** The simulation events that make a sound. */
export const EVENT_SOUNDS = /** @type {Record<string, import('../engine/audio/Sfx.js').SoundName>} */ ({
  hit: 'hit', block: 'block', swing: 'swing', special: 'special', super: 'super', throw: 'throw', tech: 'tech',
  ko: 'ko', round: 'round', fight: 'fight', jump: 'jump', land: 'land', dash: 'dash', projectile: 'projectile',
  clash: 'clash', knockdown: 'knockdown', parry: 'parry', 'guard-cancel': 'guardCancel', burst: 'burst',
});

/**
 * Which music track a scene plays (docs/AUDIO.md).
 * @param {string | undefined} name
 */
export function trackFor(name) {
  switch (name) {
    case 'select': case 'arcade-select': case 'vs': case 'online-room': case 'lab-setup': return 'select';
    case 'match': case 'online-match': case 'lab': case 'replay': return 'stage';
    case 'results': case 'online-results': case 'ending': return 'results';
    default: return 'title';
  }
}
