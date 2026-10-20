/**
 * Every file the game loads. tests/assets.test.js checks each exists under
 * public/ and is listed in ASSETS.md. URLs are relative (no leading slash)
 * so the build works under any base path.
 */
import { characters } from './characters/index.js';

/** Sprite sheets, from each character's data. */
export const SPRITE_FILES = Object.values(characters).flatMap((ch) =>
  Object.keys(ch.sprites.sheets).map((sheet) => `${ch.sprites.dir}${sheet}.png`),
);

/** Everything loaded before the title screen. */
export const ALL_FILES = [...SPRITE_FILES];
