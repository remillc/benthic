// SPDX-License-Identifier: GPL-2.0
'use strict';
// Preload of the desktop app: window.benthicDesktop, the only door between the
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
ipcRenderer.on('bc:core-event', (_event, name, data) => {
  for (const callback of listeners.get(name) || []) {
    try {
      callback(data);
    } catch (e) {
      console.error('Core event listener', e);
    }
  }
});

// `logbook`: what this window holds (bridge.cjs, logbooks.cjs); null: the start screen.
const { platform, logbook, ...paths } = ipcRenderer.sendSync('bc:paths');

contextBridge.exposeInMainWorld('benthicDesktop', {
  platform,
  paths,
  logbook,
  core: (method, args) => invoke('bc:core', method, args),
  onCoreEvent(name, callback) {
    if (typeof callback !== 'function') return () => {};
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(callback);
    return () => listeners.get(name)?.delete(callback);
  },
  credentials: {
    get: (kind) => invoke('bc:credentials', 'get', kind),
    set: (kind, value) => invoke('bc:credentials', 'set', kind, value),
    clear: (kind) => invoke('bc:credentials', 'clear', kind),
  },
  /** Release edition: a call to the Benthic server (main process, no CORS): resolves { status, text }. */
  server: { request: (options) => invoke('bc:server', options) },
  /** Dive photos and videos by hash (bridge.cjs, `media`): one call, the operation named. */
  media: { call: (op, options) => invoke('bc:media', op, options) },
  fs: {
    writeFile: (options) => invoke('bc:fs', 'writeFile', options),
    appendFile: (options) => invoke('bc:fs', 'appendFile', options),
    readFile: (options) => invoke('bc:fs', 'readFile', options),
    readChunk: (options) => invoke('bc:fs', 'readChunk', options),
    assemble: (options) => invoke('bc:fs', 'assemble', options),
    remove: (options) => invoke('bc:fs', 'remove', options),
    exists: (options) => invoke('bc:fs', 'exists', options),
    removeTree: (options) => invoke('bc:fs', 'removeTree', options),
    rename: (options) => invoke('bc:fs', 'rename', options),
    readDevEnv: (options) => invoke('bc:fs', 'readDevEnv', options),
    deleteDevEnv: (options) => invoke('bc:fs', 'deleteDevEnv', options),
  },
  htmlToPdf: (options) => invoke('bc:htmlToPdf', options),
  /** « Taille du texte » (task 2026-11-15-202): the window's zoom factor, 1 = normal. */
  setZoom: (factor) => webFrame.setZoomFactor(Number(factor) || 1),
  /** « Afficher dans le dossier »: the logbook's folder in the system's file manager. */
  showInFolder: (options) => invoke('bc:showInFolder', options),
  /** The Mac's Réglages window (desktop/main.cjs): opens it, or brings it forward. */
  openSettingsWindow: () => invoke('bc:settingsWindow'),
  /** The Mac's « Mon profil de plongeur » window, and the menu item's availability (the diver has Benthic+). */
  openProfileWindow: () => invoke('bc:profileWindow'),
  setProfileAvailable: (on) => invoke('bc:profileAvailable', !!on),
  saveAs: (options) => invoke('bc:saveAs', options),
  /** Copy and paste of dives (task 2026-11-15-178): text plus the private type application/x-benthic-dives. */
  clipboard: {
    write: (options) => invoke('bc:clipboard', 'write', options),
    read: () => invoke('bc:clipboard', 'read'),
  },
  /** The Mac's menu bar (menu.cjs): each item's command, e.g. 'undo', 'find'. Returns an unsubscribe. */
  onMenu(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('bc:menu', listener);
    return () => ipcRenderer.removeListener('bc:menu', listener);
  },
  /** The connection type (network.cjs): 'metered', 'unmetered' or 'unknown' (cached; asked again when the network changes). */
  network: {
    status: () => invoke('bc:network', 'status'),
    refresh: () => invoke('bc:network', 'refresh'),
    watch: () => invoke('bc:network', 'watch'),
    onChange(callback) {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, cost) => callback(cost);
      ipcRenderer.on('bc:network', listener);
      return () => ipcRenderer.removeListener('bc:network', listener);
    },
  },
  /** The maintenance notifications (notifications.cjs): `schedule({ notifications })` replaces this window's list
   *  ({ id, title, body, at (ms), extra }); `onClick(cb)` gives a clicked notification's `extra` back. */
  notifications: {
    schedule: (options) => invoke('bc:notifications', options),
    onClick(callback) {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, extra) => callback(extra);
      ipcRenderer.on('bc:notification-click', listener);
      return () => ipcRenderer.removeListener('bc:notification-click', listener);
    },
  },
  /** Error reports (crash-reports.cjs): the crash saved before the app died, as JSON text ('' when none); nothing is sent from here. */
  crash: {
    pending: () => invoke('bc:crash', 'pending'),
    clear: () => invoke('bc:crash', 'clear'),
  },
  placesSearch: (options) => invoke('bc:placesSearch', options),
  /** Several logbooks (task 2026-11-15-173): one window per logbook; windows.cjs answers. */
  logbooks: {
    recent: () => invoke('bc:logbooks', 'recent'),
    open: (options) => invoke('bc:logbooks', 'open', options),
    pickAndOpen: () => invoke('bc:logbooks', 'pickAndOpen'),
    openPath: (options) => invoke('bc:logbooks', 'openPath', options),
    close: () => invoke('bc:logbooks', 'close'),
    rename: (options) => invoke('bc:logbooks', 'rename', options),
    clearRecent: () => invoke('bc:logbooks', 'clearRecent'),
    forget: (options) => invoke('bc:logbooks', 'forget', options),
    exists: () => invoke('bc:logbooks', 'exists'),
    relocate: (options) => invoke('bc:logbooks', 'relocate', options),
    /** The personal clouds: { provider, available, connected, account } for each, never a token. */
    cloudStatus: () => invoke('bc:logbooks', 'cloudStatus'),
    cloudSignIn: (options) => invoke('bc:logbooks', 'cloudSignIn', options),
    cloudSignOut: (options) => invoke('bc:logbooks', 'cloudSignOut', options),
    cloudCancelSignIn: (options) => invoke('bc:logbooks', 'cloudCancelSignIn', options),
    cloudReopenSignIn: (options) => invoke('bc:logbooks', 'cloudReopenSignIn', options),
    /** « Ouvrir au démarrage »: { mode: 'last' | 'ask' }, kept in the main process. */
    startup: () => invoke('bc:logbooks', 'startup'),
    setStartup: (options) => invoke('bc:logbooks', 'setStartup', options),
    create: (options) => invoke('bc:logbooks', 'create', options),
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
