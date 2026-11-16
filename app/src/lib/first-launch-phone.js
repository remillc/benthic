// @ts-check
// The phone layout of the release edition's first launch (task 2026-11-16-227; mock-ups
// docs/mockups/android-premier-lancement-production*.dc.html, 390 x 844). Same steps, texts, logic and errors as
// the tablet; only the layout changes, and the texts that name the device. Which layout shows is decided by the
// width (lib/layout.svelte.js, `layout.phone`); the components' CSS uses the same query, PHONE_QUERY.

/** The media query the components' phone CSS uses: the same width as `layout.phone`. */
export const PHONE_QUERY = '(max-width: 767.98px)';

/** Heights of the blue band, in dp, its wave included: tall on the first step, a brand row on the others (task 2026-11-16-230). */
export const BAND_HEIGHT = Object.freeze({ start: 330, compact: 108 });

/**
 * The key of a text that names the device: « cette tablette » on a tablet, « ce téléphone » on a phone, « cet
 * ordinateur » in the desktop app (task 2026-11-16-228). The phone variant of `welcomeSteps.deviceTitle` is
 * `welcomeSteps.deviceTitlePhone`, the desktop one `welcomeSteps.deviceTitleDesktop`. The desktop app wins when
 * a narrow window also matches the phone query.
 * @param {string} key
 * @param {boolean} phone
 * @param {boolean} [desktop] the desktop app
 * @returns {string}
 */
export function deviceKey(key, phone, desktop = false) {
  return desktop ? `${key}Desktop` : phone ? `${key}Phone` : key;
}
