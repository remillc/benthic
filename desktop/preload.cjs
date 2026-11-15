// SPDX-License-Identifier: GPL-2.0
'use strict';
// Preload of the desktop app: window.odDesktop, the only door between the
// renderer and the main process (the contract is documented at the top of
// desktop/bridge.cjs). Sandbox-compatible: it uses only electron's modules.
const { contextBridge, ipcRenderer, webUtils, webFrame } = require('electron');

/** Calls a handler of the bridge; its { ok, value } answer becomes a resolved value or an Error. */
async function invoke(channel, ...args) {
  const answer = await ipcRenderer.invoke(channel, ...args);
  if (answer && answer.ok) return answer.value;
  const error = new Error(answer && answer.error ? answer.error : 'The desktop bridge did not answer');
  if (answer && answer.code) error.code = answer.code;
  throw error;
}

const listeners = new Map(); // event name -> Set of callbacks
ipcRenderer.on('od:core-event', (_event, name, data) => {
  for (const callback of listeners.get(name) || []) {
    try {
      callback(data);
    } catch (e) {
      console.error('Core event listener', e);
    }
  }
});

// `logbook`: what this window holds (bridge.cjs, logbooks.cjs); null: the start screen.
const { platform, logbook, ...paths } = ipcRenderer.sendSync('od:paths');

contextBridge.exposeInMainWorld('odDesktop', {
  platform,
  paths,
  logbook,
  core: (method, args) => invoke('od:core', method, args),
  onCoreEvent(name, callback) {
    if (typeof callback !== 'function') return () => {};
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(callback);
    return () => listeners.get(name)?.delete(callback);
  },
  credentials: {
    get: (kind) => invoke('od:credentials', 'get', kind),
    set: (kind, value) => invoke('od:credentials', 'set', kind, value),
    clear: (kind) => invoke('od:credentials', 'clear', kind),
  },
  fs: {
    writeFile: (options) => invoke('od:fs', 'writeFile', options),
    readFile: (options) => invoke('od:fs', 'readFile', options),
    remove: (options) => invoke('od:fs', 'remove', options),
    exists: (options) => invoke('od:fs', 'exists', options),
    removeTree: (options) => invoke('od:fs', 'removeTree', options),
    rename: (options) => invoke('od:fs', 'rename', options),
    readDevEnv: (options) => invoke('od:fs', 'readDevEnv', options),
    deleteDevEnv: (options) => invoke('od:fs', 'deleteDevEnv', options),
  },
  htmlToPdf: (options) => invoke('od:htmlToPdf', options),
  /** « Taille du texte » (task 2026-11-15-202): the window's zoom factor, 1 = normal. */
  setZoom: (factor) => webFrame.setZoomFactor(Number(factor) || 1),
  /** « Afficher dans le dossier »: the logbook's folder in the system's file manager. */
  showInFolder: (options) => invoke('od:showInFolder', options),
  /** The Mac's Réglages window (desktop/main.cjs): opens it, or brings it forward. */
  openSettingsWindow: () => invoke('od:settingsWindow'),
  saveAs: (options) => invoke('od:saveAs', options),
  /** The Mac's menu bar (menu.cjs): each item's command, e.g. 'undo', 'find'. Returns an unsubscribe. */
  onMenu(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('od:menu', listener);
    return () => ipcRenderer.removeListener('od:menu', listener);
  },
  placesSearch: (options) => invoke('od:placesSearch', options),
  /** Several logbooks (task 2026-11-15-173): one window per logbook; windows.cjs answers. */
  logbooks: {
    recent: () => invoke('od:logbooks', 'recent'),
    open: (options) => invoke('od:logbooks', 'open', options),
    pickAndOpen: () => invoke('od:logbooks', 'pickAndOpen'),
    openPath: (options) => invoke('od:logbooks', 'openPath', options),
    close: () => invoke('od:logbooks', 'close'),
    clearRecent: () => invoke('od:logbooks', 'clearRecent'),
    forget: (options) => invoke('od:logbooks', 'forget', options),
    cloud: () => invoke('od:logbooks', 'cloud'),
    pickFolder: () => invoke('od:logbooks', 'pickFolder'),
    create: (options) => invoke('od:logbooks', 'create', options),
    saveCopy: () => invoke('od:logbooks', 'saveCopy'),
    openCopy: (options) => invoke('od:logbooks', 'openCopy', options),
    revealCopy: (options) => invoke('od:logbooks', 'revealCopy', options),
    /** The path of a file dropped on the window (the renderer cannot read it). */
    pathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return '';
      }
    },
  },
});
