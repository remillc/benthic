// @ts-check
// The buttons of an iPhone action sheet that confirms a destructive action (task 2026-11-19-289).
import { t } from './i18n.js';

/**
 * iPhone: the confirmation of a destructive action as an action sheet (task 2026-11-19-289, ios-reglages2-bouteille-supprimer):
 * the explanation in grey, the action in red, then « Annuler » apart. The buttons' definition is separate so that tests read it.
 * @param {{ text: string, action: string, onConfirm: () => void, cancel?: string }} o
 * @returns {object[][]}
 */
export function actionSheetButtons({ text, action, onConfirm, cancel }) {
  return [
    [
      { text, label: true },
      { text: action, color: 'red', onClick: onConfirm },
    ],
    [{ text: cancel ?? t('dialog.cancel'), bold: true }],
  ];
}
