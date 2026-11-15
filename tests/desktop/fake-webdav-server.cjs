// SPDX-License-Identifier: GPL-2.0
// A small WebDAV server for the tests of the desktop app (tests/desktop/webdav.test.mjs): Basic authentication,
// PROPFIND (Depth 0), MKCOL, PUT (with If-Match), GET. `root` is the path it serves WebDAV under: a Nextcloud
// is '/remote.php/dav/files/<user>/', any other server '/dav/' or '/'; everything else answers 404 like a web server.
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');

/**
 * @param {{ root?: string, user?: string, password?: string, serverError?: boolean }} [options]
 */
function startFakeWebdav({ root = '/remote.php/dav/files/alice/', user = 'alice', password = 'app-password-123', serverError = false } = {}) {
  /** @type {Map<string, { bytes: Buffer, etag: string, modified: Date }>} path under the root -> file */
  const files = new Map();
  /** @type {Set<string>} folders under the root, with their trailing slash */
  const folders = new Set(['']);
  /** Every request, for the tests: { method, path, headers }. */
  const requests = [];
  const expected = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(request.url || '/', 'http://x');
      const pathname = decodeURIComponent(url.pathname);
      requests.push({ method: request.method, path: pathname, headers: { ...request.headers } });
      const done = (status, headers = {}, text = '') => response.writeHead(status, headers).end(text);
      if (serverError) return done(500);
      // Outside the WebDAV root this is only a web server.
      // A Nextcloud asks for the account on any of its /remote.php/dav/ paths, even one of another user.
      const mine = pathname.startsWith(root) || pathname + '/' === root;
      if (!mine && !(root.startsWith('/remote.php/dav/') && pathname.startsWith('/remote.php/dav/'))) return done(request.method === 'PROPFIND' ? 404 : 405, { 'Content-Type': 'text/html' }, 'not here');
      if (request.headers.authorization !== expected) return done(401, { 'WWW-Authenticate': 'Basic realm="dav"' });
      if (!mine) return done(404);
      const rel = pathname.slice(root.length);
      const key = rel.replace(/\/$/, '');
      const etagOf = () => `"${crypto.randomBytes(8).toString('hex')}"`;
      switch (request.method) {
        case 'PROPFIND': {
          const file = files.get(key);
          if (!file && !folders.has(key ? `${key}/` : '')) return done(404);
          const props = file
            ? `<d:getetag>${file.etag.replace(/"/g, '&quot;')}</d:getetag><d:getlastmodified>${file.modified.toUTCString()}</d:getlastmodified><d:getcontentlength>${file.bytes.length}</d:getcontentlength>`
            : '<d:resourcetype><d:collection/></d:resourcetype>';
          return done(207, { 'Content-Type': 'application/xml; charset=utf-8' }, `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>${pathname}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`);
        }
        case 'MKCOL': {
          if (folders.has(`${key}/`)) return done(405);
          const parent = key.includes('/') ? `${key.slice(0, key.lastIndexOf('/'))}/` : '';
          if (!folders.has(parent)) return done(409);
          folders.add(`${key}/`);
          return done(201);
        }
        case 'PUT': {
          const parent = key.includes('/') ? `${key.slice(0, key.lastIndexOf('/'))}/` : '';
          if (!folders.has(parent)) return done(409);
          const current = files.get(key);
          const ifMatch = request.headers['if-match'];
          if (ifMatch && (!current || current.etag !== ifMatch)) return done(412);
          const etag = etagOf();
          files.set(key, { bytes: body, etag, modified: new Date(Math.floor(Date.now() / 1000) * 1000) });
          return done(current ? 204 : 201, { ETag: etag });
        }
        case 'GET': {
          const file = files.get(key);
          return file ? done(200, { 'Content-Type': 'application/octet-stream', ETag: file.etag }, file.bytes) : done(404);
        }
        default:
          return done(405);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
      resolve({
        /** The bare server address, as a diver types it. */
        address: `http://127.0.0.1:${port}`,
        port,
        root,
        user,
        password,
        files,
        folders,
        requests,
        /** Changes a file behind the app's back (another computer, the Nextcloud web page). */
        touch(/** @type {string} */ file, /** @type {string} */ text) {
          files.set(file, { bytes: Buffer.from(text), etag: etagOf2(), modified: new Date() });
        },
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done(undefined));
          }),
      });
    });
  });
}

const etagOf2 = () => `"${crypto.randomBytes(8).toString('hex')}"`;

module.exports = { startFakeWebdav };
