// @ts-check
// Big files never cross the plugin's bridge as one string (a logbook of Subsurface-mobile is about 100 MB: as base64
// it ran the Android Java heap, 256 MB, out of memory, twice). A file lives in the app's cache, a « staged file »,
// and only its path travels. The web layer reaches it in pieces:
//   - stageFile / stageBytes: a File (or bytes) goes to the cache in pieces of 3 MB (stageImport, append);
//   - readRange / stagedHead / readAllBytes: pieces of a staged file come back (readFileChunk, at most 4 MB);
//   - scanLogbook: one streaming pass over a Subsurface file (sites, years, where the sites end) with a window of
//     2 MB, so that its memory does not depend on the size of the file;
// The core then imports from the path (importDives({ path })). `core` is the plugin (or a fake in the tests).
import { toBase64 } from './zip-fit.js';

/** Bytes of a file sent per call to the plugin. */
export const STAGE_CHUNK = 3 * 1024 * 1024;
/** Bytes read per window of a scan (the plugin answers at most 4 MB). */
export const SCAN_CHUNK = 2 * 1024 * 1024;
/** What a window reaches past its chunk, so that a tag cut by the border is found whole in the next one. */
export const SCAN_OVERLAP = 4096;
/** The largest sites-only file (Subsurface-mobile's dive sites export is a few hundred KB). */
export const MAX_SITES_FILE = 8 * 1024 * 1024;

/**
 * @typedef {Object} StagedCore the plugin's calls on staged files
 * @property {(o: { name?: string, data: string, path?: string, append?: boolean }) => Promise<{ path: string }>} stageImport
 * @property {(o: { path: string, offset: number, length: number }) => Promise<{ data: string, size: number }>} readFileChunk
 * @property {(o: { name: string, parts: ({ path: string, start: number, end: number } | { text: string })[] }) => Promise<{ path: string }>} assembleFile
 * @property {(o: { path: string }) => Promise<unknown>} discardImport
 */

/** @typedef {{ path: string, name: string, size: number }} StagedFile */

/** @param {string} base64 */
function bytesOf(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * A file (or any Blob) written to the app's cache in pieces; at most one piece is in memory on each side.
 * @param {StagedCore} core
 * @param {Blob} blob
 * @param {string} [name] the name the core reads the format from (the file's own by default)
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<StagedFile>}
 */
export async function stageFile(core, blob, name = /** @type {File} */ (blob).name || 'import.xml', onProgress) {
  let path = '';
  let offset = 0;
  try {
    do {
      const end = Math.min(blob.size, offset + STAGE_CHUNK);
      const data = toBase64(new Uint8Array(await blob.slice(offset, end).arrayBuffer()));
      ({ path } = path ? await core.stageImport({ path, data, append: true }) : await core.stageImport({ name, data }));
      offset = end;
      onProgress?.(offset, blob.size);
    } while (offset < blob.size);
  } catch (e) {
    if (path) await core.discardImport({ path }).catch(() => {});
    throw e;
  }
  return { path, name, size: blob.size };
}

/** @param {StagedCore} core @param {string} name @param {Uint8Array} bytes @returns {Promise<StagedFile>} */
export function stageBytes(core, name, bytes) {
  return stageFile(core, new Blob([/** @type {BlobPart} */ (bytes)]), name);
}

/**
 * @param {StagedCore} core @param {string} path @param {number} offset @param {number} length
 * @returns {Promise<{ bytes: Uint8Array, size: number }>}
 */
export async function readRange(core, path, offset, length) {
  const { data, size } = await core.readFileChunk({ path, offset, length });
  return { bytes: bytesOf(data), size };
}

/** The beginning of a staged file, for the sniffing of its kind. @param {StagedCore} core @param {string} path @param {number} [length] */
export async function stagedHead(core, path, length = 4096) {
  return (await readRange(core, path, 0, length)).bytes;
}

/**
 * A whole staged file in memory, for a small one only (an archive, a sites file).
 * @param {StagedCore} core @param {string} path @param {number} size
 * @returns {Promise<Uint8Array>}
 */
export async function readAllBytes(core, path, size) {
  const out = new Uint8Array(size);
  let at = 0;
  while (at < size) {
    const { bytes } = await readRange(core, path, at, Math.min(STAGE_CHUNK, size - at));
    if (!bytes.length) throw new Error('SHORT_READ');
    out.set(bytes, at);
    at += bytes.length;
  }
  return out;
}

/**
 * A staged file read in order, in pieces of 3 MB (the full export streams it into the archive).
 * @param {StagedCore} core @param {string} path @param {number} size @param {number} [chunk]
 * @returns {AsyncGenerator<Uint8Array>}
 */
export async function* readChunks(core, path, size, chunk = STAGE_CHUNK) {
  for (let at = 0; at < size; ) {
    const { bytes } = await readRange(core, path, at, Math.min(chunk, size - at));
    if (!bytes.length) throw new Error('SHORT_READ');
    at += bytes.length;
    yield bytes;
  }
}

/**
 * @typedef {Object} LogbookScan
 * @property {Set<number>} siteUuids the sites the file defines
 * @property {Set<number>} referenced the sites its dives point to (divesiteid)
 * @property {number} sites how many `<site` entries
 * @property {number|null} firstYear
 * @property {number|null} lastYear
 * @property {boolean} hasDivelog a `<divelog>` root
 * @property {boolean} hasDives a `<dives>` container
 * @property {boolean} hasDive at least one `<dive>`
 * @property {boolean} hasDivesites a `<divesites>` container
 * @property {number} divesitesEnd byte offset of the first `</divesites>`, -1 when none
 * @property {number} divesStart byte offset of the first `<dives>`, -1 when none
 */

/**
 * One streaming pass over a Subsurface file. The file is read in windows of 2 MB (plus a 4 KB overlap), decoded as
 * Latin-1 so that a character is a byte (offsets are byte offsets; the patterns are ASCII). A match belongs to the
 * window where it starts. Memory: one window, whatever the file's size.
 * @param {StagedCore} core
 * @param {string} path
 * @param {number} size
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<LogbookScan>}
 */
export function scanLogbook(core, path, size, onProgress) {
  return scanReader(async (offset, length) => (await readRange(core, path, offset, length)).bytes, size, onProgress);
}

/**
 * The same pass over a File or Blob in the web layer (a file picked, not yet staged): read with slice(), a window at a time.
 * @param {Blob} blob
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<LogbookScan>}
 */
export function scanBlob(blob, onProgress) {
  return scanReader(async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()), blob.size, onProgress);
}

/**
 * @param {(offset: number, length: number) => Promise<Uint8Array>} read
 * @param {number} size
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<LogbookScan>}
 */
async function scanReader(read, size, onProgress) {
  /** @type {LogbookScan} */
  const scan = {
    siteUuids: new Set(),
    referenced: new Set(),
    sites: 0,
    firstYear: null,
    lastYear: null,
    hasDivelog: false,
    hasDives: false,
    hasDive: false,
    hasDivesites: false,
    divesitesEnd: -1,
    divesStart: -1,
  };
  const decoder = new TextDecoder('latin1');
  for (let pos = 0; pos < size; pos += SCAN_CHUNK) {
    const bytes = await read(pos, SCAN_CHUNK + SCAN_OVERLAP);
    const text = decoder.decode(bytes);
    const own = (/** @type {number} */ index) => index < SCAN_CHUNK;
    for (const m of text.matchAll(/<site\s[^>]*?\buuid\s*=\s*['"]\s*([0-9a-fA-F]+)/g)) {
      if (!own(m.index)) continue;
      scan.sites++;
      scan.siteUuids.add(parseInt(m[1], 16));
    }
    for (const m of text.matchAll(/\bdivesiteid\s*=\s*['"]\s*([0-9a-fA-F]+)\s*['"]/g)) {
      if (own(m.index)) scan.referenced.add(parseInt(m[1], 16));
    }
    for (const m of text.matchAll(/<dive\b[^>]*?\sdate\s*=\s*['"](\d{4})-/g)) {
      if (!own(m.index)) continue;
      const year = Number(m[1]);
      scan.hasDive = true;
      if (scan.firstYear === null || year < scan.firstYear) scan.firstYear = year;
      if (scan.lastYear === null || year > scan.lastYear) scan.lastYear = year;
    }
    if (!scan.hasDive) scan.hasDive = /<dive[\s>]/.test(text);
    if (!scan.hasDivelog) scan.hasDivelog = /<divelog[\s>]/.test(text);
    if (!scan.hasDivesites) scan.hasDivesites = /<divesites[\s>]/.test(text);
    if (scan.divesitesEnd < 0) {
      const m = /<\/divesites>/i.exec(text);
      if (m && own(m.index)) scan.divesitesEnd = pos + m.index;
    }
    if (scan.divesStart < 0) {
      const m = /<dives[\s>]/i.exec(text);
      if (m && own(m.index)) {
        scan.divesStart = pos + m.index;
        scan.hasDives = true;
      }
    }
    onProgress?.(Math.min(size, pos + SCAN_CHUNK), size);
  }
  return scan;
}

/**
 * Whether the scanned file holds dive sites and no dives (Subsurface-mobile's « dive sites » export).
 * @param {LogbookScan} scan
 */
export const scanIsSitesOnly = (scan) => scan.hasDivesites && !scan.hasDives && !scan.hasDive;
