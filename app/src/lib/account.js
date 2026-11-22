// @ts-check
// Sign in and new account (spec, section 4, "Sign in and new account"): the
// same screens open from first launch (routes /welcome/…) and from Account
// without an account (routes /account/…).
import { deviceStore } from './device-store.js';
import { f7 } from 'framework7-svelte';
import { showSnackbar } from './snackbar.js';
import { accountReady, deviceDiveCount, importDeviceDives, logbook } from './logbook.svelte.js';
import { confirmAction } from './dialogs.js';
import { offerUndo } from './undo.js';
import { t } from './i18n.js';
import { FIRST_LAUNCH_SNACKBARS, FIRST_LAUNCH_SNACKBARS_DESKTOP, FIRST_LAUNCH_SNACKBARS_TABLET, newFirstLaunch } from './first-launch.js';
import { layout, ios, desktopApp } from './layout.svelte.js';

/**
 * The account being created: its email once the code is confirmed. Step 1
 * then only shows it ("Précédent" from step 2 never creates a second
 * account).
 */
export const accountFlow = { confirmedEmail: '' };

/**
 * The error code of a rejected plugin call: its own code, or the core's code
 * at the start of the message ("NETWORK: …").
 * @param {unknown} e
 */
export function errorCode(e) {
  const err = /** @type {{ code?: string, message?: string }} */ (e ?? {});
  if (err.code && err.code !== 'CORE_ERROR' && err.code !== 'UNIMPLEMENTED') return err.code;
  return String(err.message ?? '').split(':')[0].trim();
}

// The e-mail and password rules (ported from core/cloudstorage.cpp) are in
// lib/account-validation.js: the forms check them as the diver types.
export { validCloudEmail as validEmail, validCloudPassword as validPassword } from './account-validation.js';

/** @param {string} text */
export function toast(text) {
  showSnackbar(text);
}

/** A failure that is not a field's: the server did not answer, or something else. */
/** @param {string} code */
export function showFailure(code) {
  const text = code === 'NETWORK' ? t('accountStep.network') : t('accountStep.failed');
  f7.dialog.create({ title: t('accountStep.failedTitle'), text, buttons: [{ text: t('dialog.ok') }] }).open();
}

/**
 * The account is ready: first launch closes (or, from Account, back to its
 * first screen) and the account's logbook is loaded.
 * @param {any} router
 * @param {boolean} welcome
 */
export function finishAccount(router, welcome, { offerDeviceDives = false } = {}) {
  accountFlow.confirmedEmail = '';
  if (!welcome) {
    const first = router.history[0];
    if (first && router.history.length > 1) router.back(first, { force: true });
  }
  const loading = accountReady();
  // Signed in to an account that has a logbook: the dives logged on this
  // device without an account are offered once, when the account's logbook
  // is there.
  if (offerDeviceDives) Promise.resolve(loading).then(() => offerDeviceDivesOnce(logbook.email));
}

/** @param {string} email */
async function offerDeviceDivesOnce(email) {
  const key = `bc.deviceDivesOffered:${email}`;
  try {
    if (!email || deviceStore.getItem(key)) return;
  } catch {
    return;
  }
  const n = await deviceDiveCount();
  if (!n) return;
  try {
    deviceStore.setItem(key, '1');
  } catch {
    // Offered again next time: not harmful.
  }
  confirmAction({
    title: t('deviceDives.title'),
    text: t('deviceDives.text', { n }),
    action: t('deviceDives.add'),
    cancel: t('deviceDives.keep'),
    onConfirm: addDeviceDives,
  });
}

/** Adds the device's dives to the account's logbook, then offers Undo. */
export async function addDeviceDives() {
  try {
    const n = await importDeviceDives();
    offerUndo(t('deviceDives.added', { n }));
  } catch (e) {
    const code = errorCode(e);
    if (code === 'NO_NEW_DIVES') toastText(t('deviceDives.nothingNew'));
    else if (code === 'WRITE_LOCKED') toastText(t('edit.writeLocked'));
    else showFailure(code);
  }
}

/** @param {string} text */
function toastText(text) {
  showSnackbar(text);
}

/**
 * The snackbar that ends a path of the alpha first launch on a phone (task 2026-11-16-233), shown once the
 * logbook is open behind first launch: it floats above the « + ».
 * @param {keyof typeof FIRST_LAUNCH_SNACKBARS} kind
 */
export function announceFirstLaunch(kind) {
  const keys = desktopApp ? FIRST_LAUNCH_SNACKBARS_DESKTOP : layout.phone ? FIRST_LAUNCH_SNACKBARS : FIRST_LAUNCH_SNACKBARS_TABLET;
  // On a tablet it sits at the bottom left, 24 dp from the content's edge (task 2026-11-16-239).
  setTimeout(() => showSnackbar(t(keys[kind]), { placement: 'start' }), 400);
}

/** Alpha first launch on Android, phone or tablet: the new screens and snackbars. */
export function phoneFirstLaunch() {
  return newFirstLaunch({ phone: layout.phone, ios });
}
