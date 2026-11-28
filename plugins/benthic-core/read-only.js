// @ts-check
// The desktop app's read-only logbook (task 2026-11-27-414): while an account has no valid right to the desktop app, the
// logbook can be viewed and exported but nothing in it is written. The screens hide what writes; this list is the lock under
// them: core-api.js refuses these calls whatever screen makes them. Reading, exporting, planning (a calculation) and the
// device's own settings (`setPrefs`) are not here.

/** The plugin methods that add, change, delete or send something of the logbook. */
export const WRITE_METHODS = Object.freeze(
  new Set([
    'createDive', 'editDive', 'editDives', 'deleteDive', 'mergeDives', 'renumberDives', 'shiftTime', 'siteAction', 'tripAction', 'undo',
    'savePlan', 'saveLocal', 'importDives', 'importDivesFiles', 'importCsv', 'importFile', 'importSample', 'createLog', 'gitCreateLog',
    'cloudCreateLog', 'sync', 'resolveConflicts', 'bgitCommit', 'bgitPush', 'bgitWrite',
  ]),
);

let readOnly = false;

/** @param {boolean} on */
export function setCoreReadOnly(on) {
  readOnly = on;
}

/** @returns {boolean} */
export const coreReadOnly = () => readOnly;

/**
 * Whether the plugin refuses this call now.
 * @param {string} method
 * @returns {boolean}
 */
export const isBlocked = (method) => readOnly && WRITE_METHODS.has(method);

/** The rejection of a refused call: the code the screens can read. @param {string} method */
export function readOnlyError(method) {
  return Object.assign(new Error(`${method} is refused: the logbook is read only`), { code: 'READ_ONLY' });
}
