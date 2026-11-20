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

/** Framework7 reads a button's text as HTML: the name of a piece is escaped. @param {string} s */
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * iPhone: « Retirer le Shearwater Perdix 2 ? » as an action sheet (task 2026-11-19-308, ios-profil-piece-retirer): the explanation in
 * grey, one button for each reason, one without a reason, then « Annuler » apart.
 * @param {{ title: string, text: string, reasons: { reason: 'sold'|'lost'|'worn', label: string }[], none: string, onPick: (reason: 'sold'|'lost'|'worn'|undefined) => void, cancel?: string }} o
 * @returns {object[][]}
 */
export function retireSheetButtons({ title, text, reasons, none, onPick, cancel }) {
  return [
    [
      { text: `<span class="bc-retire-sheet--title">${escapeHtml(title)}</span><br>${escapeHtml(text)}`, label: true },
      ...reasons.map((r) => ({ text: r.label, onClick: () => onPick(r.reason) })),
      { text: none, onClick: () => onPick(undefined) },
    ],
    [{ text: cancel ?? t('dialog.cancel'), bold: true }],
  ];
}
