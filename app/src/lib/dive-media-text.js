// @ts-check
// The words of the dive's photos and videos: the counts (« 2 photos », « 2 vidéos », « 1 photo et 1 vidéo »), the cloud line
// and the line under a picture in the viewer. Pure apart from the translations (task 2026-11-23-367).
import { t } from './i18n.js';
import { countsOf } from './dive-media.js';
import { formatMapSize } from './maps-format.js';

/**
 * « 7 photos et 2 vidéos », « 2 photos », « 1 vidéo »; '' for nothing.
 * @param {{ mime: string }[]} items
 */
export function countsText(items) {
  const { photos, videos } = countsOf(/** @type {any} */ (items));
  const p = photos ? t('detail.mediaPhotos', { n: photos }) : '';
  const v = videos ? t('detail.mediaVideos', { n: videos }) : '';
  return p && v ? t('detail.mediaBoth', { photos: p, videos: v }) : p || v;
}

/**
 * The cloud line: « 7 photos et 2 vidéos, sur tous vos appareils · 186 Mo ».
 * @param {{ mime: string, size?: number }[]} items
 */
export function cloudLine(items) {
  if (!items.length) return t('detail.mediaEmpty');
  const bytes = items.reduce((sum, i) => sum + (Number(i.size) || 0), 0);
  return bytes > 0 ? t('detail.mediaSyncedSize', { counts: countsText(items), size: formatMapSize(Math.max(bytes, 1024 * 1024)) }) : t('detail.mediaSynced', { counts: countsText(items) });
}
