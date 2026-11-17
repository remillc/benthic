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
 * Whether the first launch shows its iPhone variant (task 2026-11-16-261): the iOS look on a phone. Android phones,
 * tablets and iPads keep their own screens.
 * @param {boolean} ios Framework7's iOS theme (lib/layout.svelte.js, `ios`)
 * @param {boolean} phone `layout.phone`
 * @returns {boolean}
 */
export function iosPhone(ios, phone) {
  return ios && phone;
}

/**
 * The kind of device the first launch names: 'desktop' in the desktop app (a narrow window is still the desktop;
 * task 2026-11-16-228), 'iphone' on the iOS look on a phone (task 2026-11-16-261), 'phone' on another phone, else
 * 'tablet'.
 * @param {{ phone: boolean, ios?: boolean, desktop?: boolean }} where
 * @returns {'phone'|'iphone'|'tablet'|'desktop'}
 */
export function deviceKind({ phone, ios = false, desktop = false }) {
  if (desktop) return 'desktop';
  if (iosPhone(ios, phone)) return 'iphone';
  return phone ? 'phone' : 'tablet';
}

/**
 * The key of a text that names the device: « cette tablette » on a tablet (the key itself), « ce téléphone » on a
 * phone (`…Phone`), « cet iPhone » (`…Iphone`), « cet ordinateur » in the desktop app (`…Desktop`).
 * @param {string} key
 * @param {'phone'|'iphone'|'tablet'|'desktop'} kind from `deviceKind`
 * @returns {string}
 */
export function deviceKey(key, kind) {
  return kind === 'tablet' ? key : `${key}${kind[0].toUpperCase()}${kind.slice(1)}`;
}

/**
 * A text that differs only on an iPhone (« Dans mon nuage » lists iCloud Drive first there).
 * @param {string} key
 * @param {boolean} iphone
 * @returns {string}
 */
export function iphoneKey(key, iphone) {
  return iphone ? `${key}Iphone` : key;
}
