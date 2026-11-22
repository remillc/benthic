// @ts-check
// The words of the backup and restore screens (task 2026-11-19-290), pure so that node:test can check them: how a version's
// differences with the current logbook, and what a sync changed in a dive, read. The screens print what these return.
import { t, locale } from './i18n.js';
import { formatRelativeDateTime, formatDateTime, formatDate, formatShortAgo, localNowIso } from './format.js';

/** @typedef {import('./backup-history.js').FieldChange} FieldChange */
/** @typedef {import('./backup-history.js').VersionDetail} VersionDetail */

/**
 * « N° 310, 311 et 312 » (a dive with no number is named by its date).
 * @param {{ number: number|null, key: string }[]} dives
 */
export function numbersText(dives) {
  const labelled = dives.filter((d) => d.number != null).map((d) => String(d.number));
  const loose = dives.filter((d) => d.number == null).map((d) => d.key.slice(0, 16));
  const all = [...labelled, ...loose];
  const list = typeof Intl.ListFormat === 'function' ? new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(all) : all.join(', ');
  return labelled.length ? t('backup.version.numbers', { list }) : list;
}

/** « N° 298 » @param {{ number: number|null, key: string }} dive */
export function numberText(dive) {
  return dive.number != null ? t('backup.version.number', { n: dive.number }) : dive.key.slice(0, 16);
}

/**
 * What a sync changed in a dive, as a sentence: « Compagnon ajouté : Michael », « Site : Northern Arch, auparavant « Site à préciser » ».
 * @param {FieldChange} c
 */
export function changeText(c) {
  const to = c.to.replace(/\s+/g, ' ').trim();
  const from = c.from.replace(/\s+/g, ' ').trim();
  switch (c.key) {
    case 'site':
      return !to ? t('backup.change.siteRemoved', { from }) : from ? t('backup.change.site', { to, from }) : t('backup.change.siteSet', { to });
    case 'buddy':
      return !from ? t('backup.change.buddyAdded', { to }) : !to ? t('backup.change.buddyRemoved', { from }) : t('backup.change.buddy', { to, from });
    case 'divemaster':
      return to ? t('backup.change.divemasterSet', { to }) : t('backup.change.divemasterRemoved');
    case 'suit':
      return to ? t('backup.change.suitSet', { to }) : t('backup.change.suitRemoved');
    case 'tags':
      return to ? t('backup.change.tags', { to }) : t('backup.change.tagsRemoved');
    case 'rating':
      return to ? t('backup.change.rating', { to }) : t('backup.change.ratingRemoved');
    case 'notes':
    case 'visibility':
    case 'duration':
    case 'watertemp':
    case 'airtemp':
    case 'cylinder':
    case 'weightsystem':
    case 'watersalinity':
    case 'trip':
    case 'profile':
      return t(`backup.change.${c.key}`);
    default:
      return t('backup.change.other');
  }
}

/** The keys that have a text for an empty value. */
const WITH_EMPTY = new Set(['site', 'buddy', 'divemaster', 'suit', 'tags', 'rating']);
/** The keys whose value is told. */
const WITH_VALUE = WITH_EMPTY;

/**
 * What restoring puts back, as the old state: « le site était « Site à préciser » ». `c.to` is the version's value.
 * @param {FieldChange} c
 */
export function revertText(c) {
  const key = ['notes', 'visibility', 'duration', 'watertemp', 'airtemp', 'cylinder', 'weightsystem', 'watersalinity', 'trip', 'profile'].includes(c.key) || WITH_VALUE.has(c.key) ? c.key : 'other';
  const value = c.to.replace(/\s+/g, ' ').trim();
  if (WITH_EMPTY.has(key)) return value ? t(`backup.revert.${key}`, { value }) : t(`backup.revert.${key}Empty`);
  return t(`backup.revert.${key}`);
}

/** All the changes of a dive on one line, a dot between. @param {FieldChange[]} changes @param {'change'|'revert'} [kind] */
export function changesLine(changes, kind = 'change') {
  const f = kind === 'revert' ? revertText : changeText;
  return changes.map(f).join(' · ');
}

/**
 * The lines under a version in the list: « 312 plongées · 1 plongée modifiée depuis ».
 * @param {import('./backup-history.js').Version} v
 */
export function versionLine(v) {
  const parts = [t('backup.versions.dives', { n: v.counts.dives })];
  if (v.since) {
    const { added, removed, modified, sites } = v.since;
    if (added) parts.push(t('backup.versions.sinceAdded', { n: added }));
    if (removed) parts.push(t('backup.versions.sinceRemoved', { n: removed }));
    if (modified) parts.push(t('backup.versions.sinceModified', { n: modified }));
    if (!added && !removed && !modified && sites) parts.push(t('backup.versions.sinceSites', { n: sites }));
    if (!added && !removed && !modified && !sites) parts.push(t('backup.versions.sinceNone'));
  }
  return parts.join(' · ');
}

/**
 * The blocks of the differences of a version: a title and a detail each, in the order added, removed, modified, sites.
 * @param {VersionDetail} d
 * @returns {{ kind: 'added'|'removed'|'modified'|'sites', title: string, detail: string }[]}
 */
export function differenceBlocks(d) {
  /** @type {{ kind: 'added'|'removed'|'modified'|'sites', title: string, detail: string }[]} */
  const out = [];
  if (d.added.length) out.push({ kind: 'added', title: t('backup.versions.sinceAdded', { n: d.added.length }), detail: t('backup.version.addedDetail', { n: d.added.length, numbers: numbersText(d.added) }) });
  if (d.removed.length) out.push({ kind: 'removed', title: t('backup.versions.sinceRemoved', { n: d.removed.length }), detail: t('backup.version.removedDetail', { n: d.removed.length, numbers: numbersText(d.removed) }) });
  if (d.modifiedTotal) {
    const rows = d.modified.map((m) => t('backup.version.modifiedRow', { number: numberText(m), changes: changesLine(m.changes, 'revert') || t('backup.revert.other') }));
    const rest = d.modifiedTotal - d.modified.length;
    if (rest > 0) rows.push(t('backup.version.more', { n: rest }));
    out.push({ kind: 'modified', title: t('backup.versions.sinceModified', { n: d.modifiedTotal }), detail: rows.join('\n') });
  }
  const siteCount = d.sites.added + d.sites.removed + d.sites.modified;
  if (siteCount) out.push({ kind: 'sites', title: t('backup.versions.sinceSites', { n: siteCount }), detail: t('backup.version.sitesDetail') });
  return out;
}

/**
 * The text of the confirmation of a restore: what is removed, brought back and reverted, then that the current logbook stays.
 * @param {VersionDetail} d
 */
export function confirmText(d) {
  /** @type {string[]} */
  const parts = [];
  if (d.added.length) parts.push(t('backup.confirm.removed', { n: d.added.length, numbers: numbersText(d.added) }));
  if (d.removed.length) parts.push(t('backup.confirm.restored', { n: d.removed.length, numbers: numbersText(d.removed) }));
  if (d.modifiedTotal === 1 && d.modified.length === 1 && d.modified[0].changes.length === 1 && d.modified[0].changes[0].key === 'site' && d.modified[0].changes[0].to) {
    parts.push(t('backup.confirm.revertedSite', { number: numberText(d.modified[0]), value: `« ${d.modified[0].changes[0].to} »` }));
  } else if (d.modifiedTotal) {
    parts.push(t('backup.confirm.reverted', { n: d.modifiedTotal, numbers: d.modified.length === d.modifiedTotal ? numbersText(d.modified) : numbersText(d.modified) + '…' }));
  }
  if (!parts.length) return `${t('backup.confirm.nothing')} ${t('backup.confirm.keep')}`;
  // « La plongée N° 310 sera retirée, et la plongée N° 298 reprendra … » : the first part starts with a capital, the others do not.
  const first = parts[0].charAt(0).toLocaleUpperCase(locale) + parts[0].slice(1);
  const rest = parts.slice(1);
  const sentence = rest.length ? `${[first, ...rest.slice(0, -1)].join(', ')}, ${t('backup.confirm.and')} ${rest[rest.length - 1]}` : first;
  return `${sentence}. ${t('backup.confirm.keep')}`;
}

/**
 * A line for a version of a dive: what the sync did.
 * @param {import('./backup-history.js').DiveVersion} v
 */
export function diveVersionLine(v) {
  if (v.state === 'deleted') return t('backup.dive.deleted');
  if (v.state === 'new') return v.computer ? t('backup.dive.downloaded', { model: v.computer }) : t('backup.dive.created');
  return v.changes.length ? changesLine(v.changes) : t('backup.change.other');
}

/**
 * The local date and time (no zone) of a moment in seconds since 1970, as the logbook writes local times.
 * @param {number} seconds
 */
export function isoOfEpoch(seconds) {
  const ms = seconds * 1000;
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

/**
 * When a version was made, for its row: « Aujourd’hui, 10 h 28 », « Hier, 21 h 14 », « 15 novembre 2026, 18 h 02 ».
 * @param {number} seconds
 * @param {string} [now] local time, for the tests
 */
export function versionWhen(seconds, now = localNowIso()) {
  const iso = isoOfEpoch(seconds);
  const DAY = 86400000;
  const days = Math.floor(Date.parse(`${now}Z`) / DAY) - Math.floor(Date.parse(`${iso}Z`) / DAY);
  return days === 0 || days === 1 ? formatRelativeDateTime(iso, now) : formatDateTime(iso);
}

/** The day of a version, for « Restaurer le carnet du 15 novembre 2026 ? ». @param {number} seconds */
export function versionDay(seconds) {
  return formatDate(isoOfEpoch(seconds));
}

/** « Il y a 2 min » since a moment. @param {number} seconds */
export function versionAgo(seconds) {
  return formatShortAgo(isoOfEpoch(seconds));
}

/**
 * When a dive was last changed, for the row of « Une version d’une plongée »: « Modifiée hier, 21 h 14 » for today and yesterday,
 * « Modifiée le 2026-11-15 » for the others (the date in the format chosen in Settings).
 * @param {number} seconds
 * @param {string} [now] local time, for the tests
 */
export function changedWhen(seconds, now = localNowIso()) {
  const iso = isoOfEpoch(seconds);
  const DAY = 86400000;
  const days = Math.floor(Date.parse(`${now}Z`) / DAY) - Math.floor(Date.parse(`${iso}Z`) / DAY);
  return days === 0 || days === 1 ? t('backup.dive.changedAt', { when: formatRelativeDateTime(iso, now, false) }) : t('backup.dive.changedOn', { date: formatDate(iso) });
}
