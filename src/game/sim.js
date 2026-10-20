/**
 * The game's simulation: the engine's step with this game's characters,
 * rules and motion inputs.
 */
import { createSimulation } from '../engine/sim/step.js';
import { characters } from './data/characters/index.js';
import { config } from './data/config.js';
import { motions } from './data/motions.js';

export const sim = createSimulation({ characters, config, motions });
