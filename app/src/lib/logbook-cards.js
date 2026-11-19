// @ts-check
// Logbook, phone layout: the rows of the virtual list when the dives are grouped by year in white cards
// (task 2026-11-18-278). Plain functions, no framework: the grouping and the month on the date block are
// tested in tests/app/logbook-cards.test.mjs.

/**
 * @typedef {{ key: string, year: number, entries: any[] }} YearSource a month group (lib/carnet-months.js)
 */

/**
 * The rows of the logbook's virtual list, from the month groups (newest first).
 *
 * With `cards` (phone and tablet): a `year` row before the first dive of each year; the dives outside trips of a year
 * form white cards (a run of dives between two trips); a trip is its own card, its header (`trip` row) then,
 * when it is expanded, its dives (`inTrip`). Each row of a card says whether it opens it (`cardFirst`) or
 * closes it (`cardLast`), and `gapBefore` when another card ends right above it, so that the list draws the
 * corners and the space between cards.
 *
 * Without `cards`: the flat list, the dives of an expanded trip after its row.
 * @template {{ id: number, trip?: {id: number}|null }} D
 * @param {{ key: string, year: number, entries: ({ type: 'dive', key: string, dive: D } | { type: 'trip', key: string, location: string, dives: D[] })[] }[]} groups
 * @param {Record<number, boolean>|((id: number) => boolean)} expanded expanded trips, by trip identifier, or a function that says it
 * @param {boolean} cards
 * @returns {any[]}
 */
export function buildRows(groups, expanded, cards) {
  /** @type {any[]} */
  const list = [];
  const isOpen = typeof expanded === 'function' ? expanded : (/** @type {number} */ id) => !!expanded[id];
  let year = -1;
  let run = 0;
  /** @type {Map<number, number>} Dives per year (the iPhone's section titles say it). */
  const perYear = new Map();
  for (const group of groups) {
    for (const entry of group.entries) perYear.set(group.year, (perYear.get(group.year) ?? 0) + (entry.type === 'dive' ? 1 : entry.dives.length));
  }
  for (const group of groups) {
    const month = group.key;
    if (cards && group.year !== year) {
      year = group.year;
      run += 1;
      if (year) list.push({ kind: 'year', key: `y${year}`, index: list.length, month, year, count: perYear.get(year) ?? 0, card: '' });
    }
    for (const entry of group.entries) {
      if (entry.type === 'dive') {
        list.push({ kind: 'dive', key: entry.key, index: list.length, month, dive: entry.dive, card: `r${run}` });
        continue;
      }
      const id = entry.dives[0].trip?.id ?? 0;
      list.push({ kind: 'trip', key: entry.key, index: list.length, month, id, location: entry.location, dives: entry.dives, card: `t${id}` });
      if (isOpen(id)) {
        entry.dives.forEach((dive, i) =>
          list.push({ kind: 'inTrip', key: `d${dive.id}`, index: list.length, month, dive, tripFirst: i === 0, tripLast: i === entry.dives.length - 1, card: `t${id}` }),
        );
      }
      // The dives that follow a trip are another card.
      run += 1;
    }
  }
  if (cards) {
    list.forEach((row, i) => {
      if (row.kind === 'year') return;
      const before = list[i - 1];
      const after = list[i + 1];
      row.cardFirst = !before || before.kind === 'year' || before.card !== row.card;
      row.cardLast = !after || after.kind === 'year' || after.card !== row.card;
      row.gapBefore = row.cardFirst && !!before && before.kind !== 'year';
    });
  }
  return list;
}

/** @type {Map<string, Intl.DateTimeFormat>} */
const monthFormats = new Map();

/**
 * The month on the date block, as the display language abbreviates it, in capitals: "FÉVR.", "FEB".
 * @param {string} iso local ISO date ("2026-02-07T09:09:00")
 * @param {string} locale
 */
export function monthAbbreviation(iso, locale) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '';
  let f = monthFormats.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    monthFormats.set(locale, f);
  }
  return f.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))).toLocaleUpperCase(locale);
}

/** The day of the month on the date block: "7". @param {string} iso */
export function dayOfMonth(iso) {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso ?? '');
  return m ? String(Number(m[1])) : '';
}
