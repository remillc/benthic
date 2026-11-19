// @ts-check
// The desktop's card photo screen (tasks 2026-11-18-275 and 277, bureau-profil-brevet-photo): the diver chooses, drops
// or pastes a picture; the card is found, cropped and straightened, the glare can be removed. The pixel work is
// lib/card-image.js; this file is the glue the dialog (components/CardPhotoDialog.svelte) calls. The text of the card is
// not read on a computer (no recognition engine): the diver types the agency, the level and the number.
import { detectCard, warpPerspective, cardSize, removeGlare } from './card-image.js';

/** @typedef {import('./card-image.js').Quad} Quad */
/** @typedef {{ width: number, height: number, data: Uint8ClampedArray }} Pixels */

/** The longest side of the photo the screen works on (pixels). */
export const WORK_SIDE = 1600;
/** The long side of the straightened card (pixels). */
export const CARD_SIDE = 1024;

/**
 * The pictures a drop or a paste holds, the first one.
 * @param {DataTransfer|null|undefined} transfer
 * @returns {File|null}
 */
export function imageOf(transfer) {
  const files = [...(transfer?.files ?? [])];
  return files.find((f) => f.type.startsWith('image/')) ?? null;
}

/**
 * A picture as pixels, at most `WORK_SIDE` on its long side, in the orientation it was taken.
 * @param {Blob} blob
 * @returns {Promise<Pixels>}
 */
export async function loadPixels(blob) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const scale = Math.min(1, WORK_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('NO_CANVAS');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * The card found in a photo, straightened, with the glare filled when asked.
 * @param {Pixels} photo
 * @param {Quad} corners
 * @param {{ glare: boolean }} options
 * @returns {{ image: Pixels, glareFound: boolean }}
 */
export function straighten(photo, corners, { glare }) {
  const { width, height } = cardSize(corners, CARD_SIDE);
  const flat = warpPerspective(photo, corners, width, height);
  const cleaned = removeGlare(flat);
  return { image: glare ? cleaned.image : flat, glareFound: cleaned.changed };
}

/**
 * Finds the card in a photo.
 * @param {Pixels} photo
 * @returns {{ found: boolean, corners: Quad }}
 */
export const findCard = (photo) => detectCard(photo);

/**
 * Pixels as a JPEG.
 * @param {Pixels} image
 * @returns {Promise<Blob>}
 */
export async function pixelsToJpeg(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('NO_CANVAS');
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('NO_JPEG');
  return /** @type {Blob} */ (blob);
}

/**
 * A corner moved to a point of the photo, kept inside it.
 * @param {Quad} corners @param {number} index @param {{ x: number, y: number }} point @param {number} width @param {number} height
 * @returns {Quad}
 */
export function moveCorner(corners, index, point, width, height) {
  const next = /** @type {Quad} */ (corners.map((c, i) => (i === index ? { x: Math.min(width - 1, Math.max(0, point.x)), y: Math.min(height - 1, Math.max(0, point.y)) } : c)));
  return next;
}
