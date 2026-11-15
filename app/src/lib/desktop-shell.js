// @ts-check
// What the desktop app does in every section (task 2026-11-15-202): Ctrl+, opens Réglages,
// Ctrl++ / Ctrl+- / Ctrl+0 change « Taille du texte », and the Mac's menu bar commands « À propos
// d'OpenDives » and the text size. On the Mac, a change made in the separate Réglages window
// reaches this window through the shared storage.
import { desktopApp, desktopMac, settingsWindow } from './layout.svelte.js';
import { openSettings, openAbout } from './navigation.svelte.js';
import { applyTextSize, stepSize } from './text-size.svelte.js';

/** @param {KeyboardEvent} e @returns {1|-1|0|null} */
export function zoomDirection(e) {
  if (e.key === '+' || e.key === '=') return 1;
  if (e.key === '-' || e.key === '_') return -1;
  if (e.key === '0') return 0;
  return null;
}

/** Starts the shortcuts and the menu commands; once, from App.svelte. */
export function startDesktopShell() {
  if (!desktopApp) return;
  applyTextSize();
  const bridge = /** @type {any} */ (window).odDesktop;

  window.addEventListener('keydown', (e) => {
    if (!(desktopMac ? e.metaKey : e.ctrlKey) || e.altKey) return;
    if (e.key === ',' && !settingsWindow) {
      e.preventDefault();
      openSettings();
      return;
    }
    // The Mac's menu bar owns ⌘+ and ⌘- (desktop/menu.cjs).
    if (desktopMac) return;
    const direction = zoomDirection(e);
    if (direction === null) return;
    e.preventDefault();
    stepSize(direction);
  });

  bridge.onMenu?.((/** @type {string} */ command) => {
    if (command === 'about' && !settingsWindow) openAbout();
    else if (command === 'text:bigger') stepSize(1);
    else if (command === 'text:smaller') stepSize(-1);
    else if (command === 'text:actual') stepSize(0);
  });

  // Mac: the Réglages window writes the settings (Capacitor's Preferences are the web storage's
  // « CapacitorStorage.od.* » keys); this window reads them again from a fresh start.
  if (desktopMac && !settingsWindow) {
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    window.addEventListener('storage', (e) => {
      if (!e.key?.startsWith('CapacitorStorage.od.')) return;
      clearTimeout(timer);
      timer = setTimeout(() => location.reload(), 500);
    });
  }
}
