/**
 * Where the game is published. GitHub Pages serves a repository at
 * https://<owner>.github.io/<repo>/, and the repository name in that URL is
 * case-sensitive. The build uses relative asset paths (`base: './'`), so it
 * works under any name; `repo` is only used for links (README) and the
 * deploy test.
 *
 * Renaming the repository: change `repo` here and the link in README.md
 * (tests/deploy.test.js checks they agree).
 */
export const site = {
  owner: 'RDBagwell',
  repo: 'dusk-duel',
  /** Vite's base path. './' = relative, works under any folder. */
  base: './',
};

export const pagesUrl = `https://${site.owner.toLowerCase()}.github.io/${site.repo}/`;
