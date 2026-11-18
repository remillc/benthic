// @ts-check
// Garmin Connect's « Export Original » gives a .zip holding the dive's .fit file. Subsurface's core
// reads the entries of a .zip as XML (core/file.cpp, try_to_open_zip(): Suunto DM and divelogs.de
// archives), so it finds no dive in it. The app takes the .fit files out first and imports each one
// (task 2026-11-14-124). Only what such an archive needs: the central directory, entries stored or
// deflated, no ZIP64, no encryption. Deflate is undone by the platform (DecompressionStream).

/** Archives larger than this are left to the core as they are. */
const MAX_ZIP_BYTES = 64 * 1024 * 1024;

/**
 * @param {Uint8Array} bytes
 * @param {number} at
 */
const u16 = (bytes, at) => bytes[at] | (bytes[at + 1] << 8);

/**
 * @param {Uint8Array} bytes
 * @param {number} at
 */
const u32 = (bytes, at) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

/**
 * Whether a file name is a .zip archive.
 * @param {string} name
 */
export function isZipName(name) {
  return /\.zip$/i.test(name);
}

/**
 * The .fit files of a .zip archive, with their contents.
 * @param {Uint8Array} bytes the whole archive
 * @returns {Promise<{ name: string, data: Uint8Array }[]>} empty when the archive holds no .fit file,
 *   cannot be read, or is too large
 */
export async function fitFilesInZip(bytes) {
  return (await filesInZip(bytes, /\.fit$/i)).map(({ name, data }) => ({ name, data }));
}

/**
 * The entries of a .zip archive whose path matches, with their contents (`name` is the last part of the path,
 * `path` the whole path).
 * @param {Uint8Array} bytes the whole archive
 * @param {RegExp} pattern tested on the entry's path
 * @returns {Promise<{ name: string, path: string, data: Uint8Array }[]>}
 */
export async function filesInZip(bytes, pattern) {
  if (bytes.length < 22 || bytes.length > MAX_ZIP_BYTES) return [];
  // The end of central directory record, searched from the end (it may carry a comment).
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return [];
  const count = u16(bytes, end + 10);
  let at = u32(bytes, end + 16);
  const found = [];
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) return [];
    const flags = u16(bytes, at + 8);
    const method = u16(bytes, at + 10);
    const size = u32(bytes, at + 20);
    const nameLength = u16(bytes, at + 28);
    const extraLength = u16(bytes, at + 30);
    const commentLength = u16(bytes, at + 32);
    const local = u32(bytes, at + 42);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    // Encrypted entries and other methods than stored (0) and deflated (8) are skipped.
    if (!pattern.test(name) || flags & 1 || (method !== 0 && method !== 8)) continue;
    if (local + 30 > bytes.length || u32(bytes, local) !== 0x04034b50) continue;
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    if (start + size > bytes.length) continue;
    const raw = bytes.subarray(start, start + size);
    try {
      const data = method === 0 ? raw.slice() : await inflate(raw);
      found.push({ name: name.split('/').pop() || name, path: name, data });
    } catch {
      // A damaged entry: the others are still imported.
    }
  }
  return found;
}

/**
 * @param {Uint8Array} raw deflated data, without header
 * @returns {Promise<Uint8Array>}
 */
async function inflate(raw) {
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Base64 of bytes, as the façade takes a file's contents.
 * @param {Uint8Array} bytes
 */
export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
