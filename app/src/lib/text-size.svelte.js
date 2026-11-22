// @ts-check
// « Taille du texte » of the desktop app (task 2026-11-15-202): Petite, Normale or Grande, the
// window's zoom (Electron's webFrame, through the preload's setZoom), remembered by the device
// store. Ctrl++ and Ctrl+- (⌘ on the Mac) step through the three sizes.
import { deviceStore } from './device-store.js';
import { desktopApp } from './layout.svelte.js';
import { textSizeOf, zoomOf, stepTextSize } from './desktop-settings.js';

const KEY = 'bc.textSize';

function read() {
  try {
    return textSizeOf(deviceStore.getItem(KEY));
  } catch {
    return 'normal';
  }
}

export const textSize = $state({ id: /** @type {'small'|'normal'|'large'} */ (read()) });

/** Puts the remembered size on the window; at start and after a change. */
export function applyTextSize() {
  if (!desktopApp) return;
  try {
    /** @type {any} */ (window).benthicDesktop.setZoom?.(zoomOf(textSize.id));
  } catch (e) {
    console.error('Text size', e);
  }
}

/** @param {'small'|'normal'|'large'} id */
export function setTextSize(id) {
  textSize.id = id;
  try {
    if (id === 'normal') deviceStore.removeItem(KEY);
    else deviceStore.setItem(KEY, id);
  } catch {
    // Not fatal: the size lasts until the app closes.
  }
  applyTextSize();
}

/** @param {1|-1|0} direction 0 goes back to Normale */
export function stepSize(direction) {
  setTextSize(direction === 0 ? 'normal' : stepTextSize(textSize.id, direction));
}
