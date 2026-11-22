// @ts-check
// The demo logbook as reactive state (task 2026-11-16-224, part 7), with the calls of the app behind the pure
// functions of demo.js. `demo` is read by components/DemoHost.svelte (the banner and the two dialogs) and by the
// screens that add dives (pages/Logbook.svelte, `guardAdd`) or open an account (App.svelte, `leaveGuard`).
import { OpenDivesCore } from 'opendives-core';
import { deviceStore } from './device-store.js';
import { logbook, startWithoutAccount, eraseDemoLogbook, showFirstLaunchAgain } from './logbook.svelte.js';
import { resetFlow } from './first-launch.svelte.js';
import { DEMO_KEY, createDemoState, storedDemo, openDemo, askExit, guardAdd, dismiss, leaveDemo, demoAvailable } from './demo.js';

export const demo = $state(createDemoState());

// A demo left open when the app was closed is open again (its logbook is this device's own).
demo.on = storedDemo(deviceStore);

/** @param {boolean} on */
function remember(on) {
  try {
    if (on) deviceStore.setItem(DEMO_KEY, 'true');
    else deviceStore.removeItem(DEMO_KEY);
  } catch {
    // Not fatal: the flag only brings the banner back after a restart.
  }
}

const deviceLogExists = async () => (await OpenDivesCore.deviceLog({ action: 'exists' })).exists;

// listDives loads the device's logbook into the core, which would replace the account's log already open (the dive
// ids of the list on screen are then unknown to the core): the offer only counts the dives, nothing is loaded.
const deviceLogHasDives = async () => (await OpenDivesCore.deviceLog({ action: 'count' })).count > 0;

/** The first launch's link is shown only on a device without a logbook. @returns {Promise<boolean>} */
export function canTryDemo() {
  return demoAvailable({ deviceLogExists: deviceLogHasDives });
}

/** « Essayer avec un carnet d’exemple ». @returns {Promise<boolean>} */
export function tryDemo() {
  return openDemo(demo, {
    remember,
    deviceLogExists,
    start: startWithoutAccount,
    erase: eraseDemoLogbook,
    showFirstStep: () => {
      resetFlow();
      showFirstLaunchAgain();
    },
  });
}

/** The banner is shown while the demo is open and the first launch is not on screen. */
export const demoBannerShown = () => demo.on && !logbook.welcome;

export const requestExit = () => askExit(demo);
export const closeDialog = () => dismiss(demo);

/** @param {() => void} action @returns {boolean} true when the action ran (false in the demo: its dialog opened) */
export const guardedAdd = (action) => guardAdd(demo, action);

/** « Commencer mon carnet »: the demo is erased and the first step is shown. @returns {Promise<boolean>} */
export function endDemo() {
  return leaveDemo(demo, {
    erase: eraseDemoLogbook,
    remember,
    showFirstStep: () => {
      resetFlow();
      showFirstLaunchAgain();
    },
  });
}

/**
 * Framework7's `beforeEnter` of the routes that start an account (signing in, creating one, changing the
 * repository, bringing a logbook): in the demo they would send the sample to an account, so the
 * « Commencer mon carnet ? » dialog opens instead.
 * @param {{ resolve: () => void, reject: () => void }} route
 */
export function accountGuard({ resolve, reject }) {
  if (demo.on) {
    reject();
    askExit(demo);
  } else {
    resolve();
  }
}
