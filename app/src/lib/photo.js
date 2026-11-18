// @ts-check
// A photo chosen with <input type="file" accept="image/*"> (a piece's, an invoice's): read, scaled down so that it
// stays light in the local store, and returned as a JPEG data URL. No plugin: the system's file chooser and camera
// are reached by the input itself.

/** The longest side kept, in pixels. */
export const MAX_SIDE = 1280;

/** The size an image is scaled to so that its longest side is at most `max`. @param {number} w @param {number} h @param {number} [max] */
export function fitSize(w, h, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * @param {File} file
 * @returns {Promise<string>} a data URL (image/jpeg)
 */
export async function photoToDataUrl(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('PHOTO_UNREADABLE'));
      el.src = url;
    });
    const { width, height } = fitSize(/** @type {HTMLImageElement} */ (img).naturalWidth, /** @type {HTMLImageElement} */ (img).naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PHOTO_UNREADABLE');
    ctx.drawImage(/** @type {HTMLImageElement} */ (img), 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
