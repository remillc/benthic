// SPDX-License-Identifier: GPL-2.0
'use strict';
// Error reports (task #102), desktop side: what the main process, the renderer and the core's helper cannot report themselves
// (a main-process exception, a renderer or helper process that died) is written to one file in the app's data folder.
// At the next launch the interface reads it (od:crash), shows it to the user and sends it only if they tap « Envoyer »;
// clearing deletes the file. Nothing leaves the device from here. Counterpart of CrashReporter.kt / CrashReporter.swift.
const fs = require('node:fs');
const path = require('node:path');

const FILE = 'crash-report.json';
const MAX_STACK = 12000;

/**
 * @param {{ dir: string, osVersion?: string, device?: string, now?: () => Date, fsImpl?: typeof fs }} options
 *   `osVersion` and `device` come from Electron (process.getSystemVersion(), the platform and architecture)
 */
function createCrashStore({ dir, osVersion = '', device = '', now = () => new Date(), fsImpl = fs }) {
  const file = path.join(dir, FILE);
  return {
    /** Keeps one crash (the last). @param {string} where @param {unknown} error */
    write(where, error) {
      try {
        const e = /** @type {any} */ (error);
        const message = error instanceof Error ? `${e.name}: ${e.message}` : typeof error === 'string' ? error : JSON.stringify(error) ?? String(error);
        const report = {
          occurredAt: now().toISOString(),
          osVersion,
          device,
          message: `${where}: ${message}`.slice(0, 2000),
          stack: (error instanceof Error && e.stack ? e.stack : '').slice(0, MAX_STACK),
        };
        fsImpl.mkdirSync(dir, { recursive: true });
        fsImpl.writeFileSync(file, JSON.stringify(report));
      } catch {
        // A fault while saving must not hide the crash itself.
      }
    },
    /** The saved crash as JSON text, or an empty string. */
    pending() {
      try {
        return fsImpl.readFileSync(file, 'utf8');
      } catch {
        return '';
      }
    },
    clear() {
      try {
        fsImpl.rmSync(file, { force: true });
      } catch {
        // Already gone.
      }
    },
  };
}

module.exports = { createCrashStore, FILE };
