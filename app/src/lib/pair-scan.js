// @ts-check
// The camera screens of pairing (inbox task 2026-11-23-338, items 2 and 7; Benthic+ only): « Jumeler cet appareil » on the
// new device (reads the code an already paired device shows) and « Lire le code d’un ordinateur » on the paired one. The
// screen itself is the native scanner (BenthicCore.qrScan); this module only gives it its texts and reads its answer.
//
// WARNING for the wiring step: the scanner as it exists accepts only the transfer codes of a dive or a plan
// (`OD1~d|p~...`, QrScanActivity.parseHeader and its Swift twin) and flashes « Code inconnu » for any other text. A
// pairing code is not one. Either the key module wraps its payload in that header, with a third kind, or the scanner
// gets a `mode: 'text'` that hands back the first code as it is. `scanPairingCode` sends `mode: 'text'` and `readPairingScan`
// reads `codes[0]`, so the native side is the only thing to change.
import { BenthicCore } from 'benthic-core';
import { t } from './i18n.js';

/**
 * The scanner's options: every visible text from the translation files (the same keys the dive scanner uses for the
 * camera permission and failures).
 * @param {'new-device'|'computer'} kind new-device: « Jumeler cet appareil »; computer: « Lire le code d’un ordinateur »
 */
export function pairScanOptions(kind) {
  return {
    mode: /** @type {'text'} */ ('text'),
    title: t(kind === 'computer' ? 'accountSync.pair.scanComputer' : 'accountSync.pair.scanTitle'),
    close: t('qr.close'),
    hint: t(kind === 'computer' ? 'accountSync.pair.scanComputerHint' : 'accountSync.pair.scanHint'),
    hintFirst: t(kind === 'computer' ? 'accountSync.pair.scanComputerHint' : 'accountSync.pair.scanHint'),
    foreign: t('qr.foreign'),
    permissionReason: t('qr.permissionReason'),
    permissionButton: t('qr.permissionButton'),
    permissionDeniedTitle: t('qr.permissionDeniedTitle'),
    permissionDenied: t('qr.permissionDenied'),
    permissionSettings: t('qr.permissionSettings'),
    cameraFailed: t('qr.cameraFailed'),
  };
}

/**
 * What the scanner answered, as the text of the code or null when the diver closed it.
 * @param {{ action: string, codes?: string[] }} result
 * @returns {string|null}
 */
export function readPairingScan(result) {
  return result.action === 'done' && result.codes?.length ? result.codes[0] : null;
}

/**
 * Opens the camera; resolves to the code's text, or null when the diver closed the screen. Rejects when the camera fails.
 * @param {'new-device'|'computer'} kind
 * @returns {Promise<string|null>}
 */
export async function scanPairingCode(kind) {
  try {
    return readPairingScan(await BenthicCore.qrScan(/** @type {any} */ (pairScanOptions(kind))));
  } catch (e) {
    // The screen closed without a code (the diver left, or the app was restarted under it): nothing to say.
    if (isCancelled(e)) return null;
    throw e;
  }
}

/** @param {unknown} e */
export const isCancelled = (e) => /cancel/i.test(String(/** @type {any} */ (e)?.code ?? '') + ' ' + String(/** @type {any} */ (e)?.message ?? e ?? ''));
