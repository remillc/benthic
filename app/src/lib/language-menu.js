// @ts-check
// Options of the app-language menu on the desktop first-launch screen (task 2026-11-16-246). The value is the one
// of Settings › « Langue de l’app » (settings.language, set with setAppSetting).

/** Names of the languages, each in its own language. */
export const LANGUAGE_NAMES = /** @type {Record<string, string>} */ ({ fr: 'Français', 'fr-CA': 'Français (Canada)', en: 'English' });

/**
 * The menu's options: « Comme le système » with the system language as help line, Français, English. Settings also
 * offers Français (Canada); the menu lists it only while it is the chosen language, so that the choice stays visible.
 * @param {string} current settings.language
 * @param {string} deviceLanguage the device language that has a translation
 * @param {string} systemLabel « Comme le système »
 * @returns {{ value: string, label: string, example?: string }[]}
 */
export function languageOptions(current, deviceLanguage, systemLabel) {
  /** @type {{ value: string, label: string, example?: string }[]} */
  const options = [
    { value: 'system', label: systemLabel, example: LANGUAGE_NAMES[deviceLanguage] },
    { value: 'fr', label: LANGUAGE_NAMES.fr },
  ];
  if (current === 'fr-CA') options.push({ value: 'fr-CA', label: LANGUAGE_NAMES['fr-CA'] });
  options.push({ value: 'en', label: LANGUAGE_NAMES.en });
  return options;
}

/**
 * The name shown on the button: the chosen language, or the system's when « Comme le système ».
 * @param {string} current settings.language
 * @param {string} deviceLanguage
 */
export function currentLanguageName(current, deviceLanguage) {
  return LANGUAGE_NAMES[current === 'system' ? deviceLanguage : current] ?? LANGUAGE_NAMES.en;
}
