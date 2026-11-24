// @ts-check
// The thumbnail of a photo or a video chosen for a dive: a JPEG of at most 256 px on its longer side, drawn in the web
// view (the picture or a frame of the video), never the original itself. A file the web view cannot decode (a HEIC photo
// on some phones, a video codec) gives no thumbnail: the tile shows a plain placeholder and the original stays as it is.
import { THUMB_SIZE } from './dive-media.js';

/** @param {Blob} blob @returns {Promise<string>} base64 without the prefix */
async function base64Of(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** @param {number} w @param {number} h */
function fit(w, h) {
  const scale = Math.min(1, THUMB_SIZE / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** @param {CanvasImageSource} source @param {number} w @param {number} h @returns {Promise<Blob>} */
async function jpegOf(source, w, h) {
  const { width, height } = fit(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('NO_CANVAS');
  context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('NO_JPEG'))), 'image/jpeg', 0.8));
}

/**
 * A frame of a video (one second in, or the middle of a short one) and its length.
 * @param {File} file @returns {Promise<{ blob: Blob, width: number, height: number, durationMs: number }>}
 */
async function videoFrame(file) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve(undefined);
      video.onerror = () => reject(new Error('NO_VIDEO'));
    });
    const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
    video.currentTime = Math.min(1, (video.duration || 0) / 2);
    await new Promise((resolve, reject) => {
      video.onseeked = () => resolve(undefined);
      video.onerror = () => reject(new Error('NO_VIDEO'));
    });
    const blob = await jpegOf(video, video.videoWidth, video.videoHeight);
    return { blob, width: video.videoWidth, height: video.videoHeight, durationMs };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The thumbnail of a chosen file.
 * @param {File} file
 * @returns {Promise<{ base64: string, width: number, height: number, durationMs?: number }|null>} null when it cannot be drawn
 */
export async function makeThumbnail(file) {
  try {
    if (file.type.startsWith('video/')) {
      const f = await videoFrame(file);
      return { base64: await base64Of(f.blob), width: f.width, height: f.height, durationMs: f.durationMs };
    }
    const bitmap = await createImageBitmap(file);
    try {
      const blob = await jpegOf(bitmap, bitmap.width, bitmap.height);
      return { base64: await base64Of(blob), width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
