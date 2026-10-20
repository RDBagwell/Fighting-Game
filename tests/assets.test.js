/**
 * Assets: every file the game loads exists and is listed in ASSETS.md,
 * every non-code file in the repository is listed there, the Oak Woods
 * files (not redistributable) are gone, and the credits agree.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_FILES } from '../src/game/data/assets.js';
import { CREDITS } from '../src/game/data/credits.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsMd = fs.readFileSync(path.join(root, 'ASSETS.md'), 'utf8');

/** @param {string} dir @returns {string[]} */
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? files(full) : [full];
  });
}

describe('assets', () => {
  it('every file the game loads exists in public/ and is listed in ASSETS.md', () => {
    expect(ALL_FILES.length).toBeGreaterThan(0);
    for (const url of ALL_FILES) {
      expect(fs.existsSync(path.join(root, 'public', url)), url).toBe(true);
      expect(assetsMd.includes(`\`public/${url}\``), `public/${url} is not in ASSETS.md`).toBe(true);
    }
  });

  it('every file in public/ (what gets deployed) is listed in ASSETS.md', () => {
    for (const file of files(path.join(root, 'public'))) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      expect(assetsMd.includes(`\`${rel}\``), `${rel} is not in ASSETS.md`).toBe(true);
    }
  });

  it('every non-code file in the repository is listed in ASSETS.md', () => {
    const skip = /^(node_modules|\.git|dist|dist-e2e|coverage|test-results|playwright-report|art\/licensed)\//;
    const binary = /\.(png|jpe?g|webp|gif|ico|svg|wav|mp3|ogg|m4a|ttf|otf|woff2?)$/i;
    const all = files(root).map((f) => path.relative(root, f).split(path.sep).join('/')).filter((f) => !skip.test(f) && binary.test(f));
    for (const rel of all) {
      // Screenshots are listed as a group ("docs/screenshots/*.png").
      const listed = assetsMd.includes(`\`${rel}\``) || (rel.startsWith('docs/screenshots/') && assetsMd.includes('`docs/screenshots/*.png`'));
      expect(listed, `${rel} is not in ASSETS.md`).toBe(true);
    }
  });

  it('the Oak Woods files (no redistribution) are not in the repository', () => {
    const all = files(root).filter((f) => !f.includes(`${path.sep}node_modules${path.sep}`) && !f.includes(`${path.sep}.git${path.sep}`) && !f.includes(`art${path.sep}licensed`));
    for (const f of all) expect(path.basename(f), f).not.toMatch(/^(background|shop)\.png$/);
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toMatch(/^art\/licensed\/$/m);
  });

  it('Luiz Melo is credited in ASSETS.md, the README and the credits screen', () => {
    const credit = 'Pixel art / character assets by Luiz Melo';
    expect(assetsMd).toContain(credit);
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toContain(credit);
    expect(CREDITS.some((c) => c.lines.includes(credit))).toBe(true);
  });
});
