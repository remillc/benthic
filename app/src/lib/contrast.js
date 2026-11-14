// @ts-check
// High contrast (task 2026-11-14-149): when the system asks for more contrast, the
// class od-high-contrast on the root element switches the --od-* variables to their
// high-contrast values (theme.css). The system says so through the media query
// prefers-contrast: more (iOS « Augmenter le contraste », and Android's WebView if it
// reports it) or, on Android 14 and later, through its contrast level, read by the
// plugin: above 0.5 is « more ». No setting in the app; it follows the system while
// the app is open (the media query live, the level when the app comes back).

/** Above this system contrast level (0 to 1), the app turns to high contrast. */
export const HIGH_CONTRAST_LEVEL = 0.5;

/**
 * Whether the app is in high contrast.
 * @param {boolean} mediaMore prefers-contrast: more
 * @param {number} level the system contrast level, 0 when unknown
 */
export function isHighContrast(mediaMore, level) {
  return mediaMore || level > HIGH_CONTRAST_LEVEL;
}

/**
 * Keeps the class on the root element in step with the system.
 * @param {{ readLevel: () => Promise<number>, onResume: (listener: () => void) => void }} system
 */
export function followContrast({ readLevel, onResume }) {
  const root = document.documentElement;
  const media = window.matchMedia?.('(prefers-contrast: more)');
  let level = 0;
  const apply = () => root.classList.toggle('od-high-contrast', isHighContrast(!!media?.matches, level));
  const read = () =>
    readLevel().then(
      (value) => {
        level = Number(value) || 0;
        apply();
      },
      () => apply(),
    );
  media?.addEventListener?.('change', apply);
  onResume(read);
  apply();
  read();
}
