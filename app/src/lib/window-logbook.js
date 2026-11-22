// @ts-check
// Which logbook this desktop window holds (task 2026-11-15-173). The main process tells it through the
// preload: window.benthicDesktop.logbook is { id, kind, name, location } for a logbook, null on the start
// screen, and undefined outside the desktop app. The logbook of this computer ('main') is what the app
// always had, with its first launch, its account and its snapshot; any other logbook is a window of its own.

/** @returns {{ id: string, kind: 'main'|'file'|'git' }|null|undefined} */
export function windowLogbookInfo() {
  return /** @type {any} */ (globalThis).benthicDesktop?.logbook;
}

/** The window holds a logbook other than this computer's, or none: no first launch, no account of the main logbook. */
export function ownLogbookWindow() {
  const info = windowLogbookInfo();
  return info === null || (info !== undefined && info.kind !== 'main');
}

/** The window has no logbook open (the start screen shows). */
export function noLogbookWindow() {
  return windowLogbookInfo() === null;
}

/** The storage key of a per-logbook cache: the main logbook keeps its key, another has its id after it. @param {string} key */
export function logbookKey(key) {
  const info = windowLogbookInfo();
  return info && info.kind !== 'main' ? `${key}.${info.id}` : key;
}
