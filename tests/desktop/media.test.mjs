// SPDX-License-Identifier: GPL-2.0
// The desktop's media folder (desktop/media.cjs): objects by SHA-256, streamed to and from a signed URL (a local HTTP server
// stands for the storage), the hash checked on download. No Electron, no native build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const { createMedia } = createRequire(import.meta.url)('../../desktop/media.cjs');
const sha = (b) => createHash('sha256').update(b).digest('hex');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-media-'));
  const tempDir = path.join(root, 'temp');
  fs.mkdirSync(path.join(tempDir, 'import'), { recursive: true });
  return { media: createMedia({ userData: path.join(root, 'data'), tempDir }), tempDir, root };
}

function storage() {
  const objects = new Map();
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'PUT') {
        objects.set(req.url, { body: Buffer.concat(chunks), headers: req.headers });
        res.end();
      } else if (objects.has(req.url)) res.end(objects.get(req.url).body);
      else {
        res.statusCode = 404;
        res.end();
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, objects, base: `http://127.0.0.1:${server.address().port}` })));
}

test('a staged file becomes the object of its hash, once', async () => {
  const { media, tempDir } = setup();
  const bytes = randomBytes(5000);
  const staged = path.join(tempDir, 'import', 'import-1-a.jpg');
  fs.writeFileSync(staged, bytes);
  const { hash, size } = await media.call('adopt', { path: staged });
  assert.deepEqual([hash, size], [sha(bytes), 5000]);
  assert.equal(fs.existsSync(staged), false);
  const stat = await media.call('stat', { hash });
  assert.equal(stat.exists, true);
  assert.ok(fs.readFileSync(stat.path).equals(bytes), 'never altered');
  fs.writeFileSync(staged, bytes);
  await media.call('adopt', { path: staged });
  assert.equal(fs.readdirSync(media.dir).length, 1, 'the same content is one object');
  assert.equal((await media.call('stat', { hash: sha('x') })).exists, false);
});

test('only a staged file, a valid hash and a local or https address are accepted', async () => {
  const { media, root } = setup();
  const outside = path.join(root, 'secret.txt');
  fs.writeFileSync(outside, 'x');
  await assert.rejects(media.call('adopt', { path: outside }), /BAD_REQUEST/);
  await assert.rejects(media.call('stat', { hash: '../x' }), /BAD_REQUEST/);
  const { hash } = await media.call('putBytes', { base64: Buffer.from('hello').toString('base64') });
  await assert.rejects(media.call('upload', { hash, url: 'http://example.com/x' }), /BAD_REQUEST/);
  await assert.rejects(media.call('nope', {}), /BAD_REQUEST/);
});

test('upload streams the file with the signed headers; download checks the hash', async () => {
  const { media } = setup();
  const { server, objects, base } = await storage();
  try {
    const bytes = randomBytes(200000);
    const { hash } = await media.call('putBytes', { base64: bytes.toString('base64') });
    const sent = await media.call('upload', { hash, url: `${base}/o/${hash}`, headers: { 'x-amz-content-sha256': hash } });
    assert.equal(sent.status, 200);
    assert.ok(objects.get(`/o/${hash}`).body.equals(bytes));
    assert.equal(objects.get(`/o/${hash}`).headers['x-amz-content-sha256'], hash);
    assert.equal(objects.get(`/o/${hash}`).headers['content-length'], '200000');

    await media.call('delete', { hash });
    assert.equal((await media.call('stat', { hash })).exists, false);
    assert.deepEqual(await media.call('download', { hash, url: `${base}/o/${hash}` }), { size: 200000 });
    assert.ok(fs.readFileSync((await media.call('stat', { hash })).path).equals(bytes));

    objects.set('/o/bad', { body: Buffer.from('not what was announced') });
    await assert.rejects(media.call('download', { hash: sha('other'), url: `${base}/o/bad` }), /HASH_MISMATCH/);
    assert.equal((await media.call('stat', { hash: sha('other') })).exists, false, 'a wrong body is never kept');
    await assert.rejects(media.call('download', { hash: sha('gone'), url: `${base}/o/missing` }), /HTTP_404/);
    assert.deepEqual(fs.readdirSync(media.dir).filter((n) => n.endsWith('.part')), [], 'no partial file is left');
  } finally {
    server.close();
  }
});
