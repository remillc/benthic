// SPDX-License-Identifier: GPL-2.0
// One-time migrations of the rename to Benthic (22 November 2026), run by the main process before anything opens
// the data folder:
//
//  1. The data folder. Electron names it after the package (`name` in package.json): it was `opendives-desktop`
//     and is `benthic-desktop`. The old folder (the logbooks, `carnet`, `logbooks.json`, the credential `*.bin`
//     files, the window state, the Chromium profile) is moved to the new name when the new one does not exist.
//  2. `<userData>/odgit` (the working copies of the Benthic server's logbooks) is renamed `bgit`.
//  3. The web storage. The interface was served from `app://opendives/` and is now served from `app://benthic/`;
//     the web storage (localStorage: the settings and the caches; IndexedDB `opendives-files`: the equipment and
//     the profile) belongs to an origin, so the new origin starts empty. For one run the old origin is loaded in a
//     hidden window, read, and handed to a hidden window of the new origin, which writes what it does not have
//     yet. The old origin is then emptied. A marker file (`legacy-origin.json`) says it is done.
//
// Every step is idempotent and never overwrites something that exists under the new name.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OLD_USER_DATA_NAME = 'opendives-desktop';
const OLD_HOST = 'opendives';
const NEW_HOST = 'benthic';
const OLD_FILES_DB = 'opendives-files';
const NEW_FILES_DB = 'benthic-files';
const MARKER = 'legacy-origin.json';
const HANDOVER_PAGE = '/legacy-migrate.html';
/** A hand-over that fails (a timeout) is tried again at the next starts, three times in all. */
const MAX_ATTEMPTS = 3;

/** @param {string} userData */
function readMarker(userData) {
  try {
    return JSON.parse(fs.readFileSync(path.join(userData, MARKER), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Moves the old data folder to the new one when the new one does not exist. A rename first (the same disk, nothing
 * copied); when the system refuses (a file in use, another disk), the folder is copied beside the new name and
 * renamed once complete, and the old folder is left in place. Nothing is done when the old folder is missing.
 * @param {{ userData: string, legacyUserData?: string }} options `legacyUserData`: the old folder (default: its
 *   sibling `opendives-desktop`)
 * @returns {'none'|'renamed'|'copied'|'failed'}
 */
function migrateUserDataFolder({ userData, legacyUserData }) {
  const old = legacyUserData || path.join(path.dirname(userData), OLD_USER_DATA_NAME);
  if (path.resolve(old) === path.resolve(userData) || !fs.existsSync(old)) return 'none';
  // Electron has already made the (empty) folder when the main script starts: that counts as "does not exist".
  if (fs.existsSync(userData) && fs.readdirSync(userData).length) return 'none';
  const clearEmpty = () => {
    try {
      fs.rmdirSync(userData);
    } catch {
      // Absent, or the system keeps it: the copy below goes into it.
    }
  };
  clearEmpty();
  try {
    fs.renameSync(old, userData);
    return 'renamed';
  } catch {
    // Fall through to the copy.
  }
  const partial = `${userData}.migrating`;
  try {
    fs.rmSync(partial, { recursive: true, force: true });
    fs.cpSync(old, partial, { recursive: true });
    clearEmpty();
    try {
      fs.renameSync(partial, userData);
    } catch {
      fs.cpSync(partial, userData, { recursive: true });
      fs.rmSync(partial, { recursive: true, force: true });
    }
    try {
      fs.rmSync(old, { recursive: true, force: true });
    } catch {
      // The old folder stays; the new one is complete.
    }
    return 'copied';
  } catch {
    try {
      fs.rmSync(partial, { recursive: true, force: true });
    } catch {
      // Nothing more to do.
    }
    return 'failed';
  }
}

/**
 * `<userData>/odgit` becomes `<userData>/bgit` (nothing when `bgit` exists or `odgit` is missing).
 * @param {string} userData
 * @returns {boolean} true when the folder was renamed
 */
function migrateGitFolder(userData) {
  const old = path.join(userData, 'odgit');
  const wanted = path.join(userData, 'bgit');
  if (!fs.existsSync(old) || fs.existsSync(wanted)) return false;
  try {
    fs.renameSync(old, wanted);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the data folder holds web storage of the old origin that has not been handed over: no marker, and the
 * profile has a localStorage or IndexedDB entry of `app://opendives`.
 * @param {string} userData
 * @returns {boolean}
 */
function hasLegacyOriginData(userData) {
  const marker = readMarker(userData);
  if (marker && (marker.status === 'done' || (marker.attempts ?? 0) >= MAX_ATTEMPTS)) return false;
  if (fs.existsSync(path.join(userData, 'IndexedDB', `app_${OLD_HOST}_0.indexeddb.leveldb`))) return true;
  const dir = path.join(userData, 'Local Storage', 'leveldb');
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return false;
  }
  const needle = Buffer.from(`app://${OLD_HOST}`);
  for (const name of names) {
    if (!/\.(ldb|log)$/.test(name)) continue;
    try {
      if (fs.readFileSync(path.join(dir, name)).includes(needle)) return true;
    } catch {
      // A file in use: it is read at the next start.
    }
  }
  return false;
}

/** The page both hidden windows load: empty; the preload does the work. */
const HANDOVER_HTML = '<!doctype html><meta charset="utf-8"><title>Benthic</title>';

/**
 * Hands the web storage of `app://opendives` over to `app://benthic` (see the top of the file).
 * @param {object} options
 * @param {typeof import('electron').BrowserWindow} options.BrowserWindow
 * @param {import('electron').IpcMain} options.ipcMain
 * @param {string} options.preload the preload of the two hidden windows (legacy-origin-preload.cjs)
 * @param {string} options.userData where the marker is written
 * @param {number} [options.timeoutMs] for each of the three steps
 * @returns {Promise<{ status: 'done'|'failed', localStorage: number, files: number, error?: string }>}
 */
async function handOverLegacyOrigin({ BrowserWindow, ipcMain, preload, userData, timeoutMs = 8000 }) {
  /** @type {any} */
  let old = null;
  /** @type {any} */
  let result = null;
  const waiting = new Map();
  /** @param {string} step */
  const step = (step) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`legacy storage: ${step} timed out`)), timeoutMs);
    waiting.set(step, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
  const done = (name, value) => waiting.get(name)?.(value);
  ipcMain.handle('bc:legacy-origin', (_event, op, payload) => {
    if (op === 'old-data') {
      old = payload;
      done('old-data');
      return true;
    }
    if (op === 'take') return old;
    if (op === 'new-done') {
      result = payload;
      done('new-done');
      return true;
    }
    if (op === 'old-cleared') {
      done('old-cleared');
      return true;
    }
    return false;
  });
  const windows = [];
  const open = (host) => {
    const win = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false } });
    windows.push(win);
    win.loadURL(`app://${host}${HANDOVER_PAGE}`);
    return win;
  };
  try {
    const readOld = step('old-data');
    const oldWin = open(OLD_HOST);
    await readOld;
    const writeNew = step('new-done');
    open(NEW_HOST);
    await writeNew;
    const cleared = step('old-cleared');
    oldWin.webContents.send('bc:legacy-origin:clear');
    await cleared;
    const outcome = { status: 'done', localStorage: result?.localStorage ?? 0, files: result?.files ?? 0 };
    fs.writeFileSync(path.join(userData, MARKER), JSON.stringify({ at: new Date().toISOString(), ...outcome }) + '\n');
    return /** @type {any} */ (outcome);
  } catch (e) {
    const attempts = (readMarker(userData)?.attempts ?? 0) + 1;
    try {
      fs.writeFileSync(path.join(userData, MARKER), JSON.stringify({ status: 'failed', attempts }) + '\n');
    } catch {
      // The next start tries again.
    }
    return { status: 'failed', localStorage: 0, files: 0, error: String(e && e.message ? e.message : e) };
  } finally {
    ipcMain.removeHandler('bc:legacy-origin');
    for (const win of windows) {
      try {
        if (!win.isDestroyed()) win.destroy();
      } catch {
        // Already gone.
      }
    }
  }
}

module.exports = {
  OLD_USER_DATA_NAME,
  OLD_HOST,
  NEW_HOST,
  OLD_FILES_DB,
  NEW_FILES_DB,
  MARKER,
  HANDOVER_PAGE,
  HANDOVER_HTML,
  migrateUserDataFolder,
  migrateGitFolder,
  hasLegacyOriginData,
  handOverLegacyOrigin,
};
