// SPDX-License-Identifier: GPL-2.0
'use strict';
// Preload of the desktop app: window.odDesktop, the only door between the
// renderer and the main process (the contract is documented at the top of
// desktop/bridge.cjs). Sandbox-compatible: it uses only electron's modules.
const { contextBridge, ipcRenderer } = require('electron');

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

const { platform, ...paths } = ipcRenderer.sendSync('od:paths');

contextBridge.exposeInMainWorld('odDesktop', {
  platform,
  paths,
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
  placesSearch: (options) => invoke('od:placesSearch', options),
});
