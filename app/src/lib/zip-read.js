// @ts-check
// A ZIP reader that streams, the inverse of lib/zip-stream.js (task 2026-11-23-360, the import of a `.benthic` file).
// It reads a file through a `source` ({ size, read(offset, length) }), so that an archive of gigabytes is never held in
// memory: the central directory is read from the end, then each entry is read in pieces, inflated by the platform
// (DecompressionStream) and handed on piece by piece. Stored and deflated entries, ZIP64 (sizes, offsets and the end
// record), UTF-8 names. No encryption, no other method. The two sources: a File or Blob picked in the web layer
// (`blobSource`) and a file already in the app's cache, read through the plugin's `readFileChunk` (`stagedSource`).
import { readRange } from './staged-file.js';
import { createSha256 } from './zip-stream.js';

/** @typedef {{ size: number, read: (offset: number, length: number) => Promise<Uint8Array> }} ByteSource */

/**
 * @typedef {Object} ZipEntry
 * @property {string} name the path in the archive
 * @property {number} method 0 stored, 8 deflated
 * @property {number} flags
 * @property {number} crc
 * @property {number} csize compressed bytes
 * @property {number} size bytes once inflated
 * @property {number} offset where the local header starts
 */

/** The size of one read of an entry's bytes. */
export const READ_CHUNK = 1024 * 1024;
/** An entry up to this size is hashed with the platform's SHA-256 (one buffer); a bigger one is hashed as it streams. */
const WHOLE_HASH_LIMIT = 32 * 1024 * 1024;

/** An archive that cannot be read as a ZIP file: truncated, or not a ZIP. */
export class ZipError extends Error {
  /** @param {string} code `NOT_ZIP`, `ZIP_TRUNCATED`, `ZIP_UNSUPPORTED`, `ZIP_ENTRY` */
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
  }
}

/** @param {Blob} blob @returns {ByteSource} */
export function blobSource(blob) {
  return { size: blob.size, read: async (offset, length) => new Uint8Array(await blob.slice(offset, Math.min(blob.size, offset + length)).arrayBuffer()) };
}

/**
 * A file of the app's cache. The plugin answers at most 4 MB a call; longer reads are made in pieces.
 * @param {import('./staged-file.js').StagedCore} core @param {string} path @param {number} size @returns {ByteSource}
 */
export function stagedSource(core, path, size) {
  return {
    size,
    async read(offset, length) {
      const want = Math.min(length, size - offset);
      if (want <= 0) return new Uint8Array(0);
      const out = new Uint8Array(want);
      let at = 0;
      while (at < want) {
        const { bytes } = await readRange(core, path, offset + at, Math.min(4 * 1024 * 1024, want - at));
        if (!bytes.length) throw new ZipError('ZIP_TRUNCATED');
        out.set(bytes, at);
        at += bytes.length;
      }
      return out;
    },
  };
}

/** @param {ByteSource} source @param {number} offset @param {number} length */
async function readExact(source, offset, length) {
  const bytes = await source.read(offset, length);
  if (bytes.length < length) throw new ZipError('ZIP_TRUNCATED');
  return bytes;
}

/** @param {Uint8Array} b */
const view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/**
 * The entries of an archive, from its central directory.
 * @param {ByteSource} source
 * @returns {Promise<ZipEntry[]>}
 * @throws {ZipError} `NOT_ZIP` (no end record: not a ZIP, or cut short), `ZIP_UNSUPPORTED`
 */
export async function readCentralDirectory(source) {
  const size = source.size;
  if (size < 22) throw new ZipError('NOT_ZIP');
  const tailLength = Math.min(size, 22 + 0xffff);
  const tail = await readExact(source, size - tailLength, tailLength);
  const tv = view(tail);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('NOT_ZIP');
  let count = tv.getUint16(eocd + 10, true);
  let cdSize = tv.getUint32(eocd + 12, true);
  let cdOffset = tv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || tv.getUint32(locator, true) !== 0x07064b50) throw new ZipError('ZIP_UNSUPPORTED', 'zip64');
    const z = Number(tv.getBigUint64(locator + 8, true));
    const head = await readExact(source, z, 56);
    const hv = view(head);
    if (hv.getUint32(0, true) !== 0x06064b50) throw new ZipError('ZIP_UNSUPPORTED', 'zip64');
    count = Number(hv.getBigUint64(32, true));
    cdSize = Number(hv.getBigUint64(40, true));
    cdOffset = Number(hv.getBigUint64(48, true));
  }
  if (cdOffset + cdSize > size) throw new ZipError('ZIP_TRUNCATED');
  const cd = await readExact(source, cdOffset, cdSize);
  const v = view(cd);
  const names = new TextDecoder();
  /** @type {ZipEntry[]} */
  const entries = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== 0x02014b50) throw new ZipError('ZIP_TRUNCATED');
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    let csize = v.getUint32(p + 20, true);
    let usize = v.getUint32(p + 24, true);
    const nameLength = v.getUint16(p + 28, true);
    const extraLength = v.getUint16(p + 30, true);
    const commentLength = v.getUint16(p + 32, true);
    let offset = v.getUint32(p + 42, true);
    const name = names.decode(cd.subarray(p + 46, p + 46 + nameLength));
    let x = p + 46 + nameLength;
    const extraEnd = x + extraLength;
    while (x + 4 <= extraEnd) {
      const id = v.getUint16(x, true);
      const length = v.getUint16(x + 2, true);
      if (id === 1) {
        let q = x + 4;
        if (usize === 0xffffffff) (usize = Number(v.getBigUint64(q, true))), (q += 8);
        if (csize === 0xffffffff) (csize = Number(v.getBigUint64(q, true))), (q += 8);
        if (offset === 0xffffffff) offset = Number(v.getBigUint64(q, true));
      }
      x += 4 + length;
    }
    entries.push({ name, method, flags, crc, csize, size: usize, offset });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * The bytes of one entry, inflated, in pieces. A stored entry is passed on as it is; a damaged or cut deflate stream
 * throws, and so does a size that is not the central directory's.
 * @param {ByteSource} source
 * @param {ZipEntry} entry
 * @returns {AsyncGenerator<Uint8Array>}
 */
export async function* entryChunks(source, entry) {
  if (entry.flags & 1) throw new ZipError('ZIP_UNSUPPORTED', 'encrypted');
  if (entry.method !== 0 && entry.method !== 8) throw new ZipError('ZIP_UNSUPPORTED', `method ${entry.method}`);
  const local = await readExact(source, entry.offset, 30);
  const lv = view(local);
  if (lv.getUint32(0, true) !== 0x04034b50) throw new ZipError('ZIP_ENTRY', entry.name);
  const start = entry.offset + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
  if (start + entry.csize > source.size) throw new ZipError('ZIP_TRUNCATED', entry.name);

  const compressed = (async function* () {
    for (let at = 0; at < entry.csize; at += READ_CHUNK) yield await readExact(source, start + at, Math.min(READ_CHUNK, entry.csize - at));
  })();

  let produced = 0;
  if (entry.method === 0) {
    for await (const chunk of compressed) {
      produced += chunk.length;
      yield chunk;
    }
  } else {
    const stream = new DecompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    let stop = false;
    const feed = (async () => {
      try {
        for await (const chunk of compressed) {
          if (stop) break;
          await writer.write(/** @type {BufferSource} */ (chunk));
        }
        if (!stop) await writer.close();
      } catch (e) {
        await writer.abort(e).catch(() => {});
      }
    })();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        produced += value.length;
        yield value;
      }
    } finally {
      stop = true;
      await reader.cancel().catch(() => {});
      await feed.catch(() => {});
    }
  }
  if (produced !== entry.size) throw new ZipError('ZIP_ENTRY', entry.name);
}

/**
 * The SHA-256 (hex) and the size of an entry's contents, read once.
 * @param {ByteSource} source @param {ZipEntry} entry
 * @param {(bytes: number) => void} [onBytes] called with the bytes read since the last call
 * @returns {Promise<{ sha256: string, size: number }>}
 */
export async function hashEntry(source, entry, onBytes) {
  let size = 0;
  if (entry.size <= WHOLE_HASH_LIMIT) {
    const whole = new Uint8Array(entry.size);
    let at = 0;
    for await (const chunk of entryChunks(source, entry)) {
      if (at + chunk.length > whole.length) throw new ZipError('ZIP_ENTRY', entry.name);
      whole.set(chunk, at);
      at += chunk.length;
      onBytes?.(chunk.length);
    }
    size = at;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (whole)));
    return { sha256: [...digest].map((b) => b.toString(16).padStart(2, '0')).join(''), size };
  }
  const hash = createSha256();
  for await (const chunk of entryChunks(source, entry)) {
    hash.update(chunk);
    size += chunk.length;
    onBytes?.(chunk.length);
  }
  return { sha256: hash.digest(), size };
}

/** The whole contents of a small entry. @param {ByteSource} source @param {ZipEntry} entry @returns {Promise<Uint8Array>} */
export async function readEntry(source, entry) {
  const out = new Uint8Array(entry.size);
  let at = 0;
  for await (const chunk of entryChunks(source, entry)) {
    if (at + chunk.length > out.length) throw new ZipError('ZIP_ENTRY', entry.name);
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
