// @ts-check
// « Avis « modifié sur deux appareils » » (inbox task 2026-11-23-338, item 12; Benthic+ only): the snackbar that tells the
// diver a sync kept the most recent of two edits of the same item. The app's one snackbar (lib/snackbar.js) already sits
// above the FAB on the phone and, on a tablet and the desktop, centred at the bottom (560 dp).
import { showSnackbar } from './snackbar.js';
import { t } from './i18n.js';

/** The notice's text. @param {string} name the item (« Détendeur Apeks », « Mon kit voyage ») */
export const twoDeviceNoticeText = (name) => t('accountSync.twoDevices', { name });

/**
 * Shows the notice, with « OK ». Several items changed by one sync: call it once per item; the snackbar replaces the one
 * on screen, so the engine should pass the first name (or count) it wants shown.
 * @param {string} name
 */
export function showTwoDeviceNotice(name) {
  return showSnackbar(twoDeviceNoticeText(name), { action: t('dialog.ok'), onAction: () => {}, placement: 'center', long: true });
}
