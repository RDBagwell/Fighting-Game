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

/**
 * `import music from 'virtual:music'` gives the URL of each music track
 * found in `public/music/` (title, select, stage, results), or null. The
 * game plays only the tracks that exist, and never requests a missing one
 * (docs/AUDIO.md).
 */
function music() {
  const id = 'virtual:music';
  const resolved = `\0${id}`;
  const tracks = ['title', 'select', 'stage', 'results'];
  const present = () =>
    Object.fromEntries(tracks.map((t) => [t, fs.existsSync(path.resolve('public/music', `${t}.ogg`)) ? `music/${t}.ogg` : null]));
  return {
    name: 'music',
    resolveId(/** @type {string} */ source) {
      return source === id ? resolved : null;
    },
    load(/** @type {string} */ source) {
      return source === resolved ? `export default ${JSON.stringify(present())};` : null;
    },
  };
}

/**
 * The production build's Content-Security-Policy, as a <meta> tag (GitHub
 * Pages can't send headers), the same policy as Netcode Pong's Pages build.
 * `connect-src` allows exactly the matchmaking server from VITE_SERVER_URL
 * (https:// and wss://; http://localhost only for the e2e build), and
 * nothing else. WebRTC's STUN requests are not covered by CSP (SECURITY.md).
 * The build fails on a bad server URL or an inline script.
 */
function contentSecurityPolicy() {
  return {
    name: 'csp',
    apply: /** @type {const} */ ('build'),
    transformIndexHtml(/** @type {string} */ html) {
      const raw = (process.env.VITE_SERVER_URL || '').trim();
      let connect = "'self'";
      if (raw) {
        const url = new URL(raw);
        const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
        if (url.protocol !== 'https:' && !local) throw new Error(`VITE_SERVER_URL must be https:// (got ${raw})`);
        if (url.hostname.endsWith('github.io')) throw new Error('VITE_SERVER_URL points at GitHub Pages, which cannot run the server: use the Render service URL');
        connect += ` ${url.origin} ${url.origin.replace(/^http/, 'ws')}`;
      }
      if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) throw new Error('index.html has an inline script, which the CSP would block');
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data: blob:",
        "media-src 'self'",
        "font-src 'self'",
        `connect-src ${connect}`,
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');
      if (!html.includes('<meta charset="UTF-8" />')) throw new Error('index.html: expected <meta charset="UTF-8" />');
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="no-referrer" />`);
    },
  };
}

export default defineConfig({
  base: site.base,
  plugins: [licensedArt(), music(), contentSecurityPolicy()],
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 30000,
  },
});
