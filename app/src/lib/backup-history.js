// @ts-check
// Backup and restore of an OpenDives+ logbook (task 2026-11-19-290; docs/architecture.md, section 11.3). The logbook is a
// git repository in Subsurface's format: every sync is a commit, and a commit is a version. This file reads the versions
// from the repository the core keeps on the device (the core's `history` calls, core/libopendives/opendives.h) and says
// what a version holds and how it differs from the current logbook. It decides nothing about the screens and keeps no
// state; the core it is given only needs `history(action, args)`, so node:test drives it with a git repository.
//
// A dive is a folder `YYYY/MM/[trip/]DD-Ddd-HH=MM=SS[~id]/` holding the files `Dive` or `Dive-<number>` and `Divecomputer`
// (core/save-git.cpp). The start time is the dive's identity here, whatever folder it moves to (a trip change moves the
// folder, a renumbering renames the file). A site is the file `01-Divesites/Site-<id>`.

/** @typedef {{ path: string, state: 'new'|'modified'|'deleted' }} Change */
/** @typedef {{ id: string, time: number, author: string, summary: string, message: string, parents: string[], changes?: Change[] }} Commit */
/** @typedef {{ history: (action: string, args?: string[]) => Promise<any> }} HistoryCore */

const DIVE_NAME = /^(?:(\d{4})-)?(?:(\d{2})-)?(\d{2})-[A-Z][a-z]{2}-(\d{2})=(\d{2})=(\d{2})(?:~[0-9a-f]+)?$/;
const DIVE_FILE = /^(Dive(?:-(\d+))?|Divecomputer(?:-\d+)?|Pictures)$/;

/**
 * Which dive a path of the repository belongs to.
 * @param {string} path
 * @returns {{ key: string, dir: string, file: string, isDive: boolean, number: number|null }|null} `isDive`: the path is the
 *   dive's own file (`Dive`, `Dive-<n>`); `number`: the dive number written in that name
 */
export function diveOfPath(path) {
  const parts = path.split('/');
  for (let i = parts.length - 2; i >= 0; i--) {
    const m = DIVE_NAME.exec(parts[i]);
    if (!m) continue;
    const file = DIVE_FILE.exec(parts[i + 1]);
    if (!file) continue;
    const year = m[1] ?? (/^\d{4}$/.test(parts[0] ?? '') ? parts[0] : '');
    const month = m[2] ?? (/^\d{2}$/.test(parts[1] ?? '') ? parts[1] : '');
    if (!year || !month) continue;
    const key = `${year}-${month}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
    const isDive = file[1].startsWith('Dive') && !file[1].startsWith('Divecomputer');
    return { key, dir: parts.slice(0, i + 1).join('/'), file: parts.slice(i + 1).join('/'), isDive, number: isDive && file[2] ? Number(file[2]) : null };
  }
  return null;
}

const SITE_FILE = /^01-Divesites\/Site-([0-9a-f]+)$/;

/**
 * The site a path names, if it is a site file.
 * @param {string} path
 * @returns {string|null} the site's id
 */
export function siteOfPath(path) {
  const m = SITE_FILE.exec(path);
  return m ? m[1] : null;
}

/**
 * @typedef {Object} DiveChange
 * @property {string} key the start time, `YYYY-MM-DD HH:MM:SS`
 * @property {'added'|'removed'|'modified'} kind
 * @property {number|null} number the dive number (the new one for a change, the old one for a removal)
 * @property {number|null} oldNumber the number in the older tree (null for an addition)
 * @property {string} dir the folder in the newer tree (the older one for a removal)
 * @property {string|null} oldDir the folder in the older tree (null for an addition)
 */

/**
 * The dives and sites a list of changed files touches. A dive that has a new `Dive` file and no deleted one is added, the
 * reverse removed, and the others (a changed file, a renumbering, a move to a trip) modified.
 * @param {Change[]} changes
 * @returns {{ dives: DiveChange[], sites: { added: number, removed: number, modified: number } }}
 */
export function summarizeChanges(changes) {
  /** @type {Map<string, { newDir: string|null, oldDir: string|null, newDive: boolean, delDive: boolean, newNumber: number|null, oldNumber: number|null }>} */
  const byKey = new Map();
  const sites = { added: 0, removed: 0, modified: 0 };
  for (const c of changes) {
    if (siteOfPath(c.path)) {
      sites[c.state === 'new' ? 'added' : c.state === 'deleted' ? 'removed' : 'modified']++;
      continue;
    }
    const d = diveOfPath(c.path);
    if (!d) continue;
    let e = byKey.get(d.key);
    if (!e) byKey.set(d.key, (e = { newDir: null, oldDir: null, newDive: false, delDive: false, newNumber: null, oldNumber: null }));
    if (c.state === 'deleted') {
      e.oldDir = d.dir;
      if (d.isDive) {
        e.delDive = true;
        e.oldNumber = d.number;
      }
    } else {
      e.newDir = d.dir;
      if (c.state === 'new' && d.isDive) {
        e.newDive = true;
        e.newNumber = d.number;
      } else if (d.isDive) {
        e.newNumber = d.number;
      }
      // A modified file is in both trees, in the same folder.
      if (c.state === 'modified') e.oldDir = d.dir;
      if (c.state === 'modified' && d.isDive) e.oldNumber = d.number;
    }
  }
  /** @type {DiveChange[]} */
  const dives = [];
  for (const [key, e] of byKey) {
    if (e.newDive && !e.delDive) dives.push({ key, kind: 'added', number: e.newNumber, oldNumber: null, dir: /** @type {string} */ (e.newDir), oldDir: null });
    else if (e.delDive && !e.newDive) dives.push({ key, kind: 'removed', number: e.oldNumber, oldNumber: e.oldNumber, dir: /** @type {string} */ (e.oldDir), oldDir: e.oldDir });
    else dives.push({ key, kind: 'modified', number: e.newNumber ?? e.oldNumber, oldNumber: e.oldNumber ?? e.newNumber, dir: /** @type {string} */ (e.newDir ?? e.oldDir), oldDir: e.oldDir ?? e.newDir });
  }
  dives.sort((a, b) => (a.key < b.key ? -1 : 1));
  return { dives, sites };
}

/**
 * The top-level lines of a dive file (`duration 52:00 min`, `buddy "Michael"`, a quoted value may run over several lines).
 * Several lines with the same name (cylinders) are joined with a line break.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseDiveFile(text) {
  /** @type {Record<string, string>} */
  const out = {};
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && text[j] !== ' ' && text[j] !== '\n') j++;
    const name = text.slice(i, j);
    let value = '';
    if (text[j] === ' ') {
      j++;
      if (text[j] === '"') {
        let k = j + 1;
        while (k < text.length && !(text[k] === '"' && text[k - 1] !== '\\')) k++;
        value = text.slice(j + 1, k).replace(/\\"/g, '"');
        j = k + 1;
        while (j < text.length && text[j] !== '\n') j++;
      } else {
        let k = j;
        while (k < text.length && text[k] !== '\n') k++;
        value = text.slice(j, k);
        j = k;
      }
    }
    if (name) out[name] = name in out ? `${out[name]}\n${value}` : value;
    i = j + 1;
  }
  return out;
}

/** The lines of a dive file that are about the dive and say it in words. */
const DIVE_KEYS = ['divesiteid', 'buddy', 'divemaster', 'suit', 'notes', 'tags', 'rating', 'visibility', 'duration', 'watertemp', 'airtemp', 'cylinder', 'weightsystem', 'watersalinity', 'trip'];

/**
 * @typedef {Object} FieldChange
 * @property {string} key one of DIVE_KEYS, `profile` (the dive computer file) or `other`
 * @property {string} from the older value, '' when there was none (a site is the site's name)
 * @property {string} to the newer value
 */

/**
 * What differs between two states of a dive's files.
 * @param {{ dive: string|null, computer: string|null, sites: (id: string) => string }} older
 * @param {{ dive: string|null, computer: string|null, sites: (id: string) => string }} newer
 * @returns {FieldChange[]}
 */
export function diveFieldChanges(older, newer) {
  /** @type {FieldChange[]} */
  const out = [];
  const a = older.dive === null ? {} : parseDiveFile(older.dive);
  const b = newer.dive === null ? {} : parseDiveFile(newer.dive);
  for (const key of DIVE_KEYS) {
    const from = a[key] ?? '';
    const to = b[key] ?? '';
    if (from === to) continue;
    if (key === 'divesiteid') out.push({ key: 'site', from: from ? older.sites(from) : '', to: to ? newer.sites(to) : '' });
    else out.push({ key, from, to });
  }
  const known = new Set(DIVE_KEYS);
  const others = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !known.has(k) && (a[k] ?? '') !== (b[k] ?? '')));
  if (others.size) out.push({ key: 'other', from: '', to: [...others].join(', ') });
  if ((older.computer ?? '') !== (newer.computer ?? '')) out.push({ key: 'profile', from: '', to: '' });
  return out;
}

/** The model of the dive computer a dive was downloaded from, from the `Divecomputer` file; '' for a dive typed by hand. */
export function computerModel(computerText) {
  if (!computerText) return '';
  const model = parseDiveFile(computerText.split('\n').slice(0, 3).join('\n')).model ?? '';
  return /manually added dive/i.test(model) ? '' : model;
}

/**
 * @typedef {Object} Version
 * @property {string} id the commit
 * @property {number} time seconds since 1970
 * @property {string} summary the commit's first line
 * @property {string[]} parents
 * @property {boolean} current the logbook as it is now
 * @property {{ dives: number, sites: number, pieces: number|null }} counts
 * @property {{ added: number, removed: number, modified: number, sites: number }|null} since what changed from this version to the current one (null for the current one)
 */

/** One page of the versions of the logbook, newest first, with their counts and what changed since.
 * @param {HistoryCore} core
 * @param {{ skip?: number, limit?: number }} [page]
 * @returns {Promise<{ versions: Version[], more: boolean, head: string|null }>}
 */
export async function listVersions(core, { skip = 0, limit = 10 } = {}) {
  const info = await core.history('info');
  const head = info.head ?? null;
  const log = await core.history('log', [String(skip), String(limit), '0']);
  /** @type {Commit[]} */
  const commits = log.commits;
  if (!commits.length) return { versions: [], more: false, head };
  const stats = (await core.history('stats', commits.map((c) => c.id))).stats;
  /** @type {Map<string, any>} */
  const byId = new Map(stats.map((/** @type {any} */ s) => [s.id, s]));
  /** @type {Version[]} */
  const versions = [];
  for (const c of commits) {
    const s = byId.get(c.id) ?? { dives: 0, sites: 0, pieces: null };
    const current = c.id === head;
    let since = null;
    if (!current && head) {
      const diff = await core.history('diff', [c.id, head]);
      const sum = summarizeChanges(diff.changes);
      since = {
        added: sum.dives.filter((d) => d.kind === 'added').length,
        removed: sum.dives.filter((d) => d.kind === 'removed').length,
        modified: sum.dives.filter((d) => d.kind === 'modified').length,
        sites: sum.sites.added + sum.sites.removed + sum.sites.modified,
      };
    }
    versions.push({ id: c.id, time: c.time, summary: c.summary, parents: c.parents, current, counts: { dives: s.dives, sites: s.sites, pieces: s.pieces ?? null }, since });
  }
  return { versions, more: log.more, head };
}

/**
 * A reader of the site names as of a commit, with a cache: `sites(commit)(id)` is the name or ''.
 * @param {HistoryCore} core
 */
function siteReader(core) {
  /** @type {Map<string, string>} */
  const cache = new Map();
  /** @param {string} commit @param {string} id */
  return async (commit, id) => {
    const k = `${commit}/${id}`;
    if (cache.has(k)) return /** @type {string} */ (cache.get(k));
    const file = await core.history('read', [commit, `01-Divesites/Site-${id}`]);
    const name = file.text ? (parseDiveFile(file.text).name ?? '') : '';
    cache.set(k, name);
    return name;
  };
}

/** The files of a dive as of a commit: `{ dive, computer }` (null when absent). The dive's file is found in its folder, as
 * its name carries the number.
 * @param {HistoryCore} core @param {string} commit @param {string|null} dir
 */
async function diveFilesAt(core, commit, dir) {
  if (!dir) return { dive: null, computer: null };
  const files = (await core.history('files', [commit, `${dir}/`])).files;
  const diveFile = files.find((/** @type {string} */ f) => diveOfPath(f)?.isDive);
  const computerFile = files.find((/** @type {string} */ f) => /\/Divecomputer$/.test(f));
  const dive = diveFile ? await core.history('read', [commit, diveFile]) : { text: null };
  const computer = computerFile ? await core.history('read', [commit, computerFile]) : { text: null };
  return { dive: dive.text ?? null, computer: computer.text ?? null };
}

/** The site ids a dive's text names. @param {string|null} text */
function siteIdOf(text) {
  return text ? (parseDiveFile(text).divesiteid ?? '') : '';
}

/**
 * @typedef {Object} DiveDifference
 * @property {string} key the start time
 * @property {number|null} number
 * @property {FieldChange[]} changes what restoring the version would put back (the version's value is `to`; the current
 *   logbook's is `from`)
 */

/**
 * @typedef {Object} VersionDetail
 * @property {{ dives: number, sites: number, pieces: number|null }} counts
 * @property {{ number: number|null, key: string }[]} added dives in the current logbook that this version does not have: restoring removes them
 * @property {{ number: number|null, key: string }[]} removed dives this version has that the current logbook does not: restoring brings them back
 * @property {DiveDifference[]} modified
 * @property {number} modifiedTotal
 * @property {{ added: number, removed: number, modified: number }} sites
 */

/**
 * A version's content and its differences with the current logbook. `modified` lists the first `max` changed dives.
 * @param {HistoryCore} core
 * @param {string} commit
 * @param {{ max?: number }} [options]
 * @returns {Promise<VersionDetail>}
 */
export async function versionDetail(core, commit, { max = 12 } = {}) {
  const info = await core.history('info');
  const head = info.head;
  const stats = (await core.history('stats', [commit])).stats[0];
  const counts = { dives: stats.dives, sites: stats.sites, pieces: stats.pieces ?? null };
  if (!head || head === commit) return { counts, added: [], removed: [], modified: [], modifiedTotal: 0, sites: { added: 0, removed: 0, modified: 0 } };
  const diff = await core.history('diff', [commit, head]);
  const sum = summarizeChanges(diff.changes);
  const site = siteReader(core);
  const added = sum.dives.filter((d) => d.kind === 'added').map((d) => ({ number: d.number, key: d.key }));
  const removed = sum.dives.filter((d) => d.kind === 'removed').map((d) => ({ number: d.number, key: d.key }));
  const changed = sum.dives.filter((d) => d.kind === 'modified');
  /** @type {DiveDifference[]} */
  const modified = [];
  for (const d of changed.slice(0, max)) {
    const older = await diveFilesAt(core, commit, d.oldDir);
    const newer = await diveFilesAt(core, head, d.dir);
    const oldSite = siteIdOf(older.dive) ? await site(commit, siteIdOf(older.dive)) : '';
    const newSite = siteIdOf(newer.dive) ? await site(head, siteIdOf(newer.dive)) : '';
    // Restoring puts the version's value back: it is the "to" of the change.
    const field = diveFieldChanges(
      { dive: older.dive, computer: older.computer, sites: () => oldSite },
      { dive: newer.dive, computer: newer.computer, sites: () => newSite },
    ).map((c) => ({ key: c.key, from: c.to, to: c.from }));
    modified.push({ key: d.key, number: d.number, changes: field });
  }
  return { counts, added, removed, modified, modifiedTotal: changed.length, sites: sum.sites };
}

/**
 * The folder of each dive of a commit, by start time.
 * @param {HistoryCore} core
 * @param {string} commit
 * @returns {Promise<Map<string, { dir: string, number: number|null }>>}
 */
export async function divesAt(core, commit) {
  const files = (await core.history('files', [commit, ''])).files;
  /** @type {Map<string, { dir: string, number: number|null }>} */
  const out = new Map();
  for (const f of files) {
    const d = diveOfPath(f);
    if (d?.isDive) out.set(d.key, { dir: d.dir, number: d.number });
  }
  return out;
}

/**
 * @typedef {Object} DiveVersion
 * @property {string} id the commit
 * @property {number} time
 * @property {'new'|'modified'|'deleted'} state what that sync did to the dive
 * @property {string|null} dir the dive's folder after that sync (null when it was deleted)
 * @property {number|null} number
 * @property {boolean} current the dive as it is now
 * @property {FieldChange[]} changes what that sync changed in the dive
 * @property {string} computer the dive computer it was downloaded from, for a new dive; '' otherwise
 */

/**
 * The versions of one dive, newest first: the syncs that touched it, with what each changed. The dive is found by its
 * start time, so a move to a trip or a renumbering stays in one list.
 * @param {HistoryCore} core
 * @param {string} key the start time, `YYYY-MM-DD HH:MM:SS`
 * @param {{ limit?: number, pageSize?: number }} [options]
 * @returns {Promise<DiveVersion[]>}
 */
export async function diveVersions(core, key, { limit = 30, pageSize = 100 } = {}) {
  const info = await core.history('info');
  const head = info.head;
  const site = siteReader(core);
  /** @type {DiveVersion[]} */
  const out = [];
  for (let skip = 0; out.length < limit; skip += pageSize) {
    const page = await core.history('log', [String(skip), String(pageSize), '1']);
    for (const c of /** @type {Commit[]} */ (page.commits)) {
      const touched = summarizeChanges((c.changes ?? []).filter((x) => diveOfPath(x.path)?.key === key)).dives[0];
      if (!touched) continue;
      const parent = c.parents[0] ?? null;
      const newer = touched.kind === 'removed' ? { dive: null, computer: null } : await diveFilesAt(core, c.id, touched.dir);
      const older = touched.kind === 'added' || !parent ? { dive: null, computer: null } : await diveFilesAt(core, parent, touched.oldDir);
      const newSite = siteIdOf(newer.dive) ? await site(c.id, siteIdOf(newer.dive)) : '';
      const oldSite = siteIdOf(older.dive) && parent ? await site(parent, siteIdOf(older.dive)) : '';
      const state = touched.kind === 'added' ? 'new' : touched.kind === 'removed' ? 'deleted' : 'modified';
      out.push({
        id: c.id,
        time: c.time,
        state,
        dir: state === 'deleted' ? null : touched.dir,
        number: touched.number,
        current: false,
        changes: state === 'modified' ? diveFieldChanges({ dive: older.dive, computer: older.computer, sites: () => oldSite }, { dive: newer.dive, computer: newer.computer, sites: () => newSite }) : [],
        computer: state === 'new' ? computerModel(newer.computer) : '',
      });
      if (out.length >= limit) break;
    }
    if (!page.more) break;
  }
  // The newest entry is the dive as it is now when the dive exists in the current logbook.
  if (head && out.length && out[0].state !== 'deleted') {
    const now = (await divesAt(core, head)).get(key);
    if (now) out[0].current = true;
  }
  return out;
}

/**
 * @typedef {Object} DeletedDive
 * @property {string} key the start time
 * @property {number|null} number
 * @property {number} deletedAt seconds since 1970
 * @property {string} commit the last version that still had the dive: restoring from it brings the dive back
 * @property {string} dir the dive's folder in that version
 * @property {string} site the site's name in that version, '' when none
 */

/**
 * The dives that were deleted and are not in the logbook now, newest deletion first. The whole history is read (no limit
 * of time or of count: a deleted dive is always recoverable).
 * @param {HistoryCore} core
 * @param {{ pageSize?: number }} [options]
 * @returns {Promise<DeletedDive[]>}
 */
export async function deletedDives(core, { pageSize = 200 } = {}) {
  const info = await core.history('info');
  const head = info.head;
  if (!head) return [];
  const present = await divesAt(core, head);
  const site = siteReader(core);
  /** @type {Map<string, DeletedDive>} */
  const found = new Map();
  for (let skip = 0; ; skip += pageSize) {
    const page = await core.history('log', [String(skip), String(pageSize), '1']);
    for (const c of /** @type {Commit[]} */ (page.commits)) {
      const parent = c.parents[0];
      if (!parent) continue;
      for (const d of summarizeChanges(c.changes ?? []).dives) {
        if (d.kind !== 'removed' || present.has(d.key) || found.has(d.key)) continue;
        const files = await diveFilesAt(core, parent, d.oldDir);
        const id = siteIdOf(files.dive);
        found.set(d.key, { key: d.key, number: d.number, deletedAt: c.time, commit: parent, dir: /** @type {string} */ (d.oldDir), site: id ? await site(parent, id) : '' });
      }
    }
    if (!page.more) break;
  }
  return [...found.values()].sort((a, b) => b.deletedAt - a.deletedAt);
}

/** The message of the commit that restores a whole version. @param {string} date */
export function restoreMessage(date) {
  return `Restore the logbook of ${date}`;
}

/**
 * Brings the whole logbook back to a version: a new commit with that version's content, the history untouched. The logbook
 * in memory is read again by the core; sending it is the sync's job.
 * @param {HistoryCore} core
 * @param {string} commit
 * @param {string} [date] shown in the commit message
 * @returns {Promise<{ commit: string|null }>} null: the logbook already was that version
 */
export async function restoreVersion(core, commit, date = '') {
  const result = await core.history('restore', [commit, restoreMessage(date || commit.slice(0, 7))]);
  return { commit: result?.commit ?? null };
}

/**
 * Brings one dive back to a version of its own, or a deleted dive back: only that dive's folders change. The folder the
 * dive has now (if any) is replaced by what the version had, and so is the folder it had in the version.
 * @param {HistoryCore} core
 * @param {{ commit: string, dir: string, key: string, date?: string }} what `dir`: the folder in that version
 * @returns {Promise<{ commit: string|null }>}
 */
export async function restoreDive(core, { commit, dir, key, date = '' }) {
  const info = await core.history('info');
  const now = info.head ? (await divesAt(core, info.head)).get(key) : undefined;
  const paths = [...new Set([dir, ...(now ? [now.dir] : [])])];
  const result = await core.history('restore', [commit, `Restore a dive (${key}) of ${date || commit.slice(0, 7)}`, ...paths]);
  return { commit: result?.commit ?? null };
}

/**
 * The start time of a dive of the list (`date` as the core gives it) as the repository names it.
 * @param {string} date ISO local date and time, `2026-12-01T10:00:00`
 * @returns {string}
 */
export function keyOfDate(date) {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/.exec(String(date));
  return m ? `${m[1]} ${m[2]}:${m[3] ?? '00'}` : '';
}
