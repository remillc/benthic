// @ts-check
// Launch screen: the native launch screen (splash) stays until the first real screen is on show:
// the WebView has painted its first content AND the screen the app starts on is drawn and laid out
// (the first launch when no way to start was chosen yet, the Logbook otherwise). Android and iOS only;
// elsewhere the call does nothing. A safety timeout lets the launch screen go whatever happens.
import { OpenDivesCore } from 'opendives-core';
import { mark } from './perf.js';

/** The launch screen is released after this, even if the first screen never says it is ready. */
export const LAUNCH_SAFETY_MS = 3000;

/** @type {() => void} */
let readyResolve = () => {};
const firstScreen = new Promise((resolve) => {
  readyResolve = () => resolve(undefined);
});

/** The first real screen is drawn and laid out: the launch screen can go (once the first paint is also done). */
export function markFirstScreenReady() {
  readyResolve();
}

/**
 * Resolves with the first of: the first screen is ready, or the safety timeout.
 * @param {Promise<unknown>} ready
 * @param {number} limitMs
 * @returns {Promise<'ready'|'timeout'>}
 */
export function readyOrTimeout(ready, limitMs = LAUNCH_SAFETY_MS) {
  return Promise.race([
    ready.then(() => /** @type {const} */ ('ready')),
    new Promise((resolve) => setTimeout(() => resolve(/** @type {const} */ ('timeout')), limitMs)),
  ]);
}

/** Waits for two frames: what was just rendered is laid out and painted. */
function afterPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') return resolve(undefined);
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)));
  });
}

/** Tells the native side to remove the launch screen, once the first real screen is painted. */
export function releaseLaunchScreen() {
  const release = () => {
    mark('launchScreenReleased');
    try {
      OpenDivesCore.contentShown().catch(() => {});
    } catch {
      // No native layer (browser): nothing to tell.
    }
  };
  // The paint entry, not a frame callback, is the proof that pixels are on screen: before it the WebView shows the empty shell.
  const painted = new Promise((resolve) => {
    try {
      const observer = new PerformanceObserver((list) => {
        if (list.getEntries().some((e) => e.name === 'first-contentful-paint')) {
          observer.disconnect();
          resolve(undefined);
        }
      });
      observer.observe({ type: 'paint', buffered: true });
    } catch {
      resolve(undefined);
    }
  });
  const ready = Promise.all([painted, firstScreen]).then(afterPaint);
  readyOrTimeout(ready).then(release);
}
