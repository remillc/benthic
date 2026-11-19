// @ts-check
// The browser side of the card photos (task 2026-11-18-272): a picture chosen by the diver becomes a JPEG of at most
// 1600 pixels on its long side (the card photo kept on the device, sealed), and a stored one is shown from its bytes.
// The pixel work of lib/card-image.js (perspective, glare) is used by the desktop's image screen, not here.

/**
 * @param {Blob} image
 * @param {number} [maxSide]
 * @returns {Promise<Uint8Array>} JPEG bytes
 */
export async function toJpegBytes(image, maxSide = 1600) {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('NO_CANVAS');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('NO_JPEG');
  return new Uint8Array(await /** @type {Blob} */ (blob).arrayBuffer());
}

/** An address for showing JPEG bytes in an <img>; revoke it with URL.revokeObjectURL. @param {Uint8Array} bytes */
export const photoUrl = (bytes) => URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'image/jpeg' }));

/**
 * The picture of a scan as JPEG bytes: shrunk to 1600 pixels when the browser can decode it, else as it came (the system scanner
 * already gives a JPEG), so that a scan is never lost to a decoding problem.
 * @param {Blob} image
 * @returns {Promise<Uint8Array>}
 */
export async function scanJpegBytes(image) {
  try {
    return await toJpegBytes(image);
  } catch {
    return new Uint8Array(await image.arrayBuffer());
  }
}
