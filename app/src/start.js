// @ts-check
// The app itself, started by main.js once the settings of this device are loaded
// (lib/device-store.js): every module below may read them as it loads.
import { mount } from 'svelte';
import Framework7 from 'framework7/lite-bundle';
import Framework7Svelte from 'framework7-svelte';
import App from './App.svelte';
import { mark, observePaints } from './lib/perf.js';
import { boot } from './lib/logbook.svelte.js';
import { noteFirstOpen } from './lib/review-prompt.js';
import { releaseLaunchScreen } from './lib/launch.js';
import { deviceStore } from './lib/device-store.js';
import { installRippleFix } from './lib/ripple-fix.js';

observePaints();
mark('main');
// The core starts on the logbook now, on its own thread, while the screens are
// built: the settings of this device first, then the account and the device's
// copy of the log (on a first launch, nothing is loaded until a choice).
noteFirstOpen();
// The paper grain trial's choice (task 2026-11-13-108): the grain is now always on (task 109).
deviceStore.removeItem('od.paperGrain');
boot();
installRippleFix();

Framework7.use(Framework7Svelte);

/**
 * Resolves once the page's stylesheet applies. This module can run before it
 * has loaded (seen on iOS, about one start in three after an install), and the
 * app reads --od-action from it for Framework7, which then fails and leaves the
 * screen white. At most 3 seconds, so that a stylesheet that never loads does
 * not stop the app.
 * @returns {Promise<unknown>}
 */
function stylesApplied() {
  if (getComputedStyle(document.documentElement).getPropertyValue('--od-action').trim()) return Promise.resolve();
  const pending = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .filter((link) => !(/** @type {HTMLLinkElement} */ (link).sheet))
    .map((link) => new Promise((done) => {
      link.addEventListener('load', done, { once: true });
      link.addEventListener('error', done, { once: true });
    }));
  if (!pending.length && document.readyState !== 'complete') {
    pending.push(new Promise((done) => window.addEventListener('load', done, { once: true })));
  }
  return Promise.race([Promise.all(pending), new Promise((done) => setTimeout(done, 3000))]);
}

stylesApplied().then(() => {
  mount(App, { target: /** @type {HTMLElement} */ (document.getElementById('app')) });
  mark('mounted');
  releaseLaunchScreen();
});
