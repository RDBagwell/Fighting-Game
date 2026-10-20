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
