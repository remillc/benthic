// @ts-check
// The recent logbooks on the window without a logbook (task 2026-11-16-242; mock-ups docs/mockups/
// bureau-demarrage-actuel.dc.html and bureau-demarrage-introuvable.dc.html; first built for the release edition,
// task 2026-11-16-241): what each row says. Pure logic; the main process keeps the list (desktop/logbooks.cjs) and
// says which files are still there (desktop/windows.cjs, `exists`).
import { sourceKind, sourceText, whenText, displayName } from './desktop-logbooks.js';

/** @typedef {import('./desktop-logbooks.js').LogbookEntry} LogbookEntry */

/** The most logbooks the list shows: the oldest are dropped from the view (the main process keeps more). */
export const RECENT_SHOWN = 5;

/**
 * The file name of a logbook kept in a file: « essai.ssrf ».
 * @param {LogbookEntry} entry
 */
export function fileNameOf(entry) {
  return entry.location.split(/[\\/]/).pop() || entry.name;
}

/**
 * The rows of the list, newest first, at most RECENT_SHOWN, each with the icon of where it is kept, its name, the
 * place with when it was last closed or opened, and whether it cannot be found.
 * @param {LogbookEntry[]} recent as the main process sorts them (newest first)
 * @param {Record<string, boolean>} exists logbook id -> it can be found; an id not in it counts as found
 * @param {number} now
 * @param {(key: string, params?: Record<string, any>) => string} t
 * @param {(time: number) => string} formatDate
 */
export function recentRows(recent, exists, now, t, formatDate) {
  return [...recent]
    .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
    .slice(0, RECENT_SHOWN)
    .map((entry) => {
      const place = sourceText(entry, t);
      const missing = exists[entry.id] === false;
      return {
        id: entry.id,
        kind: sourceKind(entry),
        name: displayName(entry, t),
        fileName: fileNameOf(entry),
        place,
        missing,
        detail: missing ? t('desktopLogbooks.recents.missingIn', { place }) : [place, whenText(entry, now, t, formatDate)].filter(Boolean).join(' · '),
      };
    });
}
