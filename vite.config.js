// Vite configuration.
//
// The base path comes from site.config.js. It is relative ('./') so the
// same build works at https://rdbagwell.github.io/Fighting-Game/, on any
// other static host, and after the repository is renamed.

import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { site } from './site.config.js';

/**
 * `import art from 'virtual:licensed-art'` gives the URL of each optional
 * licensed file in the git-ignored `art/licensed/` folder, or null.
 *
 * The Oak Woods pack (brullov) may be used in a game but not redistributed,
 * so it is never committed (ASSETS.md). If Robert puts his own copy in
 * `art/licensed/oak-woods/`, `npm run dev` serves it and `npm run build`
 * copies it into the build; otherwise every entry is null and the game
 * never requests it. GitHub Actions never has the folder.
 */
function licensedArt() {
  const id = 'virtual:licensed-art';
  const resolved = `\0${id}`;
  const dir = path.resolve('art/licensed/oak-woods');
  const files = { oakWoodsBackground: 'background.png', oakWoodsShop: 'shop.png' };
  const present = () =>
    Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.existsSync(path.join(dir, file)) ? `licensed/oak-woods/${file}` : null]));
  return {
    name: 'licensed-art',
    resolveId(/** @type {string} */ source) {
      return source === id ? resolved : null;
    },
    load(/** @type {string} */ source) {
      return source === resolved ? `export default ${JSON.stringify(present())};` : null;
    },
    configureServer(/** @type {any} */ server) {
      server.middlewares.use((/** @type {any} */ req, /** @type {any} */ res, /** @type {any} */ next) => {
        const match = /\/licensed\/oak-woods\/([a-z-]+\.png)$/.exec(req.url ?? '');
        const file = match && path.join(dir, match[1]);
        if (!file || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', 'image/png');
        fs.createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const file of Object.values(files)) {
        const full = path.join(dir, file);
        if (fs.existsSync(full)) {
          // @ts-ignore - Rollup plugin context
          this.emitFile({ type: 'asset', fileName: `licensed/oak-woods/${file}`, source: fs.readFileSync(full) });
        }
      }
    },
  };
}

export default defineConfig({
  base: site.base,
  plugins: [licensedArt()],
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 30000,
  },
});
