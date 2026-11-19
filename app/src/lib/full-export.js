// @ts-check
// « Télécharger mes données » (task 2026-11-18-57): the full export, the diver's own copy of everything. The engine
// only; the screens (account, warning, progress) call it. Decided on 18 November 2026:
//  - a ZIP archive in open formats, written chunk by chunk to a file in the app's cache (or the desktop's temp
//    folder), never held in memory and never written anywhere public;
//  - the logbook in Subsurface's format (`logbook/logbook.ssrf`, the core's own export);
//  - what only OpenDives keeps, as JSON under `opendives/`: equipment, kits, maintenance, what each dive used, the
//    diver profile, the certifications with their photos, the settings of the device. The sealed items (blood group,
//    emergency contact, certifications, card photos) are opened with the device's key and written IN CLEAR: the
//    screen before the export says so (`containsSensitive`);
//  - as a choice made at export time, the original photos and videos of the dives (`dive-media/`);
//  - `manifest.json` at the root: format version, app version, export date, every file with its size and SHA-256.
// Layout, with what writes each part:
//   manifest.json
//   README.txt
//   logbook/logbook.ssrf
//   opendives/gear/<id>.json, kits/<id>.json, maintenance/<id>.json, dive-equipment/<id>.json   (copied as stored)
//   opendives/profile/diver.json                    decrypted: dateOfBirth, emergencyContact, bloodGroup, healthConsent
//   opendives/certifications/<id>.json              decrypted, `documents` point at the photos
//   opendives/certifications/photos/<id>-<side>.jpg   (<id>-page-<n>.jpg for the pages of a document, .pdf for a PDF)
//   opendives/media/<id>.jpg                         the photos of pieces and invoices
//   opendives/settings.json                          the device's settings and the core's preferences
//   dive-media/<name>                                the dives' original photos and videos (only when asked)
// Everything the engine needs from the platform is given in `deps` (the tests give fakes); `defaultDeps()` wires
// the real ones. The last step (share sheet on the phone, save dialog on the desktop) is `deliverExport`.

import { sortedJson } from './file-store.js';
import { toBase64 } from './secret-box.js';
import { createZipWriter } from './zip-stream.js';
import { fileExtension } from './profile.js';

/** The archive's format, in `manifest.json`: raised when its layout changes in a way a reader must know. */
export const EXPORT_FORMAT = 1;

/** Estimated size of one dive in the `.ssrf` (the real size is known only once the core has written it). */
const SSRF_BYTES_PER_DIVE = 10 * 1024;
/** Bytes gathered before one write to the sink (one native call). */
const WRITE_CHUNK = 1024 * 1024;

const enc = new TextEncoder();

/**
 * The logbook as the core wrote it to a file; read in order, deleted by `dispose`.
 * @typedef {Object} LogbookFile
 * @property {number} size bytes
 * @property {() => AsyncIterable<Uint8Array>} chunks
 * @property {() => Promise<unknown>} dispose
 */

/**
 * One original photo or video of a dive.
 * @typedef {Object} MediaItem
 * @property {string} name file name in `dive-media/` (unique)
 * @property {number} size bytes
 * @property {boolean} onDevice false when the original is only on the OpenDives server: it is « to download »
 * @property {() => AsyncIterable<Uint8Array>} [open] reads it from the device, in chunks
 * @property {(signal?: AbortSignal) => AsyncIterable<Uint8Array>} [download] fetches it from the server (not built yet: a seam)
 */

/**
 * The file being written. `write` takes bytes in order; `close` resolves where it is; `abort` deletes it.
 * @typedef {Object} SinkFile
 * @property {(bytes: Uint8Array) => Promise<void>} write
 * @property {() => Promise<ExportFile>} close
 * @property {() => Promise<void>} abort
 */

/**
 * @typedef {Object} ExportFile
 * @property {string} name
 * @property {string} path where it is (the platform's own path or URI)
 * @property {string} [uri] a URI the share sheet takes
 * @property {number} size
 */

/**
 * @typedef {Object} ExportDeps
 * @property {import('./file-store.js').FileStore} store the OpenDives data (gear, kits, maintenance...)
 * @property {import('./profile.js').Profile} profile the diver profile and the certifications, with their key
 * @property {string} appVersion
 * @property {() => Date} [now]
 * @property {{ diveCount: () => Promise<number>, read?: () => Promise<Uint8Array|null>, open?: () => Promise<LogbookFile|null> }} logbook
 *   `open` is the `.ssrf` as a file in the app's cache that is read in pieces (a logbook can be 100 MB: it never
 *   crosses the plugin's bridge as one string); `read` is the same in memory, for a small one (the tests); null when there is no logbook
 * @property {() => Promise<Record<string, unknown>>} settings the device's settings and the core's preferences
 * @property {() => Promise<MediaItem[]>} [media] the originals of the dives; none when missing
 * @property {(name: string) => Promise<SinkFile>} openFile where the archive is written
 */

/**
 * One file of the OpenDives data, with its size known before it is read.
 * @typedef {Object} DataEntry
 * @property {string} path path in the archive
 * @property {string} area gear, kits, maintenance, diveEquipment, profile, certifications, certificationPhotos, media, settings, other
 * @property {number} size
 * @property {boolean} sensitive in clear here, sealed on the device
 * @property {() => Promise<Uint8Array>} data
 */

/** @param {unknown} value @returns {Uint8Array} */
const jsonBytes = (value) => enc.encode(sortedJson(value));

/** @param {string} path @param {string} area @param {unknown} value @param {boolean} [sensitive] @returns {DataEntry} */
function jsonEntry(path, area, value, sensitive = false) {
  const bytes = jsonBytes(value);
  return { path, area, size: bytes.length, sensitive, data: async () => bytes };
}

/** @param {string} dataUrl @returns {{ bytes: Uint8Array, ext: string }} */
function decodeDataUrl(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return { bytes: new Uint8Array(0), ext: 'bin' };
  const bytes = m[2] ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0)) : enc.encode(decodeURIComponent(m[3]));
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[m[1]] ?? 'bin';
  return { bytes, ext };
}

/** Folders of the store that are not exported as they are: the device's own state, or handled apart. */
const HANDLED_APART = ['meta/', 'documents/', 'profile/', 'certifications/', 'media/'];

/**
 * Every file of the OpenDives data, the sealed items opened. Sizes are exact; bytes are read when written.
 * @param {ExportDeps} deps
 * @returns {Promise<DataEntry[]>}
 */
export async function collectData(deps) {
  const { store, profile } = deps;
  /** @type {DataEntry[]} */
  const out = [];

  // What the logbook format keeps in clear: copied as stored (unknown fields included).
  for (const path of await store.list('')) {
    if (HANDLED_APART.some((p) => path.startsWith(p))) continue;
    const value = await store.read(path);
    if (value == null) continue;
    const area = { gear: 'gear', kits: 'kits', maintenance: 'maintenance', 'dive-equipment': 'diveEquipment' }[path.split('/')[0]] ?? 'other';
    out.push(jsonEntry(`opendives/${path}`, area, value));
  }

  // Photos of pieces and invoices (data URLs in the store): real image files.
  for (const path of await store.list('media/')) {
    const file = await store.read(path);
    if (!file || typeof file.dataUrl !== 'string') continue;
    const { bytes, ext } = decodeDataUrl(file.dataUrl);
    out.push({ path: `opendives/media/${file.id ?? path.slice(6, -5)}.${ext}`, area: 'media', size: bytes.length, sensitive: false, data: async () => bytes });
  }

  // The diver profile, opened.
  const info = await profile.readInfo();
  const consent = await profile.readConsent();
  const diverFile = await store.read('profile/diver.json');
  if (diverFile) {
    out.push(
      jsonEntry(
        'opendives/profile/diver.json',
        'profile',
        {
          format: 1,
          updatedAt: diverFile.updatedAt ?? '',
          ...(info.dateOfBirth ? { dateOfBirth: info.dateOfBirth } : {}),
          emergencyContact: info.emergency,
          ...(info.bloodGroup ? { bloodGroup: info.bloodGroup } : {}),
          healthConsent: { consent: consent.consent, at: consent.at },
        },
        true,
      ),
    );
  }

  // The certifications, opened, and their card photos.
  for (const c of await profile.listCertifications()) {
    const documents = [];
    for (const d of c.documents) {
      // A page of a medical certificate is `<id>-page-2.jpg`; a PDF keeps its extension (task 2026-11-19-309).
      const file = `certifications/photos/${c.id}-${d.side}${d.page ? `-${d.page}` : ''}.${fileExtension(d.mime)}`;
      documents.push({ side: d.side, ...(d.page ? { page: d.page } : {}), mime: d.mime, size: d.size, file });
      out.push({
        path: `opendives/${file}`,
        area: 'certificationPhotos',
        size: d.size,
        sensitive: true,
        data: async () => {
          const bytes = await profile.readPhoto(c.id, d.hash);
          if (!bytes) throw new Error(`EXPORT_PHOTO_UNREADABLE:${c.id}`);
          return bytes;
        },
      });
    }
    out.push(jsonEntry(`opendives/certifications/${c.id}.json`, 'certifications', { format: 1, ...c, documents }, true));
  }

  // The settings of the device.
  out.push(jsonEntry('opendives/settings.json', 'settings', { format: 1, ...(await deps.settings()) }));
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * What the export holds, for the screens (the warning and the choice of the media).
 * @param {ExportDeps} [deps] the real services when missing
 * @returns {Promise<{ any: boolean, kinds: ('dateOfBirth'|'emergencyContact'|'bloodGroup'|'certifications'|'certificationPhotos')[] }>}
 */
export async function containsSensitive(deps) {
  deps ??= await defaultDeps();
  /** @type {('dateOfBirth'|'emergencyContact'|'bloodGroup'|'certifications'|'certificationPhotos')[]} */
  const kinds = [];
  const info = await deps.profile.readInfo();
  if (info.dateOfBirth) kinds.push('dateOfBirth');
  if (info.emergency.name || info.emergency.relation || info.emergency.phone.number) kinds.push('emergencyContact');
  if (info.bloodGroup) kinds.push('bloodGroup');
  const cards = await deps.profile.listCertifications();
  if (cards.length) kinds.push('certifications');
  if (cards.some((c) => c.documents.length)) kinds.push('certificationPhotos');
  return { any: kinds.length > 0, kinds };
}

/**
 * The contents and the sizes of the export, with and without the original media.
 * @param {{ withMedia?: boolean }} [options]
 * @param {ExportDeps} [deps] the real services when missing
 */
export async function planExport({ withMedia = false } = {}, deps) {
  deps ??= await defaultDeps();
  const data = await collectData(deps);
  /** @type {Record<string, { files: number, bytes: number }>} */
  const areas = {};
  for (const e of data) {
    const a = (areas[e.area] ??= { files: 0, bytes: 0 });
    a.files++;
    a.bytes += e.size;
  }
  const dives = await deps.logbook.diveCount();
  const logbookBytes = dives * SSRF_BYTES_PER_DIVE;
  const media = (await deps.media?.()) ?? [];
  const onDevice = media.filter((m) => m.onDevice);
  const remote = media.filter((m) => !m.onDevice);
  const sum = (/** @type {{ size: number }[]} */ list) => list.reduce((n, m) => n + m.size, 0);
  const dataBytes = sum(data);
  const withoutMediaBytes = dataBytes + logbookBytes;
  return {
    withMedia,
    dives,
    logbook: { bytes: logbookBytes, estimated: true },
    areas,
    sensitive: await containsSensitive(deps),
    media: { count: media.length, onDevice: { count: onDevice.length, bytes: sum(onDevice) }, toDownload: { count: remote.length, bytes: sum(remote) } },
    bytes: { withoutMedia: withoutMediaBytes, withMedia: withoutMediaBytes + sum(media) },
    /** The size of what was asked for. */
    estimatedBytes: withoutMediaBytes + (withMedia ? sum(media) : 0),
  };
}

const README = `OpenDives: all my data
======================

manifest.json              every file of this archive with its size and its SHA-256
logbook/logbook.ssrf       the dive log in Subsurface's format (open it with Subsurface)
opendives/                 what only OpenDives keeps, as JSON: gear, kits, maintenance, what each dive used,
                           the diver profile, the certifications, the settings of the device
opendives/media/           the photos of pieces and of invoices
dive-media/                the original photos and videos of the dives (only when they were asked for)

This archive is NOT encrypted. The date of birth, the emergency contact, the blood group and the
certifications with their card photos are written in clear text. Keep it somewhere safe.
`;

/** A file name that is safe in an archive: no folders, no control characters. @param {string} name */
const safeName = (name) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_') || 'file';

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/** The archive's file name: `opendives-data-YYYY-MM-DD.zip`. @param {Date} d */
export const exportFileName = (d) => `opendives-data-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`;

/**
 * @typedef {Object} ExportProgress
 * @property {'logbook'|'data'|'media'|'finish'} phase
 * @property {string} file the file being written
 * @property {number} doneBytes
 * @property {number} totalBytes
 * @property {number} doneFiles
 * @property {number} totalFiles
 */

/**
 * Writes the archive. Progress is in bytes of content (`doneBytes` of `totalBytes`), so that the time-left
 * estimator (lib/time-left.js) can be fed with them. On cancel or failure the file is deleted and the error is
 * thrown (an `AbortError` for a cancel).
 * @param {{ withMedia?: boolean, onProgress?: (p: ExportProgress) => void, signal?: AbortSignal, zip64At?: number }} [options]
 * @param {ExportDeps} [deps] the real services when missing
 * @returns {Promise<{ file: ExportFile, manifest: any, skipped: { path: string, reason: string }[] }>}
 */
export async function buildExport({ withMedia = false, onProgress, signal, zip64At } = {}, deps) {
  deps ??= await defaultDeps();
  const now = (deps.now ?? (() => new Date()))();
  const aborted = () => signal?.aborted === true;
  const check = () => {
    if (aborted()) throw signal?.reason instanceof Error ? signal.reason : new DOMException('The export was cancelled', 'AbortError');
  };
  check();

  const data = await collectData(deps);
  const logbookFile = deps.logbook.open ? await deps.logbook.open() : null;
  const logbookBytes = logbookFile ? null : ((await deps.logbook.read?.()) ?? null);
  const logbookSize = logbookFile?.size ?? logbookBytes?.length ?? 0;
  const hasLogbook = !!logbookFile || !!logbookBytes;
  const mediaItems = withMedia ? ((await deps.media?.()) ?? []) : [];
  /** @type {{ path: string, reason: string }[]} */
  const skipped = [];
  const media = mediaItems.filter((m) => {
    if (m.onDevice && m.open) return true;
    if (!m.onDevice && m.download) return true;
    skipped.push({ path: `dive-media/${safeName(m.name)}`, reason: m.onDevice ? 'unreadable' : 'not-downloaded' });
    return false;
  });

  const readme = enc.encode(README);
  const totalBytes = logbookSize + data.reduce((n, e) => n + e.size, 0) + media.reduce((n, m) => n + m.size, 0) + readme.length;
  const totalFiles = (hasLogbook ? 1 : 0) + data.length + media.length + 2;
  let doneBytes = 0;
  let doneFiles = 0;
  /** @param {ExportProgress['phase']} phase @param {string} file */
  const report = (phase, file) => onProgress?.({ phase, file, doneBytes, totalBytes, doneFiles, totalFiles });

  /** @type {SinkFile} */
  let sink;
  try {
    sink = await deps.openFile(exportFileName(now));
  } catch (e) {
    await logbookFile?.dispose().catch(() => {});
    throw e;
  }
  let pending = new Uint8Array(WRITE_CHUNK * 2);
  let filled = 0;
  const flush = async () => {
    if (filled) {
      const chunk = pending.slice(0, filled);
      filled = 0;
      await sink.write(chunk);
    }
  };
  /** @param {Uint8Array} bytes */
  const write = async (bytes) => {
    // Small pieces (headers) are gathered; a big chunk goes straight through.
    if (bytes.length >= WRITE_CHUNK) {
      await flush();
      await sink.write(bytes);
      return;
    }
    if (filled + bytes.length > pending.length) await flush();
    pending.set(bytes, filled);
    filled += bytes.length;
    if (filled >= WRITE_CHUNK) await flush();
  };

  try {
    const zip = createZipWriter(write, { zip64At, now });
    /** @type {{ path: string, size: number, sha256: string }[]} */
    const files = [];
    /**
     * @param {string} path @param {AsyncIterable<Uint8Array>|Uint8Array} source @param {number} size @param {boolean} deflate
     * @param {ExportProgress['phase']} phase
     */
    const addFile = async (path, source, size, deflate, phase) => {
      check();
      report(phase, path);
      const counted = (async function* () {
        const iter = source instanceof Uint8Array ? [source] : source;
        for await (const chunk of iter) {
          yield chunk;
          doneBytes += chunk.length;
          report(phase, path);
        }
      })();
      const r = await zip.add(path, counted, { size, deflate, signal });
      files.push({ path, size: r.size, sha256: r.sha256 });
      doneFiles++;
      report(phase, path);
    };

    if (logbookFile) await addFile('logbook/logbook.ssrf', logbookFile.chunks(), logbookFile.size, true, 'logbook');
    else if (logbookBytes) await addFile('logbook/logbook.ssrf', logbookBytes, logbookBytes.length, true, 'logbook');
    await addFile('README.txt', readme, readme.length, true, 'data');
    for (const e of data) await addFile(e.path, await e.data(), e.size, e.path.endsWith('.json'), 'data');
    for (const m of media) {
      const source = m.onDevice ? /** @type {NonNullable<typeof m.open>} */ (m.open)() : /** @type {NonNullable<typeof m.download>} */ (m.download)(signal);
      await addFile(`dive-media/${safeName(m.name)}`, source, m.size, false, 'media');
    }

    const sensitive = data.some((e) => e.sensitive);
    const manifest = {
      format: EXPORT_FORMAT,
      app: 'OpenDives',
      appVersion: deps.appVersion,
      exportedAt: now.toISOString(),
      withMedia,
      containsSensitive: sensitive,
      sensitiveInClear: sensitive,
      dives: await deps.logbook.diveCount(),
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      skipped,
    };
    report('finish', 'manifest.json');
    const manifestBytes = jsonBytes(manifest);
    check();
    await zip.add('manifest.json', manifestBytes, { size: manifestBytes.length, deflate: true });
    await zip.finish();
    await flush();
    pending = new Uint8Array(0);
    const file = await sink.close();
    doneFiles++;
    report('finish', 'manifest.json');
    return { file, manifest, skipped };
  } catch (e) {
    await sink.abort().catch(() => {});
    throw e;
  } finally {
    await logbookFile?.dispose().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Where the archive is written: the phone's cache, the desktop's temp folder.
// ---------------------------------------------------------------------------

/**
 * The phone: the app's cache folder through @capacitor/filesystem (the one the share sheet may read).
 * @param {{ Filesystem: any, Directory: { Cache: any }, folder?: string }} plugin
 * @returns {(name: string) => Promise<SinkFile>}
 */
export function capacitorSink({ Filesystem, Directory, folder = 'exports' }) {
  return async (name) => {
    const path = `${folder}/${safeName(name)}`;
    const directory = Directory.Cache;
    await Filesystem.deleteFile({ path, directory }).catch(() => {});
    let started = false;
    let size = 0;
    return {
      async write(bytes) {
        const data = toBase64(bytes);
        if (!started) {
          started = true;
          await Filesystem.writeFile({ path, directory, data, recursive: true });
        } else {
          await Filesystem.appendFile({ path, directory, data });
        }
        size += bytes.length;
      },
      async close() {
        const { uri } = await Filesystem.getUri({ path, directory });
        return { name: safeName(name), path, uri, size };
      },
      async abort() {
        await Filesystem.deleteFile({ path, directory }).catch(() => {});
      },
    };
  };
}

/**
 * The desktop: <temp>/share through the bridge (`odDesktop.fs`).
 * @param {{ fs: { writeFile: Function, appendFile: Function, remove: Function } }} bridge `window.odDesktop`
 * @returns {(name: string) => Promise<SinkFile>}
 */
export function desktopSink(bridge) {
  return async (name) => {
    /** @type {string|null} */
    let path = null;
    let size = 0;
    return {
      async write(bytes) {
        const base64 = toBase64(bytes);
        if (path === null) ({ path } = await bridge.fs.writeFile({ area: 'share', name: safeName(name), base64 }));
        else await bridge.fs.appendFile({ path, base64 });
        size += bytes.length;
      },
      async close() {
        if (path === null) ({ path } = await bridge.fs.writeFile({ area: 'share', name: safeName(name), base64: '' }));
        return { name: safeName(name), path, size };
      },
      async abort() {
        if (path !== null) await bridge.fs.remove({ path }).catch(() => {});
      },
    };
  };
}

// ---------------------------------------------------------------------------
// The real services.
// ---------------------------------------------------------------------------

/**
 * The deps wired to the app: its local stores, the core, the platform's file writer. The originals of the dives are
 * not listed yet (the core does not expose the picture paths): `media` is empty until a provider is given.
 * @param {{ media?: ExportDeps['media'] }} [overrides]
 * @returns {Promise<ExportDeps>}
 */
export async function defaultDeps(overrides = {}) {
  const [{ services }, { OpenDivesCore }, { deviceSettingsSnapshot }] = await Promise.all([import('./profile.svelte.js'), import('opendives-core'), import('./device-store.js')]);
  const { store, profile } = services();
  const bridge = /** @type {any} */ (globalThis).window?.odDesktop ?? null;
  /** @type {ExportDeps['openFile']} */
  let openFile;
  if (bridge) openFile = desktopSink(bridge);
  else {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    openFile = capacitorSink({ Filesystem, Directory });
  }
  return {
    store,
    profile,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    logbook: {
      async diveCount() {
        const { exists, dives } = await OpenDivesCore.listDives();
        return exists ? dives.length : 0;
      },
      // The core writes the .ssrf to a file of the cache; the archive reads it in pieces of 3 MB.
      async open() {
        const { exists, dives } = await OpenDivesCore.listDives();
        if (!exists || !dives.length) return null;
        const { path = '', size = 0 } = await OpenDivesCore.exportDives({ ids: dives.map((d) => d.id), format: 'ssrf', anonymize: false, name: 'logbook.ssrf', stage: true });
        if (!path) return null;
        const { readChunks } = await import('./staged-file.js');
        return { size, chunks: () => readChunks(OpenDivesCore, path, size), dispose: () => OpenDivesCore.discardImport({ path }) };
      },
    },
    async settings() {
      return { app: deviceSettingsSnapshot(), logbook: await OpenDivesCore.getPrefs().catch(() => null) };
    },
    media: overrides.media,
    openFile,
  };
}

/**
 * The final step: the finished archive handed to the person. Phone: the system's share sheet (the cache file is
 * opened to the apps through the plugin's grant, as for any share). Desktop: the system's save dialog.
 * Resolves `{ saved: false }` when the person closes it without choosing. The archive is deleted from the cache
 * afterwards (`discardExport`), whatever the outcome.
 * @param {ExportFile} file
 * @returns {Promise<{ saved: boolean, path?: string }>}
 */
export async function deliverExport(file) {
  const bridge = /** @type {any} */ (globalThis).window?.odDesktop ?? null;
  try {
    if (bridge) {
      const result = await bridge.saveAs({ path: file.path, name: file.name });
      return result?.saved ? { saved: true, path: result.path } : { saved: false };
    }
    const [{ Share }, { OpenDivesCore }] = await Promise.all([import('@capacitor/share'), import('opendives-core')]);
    const uri = file.uri ?? file.path;
    await OpenDivesCore.grantShareFile({ uri, mime: 'application/zip' });
    await Share.share({ title: file.name, files: [uri] });
    return { saved: true };
  } catch (e) {
    // The share sheet reports a closed sheet as an error on some systems.
    if (/cancel/i.test(String(/** @type {any} */ (e)?.message ?? e))) return { saved: false };
    throw e;
  } finally {
    await discardExport(file);
  }
}

/** Deletes the archive from the cache. Call it when the person leaves without delivering it. @param {ExportFile} file */
export async function discardExport(file) {
  const bridge = /** @type {any} */ (globalThis).window?.odDesktop ?? null;
  try {
    if (bridge) await bridge.fs.remove({ path: file.path });
    else {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      await Filesystem.deleteFile({ path: file.path, directory: Directory.Cache });
    }
  } catch {
    // Already gone.
  }
}
