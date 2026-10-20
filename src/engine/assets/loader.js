/**
 * Loads images, reporting progress. A missing file rejects with its URL,
 * so the loading screen can say which one (and the asset test makes sure
 * it never happens in a build).
 */

/**
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

/**
 * @param {string[]} urls
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<Map<string, HTMLImageElement>>}
 */
export async function loadImages(urls, onProgress) {
  let done = 0;
  const entries = await Promise.all(
    urls.map(async (url) => {
      const img = await loadImage(url);
      done++;
      onProgress?.(done, urls.length);
      return /** @type {[string, HTMLImageElement]} */ ([url, img]);
    }),
  );
  return new Map(entries);
}

/**
 * Loads an image if it exists, or resolves null (optional licensed art).
 * @param {string | null} url
 */
export async function loadOptionalImage(url) {
  if (!url) return null;
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}
