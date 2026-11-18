// @ts-check
// Framework7's touch ripple (Android) goes on every <button>, as the first child of the pressed
// element, with `position: absolute`. A button that is not positioned (most of the app's own
// buttons: « Fusionner », « Ce ne sont pas des doublons » in Nettoyer les sites) then gives the wave
// to its nearest positioned ancestor, and the wave shows at the top of the screen instead of on the
// button (todo 92). The button becomes the wave's box, and clips it, just before Framework7
// creates the wave.

/**
 * Makes a pressed element a box for the ripple wave: positioned, and clipping what overflows.
 * Elements that are already positioned (map pins, Framework7's own buttons) are left as they are.
 * @param {Element|null} el the closest <button> of the touch, if any
 */
export function prepareRippleTarget(el) {
  if (!(el instanceof HTMLElement) || el.classList.contains('no-ripple')) return;
  if (getComputedStyle(el).position !== 'static') return;
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  el.style.isolation = 'isolate';
}

/** Listens to the touches before Framework7 does (capture phase on the window). */
export function installRippleFix() {
  const press = (/** @type {Event} */ e) => prepareRippleTarget(e.target instanceof Element ? e.target.closest('button') : null);
  window.addEventListener('touchstart', press, { capture: true, passive: true });
  window.addEventListener('mousedown', press, { capture: true, passive: true });
}
