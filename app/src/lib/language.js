// @ts-check
// The interface language and its catalogs (see i18n.js). A module of its own so that main.js can start
// fetching the catalogs while the app's code loads, instead of after it.
import { deviceStore } from './device-store.js';

// Each catalog is its own chunk, loaded when the language needs it: the language chosen, English as the
// fallback, and French under fr-CA. The others are never downloaded (the language changes only with a restart).
/** @type {Record<string, () => Promise<{ default: Record<string, any> }>>} */
const loaders = {
  fr: () => import('../i18n/fr.json'),
  'fr-CA': () => import('../i18n/fr-CA.json'),
  en: () => import('../i18n/en.json'),
};
/** @type {Record<string, Record<string, any>>} the catalogs loaded so far */
export const catalogs = {};
export const FALLBACK = 'en';

/**
 * Catalogs searched for a key, in order. fr-CA holds only what differs from
 * fr (a plural object counts as one leaf), then fr, then English.
 * @param {string} lang
 */
export function catalogChain(lang) {
  return lang === 'fr-CA' ? ['fr-CA', 'fr', FALLBACK] : lang === FALLBACK ? [FALLBACK] : [lang, FALLBACK];
}

/**
 * Interface language for a list of device language tags: fr-CA for a tag
 * fr-CA (any case), fr for any other fr-*, else the first tag that has a
 * translation, else English.
 * @param {readonly string[]} tags
 */
export function pickLanguage(tags) {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (lower === 'fr-ca') return 'fr-CA';
    const code = lower.split('-')[0];
    if (code in loaders) return code;
  }
  return FALLBACK;
}

/** Device language that has a translation, or English. */
export const deviceLanguage = pickLanguage(typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []);

/**
 * Interface language: the one chosen in Settings ("App language", kept by
 * settings.svelte.js), else the device's. Changing it restarts the app.
 */
export const language = (() => {
  try {
    const chosen = JSON.parse(deviceStore.getItem('od.appSettings') ?? '{}').language;
    if (chosen in loaders) return chosen;
  } catch {
    // The device's language.
  }
  return deviceLanguage;
})();

// The catalogs of this session are read before any module that uses t() runs (top-level await: the modules
// that import this one wait for it; their own files are fetched meanwhile).
await Promise.all(catalogChain(language).map(async (name) => (catalogs[name] = (await loaders[name]()).default)));


