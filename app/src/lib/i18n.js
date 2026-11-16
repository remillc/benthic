// @ts-check
// Interface languages (docs/ui-specification.md, section 2, "Langues").
// No visible text is hard-coded in a component: every text has a key, and its
// translations live in src/i18n/<language>.json. French is the reference
// language; an untranslated language falls back to English.
// Diver data (site names, notes, tags) never goes through this module.
import { keepUnits } from './nbsp.js';

import { catalogs, catalogChain, deviceLanguage, language, pickLanguage, FALLBACK } from './language.js';

export { catalogChain, deviceLanguage, language, pickLanguage };

/**
 * Locale of the numbers, dates and times: the device's own ("10:44" in fr-FR,
 * "10 h 44" in fr-CA). When the interface is fr-CA (chosen in Settings, or
 * the device is fr-CA) and the device region says otherwise, fr-CA wins so
 * that the times read "10 h 44" with the "pi" of the unit labels.
 * @param {string} lang interface language
 * @param {string|undefined} deviceTag navigator.language
 */
export function formatLocale(lang, deviceTag) {
  if (lang === 'fr-CA') return 'fr-CA';
  return deviceTag || lang;
}

/** Locale of every number, date and time the app formats. */
export const locale = formatLocale(language, typeof navigator !== 'undefined' ? navigator.language : undefined);

/** Number format: the device's ("1 353" in French). */
const numbers = new Intl.NumberFormat(locale);
const plurals = new Intl.PluralRules(language.split('-')[0]); // fr-CA follows French

/**
 * @param {Record<string, any>} catalog
 * @param {string} key e.g. "logbook.title"
 */
function lookup(catalog, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), /** @type {any} */ (catalog));
}

/** @param {string} key */
function find(key) {
  for (const name of catalogChain(language)) {
    const value = lookup(catalogs[name], key);
    if (value != null) return value;
  }
  return undefined;
}

/**
 * Translated text. Parameters replace the {names}; the numeric parameter `n`
 * selects the plural form (Intl.PluralRules) and is shown in the device's
 * number format.
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  let value = find(key);
  if (value == null) {
    console.warn(`Missing text: ${key}`);
    return key;
  }
  if (typeof value === 'object') {
    const n = typeof params.n === 'number' ? params.n : 0;
    value = value[plurals.select(n)] ?? value.other;
  }
  // A number and its unit never part (docs/ui-writing.md): « 9 plongées », « 302 Mo ».
  return keepUnits(
    String(value).replace(/\{(\w+)\}/g, (whole, name) => {
      if (!(name in params)) return whole;
      const v = params[name];
      return typeof v === 'number' ? numbers.format(v) : v;
    }),
  );
}

/**
 * Optional translated text: undefined when the key does not exist (e.g. an
 * unknown dive mode, then shown as the core gives it).
 * @param {string} key
 */
export function tIfExists(key) {
  const value = find(key);
  return typeof value === 'string' ? value : undefined;
}

if (typeof document !== 'undefined') document.documentElement.lang = language;
