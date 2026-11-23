// @ts-check
// The join step (docs/account-sync.md, « First sync of a device that already has data »): a device that holds its own
// equipment, kits, maintenance, certifications and profile meets an account whose `benthic` branch already has data.
// Nothing is sent before the diver has seen what will happen. Each local item is matched to the server's by its natural
// key; the server's id is kept and the local references (`kits.gearIds`, `dive-equipment.*GearId`, `maintenance.gearId`,
// `photoId`) are remapped; empty server fields are filled from the device and differing values follow the newer
// `updatedAt`. Exact matches merge by themselves, doubtful ones are listed (`ambiguous`) for the diver to say « same » or
// « two ». The result is one commit, « Joindre cet appareil ».
//
// Like the engine, no screen code: `core`, `store` and `box` are parameters (tests/app/account-join.test.mjs).

import { sortedJson } from './file-store.js';
import { repositoryKey } from './server-logbook.js';
import { sameComputer } from './dc-model.js';
import { fromBase64 } from './secret-box.js';
import { BRANCH, SYNCED_PREFIXES, codeOf, isSyncedPath, workingCopyName } from './account-sync.js';

/** The commit message of the join. */
export const JOIN_MESSAGE = 'Joindre cet appareil';

/** Attempts when the server moves between the plan and the push. */
const MAX_ATTEMPTS = 3;

/** @param {unknown} s */
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** @param {unknown} v */
const isEmpty = (v) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && v !== null && Object.keys(v).length === 0);

/** @param {unknown} v @returns {v is Record<string, any>} */
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} a @param {unknown} b */
const equal = (a, b) => sortedJson(a) === sortedJson(b);

/** @param {Uint8Array} bytes */
async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The server's file with the device's empty-field gaps filled; where both have a value and they differ, the newer file
 * wins (arrays of text are united).
 * @param {Record<string, any>} remote @param {Record<string, any>} local @param {boolean} localNewer @param {Set<string>} [skip]
 * @returns {Record<string, any>}
 */
export function fillMerge(remote, local, localNewer, skip = new Set()) {
  /** @type {Record<string, any>} */
  const out = { ...remote };
  for (const key of Object.keys(local)) {
    if (skip.has(key)) continue;
    const l = local[key];
    const r = remote[key];
    if (isEmpty(l)) continue;
    if (isEmpty(r)) out[key] = l;
    else if (!equal(r, l)) {
      if (Array.isArray(r) && Array.isArray(l) && [...r, ...l].every((x) => typeof x === 'string')) out[key] = [...new Set([...r, ...l])];
      else if (isPlain(r) && isPlain(l)) out[key] = fillMerge(r, l, localNewer);
      else if (localNewer) out[key] = l;
    }
  }
  return out;
}

/** @param {Record<string, any>} piece */
const pieceModel = (piece) => norm([piece.brand, piece.model].filter(Boolean).join(' ')) || norm(piece.name);

/**
 * How two pieces compare: the same (exact), possibly the same (maybe: one has a serial the other lacks, or several pieces
 * look alike), or two pieces.
 * @param {Record<string, any>} a @param {Record<string, any>} b
 * @returns {'exact'|'maybe'|'no'}
 */
function comparePieces(a, b) {
  if (a.id && a.id === b.id) return 'exact';
  if (a.type !== b.type) return 'no';
  const computer = (/** @type {Record<string, any>} */ p) => ({ model: p.computerModel || [p.brand, p.model].filter(Boolean).join(' ') || p.name || '', serial: p.computerSerial ?? p.serial ?? '' });
  if (a.type === 'computer') return sameComputer(a, computer(b)) && sameComputer(b, computer(a)) ? 'exact' : 'no';
  const sa = norm(a.serial);
  const sb = norm(b.serial);
  if (sa && sb) return sa === sb ? 'exact' : 'no';
  const ma = pieceModel(a);
  if (!ma || ma !== pieceModel(b)) return 'no';
  return sa || sb ? 'maybe' : 'exact';
}

/**
 * Matches two lists with a comparison. A pair is automatic when it is exact and no other item is a candidate of either;
 * every other candidate pair is « ambiguous ».
 * @template T
 * @param {T[]} locals @param {T[]} remotes @param {(l: T, r: T) => 'exact'|'maybe'|'no'} compare
 * @returns {{ pairs: [T, T][], doubtful: [T, T][] }}
 */
function matchLists(locals, remotes, compare) {
  /** @type {Map<T, Map<T, 'exact'|'maybe'>>} */
  const table = new Map();
  /** @type {Map<T, number>} */
  const remoteCandidates = new Map();
  for (const l of locals) {
    const row = new Map();
    for (const r of remotes) {
      const c = compare(l, r);
      if (c === 'no') continue;
      row.set(r, c);
      remoteCandidates.set(r, (remoteCandidates.get(r) ?? 0) + 1);
    }
    table.set(l, row);
  }
  /** @type {[T, T][]} */ const pairs = [];
  /** @type {[T, T][]} */ const doubtful = [];
  for (const [l, row] of table) {
    const entries = [...row];
    if (entries.length === 1 && entries[0][1] === 'exact' && remoteCandidates.get(entries[0][0]) === 1) pairs.push([l, entries[0][0]]);
    else for (const [r] of entries) doubtful.push([l, r]);
  }
  return { pairs, doubtful };
}

/**
 * What the screen shows and the diver answers.
 * @typedef {Object} JoinAmbiguity
 * @property {string} key the answer's key: `<local path>|<server path>`
 * @property {'gear'|'kit'|'maintenance'|'certification'} kind
 * @property {Record<string, any>} local the device's item (the opened payload for a sealed one)
 * @property {Record<string, any>} remote the server's
 * @typedef {{ key: string, choice: 'same'|'two' }} JoinResolution
 * @typedef {Object} JoinAnalysis
 * @property {'ready'|'nothing'|'DIFFERENT_ACCOUNT'|'noSession'|'offline'|'refused'|'error'} state
 * @property {number} [recognised] items found on both sides (merged by themselves)
 * @property {number} [added] items only this device has (they go to the server)
 * @property {JoinAmbiguity[]} [ambiguous]
 * @property {Record<string, { recognised: number, added: number, ambiguous: number }>} [byKind]
 * @property {string[]} [locked] sealed items whose key is missing here: left out
 * @property {string} [error]
 */

/**
 * @typedef {Object} JoinDeps
 * @property {Pick<import('benthic-core').BenthicCorePlugin, 'bgitClone'|'bgitCommit'|'bgitPush'|'bgitHead'|'bgitWrite'|'bgitRead'|'bgitFiles'|'bgitRemove'> & { serverSessionAccess: () => Promise<{repositoryUrl: string, username: string, token: string}> }} core
 * @property {import('./file-store.js').FileStore} store
 * @property {import('./secret-box.js').SecretBox} box
 * @property {() => Date} [now]
 * @property {string} [authorName]
 * @property {string} [authorEmail]
 */

/** @param {JoinDeps} deps */
export function createAccountJoin({ core, store, box, now = () => new Date(), authorName, authorEmail }) {
  const stamp = () => now().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const author = { ...(authorName ? { authorName } : {}), ...(authorEmail ? { authorEmail } : {}) };

  /** @returns {Promise<{ access: any, accountKey: string, dir: string }|JoinAnalysis>} */
  async function session() {
    /** @type {any} */
    let access;
    try {
      access = await core.serverSessionAccess();
    } catch {
      return { state: 'noSession' };
    }
    if (!access?.repositoryUrl || !access.token) return { state: 'noSession' };
    const accountKey = repositoryKey(access.repositoryUrl);
    const syncState = await store.read('meta/sync.json');
    if (syncState?.accountKey && syncState.accountKey !== accountKey) return { state: 'DIFFERENT_ACCOUNT' };
    if (syncState?.accountKey) return { state: 'nothing' };
    return { access, accountKey, dir: workingCopyName(access.repositoryUrl) };
  }

  /** A fresh working copy of the server's branch, and its synced files. @param {any} access @param {string} dir */
  async function freshRemote(access, dir) {
    try {
      await core.bgitRemove({ dir });
    } catch {
      // No copy to remove.
    }
    await core.bgitClone({ dir, username: access.username, token: access.token, branch: BRANCH, url: access.repositoryUrl });
    const paths = (await core.bgitFiles({ dir })).files.filter(isSyncedPath);
    const texts = paths.length ? (await core.bgitRead({ dir, paths })).texts : [];
    /** @type {Map<string, Record<string, any>>} */
    const files = new Map();
    paths.forEach((path, i) => {
      try {
        if (texts[i] != null) files.set(path, JSON.parse(/** @type {string} */ (texts[i])));
      } catch {
        // An unreadable file of the server is left as it is.
      }
    });
    return files;
  }

  /** The device's synced files. @returns {Promise<Map<string, Record<string, any>>>} */
  async function localFiles() {
    /** @type {Map<string, Record<string, any>>} */
    const files = new Map();
    for (const prefix of SYNCED_PREFIXES) {
      for (const path of await store.list(prefix)) {
        if (!isSyncedPath(path)) continue;
        const value = await store.read(path);
        if (value) files.set(path, value);
      }
    }
    return files;
  }

  /** The sealed payload of a profile or certification file; null when its key is missing here. @param {string} path @param {Record<string, any>} file */
  async function open(path, file) {
    const item = path.startsWith('profile/') ? { id: 'profile', format: Number(file.format ?? 1) } : { id: String(file.id), format: Number(file.format ?? 1) };
    let payload = {};
    if (file.enc) {
      try {
        payload = await box.open(file.enc, item);
      } catch (e) {
        if (codeOf(e) === 'MISSING_DATA_KEY') return null;
        throw e;
      }
    }
    if (path.startsWith('profile/') && typeof file.dateOfBirth === 'string' && file.dateOfBirth) payload = { dateOfBirth: file.dateOfBirth, ...payload };
    return payload;
  }

  /** @param {Record<string, any>} p */
  const certKey = (p) => [p.kind ?? 'certification', p.agency, p.level, p.number, p.title, p.insurer].map(norm).join('|');

  /**
   * @param {Map<string, Record<string, any>>} local @param {Map<string, Record<string, any>>} remote @param {Map<string, string>} answers key → 'same'|'two'
   * @param {{ reseal: boolean }} options
   */
  async function buildPlan(local, remote, answers, { reseal }) {
    /** @type {Map<string, Record<string, any>>} */
    const finalFiles = new Map(remote);
    /** @type {Set<string>} */ const dropLocal = new Set();
    /** @type {Set<string>} */ const handled = new Set();
    /** @type {Set<string>} */ const lockedPaths = new Set();
    /** @type {JoinAmbiguity[]} */ const ambiguous = [];
    /** @type {Record<string, { recognised: number, added: number, ambiguous: number }>} */
    const byKind = {};
    const count = (/** @type {string} */ kind) => (byKind[kind] ??= { recognised: 0, added: 0, ambiguous: 0 });
    const pathOf = (/** @type {string} */ folder, /** @type {Record<string, any>} */ item) => `${folder}/${item.id}.json`;
    const values = (/** @type {string} */ prefix, /** @type {Map<string, Record<string, any>>} */ m) => [...m].filter(([p]) => p.startsWith(prefix)).map(([, v]) => v);

    /**
     * Pairs by a comparison, with the diver's answers applied to the doubtful ones.
     * @param {'gear'|'kit'|'maintenance'|'certification'} kind @param {string} folder
     * @param {Record<string, any>[]} locals @param {Record<string, any>[]} remotes @param {(l: any, r: any) => 'exact'|'maybe'|'no'} compare
     * @param {(item: any) => Record<string, any>} [shown] what the screen shows of an item
     */
    function pair(kind, folder, locals, remotes, compare, shown = (x) => x) {
      const { pairs, doubtful } = matchLists(locals, remotes, compare);
      const used = new Set(pairs.flat());
      for (const [l, r] of doubtful) {
        const key = `${pathOf(folder, l)}|${pathOf(folder, r)}`;
        ambiguous.push({ key, kind, local: shown(l), remote: shown(r) });
        count(kind).ambiguous++;
        if (answers.get(key) === 'same' && !used.has(l) && !used.has(r)) {
          pairs.push([l, r]);
          used.add(l);
          used.add(r);
        }
      }
      count(kind).recognised += pairs.length;
      count(kind).added += locals.length - pairs.length;
      return pairs;
    }

    // --- Gear, then everything that points at it.
    /** @type {Map<string, string>} */
    const gearMap = new Map();
    const localGear = values('gear/', local);
    const remoteGear = values('gear/', remote);
    for (const [l, r] of pair('gear', 'gear', localGear, remoteGear, comparePieces)) {
      gearMap.set(l.id, r.id);
      const localNewer = String(l.updatedAt ?? '') > String(r.updatedAt ?? '');
      let merged = fillMerge(r, l, localNewer, new Set(['id', 'createdAt', 'updatedAt', 'format', 'photoId']));
      if (isEmpty(r.photoId) && l.photoId) merged.photoId = l.photoId;
      else if (l.photoId && l.photoId !== r.photoId) dropLocal.add(`gear-photos/${l.photoId}.json`);
      if (l.createdAt && String(l.createdAt) < String(r.createdAt ?? 'z')) merged.createdAt = l.createdAt;
      merged.updatedAt = equal({ ...merged, updatedAt: '' }, { ...r, updatedAt: '' }) ? r.updatedAt : stamp();
      finalFiles.set(pathOf('gear', r), merged);
      dropLocal.add(pathOf('gear', l));
      handled.add(pathOf('gear', l));
    }
    const mapGear = (/** @type {any} */ id) => (typeof id === 'string' && gearMap.has(id) ? /** @type {string} */ (gearMap.get(id)) : id);

    // --- Kits: the name.
    /** @type {Map<string, string>} */
    const kitMap = new Map();
    const localKits = values('kits/', local);
    const remoteKits = values('kits/', remote);
    const kitPairs = pair('kit', 'kits', localKits, remoteKits, (l, r) => (l.id === r.id || (norm(l.name) && norm(l.name) === norm(r.name)) ? 'exact' : 'no'));
    for (const [l, r] of kitPairs) {
      kitMap.set(l.id, r.id);
      const merged = { ...r, gearIds: [...new Set([...(r.gearIds ?? []), ...(l.gearIds ?? []).map(mapGear)])] };
      if (!equal(merged.gearIds, r.gearIds ?? [])) merged.updatedAt = stamp();
      finalFiles.set(pathOf('kits', r), merged);
      dropLocal.add(pathOf('kits', l));
      handled.add(pathOf('kits', l));
    }
    const mapKit = (/** @type {any} */ id) => (typeof id === 'string' && kitMap.has(id) ? /** @type {string} */ (kitMap.get(id)) : id);
    const matchedKitLocals = new Set(kitPairs.map(([l]) => l.id));
    for (const kit of localKits) {
      if (matchedKitLocals.has(kit.id)) continue;
      const next = { ...kit, gearIds: (kit.gearIds ?? []).map(mapGear) };
      if (!equal(next, kit)) next.updatedAt = stamp();
      finalFiles.set(pathOf('kits', kit), next);
      handled.add(pathOf('kits', kit));
    }

    // --- Maintenance: the piece and the task.
    const localMaint = values('maintenance/', local).map((m) => ({ ...m, gearId: mapGear(m.gearId), $original: m }));
    const remoteMaint = values('maintenance/', remote);
    const sameTask = (/** @type {any} */ l, /** @type {any} */ r) =>
      l.id === r.id || (l.gearId === r.gearId && l.task === r.task && (l.task !== 'custom' || norm(l.label) === norm(r.label))) ? 'exact' : 'no';
    const maintPairs = pair('maintenance', 'maintenance', localMaint, remoteMaint, sameTask);
    const entryKey = (/** @type {any} */ h) => [h.kind, h.doneOn, norm(h.doneBy), h.cost ?? ''].join('|');
    for (const [l, r] of maintPairs) {
      const localNewer = String(l.updatedAt ?? '') > String(r.updatedAt ?? '');
      const merged = fillMerge(r, l, localNewer, new Set(['id', 'createdAt', 'updatedAt', 'format', 'history', 'gearId', '$original']));
      const known = new Set((r.history ?? []).map(entryKey));
      const history = [...(r.history ?? []), ...(l.history ?? []).filter((/** @type {any} */ h) => !known.has(entryKey(h)))]
        .sort((a, b) => (a.doneOn < b.doneOn ? 1 : a.doneOn > b.doneOn ? -1 : a.id < b.id ? -1 : 1));
      if (history.length) Object.assign(merged, { history, lastDoneOn: history[0].doneOn });
      merged.updatedAt = equal({ ...merged, updatedAt: '' }, { ...r, updatedAt: '' }) ? r.updatedAt : stamp();
      finalFiles.set(pathOf('maintenance', r), merged);
      dropLocal.add(pathOf('maintenance', l.$original));
      handled.add(pathOf('maintenance', l.$original));
    }
    const matchedMaint = new Set(maintPairs.map(([l]) => l.id));
    for (const m of localMaint) {
      if (matchedMaint.has(m.id)) continue;
      const { $original, ...next } = m;
      if (!equal(next, $original)) next.updatedAt = stamp();
      finalFiles.set(pathOf('maintenance', next), next);
      handled.add(pathOf('maintenance', next));
    }

    // --- What each dive used: the dive.
    const remoteByDive = new Map(values('dive-equipment/', remote).map((r) => [r.diveKey?.start, r]));
    const remapEquipment = (/** @type {Record<string, any>} */ rec) => ({
      ...rec,
      suitGearId: mapGear(rec.suitGearId ?? ''),
      undersuitGearId: mapGear(rec.undersuitGearId ?? ''),
      gearIds: (rec.gearIds ?? []).map(mapGear),
      kitId: mapKit(rec.kitId ?? ''),
    });
    for (const rec of values('dive-equipment/', local)) {
      const start = rec.diveKey?.start;
      const r = remoteByDive.get(start);
      const mapped = remapEquipment(rec);
      if (r) {
        count('diveEquipment').recognised++;
        const localNewer = String(rec.updatedAt ?? '') > String(r.updatedAt ?? '');
        const merged = fillMerge(r, mapped, localNewer, new Set(['id', 'createdAt', 'updatedAt', 'format', 'diveKey', 'gearIds', 'adhoc']));
        merged.gearIds = [...new Set([...(r.gearIds ?? []), ...mapped.gearIds])];
        const adhoc = [...(r.adhoc ?? [])];
        for (const p of mapped.adhoc ?? []) if (!adhoc.some((q) => norm(q.name) === norm(p.name))) adhoc.push(p);
        merged.adhoc = adhoc;
        merged.updatedAt = equal({ ...merged, updatedAt: '' }, { ...r, updatedAt: '' }) ? r.updatedAt : stamp();
        finalFiles.set(pathOf('dive-equipment', r), merged);
        dropLocal.add(pathOf('dive-equipment', rec));
      } else {
        count('diveEquipment').added++;
        const next = equal(mapped, rec) ? mapped : { ...mapped, updatedAt: stamp() };
        finalFiles.set(pathOf('dive-equipment', rec), next);
      }
      handled.add(pathOf('dive-equipment', rec));
    }

    // --- Dive validations: who signed, when.
    const validationKey = (/** @type {any} */ v) => [v.at, norm(v.signer?.name), v.method].join('|');
    const remoteValidations = new Map(values('dive-validations/', remote).map((r) => [validationKey(r), r]));
    for (const v of values('dive-validations/', local)) {
      const r = remoteValidations.get(validationKey(v));
      if (r) {
        handled.add(pathOf('dive-validations', v));
        count('validation').recognised++;
        const dives = [...(r.dives ?? [])];
        for (const d of v.dives ?? []) if (!dives.some((x) => x.start === d.start)) dives.push(d);
        finalFiles.set(pathOf('dive-validations', r), equal(dives, r.dives ?? []) ? r : { ...r, dives, updatedAt: stamp() });
        dropLocal.add(pathOf('dive-validations', v));
      } else count('validation').added++;
    }

    // --- The profile, sealed: one file, merged by field.
    const sealedLeft = /** @type {{ path: string, file: Record<string, any>, payload: Record<string, any> }[]} */ ([]);
    const lp = local.get('profile/diver.json');
    const rp = remote.get('profile/diver.json');
    if (lp) {
      handled.add('profile/diver.json');
      const localPayload = await open('profile/diver.json', lp);
      const remotePayload = rp ? await open('profile/diver.json', rp) : {};
      if (localPayload === null || remotePayload === null) lockedPaths.add('profile/diver.json');
      else {
        const localNewer = String(lp.updatedAt ?? '') > String(rp?.updatedAt ?? '');
        const payload = rp ? fillMerge(remotePayload, localPayload, localNewer) : localPayload;
        const { enc, dateOfBirth, ...localRest } = lp;
        const { enc: remoteEnc, dateOfBirth: remoteBirth, ...remoteRest } = rp ?? {};
        const rest = fillMerge(remoteRest, localRest, localNewer, new Set(['updatedAt']));
        if (rp) count('profile').recognised++;
        else count('profile').added++;
        if (!rp || !equal(payload, remotePayload) || !equal(rest, remoteRest)) sealedLeft.push({ path: 'profile/diver.json', file: { ...rest, format: 1, updatedAt: stamp() }, payload });
      }
    }

    // --- Certifications and documents, sealed: the kind, the agency, the level, the number.
    /** @type {{ id: string, path: string, file: Record<string, any>, payload: Record<string, any> }[]} */
    const certs = [];
    for (const [path, file] of local) if (path.startsWith('certifications/')) certs.push({ id: String(file.id), path, file, payload: /** @type {any} */ (await open(path, file)) });
    /** @type {{ id: string, path: string, file: Record<string, any>, payload: Record<string, any> }[]} */
    const remoteCerts = [];
    for (const [path, file] of remote) if (path.startsWith('certifications/')) remoteCerts.push({ id: String(file.id), path, file, payload: /** @type {any} */ (await open(path, file)) });
    const openLocals = certs.filter((c) => {
      if (c.payload !== null) return true;
      lockedPaths.add(c.path);
      handled.add(c.path);
      return false;
    });
    const openRemotes = remoteCerts.filter((c) => c.payload !== null);
    const certCompare = (/** @type {any} */ l, /** @type {any} */ r) => {
      if (l.id === r.id) return 'exact';
      if (certKey(l.payload) === certKey(r.payload)) return 'exact';
      const a = l.payload;
      const b = r.payload;
      return a.kind === b.kind && norm(a.agency) && norm(a.agency) === norm(b.agency) && norm(a.level) === norm(b.level) && (!norm(a.number) || !norm(b.number)) ? 'maybe' : 'no';
    };
    const certPairs = pair('certification', 'certifications', openLocals, openRemotes, certCompare, (c) => c.payload);
    const certMatch = new Map(certPairs.map(([l, r]) => [l.id, r]));
    /** @type {{ path: string, from: string, to: string, file: Record<string, any>, payload: Record<string, any>, remotePayload: Record<string, any>|null, localNewer: boolean }[]} */
    const certWork = [];
    for (const l of openLocals) {
      handled.add(l.path);
      const r = certMatch.get(l.id);
      if (r) dropLocal.add(l.path);
      certWork.push({ path: r ? r.path : l.path, from: l.id, to: r ? r.id : l.id, file: r ? r.file : l.file, payload: l.payload, remotePayload: r ? r.payload : null, localNewer: String(l.file.updatedAt ?? '') > String(r?.file.updatedAt ?? '') });
    }

    // Local files no rule above covered (photos, documents, other kinds) go as they are.
    const documentFiles = new Map([...local].filter(([p]) => p.startsWith('documents/')));
    for (const [path, file] of local) {
      if (handled.has(path) || path.startsWith('documents/')) continue;
      if (dropLocal.has(path) || lockedPaths.has(path)) continue;
      if (!finalFiles.has(path)) finalFiles.set(path, file);
    }

    // --- Sealing: only when the plan is applied.
    if (reseal) {
      for (const s of sealedLeft) {
        const enc = await box.seal(s.payload, { id: 'profile', format: 1 });
        finalFiles.set(s.path, { ...s.file, enc });
      }
      for (const w of certWork) {
        const docs = [];
        const remoteDocs = w.remotePayload?.documents ?? [];
        for (const d of w.payload.documents ?? []) {
          if (w.remotePayload && remoteDocs.some((x) => x.side === d.side && (x.page ?? 0) === (d.page ?? 0))) {
            dropLocal.add(`documents/${d.hash}.json`);
            continue;
          }
          const file = documentFiles.get(`documents/${d.hash}.json`);
          if (!file?.enc) {
            docs.push(d);
            continue;
          }
          let bytes;
          try {
            bytes = await box.openBytes(file.enc, { id: w.from, format: 1 });
          } catch (e) {
            if (codeOf(e) !== 'MISSING_DATA_KEY') throw e;
            docs.push(d);
            continue;
          }
          const sealed = await box.sealBytes(bytes, { id: w.to, format: 1 });
          const hash = await sha256Hex(fromBase64(sealed.ct));
          finalFiles.set(`documents/${hash}.json`, { format: 1, enc: sealed });
          dropLocal.add(`documents/${d.hash}.json`);
          docs.push({ ...d, hash });
        }
        const merged = w.remotePayload ? fillMerge(w.remotePayload, w.payload, w.localNewer, new Set(['documents'])) : { ...w.payload };
        const allDocs = [...remoteDocs, ...docs];
        if (allDocs.length) merged.documents = allDocs;
        const enc = await box.seal(merged, { id: w.to, format: Number(w.file.format ?? 1) });
        const changed = !w.remotePayload || !equal(merged, w.remotePayload);
        finalFiles.set(w.path, { ...w.file, id: w.to, enc, updatedAt: changed ? stamp() : w.file.updatedAt });
      }
    }
    // A document no card replaced stays as it is.
    for (const [path, file] of documentFiles) if (!finalFiles.has(path) && !dropLocal.has(path) && !lockedPaths.has(path)) finalFiles.set(path, file);

    let recognised = 0;
    let added = 0;
    let doubtful = 0;
    for (const c of Object.values(byKind)) {
      recognised += c.recognised;
      added += c.added;
      doubtful += c.ambiguous;
    }
    return { finalFiles, dropLocal, lockedPaths, ambiguous, byKind, recognised, added, doubtful };
  }

  /** @param {JoinResolution[]} resolutions */
  const answersOf = (resolutions) => new Map(resolutions.map((r) => [r.key, r.choice]));

  return {
    /**
     * What joining would do, without changing anything on the device or on the server.
     * @returns {Promise<JoinAnalysis>}
     */
    async analyse() {
      const s = await session();
      if ('state' in s) return s;
      try {
        const remote = await freshRemote(s.access, s.dir);
        const local = await localFiles();
        if (!local.size || !remote.size) return { state: 'nothing' };
        const plan = await buildPlan(local, remote, new Map(), { reseal: false });
        return {
          state: 'ready',
          recognised: plan.recognised,
          added: plan.added,
          ambiguous: plan.ambiguous,
          byKind: plan.byKind,
          locked: [...plan.lockedPaths],
        };
      } catch (e) {
        return failure(e);
      }
    },

    /**
     * Joins: one commit, « Joindre cet appareil », sent to the server; then the device holds the server's ids.
     * @param {JoinResolution[]} [resolutions] the diver's answers to `ambiguous` (an unanswered one counts as « two »)
     * @returns {Promise<{ state: 'joined'|'busy'|JoinAnalysis['state'], head?: string|null, recognised?: number, added?: number, error?: string }>}
     */
    async apply(resolutions = []) {
      const s = await session();
      if ('state' in s) return s;
      const answers = answersOf(resolutions);
      try {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          const remote = await freshRemote(s.access, s.dir);
          const local = await localFiles();
          if (!local.size || !remote.size) return { state: 'nothing' };
          // Before the first push every existing file is pending: whatever happens next, nothing is forgotten.
          await store.trackedBatch({ writes: [...local].map(([p, v]) => [p, v]) });
          const snapshot = await store.snapshotPending();
          const plan = await buildPlan(local, remote, answers, { reseal: true });

          const remoteText = (/** @type {string} */ path) => (remote.has(path) ? sortedJson(remote.get(path)) : null);
          const writes = [...plan.finalFiles].filter(([path, v]) => remoteText(path) !== sortedJson(v)).map(([path, v]) => ({ path, text: sortedJson(v) }));
          if (writes.length) {
            await core.bgitWrite({ dir: s.dir, files: writes });
            await core.bgitCommit({ dir: s.dir, paths: writes.map((w) => w.path), message: JOIN_MESSAGE, ...author });
            try {
              await core.bgitPush({ dir: s.dir, username: s.access.username, token: s.access.token, branch: BRANCH });
            } catch (e) {
              if (codeOf(e) === 'REJECTED' && attempt < MAX_ATTEMPTS) continue; // the server moved: plan again from its new state
              throw e;
            }
          }
          const { head } = await core.bgitHead({ dir: s.dir, branch: BRANCH });

          // The device now holds what the server holds, under the server's ids.
          /** @type {[string, string|null][]} */ const expected = [];
          /** @type {[string, unknown][]} */ const localWrites = [];
          /** @type {string[]} */ const removes = [];
          for (const [path, value] of plan.finalFiles) {
            const text = sortedJson(value);
            const current = local.has(path) ? sortedJson(local.get(path)) : null;
            if (current === text) continue;
            expected.push([path, (await store.readSnapshot(path).catch(() => ({ text: null }))).text]);
            localWrites.push([path, value]);
          }
          for (const path of local.keys()) {
            if (plan.finalFiles.has(path) || plan.lockedPaths.has(path)) continue;
            expected.push([path, (await store.readSnapshot(path).catch(() => ({ text: null }))).text]);
            removes.push(path);
          }
          const acknowledged = snapshot.filter(([p]) => !plan.lockedPaths.has(p));
          const applied = await store.applySyncedIfUnchanged(expected, { writes: localWrites, removes }, acknowledged);
          if (!applied) return { state: 'busy', head };
          await store.write('meta/sync.json', { format: 1, accountKey: s.accountKey, head: head ?? '', syncedAt: stamp() });
          return { state: 'joined', head, recognised: plan.recognised, added: plan.added };
        }
        return { state: 'error', error: 'REJECTED' };
      } catch (e) {
        return failure(e);
      }
    },
  };

  /** @param {unknown} e @returns {JoinAnalysis & { state: any }} */
  function failure(e) {
    const code = codeOf(e);
    if (code === 'UNREACHABLE') return { state: 'offline', error: code };
    if (code === 'REFUSED' || code === 'BAD_CREDENTIALS') return { state: 'refused', error: code };
    return { state: 'error', error: code || 'GIT_ERROR' };
  }
}
