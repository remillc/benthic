// SPDX-License-Identifier: GPL-2.0
'use strict';
// Preload of the two hidden windows of the one-time hand-over of the web storage from `app://opendives` to
// `app://benthic` (legacy-migration.cjs). Sandbox-compatible: it uses only electron's modules and the page's own
// localStorage and IndexedDB. In the old origin it reads everything, then empties it when the main process says so;
// in the new origin it writes what is not there yet (an existing value is never replaced).
const { ipcRenderer } = require('electron');

const OLD_HOST = 'opendives';
const OLD_FILES_DB = 'opendives-files';
const NEW_FILES_DB = 'benthic-files';
const STORE = 'files';

/** @template T @param {IDBRequest<T>} request @returns {Promise<T>} */
function wait(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** @param {string} name @returns {Promise<boolean>} */
async function databaseExists(name) {
  if (typeof indexedDB.databases !== 'function') return false;
  return (await indexedDB.databases()).some((d) => d.name === name);
}

/** The files of the old database: [path, text] pairs. */
async function readFiles() {
  if (!(await databaseExists(OLD_FILES_DB))) return [];
  const db = await wait(indexedDB.open(OLD_FILES_DB));
  try {
    if (!db.objectStoreNames.contains(STORE)) return [];
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const keys = await wait(store.getAllKeys());
    const values = await wait(store.getAll());
    return keys.map((key, i) => [String(key), values[i]]);
  } finally {
    db.close();
  }
}

/** @param {[string, unknown][]} files @returns {Promise<number>} the files written (the ones already there stay) */
async function writeFiles(files) {
  if (!files.length) return 0;
  const request = indexedDB.open(NEW_FILES_DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  const db = await wait(request);
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let written = 0;
    for (const [path, value] of files) {
      const exists = await wait(store.getKey(path));
      if (exists === undefined) {
        store.put(value, path);
        written++;
      }
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return written;
  } finally {
    db.close();
  }
}

async function run() {
  if (location.host === OLD_HOST) {
    /** @type {Record<string, string>} */
    const entries = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key != null) entries[key] = localStorage.getItem(key) ?? '';
    }
    const files = await readFiles();
    ipcRenderer.on('bc:legacy-origin:clear', async () => {
      localStorage.clear();
      if (await databaseExists(OLD_FILES_DB)) await wait(indexedDB.deleteDatabase(OLD_FILES_DB));
      await ipcRenderer.invoke('bc:legacy-origin', 'old-cleared');
    });
    await ipcRenderer.invoke('bc:legacy-origin', 'old-data', { localStorage: entries, files });
    return;
  }
  const old = await ipcRenderer.invoke('bc:legacy-origin', 'take');
  let local = 0;
  for (const [key, value] of Object.entries(old?.localStorage ?? {})) {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, String(value));
      local++;
    }
  }
  const files = await writeFiles(old?.files ?? []);
  await ipcRenderer.invoke('bc:legacy-origin', 'new-done', { localStorage: local, files });
}

window.addEventListener('DOMContentLoaded', () => {
  run().catch((e) => console.error('Legacy storage hand-over', e));
});
