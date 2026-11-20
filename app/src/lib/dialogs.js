// @ts-check
// Confirmation before a change of the logbook: the confirm button names the
// action ("Merge", "Delete"), as Material 3 and the iOS guidelines ask, and
// Cancel comes first.
import { f7 } from 'framework7-svelte';
import { t } from './i18n.js';
import { actionSheetButtons } from './action-sheet.js';

/** @param {{ text: string, action: string, onConfirm: () => void, cancel?: string }} o */
export function confirmActionSheet(o) {
  f7.actions.create({ buttons: actionSheetButtons(o) }).open();
}

/**
 * @param {{ title: string, text: string, action: string, onConfirm: () => void, cancel?: string, onCancel?: () => void }} options
 *   `cancel` and `onCancel`: another label for Cancel, and what to do when it is chosen
 */
export function confirmAction({ title, text, action, onConfirm, cancel, onCancel, danger = false }) {
  f7.dialog
    .create({
      title,
      text,
      buttons: [{ text: cancel ?? t('dialog.cancel'), onClick: onCancel }, { text: action, onClick: onConfirm, cssClass: danger ? 'bc-dialog-danger' : undefined }],
    })
    .open();
}
