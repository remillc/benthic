// The .fit files taken out of a Garmin Connect « Export Original » .zip (app/src/lib/zip-fit.js,
// task 2026-11-14-124). The archives are built here; the .fit is one of Subsurface's samples.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { fitFilesInZip, isZipName, toBase64 } from '../../app/src/lib/zip-fit.js';

const FIT = new Uint8Array(readFileSync(new URL('../../third_party/subsurface/dives/garmin_2023-08-17-08-51-59.fit', import.meta.url)));

/**
 * A .zip archive (no CRC check is made by the reader, so it is left at 0).
 * @param {{ name: string, data: Uint8Array, deflate?: boolean }[]} entries
 * @param {string} [comment]
 */
function zip(entries, comment = '') {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const body = e.deflate ? deflateRawSync(e.data) : Buffer.from(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(e.deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(e.deflate ? 8 : 0, 10);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(e.data.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    parts.push(local, name, body);
    central.push(head, name);
    offset += local.length + name.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(Buffer.byteLength(comment), 20);
  return new Uint8Array(Buffer.concat([...parts, dir, end, Buffer.from(comment)]));
}

test('a Garmin export: the deflated .fit comes out unchanged', async () => {
  const fits = await fitFilesInZip(zip([{ name: '123456789_ACTIVITY.fit', data: FIT, deflate: true }]));
  assert.equal(fits.length, 1);
  assert.equal(fits[0].name, '123456789_ACTIVITY.fit');
  assert.deepEqual(fits[0].data, FIT);
});

test('stored entries, folders and a comment; other files are left out', async () => {
  const fits = await fitFilesInZip(
    zip(
      [
        { name: 'readme.txt', data: new TextEncoder().encode('hello') },
        { name: 'dives/A.FIT', data: FIT },
        { name: 'dives/b.fit', data: FIT, deflate: true },
      ],
      'Garmin Connect',
    ),
  );
  assert.deepEqual(
    fits.map((f) => f.name),
    ['A.FIT', 'b.fit'],
  );
  assert.deepEqual(fits[0].data, FIT);
});

test('no .fit, or not a zip: nothing, and the core gets the file as it is', async () => {
  assert.deepEqual(await fitFilesInZip(zip([{ name: 'divelogs.xml', data: new TextEncoder().encode('<divelogs/>') }])), []);
  assert.deepEqual(await fitFilesInZip(new TextEncoder().encode('<divelog program="subsurface"/>')), []);
  assert.deepEqual(await fitFilesInZip(new Uint8Array(0)), []);
});

test('the name of an archive', () => {
  assert.ok(isZipName('123.zip'));
  assert.ok(isZipName('Export.ZIP'));
  assert.ok(!isZipName('dive.fit'));
});

test('base64 as the façade takes it, also for large files', () => {
  assert.equal(toBase64(new Uint8Array([0, 1, 2, 250])), 'AAEC+g==');
  assert.equal(Buffer.from(toBase64(FIT), 'base64').compare(Buffer.from(FIT)), 0);
});
