// The EXIF reader (app/src/lib/exif.js, task 2026-11-23-367): the time taken and the camera of a JPEG and of a HEIC file, from
// files built here byte by byte (no picture is needed: the reader looks at the headers only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraName, isoOf, readExif, readHeicExif, readJpegExif } from '../../app/src/lib/exif.js';

const ascii = (s) => [...s].map((c) => c.charCodeAt(0)).concat(0);

/**
 * A TIFF block: IFD0 with Make and Model and a pointer to the Exif IFD with DateTimeOriginal (and OffsetTimeOriginal).
 * @param {{ make?: string, model?: string, date?: string, zone?: string, little?: boolean }} o
 */
function tiff({ make = '', model = '', date = '', zone = '', little = true } = {}) {
  const out = [];
  const u16 = (v) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v) => (little ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  out.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  const ifd0 = [];
  if (make) ifd0.push([0x010f, ascii(make)]);
  if (model) ifd0.push([0x0110, ascii(model)]);
  const sub = [];
  if (date) sub.push([0x9003, ascii(date)]);
  if (zone) sub.push([0x9011, ascii(zone)]);
  const hasSub = sub.length > 0;
  const entries0 = ifd0.length + (hasSub ? 1 : 0);
  const size0 = 2 + entries0 * 12 + 4;
  let dataAt = 8 + size0;
  const subAt = dataAt;
  const sizeSub = hasSub ? 2 + sub.length * 12 + 4 : 0;
  dataAt += sizeSub;
  const blobs = [];
  const place = (bytes) => {
    if (bytes.length <= 4) return { inline: [...bytes, ...new Array(4 - bytes.length).fill(0)] };
    const at = dataAt;
    blobs.push(bytes);
    dataAt += bytes.length;
    return { at };
  };
  const entry = (tag, bytes) => {
    const p = place(bytes);
    return [...u16(tag), ...u16(2), ...u32(bytes.length), ...(p.inline ?? u32(p.at))];
  };
  out.push(...u16(entries0));
  for (const [tag, bytes] of ifd0) out.push(...entry(tag, bytes));
  if (hasSub) out.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(subAt));
  out.push(...u32(0));
  if (hasSub) {
    out.push(...u16(sub.length));
    for (const [tag, bytes] of sub) out.push(...entry(tag, bytes));
    out.push(...u32(0));
  }
  for (const b of blobs) out.push(...b);
  return out;
}

/** A JPEG that starts with an APP1 Exif segment. */
function jpeg(options) {
  const body = [...ascii('Exif').slice(0, 4), 0, 0, ...tiff(options)];
  const length = body.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xe1, length >> 8, length & 255, ...body, 0xff, 0xda, 0, 2]);
}

const box = (type, payload) => {
  const size = payload.length + 8;
  return [(size >>> 24) & 255, (size >> 16) & 255, (size >> 8) & 255, size & 255, ...ascii(type).slice(0, 4), ...payload];
};

/** A HEIC file: ftyp, a meta box with iinf (an hvc1 item and an Exif item) and iloc, and the Exif item after it. */
function heic(options) {
  const exifTiff = tiff(options);
  const exifItem = [0, 0, 0, 6, ...ascii('Exif').slice(0, 4), 0, 0, ...exifTiff]; // offset of the TIFF header: 6 bytes on
  const infe = (id, type) => box('infe', [2, 0, 0, 0, 0, id, 0, 0, ...ascii(type).slice(0, 4), 0]);
  const iinf = box('iinf', [0, 0, 0, 0, 0, 2, ...infe(1, 'hvc1'), ...infe(2, 'Exif')]);
  const ftyp = box('ftyp', [...ascii('heic').slice(0, 4), 0, 0, 0, 0]);
  // iloc version 0: offset size 4, length size 4, base offset size 0; two items, one extent each.
  const ilocBody = (exifOffset) => [0, 0, 0, 0, 0x44, 0x00, 0, 2, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 10, 0, 2, 0, 0, 0, 1, (exifOffset >>> 24) & 255, (exifOffset >> 16) & 255, (exifOffset >> 8) & 255, exifOffset & 255, 0, 0, 0, exifItem.length];
  const metaWith = (offset) => box('meta', [0, 0, 0, 0, ...iinf, ...box('iloc', ilocBody(offset))]);
  const offset = ftyp.length + metaWith(0).length;
  return new Uint8Array([...ftyp, ...metaWith(offset), ...exifItem]);
}

test('a JPEG gives the time taken and the camera', () => {
  const info = readJpegExif(jpeg({ make: 'OLYMPUS CORPORATION', model: 'TG-6', date: '2014:04:02 10:11:00' }));
  assert.deepEqual(info, { camera: 'Olympus TG-6', takenAt: '2014-04-02T10:11:00' });
});

test('the camera zone is kept when it is written, and the byte order does not matter', () => {
  for (const little of [true, false]) {
    const info = readJpegExif(jpeg({ make: 'GoPro', model: 'HERO12 Black', date: '2024:01:15 08:05:09', zone: '+13:00', little }));
    assert.deepEqual(info, { camera: 'GoPro HERO12 Black', takenAt: '2024-01-15T08:05:09+13:00' }, `little ${little}`);
  }
});

test('a model that already starts with the make is not doubled; a missing make is fine', () => {
  assert.equal(cameraName('Apple', 'iPhone 15 Pro'), 'Apple iPhone 15 Pro');
  assert.equal(cameraName('SONY', 'SONY ILCE-7M4'), 'SONY ILCE-7M4');
  assert.equal(cameraName('', 'TG-6'), 'TG-6');
  assert.deepEqual(readJpegExif(jpeg({ model: 'TG-6' })), { camera: 'TG-6' });
});

test('a JPEG without EXIF, a broken one, and other files give nothing', () => {
  assert.deepEqual(readJpegExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), {});
  assert.deepEqual(readJpegExif(new Uint8Array([1, 2, 3])), {});
  assert.deepEqual(readJpegExif(jpeg({ make: 'X', model: 'Y', date: '2014:04:02 10:11:00' }).slice(0, 40)), {});
  assert.deepEqual(readHeicExif(new Uint8Array(40)), {});
  assert.equal(isoOf('0000:00:00 00:00:00'), '');
  assert.equal(isoOf('2014:13:45 10:11:00'), '');
});

test('a HEIC file gives the same two values, from its Exif item', () => {
  const info = readHeicExif(heic({ make: 'Apple', model: 'iPhone 15 Pro', date: '2025:07:09 16:20:05', zone: '-05:00' }));
  assert.deepEqual(info, { camera: 'Apple iPhone 15 Pro', takenAt: '2025-07-09T16:20:05-05:00' });
});

test('readExif picks the reader from the type or the name, and never throws', async () => {
  const j = new Blob([jpeg({ model: 'TG-6', date: '2014:04:02 10:11:00' })], { type: 'image/jpeg' });
  assert.deepEqual(await readExif(j), { camera: 'TG-6', takenAt: '2014-04-02T10:11:00' });
  const h = new Blob([heic({ model: 'iPhone', date: '2025:07:09 16:20:05' })]);
  h.name = 'IMG_1.HEIC';
  assert.deepEqual(await readExif(h), { camera: 'iPhone', takenAt: '2025-07-09T16:20:05' });
  assert.deepEqual(await readExif(new Blob(['x'], { type: 'video/mp4' })), {});
  assert.deepEqual(await readExif({ type: 'image/jpeg', slice() { throw new Error('boom'); } }), {});
});
