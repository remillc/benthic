// @ts-check
// The import of a `.benthic` file (task 2026-11-23-360): the inverse of the full export (lib/full-export.js). The file is a
// ZIP archive whose `manifest.json` lists every file with its size and SHA-256. The import is ALL OR NOTHING:
//   1. verify: every file of the manifest is read once and checked against its size and hash; one that is missing, cut or
//      different makes the file « incomplete » and nothing else happens;
//   2. stage: the logbook (`logbook/logbook.ssrf`) goes to the app's cache in pieces (never one string through the bridge);
//      the equipment, kits, maintenance, what each dive used, the gear photos, the profile and the certifications are read
//      and turned into the files the store keeps. The sensitive items (written in clear in the archive) are sealed here, with
//      THIS device's data key, into a scratch store: the real one is not touched;
//   3. write, only when every step succeeded: the store files go in one transaction (`trackedBatch`, so they are ordinary
//      local edits that an account syncs under the existing join rules), then the logbook goes through the existing paths
//      (« Importer un carnet »: `replaceDeviceLogbook`, or the new device logbook) given in `deps.applyLogbook`. If that
//      fails the store is put back as it was. Staged files are deleted whatever the outcome.
// A cancel (`signal`) before the write ends the same way: nothing was changed. No screen code: `deps` carries the platform
// (tests/app/benthic-import.test.mjs).
import { createFileStore, memoryBackend } from './file-store.js';
import { createProfile } from './profile.js';
import { blobSource, entryChunks, hashEntry, readCentralDirectory, readEntry, ZipError } from './zip-read.js';
import { STAGE_CHUNK } from './staged-file.js';
import { toBase64 } from './zip-fit.js';

/** The newest archive format this version reads (`EXPORT_FORMAT` of lib/full-export.js). */
export const SUPPORTED_FORMAT = 1;

/** Whether a file name is a `.benthic` file. @param {string} name */
export const isBenthicName = (name) => /\.benthic$/i.test(String(name));

/**
 * What is wrong with the file. `code`: `NOT_BENTHIC` (not an archive of Benthic: unreadable), `INCOMPLETE` (it is one, but
 * files are missing or differ from their hash: `bad` lists them; null when the archive itself is cut short), `TOO_NEW`
 * (written by a newer version), `CANCELLED`, `BAD_LOGBOOK` (the logbook inside cannot be read), `FAILED`.
 */
export class BenthicImportError extends Error {
  /** @param {'NOT_BENTHIC'|'INCOMPLETE'|'TOO_NEW'|'CANCELLED'|'BAD_LOGBOOK'|'FAILED'} code @param {{ bad?: { path: string, reason: string }[]|null, cause?: unknown }} [more] */
  constructor(code, { bad = [], cause } = {}) {
    super(code);
    this.code = code;
    /** @type {{ path: string, reason: string }[]|null} */
    this.bad = bad;
    this.cause = cause;
  }
}

/** @param {AbortSignal|undefined} signal */
function checkSignal(signal) {
  if (signal?.aborted) throw new BenthicImportError('CANCELLED');
}

/**
 * @typedef {Object} Counts what the file holds, read from its manifest (the sites from `counts.sites` when the export wrote it)
 * @property {number} dives
 * @property {number|null} sites
 * @property {number} gear pieces
 * @property {number} kits
 * @property {number} maintenance
 * @property {number} certifications cards
 * @property {number} documents insurance, medical and other documents
 * @property {boolean} profile the diver profile is there
 * @property {number} media photos and videos of the dives
 * @property {number} mediaBytes
 * @property {number} files files in the manifest
 * @property {number} bytes their total size
 */

/**
 * @typedef {Object} Inspection
 * @property {import('./zip-read.js').ByteSource} source
 * @property {Map<string, import('./zip-read.js').ZipEntry>} entries
 * @property {any} manifest
 * @property {{ path: string, size: number, sha256: string }[]} files the manifest's files
 * @property {Counts} counts
 * @property {string} exportedAt ISO instant
 * @property {boolean} sensitive the file holds personal information in clear
 * @property {boolean} hasLogbook
 */

/** The prefix of the Benthic data in the archive. */
const DATA = 'benthic/';

/**
 * Reads the end of the archive and its manifest, nothing more: fast, whatever the size. The counts are the manifest's.
 * @param {import('./zip-read.js').ByteSource} source
 * @returns {Promise<Inspection>}
 * @throws {BenthicImportError} NOT_BENTHIC, INCOMPLETE (cut short), TOO_NEW
 */
export async function inspectBenthic(source) {
  /** @type {import('./zip-read.js').ZipEntry[]} */
  let list;
  try {
    list = await readCentralDirectory(source);
  } catch (e) {
    if (!(e instanceof ZipError)) throw e;
    // A cut file still starts like an archive (a local header); something else is not an archive at all.
    const head = await source.read(0, 4).catch(() => new Uint8Array(0));
    const looksLikeZip = head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4;
    throw new BenthicImportError(looksLikeZip || e.code === 'ZIP_TRUNCATED' ? 'INCOMPLETE' : 'NOT_BENTHIC', { bad: null });
  }
  const entries = new Map(list.map((e) => [e.name, e]));
  const entry = entries.get('manifest.json');
  if (!entry) throw new BenthicImportError('NOT_BENTHIC');
  /** @type {any} */
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(await readEntry(source, entry)));
  } catch (e) {
    throw new BenthicImportError('INCOMPLETE', { bad: [{ path: 'manifest.json', reason: 'unreadable' }], cause: e });
  }
  if (!manifest || manifest.app !== 'Benthic' || !Array.isArray(manifest.files)) throw new BenthicImportError('NOT_BENTHIC');
  if (Number(manifest.format) > SUPPORTED_FORMAT) throw new BenthicImportError('TOO_NEW');
  const files = manifest.files.filter((/** @type {any} */ f) => f && typeof f.path === 'string' && typeof f.sha256 === 'string' && Number.isFinite(f.size));
  if (files.length !== manifest.files.length) throw new BenthicImportError('NOT_BENTHIC');
  const folder = (/** @type {string} */ prefix) => files.filter((/** @type {{ path: string }} */ f) => f.path.startsWith(prefix) && f.path.endsWith('.json'));
  const media = files.filter((/** @type {{ path: string }} */ f) => f.path.startsWith('dive-media/'));
  let cards = 0;
  let documents = 0;
  for (const f of folder(`${DATA}certifications/`)) {
    const e = entries.get(f.path);
    if (!e) continue;
    try {
      const card = JSON.parse(new TextDecoder().decode(await readEntry(source, e)));
      if (!card.kind || card.kind === 'certification') cards++;
      else documents++;
    } catch {
      // Counted when verified: a damaged card makes the file incomplete there.
      cards++;
    }
  }
  /** @type {Counts} */
  const counts = {
    dives: Number.isFinite(manifest.dives) ? Number(manifest.dives) : 0,
    sites: Number.isFinite(manifest.counts?.sites) ? Number(manifest.counts.sites) : null,
    gear: folder(`${DATA}gear/`).length,
    kits: folder(`${DATA}kits/`).length,
    maintenance: folder(`${DATA}maintenance/`).length,
    certifications: cards,
    documents,
    profile: files.some((/** @type {{ path: string }} */ f) => f.path === `${DATA}profile/diver.json`),
    media: media.length,
    mediaBytes: media.reduce((/** @type {number} */ n, /** @type {{ size: number }} */ f) => n + f.size, 0),
    files: files.length,
    bytes: files.reduce((/** @type {number} */ n, /** @type {{ size: number }} */ f) => n + f.size, 0),
  };
  return {
    source,
    entries,
    manifest,
    files,
    counts,
    exportedAt: typeof manifest.exportedAt === 'string' ? manifest.exportedAt : '',
    sensitive: manifest.containsSensitive === true || manifest.sensitiveInClear === true,
    hasLogbook: files.some((/** @type {{ path: string }} */ f) => f.path === 'logbook/logbook.ssrf'),
  };
}

/**
 * Step 1: every file of the manifest is read and compared with its size and SHA-256. All of them are checked (so that the
 * message can say how many differ), then the file is accepted or refused as a whole.
 * @param {Inspection} inspection
 * @param {{ onProgress?: (p: { files: number, bytes: number }) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<{ files: number }>} the files checked, all intact
 * @throws {BenthicImportError} INCOMPLETE with the files that differ, CANCELLED
 */
export async function verifyBenthic(inspection, { onProgress, signal } = {}) {
  /** @type {{ path: string, reason: string }[]} */
  const bad = [];
  let bytes = 0;
  let files = 0;
  for (const f of inspection.files) {
    checkSignal(signal);
    const entry = inspection.entries.get(f.path);
    if (!entry) {
      bad.push({ path: f.path, reason: 'missing' });
    } else {
      try {
        const got = await hashEntry(inspection.source, entry, (n) => {
          bytes += n;
          checkSignal(signal);
          onProgress?.({ files, bytes });
        });
        if (got.size !== f.size) bad.push({ path: f.path, reason: 'size' });
        else if (got.sha256 !== f.sha256) bad.push({ path: f.path, reason: 'hash' });
      } catch (e) {
        if (e instanceof BenthicImportError) throw e;
        bad.push({ path: f.path, reason: 'unreadable' });
      }
    }
    files++;
    onProgress?.({ files, bytes });
  }
  if (bad.length) throw new BenthicImportError('INCOMPLETE', { bad });
  return { files };
}

/**
 * @typedef {Object} StagedLogbook
 * @property {string} path the logbook as a file of the app's cache
 * @property {number} size
 */

/**
 * The logbook entry written to the app's cache in pieces of 3 MB.
 * @param {import('./staged-file.js').StagedCore} core
 * @param {import('./zip-read.js').ByteSource} source
 * @param {import('./zip-read.js').ZipEntry} entry
 * @param {string} name the staged file's name (the core reads its format from it)
 * @param {(bytes: number) => void} [onBytes]
 * @param {AbortSignal} [signal]
 * @returns {Promise<StagedLogbook>}
 */
export async function stageEntry(core, source, entry, name, onBytes, signal) {
  let path = '';
  let size = 0;
  let pending = new Uint8Array(0);
  /** @param {Uint8Array} bytes */
  const send = async (bytes) => {
    const data = toBase64(bytes);
    ({ path } = path ? await core.stageImport({ path, data, append: true }) : await core.stageImport({ name, data }));
  };
  try {
    for await (const chunk of entryChunks(source, entry)) {
      checkSignal(signal);
      size += chunk.length;
      onBytes?.(chunk.length);
      const joined = new Uint8Array(pending.length + chunk.length);
      joined.set(pending);
      joined.set(chunk, pending.length);
      pending = joined;
      while (pending.length >= STAGE_CHUNK) {
        await send(pending.subarray(0, STAGE_CHUNK));
        pending = pending.slice(STAGE_CHUNK);
      }
    }
    if (pending.length || !path) await send(pending);
  } catch (e) {
    if (path) await core.discardImport({ path }).catch(() => {});
    throw e;
  }
  return { path, size };
}

/** The mime types of the photos of pieces and invoices, by extension. */
const IMAGE_MIME = /** @type {Record<string, string>} */ ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });

/** Folders of the archive's Benthic data that are not copied as they are. */
const NOT_COPIED = ['profile/', 'certifications/', 'documents/', 'meta/', 'media/', 'gear-photos/', 'settings.json'];

/** The folders of the store that hold the equipment and what the dives used; the profile and the certifications are the other group. */
const EQUIPMENT_FOLDERS = ['gear/', 'kits/', 'maintenance/', 'dive-equipment/', 'dive-validations/', 'gear-photos/'];
const PROFILE_FOLDERS = ['profile/', 'certifications/', 'documents/'];

/**
 * @typedef {Object} StagedData the Benthic data, as the files the store keeps
 * @property {[string, unknown][]} writes
 * @property {string[]} replaces the folders whose existing files go (the group the file brings)
 * @property {{ equipment: boolean, profile: boolean }} groups
 */

/**
 * Step 3 of the list on screen, « Équipement, profil et brevets »: reads the archive's data and builds the store's files. The
 * sensitive items are sealed with this device's key into a scratch store; nothing real is written.
 * @param {Inspection} inspection
 * @param {{ box: import('./secret-box.js').SecretBox, now?: () => Date }} deps
 * @param {{ onBytes?: (bytes: number) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<StagedData>}
 */
export async function stageData(inspection, { box, now = () => new Date() }, { onBytes, signal } = {}) {
  const { source, entries, files, exportedAt } = inspection;
  const dec = new TextDecoder();
  /** @param {string} path */
  const bytesOf = async (path) => {
    checkSignal(signal);
    const entry = entries.get(path);
    if (!entry) throw new BenthicImportError('INCOMPLETE', { bad: [{ path, reason: 'missing' }] });
    const bytes = await readEntry(source, entry);
    onBytes?.(bytes.length);
    return bytes;
  };
  /** @param {string} path */
  const jsonOf = async (path) => JSON.parse(dec.decode(await bytesOf(path)));

  /** @type {[string, unknown][]} */
  const writes = [];
  /** The data of the archive, by group. */
  let equipment = false;
  let profileGroup = false;
  for (const { path } of files) {
    if (!path.startsWith(DATA) || path.includes('..')) continue;
    const rel = path.slice(DATA.length);
    if (rel.startsWith('gear-photos/')) {
      const m = /^gear-photos\/([^/]+)\.([a-z0-9]+)$/i.exec(rel);
      if (!m) continue;
      const bytes = await bytesOf(path);
      const mime = IMAGE_MIME[m[2].toLowerCase()] ?? 'application/octet-stream';
      writes.push([`gear-photos/${m[1]}.json`, { format: 1, id: m[1], createdAt: exportedAt, dataUrl: `data:${mime};base64,${toBase64(bytes)}` }]);
      equipment = true;
      continue;
    }
    if (!rel.endsWith('.json') || NOT_COPIED.some((p) => rel.startsWith(p) || rel === p)) continue;
    writes.push([rel, await jsonOf(path)]);
    if (EQUIPMENT_FOLDERS.some((p) => rel.startsWith(p))) equipment = true;
  }

  // The profile and the certifications are written in clear in the archive: they are sealed here, with this device's key,
  // into a scratch store, and their files are what is written for real at the end.
  const scratch = createFileStore(memoryBackend());
  if (entries.has(`${DATA}profile/diver.json`)) {
    const diver = await jsonOf(`${DATA}profile/diver.json`);
    const profile = createProfile(scratch, box, { now });
    await profile.saveInfo({
      fullName: typeof diver.fullName === 'string' ? diver.fullName : '',
      dateOfBirth: typeof diver.dateOfBirth === 'string' ? diver.dateOfBirth : '',
      emergency: { name: diver.emergencyContact?.name ?? '', relation: diver.emergencyContact?.relation ?? '', phone: { country: diver.emergencyContact?.phone?.country ?? 'CA', number: diver.emergencyContact?.phone?.number ?? '' } },
      bloodGroup: typeof diver.bloodGroup === 'string' ? diver.bloodGroup : '',
    });
    // The file keeps the time of the last change made in the exported logbook (the sync's rules compare it).
    const written = await scratch.read('profile/diver.json');
    if (typeof diver.updatedAt === 'string' && diver.updatedAt) await scratch.write('profile/diver.json', { ...written, updatedAt: diver.updatedAt });
    profileGroup = true;
  }
  for (const { path } of files) {
    const m = /^benthic\/certifications\/([^/]+)\.json$/.exec(path);
    if (!m) continue;
    const card = await jsonOf(path);
    if (typeof card.id !== 'string' || !card.id) throw new BenthicImportError('INCOMPLETE', { bad: [{ path, reason: 'unreadable' }] });
    /** @type {{ side: 'front'|'back'|'page', page?: number, bytes: Uint8Array, mime: string }[]} */
    const photos = [];
    for (const d of Array.isArray(card.documents) ? card.documents : []) {
      if (typeof d.file !== 'string' || d.file.includes('..')) continue;
      photos.push({ side: d.side, ...(d.page ? { page: d.page } : {}), bytes: await bytesOf(`${DATA}${d.file}`), mime: d.mime === 'application/pdf' ? 'application/pdf' : 'image/jpeg' });
    }
    const id = card.id;
    const profile = createProfile(scratch, box, { now, id: () => id });
    await profile.saveDocument({ ...card, id: undefined, files: photos });
    const written = await scratch.read(`certifications/${id}.json`);
    if (typeof card.updatedAt === 'string' && card.updatedAt) await scratch.write(`certifications/${id}.json`, { ...written, updatedAt: card.updatedAt });
    profileGroup = true;
  }
  for (const folder of ['profile/', 'certifications/', 'documents/']) {
    for (const path of await scratch.list(folder)) writes.push([path, await scratch.read(path)]);
  }

  /** @type {string[]} */
  const replaces = [];
  if (equipment) replaces.push(...EQUIPMENT_FOLDERS);
  if (profileGroup) replaces.push(...PROFILE_FOLDERS);
  return { writes, replaces, groups: { equipment, profile: profileGroup } };
}

/**
 * The store changed in one transaction, the way every edit of the inventory is (`trackedBatch`): the paths are recorded as
 * not sent yet. The files of the groups the archive brings are replaced as a whole. Returns what undoes it.
 * @param {import('./file-store.js').FileStore} store
 * @param {StagedData} data
 * @returns {Promise<() => Promise<void>>}
 */
export async function writeData(store, data) {
  const writePaths = new Set(data.writes.map(([p]) => p));
  /** @type {string[]} */
  const removes = [];
  for (const folder of data.replaces) for (const path of await store.list(folder)) if (!writePaths.has(path)) removes.push(path);
  // What was there, to put back: the touched files and the list of the files not sent yet.
  const touched = [...writePaths, ...removes];
  /** @type {[string, unknown][]} */
  const before = [];
  /** @type {string[]} */
  const absent = [];
  for (const path of touched) {
    const value = await store.read(path);
    if (value == null) absent.push(path);
    else before.push([path, value]);
  }
  const pending = await store.read('meta/pending.json');
  if (data.writes.length || removes.length) await store.trackedBatch({ writes: data.writes, removes });
  return async () => {
    await store.batch({ writes: [...before, ...(pending ? /** @type {[string, unknown][]} */ ([['meta/pending.json', pending]]) : [])], removes: absent });
    if (!pending) await store.remove('meta/pending.json');
  };
}

/**
 * @typedef {Object} MediaDeps the originals of the dives (docs/architecture.md 11.6). A device without the plugin's media
 *   folder (`mediaAdopt`) gives none, and the photos and videos of the file are verified and counted but not kept (`skipped` in the result).
 * @property {(name: string, chunks: AsyncIterable<Uint8Array>, size: number) => Promise<{ undo: () => Promise<void> }>} put stages one file; the file is kept at `finish`
 * @property {() => Promise<void>} finish keeps every staged file (called with the last step)
 * @property {() => Promise<void>} discard drops every staged file
 */

/**
 * @typedef {Object} ImportDeps
 * @property {import('./staged-file.js').StagedCore & { importCount: (o: { path: string }) => Promise<{ dives: number }> }} core
 * @property {import('./file-store.js').FileStore} store
 * @property {import('./secret-box.js').SecretBox} box
 * @property {(logbook: { path: string, dives: number }|null) => Promise<unknown>} applyLogbook the existing path: replaces the device's logbook or fills the new one; null when the file has no logbook
 * @property {MediaDeps} [media]
 * @property {() => Date} [now]
 */

/**
 * @typedef {Object} ImportProgress
 * @property {'verify'|'logbook'|'data'|'media'|'write'} phase
 * @property {number} done bytes (files for `verify`) done in the phase
 * @property {number} total bytes (files for `verify`) of the phase
 * @property {number} files the files checked (verify)
 */

/**
 * The whole import of an inspected file. Verify, stage, then write; see the top of the file.
 * @param {Inspection} inspection
 * @param {ImportDeps} deps
 * @param {{ onProgress?: (p: ImportProgress) => void, signal?: AbortSignal, skipVerify?: boolean }} [options]
 * @returns {Promise<{ dives: number, files: number, skipped: number }>}
 * @throws {BenthicImportError} INCOMPLETE (nothing imported), CANCELLED, BAD_LOGBOOK, FAILED (the cause is `cause`); nothing changed in any case
 */
export async function importBenthic(inspection, deps, { onProgress, signal, skipVerify = false } = {}) {
  const { core, store, box, now } = deps;
  const { counts, files } = inspection;
  /** @type {string[]} */
  const staged = [];
  /** @type {(() => Promise<void>)|null} */
  let undoStore = null;
  const media = files.filter((f) => f.path.startsWith('dive-media/'));
  const mediaBytes = media.reduce((n, f) => n + f.size, 0);
  const logbookEntry = inspection.entries.get('logbook/logbook.ssrf');
  const logbookSize = logbookEntry?.size ?? 0;
  const dataBytes = files.filter((f) => f.path.startsWith(DATA)).reduce((n, f) => n + f.size, 0);
  /** @type {ImportProgress['phase']} */
  let phase = 'verify';
  const report = (/** @type {number} */ done, /** @type {number} */ total, /** @type {number} */ checked = 0) => onProgress?.({ phase, done, total, files: checked });

  try {
    if (!skipVerify) {
      phase = 'verify';
      report(0, counts.bytes);
      await verifyBenthic(inspection, { signal, onProgress: (p) => report(p.bytes, counts.bytes, p.files) });
    }
    checkSignal(signal);

    // Step 2: the logbook, in the cache, and counted by the core.
    phase = 'logbook';
    /** @type {{ path: string, dives: number }|null} */
    let logbook = null;
    if (logbookEntry) {
      report(0, logbookSize);
      let done = 0;
      const file = await stageEntry(core, inspection.source, logbookEntry, 'logbook.ssrf', (n) => report((done += n), logbookSize), signal);
      staged.push(file.path);
      let dives = 0;
      try {
        dives = (await core.importCount({ path: file.path })).dives;
      } catch (e) {
        throw new BenthicImportError('BAD_LOGBOOK', { cause: e });
      }
      if (!dives) throw new BenthicImportError('BAD_LOGBOOK');
      logbook = { path: file.path, dives };
    }
    checkSignal(signal);

    // Step 3: the Benthic data, sealed with this device's key into a scratch store.
    phase = 'data';
    let done = 0;
    report(0, dataBytes);
    const data = await stageData(inspection, { box, now }, { onBytes: (n) => report((done += n), dataBytes), signal });
    checkSignal(signal);

    // Step 4: the photos and videos, when the device keeps them.
    phase = 'media';
    let skipped = 0;
    if (media.length && deps.media) {
      done = 0;
      report(0, mediaBytes);
      for (const f of media) {
        const entry = inspection.entries.get(f.path);
        if (!entry) throw new BenthicImportError('INCOMPLETE', { bad: [{ path: f.path, reason: 'missing' }] });
        await deps.media.put(
          f.path.slice('dive-media/'.length),
          (async function* () {
            for await (const chunk of entryChunks(inspection.source, entry)) {
              checkSignal(signal);
              done += chunk.length;
              report(done, mediaBytes);
              yield chunk;
            }
          })(),
          entry.size,
        );
      }
    } else {
      skipped = media.length;
      report(mediaBytes, mediaBytes);
    }
    checkSignal(signal);

    // Everything is staged and sound: the writes. Not cancellable from here.
    phase = 'write';
    report(0, 1);
    undoStore = await writeData(store, data);
    try {
      await deps.applyLogbook(logbook);
      await deps.media?.finish();
    } catch (e) {
      await undoStore().catch(() => {});
      undoStore = null;
      throw e;
    }
    report(1, 1);
    return { dives: logbook?.dives ?? 0, files: inspection.files.length, skipped };
  } catch (e) {
    await deps.media?.discard().catch(() => {});
    if (e instanceof BenthicImportError) throw e;
    throw new BenthicImportError('FAILED', { cause: e });
  } finally {
    for (const path of staged) await core.discardImport({ path }).catch(() => {});
  }
}

/** A `.benthic` file the diver picked, opened: the file card and the counts. @param {Blob} file */
export const inspectBenthicFile = (file) => inspectBenthic(blobSource(file));
