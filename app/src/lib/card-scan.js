// @ts-check
// Scanning a certification card (tasks 2026-11-18-272 and 277). Two parts:
//  - `scanCard(side)`: THE seam to the phone's document scanner. On Android and iOS it calls the plugin's
//    `scanDocument` (ML Kit Document Scanner / VisionKit: framing, crop and straightening are the system's own
//    screens) which also returns the text read on the device (ML Kit / Vision). The diver cancelling changes nothing.
//    Where the scanner does not exist (desktop, browser) it falls back to the system image picker, with no text;
//    the desktop crop flow is another task.
//  - the parsers (lib/card-parse.js, re-exported here) propose the fields of each kind of document from the recognised
//    text. They only propose; the diver checks the values. The photo never leaves the device.

/**
 * @typedef {Object} ScanResult
 * @property {Blob} image the card, as a picture
 * @property {string} text the text recognised on it; '' when the scanner does not read text
 */

/** @typedef {() => Promise<{ action: 'cancelled'|'unavailable'|'done', image?: string, text?: string }>} NativeScanner */

/** The plugin's scanner, loaded when first used. @type {NativeScanner} */
const nativeScanner = async () => {
  const { BenthicCore } = await import('benthic-core');
  return BenthicCore.scanDocument();
};

/** @param {string} base64 @returns {Blob} */
function jpegFromBase64(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

/**
 * Asks the diver for a picture of one side of the card. Resolves null when the diver cancels (no message, no change).
 * @param {'front'|'back'} _side which side of the card is asked for
 * @param {{ scanner?: NativeScanner, picker?: () => Promise<ScanResult|null> }} [deps] replaced in tests
 * @returns {Promise<ScanResult|null>}
 */
export async function scanCard(_side, { scanner = nativeScanner, picker = pickImage } = {}) {
  /** @type {Awaited<ReturnType<NativeScanner>>|null} */
  let result = null;
  try {
    result = await scanner();
  } catch {
    result = null; // no scanner on this platform (desktop, browser)
  }
  if (result?.action === 'cancelled') return null;
  if (result?.action === 'done' && result.image) return { image: jpegFromBase64(result.image), text: result.text ?? '' };
  return picker();
}

/** The system image picker (on Android it often offers the camera). Resolves null when the diver cancels. @returns {Promise<ScanResult|null>} */
function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    let settled = false;
    const done = (/** @type {ScanResult|null} */ value) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      done(file ? { image: file, text: '' } : null);
    });
    input.addEventListener('cancel', () => done(null));
    document.body.append(input);
    input.click();
  });
}

export { parseCardText, parseInsuranceText, parseMedicalText, parseOtherText, findDate, findDates, joinTexts } from './card-parse.js';
