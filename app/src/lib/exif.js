// @ts-check
// A small EXIF reader with no dependency (task 2026-11-23-367): the time a picture was taken (DateTimeOriginal) and the
// camera's model, from a JPEG or a HEIC file. Nothing else is read and nothing is written; a file that does not say, or that
// cannot be read, gives an empty answer. The time is the camera's own clock, written without a zone: it is returned as
// `2014-04-02T10:11:00` (the device's local time when read), with the zone (`+13:00`) when the camera wrote OffsetTimeOriginal.

/** @typedef {{ takenAt?: string, camera?: string }} ExifInfo */

const TAG_MODEL = 0x0110;
const TAG_MAKE = 0x010f;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_ORIGINAL = 0x9003;
const TAG_OFFSET_ORIGINAL = 0x9011;

/** The longest read of a JPEG's head: the EXIF block is in the first segments. */
export const JPEG_HEAD_BYTES = 256 * 1024;
/** A HEIC file is read whole (its Exif item can sit after the picture); beyond this size it is left alone. */
export const HEIC_MAX_BYTES = 40 * 1024 * 1024;

/**
 * The values of a TIFF block (the part of EXIF after the « Exif\0\0 » marker or the HEIC prefix).
 * @param {DataView} view @param {number} base where the TIFF header starts
 * @returns {ExifInfo}
 */
export function readTiff(view, base) {
  if (base + 8 > view.byteLength) return {};
  const order = view.getUint16(base);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return {};
  if (view.getUint16(base + 2, little) !== 42) return {};
  const u16 = (/** @type {number} */ at) => view.getUint16(at, little);
  const u32 = (/** @type {number} */ at) => view.getUint32(at, little);

  /** The ASCII value of an entry, without its terminator. */
  const ascii = (/** @type {number} */ entry) => {
    const count = u32(entry + 4);
    const at = count <= 4 ? entry + 8 : base + u32(entry + 8);
    if (count < 1 || at < 0 || at + count > view.byteLength) return '';
    let out = '';
    for (let i = 0; i < count; i++) {
      const c = view.getUint8(at + i);
      if (c === 0) break;
      out += String.fromCharCode(c);
    }
    return out.trim();
  };

  /** The entries of an IFD: tag to the offset of its 12 bytes. @param {number} offset @returns {Map<number, number>} */
  const entries = (offset) => {
    /** @type {Map<number, number>} */
    const out = new Map();
    const at = base + offset;
    if (at < base + 8 || at + 2 > view.byteLength) return out;
    const n = u16(at);
    for (let i = 0; i < n; i++) {
      const entry = at + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      out.set(u16(entry), entry);
    }
    return out;
  };

  /** @type {ExifInfo} */
  const info = {};
  const ifd0 = entries(u32(base + 4));
  const model = ifd0.has(TAG_MODEL) ? ascii(/** @type {number} */ (ifd0.get(TAG_MODEL))) : '';
  const make = ifd0.has(TAG_MAKE) ? ascii(/** @type {number} */ (ifd0.get(TAG_MAKE))) : '';
  if (model) info.camera = cameraName(make, model);
  const pointer = ifd0.get(TAG_EXIF_IFD);
  if (pointer !== undefined) {
    const sub = entries(u32(pointer + 8));
    const date = sub.has(TAG_DATE_ORIGINAL) ? ascii(/** @type {number} */ (sub.get(TAG_DATE_ORIGINAL))) : '';
    const zone = sub.has(TAG_OFFSET_ORIGINAL) ? ascii(/** @type {number} */ (sub.get(TAG_OFFSET_ORIGINAL))) : '';
    const iso = isoOf(date, zone);
    if (iso) info.takenAt = iso;
  }
  return info;
}

/**
 * « Olympus TG-6 »: the model, with the make in front when the model does not already start with it (the makes are written
 * in capitals by some cameras, « OLYMPUS CORPORATION »: the first word, in its usual case).
 * @param {string} make @param {string} model
 */
export function cameraName(make, model) {
  const word = make.split(/[\s,]+/)[0] ?? '';
  if (!word || model.toLowerCase().startsWith(word.toLowerCase())) return model;
  const nice = word === word.toUpperCase() && word.length > 3 ? word[0] + word.slice(1).toLowerCase() : word;
  return `${nice} ${model}`;
}

/** « 2014:04:02 10:11:00 » (and « +13:00 ») to ISO, or '' when it is not a time. @param {string} date @param {string} zone */
export function isoOf(date, zone = '') {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(date);
  if (!m || m[1] === '0000') return '';
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  const z = /^([+-]\d{2}):(\d{2})$/.exec(zone.trim());
  return Number.isNaN(Date.parse(iso)) ? '' : z ? `${iso}${z[1]}:${z[2]}` : iso;
}

/**
 * The EXIF of a JPEG.
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {ExifInfo}
 */
export function readJpegExif(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {};
  let at = 2;
  while (at + 4 <= view.byteLength) {
    if (view.getUint8(at) !== 0xff) return {};
    const marker = view.getUint8(at + 1);
    if (marker === 0xda || marker === 0xd9) return {};
    const length = view.getUint16(at + 2);
    if (marker === 0xe1 && length >= 8 && view.getUint32(at + 4) === 0x45786966 && view.getUint16(at + 8) === 0) {
      return safe(() => readTiff(view, at + 10));
    }
    at += 2 + length;
  }
  return {};
}

/** The four letters at a place. @param {DataView} view @param {number} at */
const fourcc = (view, at) => (at + 4 <= view.byteLength ? String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3)) : '');

/**
 * The EXIF of a HEIC or HEIF file: the `Exif` item of the `meta` box (found through `iinf` and located by `iloc`).
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {ExifInfo}
 */
export function readHeicExif(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (fourcc(view, 4) !== 'ftyp') return {};
  return safe(() => {
    /** @param {number} from @param {number} to @param {string} type @returns {{ start: number, end: number }|null} */
    const find = (from, to, type) => {
      let at = from;
      while (at + 8 <= to) {
        let size = view.getUint32(at);
        const kind = fourcc(view, at + 4);
        let head = 8;
        if (size === 1) {
          size = Number(view.getBigUint64(at + 8));
          head = 16;
        } else if (size === 0) size = to - at;
        if (size < head) return null;
        if (kind === type) return { start: at + head, end: Math.min(to, at + size) };
        at += size;
      }
      return null;
    };
    const meta = find(0, view.byteLength, 'meta');
    if (!meta) return {};
    const inner = meta.start + 4; // a full box: version and flags
    const iinf = find(inner, meta.end, 'iinf');
    const iloc = find(inner, meta.end, 'iloc');
    if (!iinf || !iloc) return {};

    // The id of the item whose type is « Exif ».
    const iinfVersion = view.getUint8(iinf.start);
    let at = iinf.start + 4 + (iinfVersion === 0 ? 2 : 4);
    let exifId = -1;
    while (at + 8 <= iinf.end) {
      const size = view.getUint32(at);
      if (size < 12) break;
      if (fourcc(view, at + 4) === 'infe') {
        const version = view.getUint8(at + 8);
        if (version >= 2) {
          const id = version === 2 ? view.getUint16(at + 12) : view.getUint32(at + 12);
          const typeAt = at + 12 + (version === 2 ? 2 : 4) + 2;
          if (fourcc(view, typeAt) === 'Exif') exifId = id;
        }
      }
      at += size;
    }
    if (exifId < 0) return {};

    // Where it is.
    const iv = view.getUint8(iloc.start);
    const sizes = view.getUint16(iloc.start + 4);
    const offsetSize = sizes >> 12;
    const lengthSize = (sizes >> 8) & 15;
    const baseSize = (sizes >> 4) & 15;
    const indexSize = iv >= 1 ? sizes & 15 : 0;
    const read = (/** @type {number} */ pos, /** @type {number} */ n) => (n === 0 ? 0 : n === 4 ? view.getUint32(pos) : n === 8 ? Number(view.getBigUint64(pos)) : view.getUint16(pos));
    let p = iloc.start + 6;
    const count = iv < 2 ? view.getUint16(p) : view.getUint32(p);
    p += iv < 2 ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const id = iv < 2 ? view.getUint16(p) : view.getUint32(p);
      p += iv < 2 ? 2 : 4;
      if (iv >= 1) p += 2; // construction method
      p += 2; // data reference index
      const baseOffset = read(p, baseSize);
      p += baseSize;
      const extents = view.getUint16(p);
      p += 2;
      for (let e = 0; e < extents; e++) {
        if (iv >= 1 && indexSize) p += indexSize;
        const offset = read(p, offsetSize);
        p += offsetSize;
        const length = read(p, lengthSize);
        p += lengthSize;
        if (id === exifId && e === 0) {
          const start = baseOffset + offset;
          if (start + 4 > view.byteLength || length < 8) return {};
          // The item begins with the offset, from its fourth byte, of the TIFF header (the « Exif\0\0 » marker, often).
          return readTiff(view, start + 4 + view.getUint32(start));
        }
      }
    }
    return {};
  });
}

/** @template T @param {() => T} fn @returns {T|{}} */
function safe(fn) {
  try {
    return fn();
  } catch {
    return {};
  }
}

/**
 * The time taken and the camera of a picked file. JPEG and HEIC are read; any other file, or a file with no EXIF, gives `{}`.
 * @param {Blob & { name?: string }} file
 * @returns {Promise<ExifInfo>}
 */
export async function readExif(file) {
  try {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (type === 'image/jpeg' || /\.jpe?g$/.test(name)) return readJpegExif(await file.slice(0, JPEG_HEAD_BYTES).arrayBuffer());
    if (type === 'image/heic' || type === 'image/heif' || /\.(heic|heif)$/.test(name)) {
      return file.size <= HEIC_MAX_BYTES ? readHeicExif(await file.arrayBuffer()) : {};
    }
  } catch {
    // An unreadable file has no time and no camera.
  }
  return {};
}
