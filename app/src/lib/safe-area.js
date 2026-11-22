// @ts-check
// The safe area on Android. The WebView's env(safe-area-inset-*) is not reliable there (the
// navigation bar is never reported, the top is 52 px or 0 from one launch to the next), so the
// native side (MainActivity, SafeAreaInsets.java) reads the window insets and hands them over:
// once at boot through the BenthicInsets interface, then on every change through
// window.__odSetInsets. They become --bc-safe-top/right/bottom/left on <html>, and theme.css
// points Framework7's --f7-safe-area-* at them. Elsewhere (iOS, desktop, browser) nothing is
// set and env() keeps working.
//
// The same message carries the system's gesture zones (`gestureLeft`, `gestureRight`, in CSS pixels): with gesture
// navigation, a swipe that starts within them is the system's Back gesture, and the system takes the touch away from
// the page. The app's own swipes do not start there (lib/swipe.js). Zero with the 3-button navigation, and when the
// native side does not send them.

/** @typedef {{ top: number, right: number, bottom: number, left: number }} Insets */

const SIDES = /** @type {const} */ (['top', 'right', 'bottom', 'left']);

/**
 * Reads the value sent by the native side and keeps the four sides as non-negative numbers.
 * @param {unknown} raw JSON text or an object
 * @returns {Insets | null} null when it is not a set of insets
 */
export function parseInsets(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const source = /** @type {Record<string, unknown>} */ (value);
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const side of SIDES) {
    const n = Number(source[side]);
    if (source[side] != null && Number.isFinite(n)) insets[side] = Math.max(0, n);
  }
  return insets;
}

/** @type {{ left: number, right: number }} */
let gestureZone = { left: 0, right: 0 };

/** The widths of the system's Back gesture zones at the left and right edges, in CSS pixels (0: none, or not known). */
export const systemGestureZone = () => gestureZone;

/**
 * Reads the gesture zones of a native message. A zone wider than a quarter of a phone is not one: it is ignored.
 * @param {unknown} raw JSON text or an object
 * @returns {{ left: number, right: number }}
 */
export function parseGestureZone(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { left: 0, right: 0 };
    }
  }
  const source = /** @type {Record<string, unknown>} */ (value && typeof value === 'object' ? value : {});
  const side = (/** @type {unknown} */ v) => {
    const n = Number(v);
    return v != null && Number.isFinite(n) && n > 0 && n <= 100 ? n : 0;
  };
  return { left: side(source.gestureLeft), right: side(source.gestureRight) };
}

/**
 * Applies insets to the document: the four variables and the class theme.css keys on.
 * @param {unknown} raw
 * @param {HTMLElement} [root]
 * @returns {Insets | null} what was applied
 */
export function applyInsets(raw, root = document.documentElement) {
  const insets = parseInsets(raw);
  if (!insets) return null;
  for (const side of SIDES) root.style.setProperty(`--bc-safe-${side}`, `${insets[side]}px`);
  root.classList.add('bc-native-insets');
  return insets;
}

/**
 * Installs the native insets: reads the boot value and listens for changes. Does nothing without
 * the native interface (iOS, desktop, browser).
 * @param {any} [win]
 * @returns {boolean} whether the native interface is there
 */
export function installSafeArea(win = window) {
  const bridge = win.BenthicInsets;
  const apply = (/** @type {unknown} */ raw) => {
    const applied = applyInsets(raw, win.document.documentElement);
    if (applied) gestureZone = parseGestureZone(raw);
    if (applied) win.dispatchEvent(new CustomEvent('od-insets', { detail: applied }));
  };
  win.__odSetInsets = apply;
  if (!bridge || typeof bridge.get !== 'function') return false;
  apply(bridge.get());
  return true;
}
