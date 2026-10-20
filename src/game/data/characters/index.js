/**
 * The roster. Adding a character is a data file like mack.js, an entry
 * here, and its sprites in public/sprites/ (listed in ASSETS.md).
 */
import { mack } from './mack.js';
import { kenji } from './kenji.js';

/** @type {Record<string, import('../../../engine/sim/types.js').CharacterData>} */
export const characters = { mack, kenji };

/** Display order on the character select screen. */
export const roster = ['mack', 'kenji'];
