/// <reference types="vite/client" />

/**
 * Art Robert has licensed himself, from the git-ignored art/licensed/
 * folder (vite.config.js). Each entry is a URL, or null when the file
 * isn't there; in the public build every entry is null.
 */
declare module 'virtual:licensed-art' {
  const art: { oakWoodsBackground: string | null; oakWoodsShop: string | null };
  export default art;
}

/**
 * Music tracks found in public/music/ at build time (vite.config.js): a
 * URL for each track that exists, null for the rest (docs/AUDIO.md).
 */
declare module 'virtual:music' {
  const music: { title: string | null; select: string | null; stage: string | null; results: string | null };
  export default music;
}
