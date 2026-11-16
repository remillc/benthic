// @ts-check
// Several logbooks on the desktop (task 2026-11-15-173): what this window holds, the recent logbooks
// of this computer, and the commands (new, open, close, save a copy) the selector, the Mac's menu bar
// and the keyboard share. The main process (desktop/windows.cjs) opens the windows; this file only asks.
import { t } from './i18n.js';
import { showSnackbar } from './snackbar.js';
import { desktopApp, desktopMac } from './layout.svelte.js';
import { logbookShortcut, isLogbookFileName } from './desktop-logbooks.js';

/** @typedef {import('./desktop-logbooks.js').LogbookEntry} LogbookEntry */

/** @returns {any} */
const bridge = () => /** @type {any} */ (globalThis).odDesktop;

/** What this window holds: undefined outside the desktop app, null on the start screen. @returns {LogbookEntry|null|undefined} */
export function windowLogbook() {
  return bridge()?.logbook;
}

/** The window has no logbook open: the start screen shows. */
export const noLogbook = desktopApp && windowLogbook() === null;

export const logbooks = $state({
  /** The new-logbook dialog is open. */
  dialog: false,
  /** @type {LogbookEntry[]} */
  recent: [],
  /** The recent logbooks were read at least once (the window without a logbook waits for it to choose its screen). */
  recentLoaded: false,
  /** @type {Record<string, boolean>} logbook id -> the logbook can be found (a file that was moved or deleted is false) */
  exists: {},
});

/** Reads the recent logbooks again (the main process keeps them). */
export async function refreshRecent() {
  try {
    logbooks.recent = await bridge().logbooks.recent();
  } catch (e) {
    console.error('Reading the recent logbooks', e);
  }
  logbooks.recentLoaded = true;
}

/** Asks which recent logbooks are still there (task 2026-11-16-241): a missing one is shown as such. */
export async function checkRecent() {
  try {
    logbooks.exists = await bridge().logbooks.exists();
  } catch (e) {
    console.error('Looking for the recent logbooks', e);
  }
}

/** « Retirer de la liste »: the entry leaves the recent list. @param {string} id */
export async function forgetRecent(id) {
  try {
    logbooks.recent = await bridge().logbooks.forget({ id });
  } catch (e) {
    console.error('Forgetting a recent logbook', e);
  }
}

/**
 * « Chercher le fichier… »: the system's file picker; the picked file replaces the entry and opens in this window.
 * @param {string} id
 * @returns {Promise<boolean>} the picked file was opened
 */
export async function relocateRecent(id) {
  try {
    const result = await bridge().logbooks.relocate({ id });
    return !!result.opened;
  } catch (e) {
    fail('Looking for a logbook file', e);
    return false;
  } finally {
    refreshRecent();
    checkRecent();
  }
}

/** @param {string} message */
function fail(message, error) {
  console.error(message, error);
  showSnackbar(t('desktopLogbooks.start.openFailed'));
}

export async function openLogbookDialog() {
  try {
    await bridge().logbooks.pickAndOpen();
  } catch (e) {
    fail('Opening a logbook', e);
  }
  refreshRecent();
}

/** @param {string} id */
export async function openRecent(id) {
  try {
    await bridge().logbooks.open({ id });
  } catch (e) {
    fail('Opening a recent logbook', e);
  }
  refreshRecent();
}

/** @param {string} path */
export async function openPath(path) {
  try {
    await bridge().logbooks.openPath({ path });
  } catch (e) {
    fail('Opening a logbook file', e);
  }
}

/** « Fermer le carnet »: the window goes back to its start screen. */
export async function closeLogbook() {
  try {
    await bridge().logbooks.close();
  } catch (e) {
    console.error('Closing the logbook', e);
  }
}

export async function clearRecent() {
  try {
    await bridge().logbooks.clearRecent();
    logbooks.recent = [];
  } catch (e) {
    console.error('Clearing the recent logbooks', e);
  }
}

/** « Enregistrer une copie… »: then « Copie enregistrée · Ouvrir » (task 2026-11-15-188). */
export async function saveCopy() {
  try {
    const result = await bridge().logbooks.saveCopy();
    if (result.canceled) return;
    showSnackbar(t('desktopLogbooks.copy.saved'), {
      action: t('desktopLogbooks.copy.open'),
      onAction: () => openPath(result.path),
    });
  } catch (e) {
    const code = /** @type {any} */ (e)?.message;
    console.error('Saving a copy', e);
    showSnackbar(code === 'SAME_FILE' ? t('desktopLogbooks.copy.sameFile') : t('desktopLogbooks.copy.failed'));
  }
}

/** @param {'newLogbook'|'openLogbook'|'saveCopy'|'closeLogbook'} command */
export function runCommand(command) {
  if (command === 'newLogbook') logbooks.dialog = true;
  else if (command === 'openLogbook') openLogbookDialog();
  else if (command === 'saveCopy') saveCopy();
  else if (command === 'closeLogbook') closeLogbook();
}

/**
 * Starts listening: the Mac's menu commands, and on Windows and Linux the keyboard. Returns the stop function.
 */
export function enableLogbookCommands() {
  if (!desktopApp) return () => {};
  const offMenu = bridge().onMenu?.((/** @type {string} */ command) => {
    if (command === 'newLogbook' || command === 'saveCopy') runCommand(command);
  });
  /** @param {KeyboardEvent} e */
  const keydown = (e) => {
    if (desktopMac) return;
    const command = logbookShortcut(e);
    if (!command) return;
    // Ctrl+W on a start screen closes the window, as in any application.
    if (command === 'closeLogbook' && noLogbook) return;
    e.preventDefault();
    runCommand(command);
  };
  window.addEventListener('keydown', keydown);
  return () => {
    offMenu?.();
    window.removeEventListener('keydown', keydown);
  };
}

/**
 * Files dropped on the window: on the start screen, a logbook file opens in this window. Returns the stop function.
 * @param {() => void} [onBad] a dropped file is not a logbook
 */
export function enableDropToOpen(onBad) {
  /** @param {DragEvent} e */
  const over = (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  };
  /** @param {DragEvent} e */
  const drop = async (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    if (!isLogbookFileName(file.name)) {
      onBad?.();
      return;
    }
    const path = bridge().logbooks.pathForFile(file);
    if (path) await openPath(path);
  };
  window.addEventListener('dragover', over);
  window.addEventListener('drop', drop);
  return () => {
    window.removeEventListener('dragover', over);
    window.removeEventListener('drop', drop);
  };
}
