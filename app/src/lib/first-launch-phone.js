// @ts-check
// The phone layout of the release edition's first launch (task 2026-11-16-227; mock-ups
// docs/mockups/android-premier-lancement-production*.dc.html, 390 x 844). Same steps, texts, logic and errors as
// the tablet; only the layout changes, and the texts that name the device. Which layout shows is decided by the
// width (lib/layout.svelte.js, `layout.phone`); the components' CSS uses the same query, PHONE_QUERY.

/** The media query the components' phone CSS uses: the same width as `layout.phone`. */
export const PHONE_QUERY = '(max-width: 767.98px)';

/** Heights of the blue band, in dp, its wave included: tall on the first step, a brand row on the others (task 2026-11-16-244: 140, 108 before). */
export const BAND_HEIGHT = Object.freeze({ start: 330, compact: 140 });

/**
 * The key of a text that names the device: « cette tablette » on a tablet, « ce téléphone » on a phone. The
 * phone variant of `welcomeSteps.deviceTitle` is `welcomeSteps.deviceTitlePhone`.
 * @param {string} key
 * @param {boolean} phone
 * @returns {string}
 */
export function deviceKey(key, phone) {
  return phone ? `${key}Phone` : key;
}
