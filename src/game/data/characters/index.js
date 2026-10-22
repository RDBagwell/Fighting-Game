/**
 * The roster. Adding a character is a data file like mack.js, an entry
 * here, and its sprites in public/sprites/ (listed in ASSETS.md).
 */
import { mack } from './mack.js';
import { kenji } from './kenji.js';
import { deka } from './deka.js';
import { elumlur } from './elumlur.js';
import { mav } from './mav.js';
import { reroe } from './reroe.js';

/** @type {Record<string, import('../../../engine/sim/types.js').CharacterData>} */
export const characters = { mack, kenji, deka, elumlur, mav, reroe };

/** Display order on the character select screen. */
export const roster = ['mack', 'kenji', 'deka', 'elumlur', 'mav', 'reroe'];
