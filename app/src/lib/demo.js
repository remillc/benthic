// @ts-check
// The demo logbook of the release edition's first launch (task 2026-11-16-224, part 7; to-do #69; mock-ups
// docs/mockups/android-tablette-demo{,-quitter,-ajout}-{paysage,portrait}.dc.html), as pure functions so that
// node:test can drive them. The sample logbook the app ships (`importSample`) is opened as this device's own
// logbook, with a banner; « Commencer mon carnet » erases it and returns to the first step. Nothing from the demo
// is ever sent to an account or kept: it has no account (so nothing is synchronised), the device dives are never
// offered to an account while it is open (lib/logbook.svelte.js, deviceDiveCount), and the account screens that
// would start a synchronisation open the « Commencer mon carnet ? » dialog instead (App.svelte, `leaveGuard`).

/** The device-store key that says the logbook on screen is the demo (components/DemoHost.svelte reads it at start). */
export const DEMO_KEY = 'od.demo';

/**
 * The state: whether the demo is open, and the dialog on top of it.
 * `dialog`: `exit` (the banner's button) or `add` (adding, downloading or importing a dive).
 * @typedef {{ on: boolean, dialog: null|'exit'|'add', busy: boolean, failed: boolean }} DemoState
 */

/** @returns {DemoState} */
export function createDemoState() {
  return { on: false, dialog: null, busy: false, failed: false };
}

/**
 * Whether the stored flag says the demo is open.
 * @param {{ getItem: (key: string) => string|null }} store
 * @returns {boolean}
 */
export function storedDemo(store) {
  try {
    return store.getItem(DEMO_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * The demo is offered only when this device has no logbook yet: the demo is made of the sample the app adds when it
 * has none, and « Commencer mon carnet » erases the dives of the logbook that is open.
 * @param {{ deviceLogExists: () => Promise<boolean> }} deps
 * @returns {Promise<boolean>}
 */
export async function demoAvailable(deps) {
  try {
    return !(await deps.deviceLogExists());
  } catch {
    return false;
  }
}

/**
 * « Essayer avec un carnet d’exemple »: the flag first (so that a start interrupted half-way still knows what is
 * on the device), then the device logbook is opened, which adds the sample.
 * @param {DemoState} state
 * @param {{
 *   remember: (on: boolean) => void,
 *   deviceLogExists: () => Promise<boolean>,
 *   start: () => Promise<unknown>,
 *   erase: () => Promise<unknown>,
 *   showFirstStep: () => void,
 * }} deps
 * @returns {Promise<boolean>} true when the demo is open
 */
export async function openDemo(state, deps) {
  if (state.busy || state.on) return false;
  state.busy = true;
  state.failed = false;
  // Never on top of a logbook of the diver's own: the sample is added only to a device without one, and nothing is
  // erased here (the clean-up below is for the sample only).
  let exists = true;
  try {
    exists = await deps.deviceLogExists();
  } catch {
    // Unknown: as if there were one.
  }
  if (exists) {
    state.failed = true;
    state.busy = false;
    return false;
  }
  try {
    deps.remember(true);
    await deps.start();
    state.on = true;
    state.dialog = null;
    return true;
  } catch (e) {
    console.error('Demo logbook', String(/** @type {any} */ (e)?.message ?? e));
    deps.remember(false);
    // Whatever the start left (the sample, when it got that far) goes away: the device had no logbook.
    await deps.erase().catch(() => {});
    deps.showFirstStep();
    state.on = false;
    state.failed = true;
    return false;
  } finally {
    state.busy = false;
  }
}

/** The banner's « Commencer mon carnet »: the confirmation dialog. @param {DemoState} state */
export function askExit(state) {
  if (state.on && !state.busy) state.dialog = 'exit';
}

/**
 * Adding, downloading or importing a dive, or any other way into an account: while the demo is open it opens
 * `demo-ajout` instead and the action does not run.
 * @param {DemoState} state
 * @param {() => void} action what the choice does outside the demo
 * @returns {boolean} true when the action ran
 */
export function guardAdd(state, action) {
  if (state.on) {
    if (!state.busy) state.dialog = 'add';
    return false;
  }
  action();
  return true;
}

/** « Annuler », the scrim, Back: the dialog closes, the demo stays. @param {DemoState} state */
export function dismiss(state) {
  state.dialog = null;
}

/**
 * « Commencer mon carnet » in either dialog: the demo logbook is erased and the first step is shown again.
 * @param {DemoState} state
 * @param {{
 *   erase: () => Promise<unknown>,
 *   remember: (on: boolean) => void,
 *   showFirstStep: () => void,
 * }} deps
 * @returns {Promise<boolean>} true when the demo is gone
 */
export async function leaveDemo(state, deps) {
  if (!state.on || state.busy) return false;
  state.busy = true;
  try {
    await deps.erase();
    deps.remember(false);
    state.on = false;
    state.dialog = null;
    deps.showFirstStep();
    return true;
  } catch (e) {
    console.error('Leaving the demo logbook', String(/** @type {any} */ (e)?.message ?? e));
    return false;
  } finally {
    state.busy = false;
  }
}
