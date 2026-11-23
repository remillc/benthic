// SPDX-License-Identifier: GPL-2.0
'use strict';
// Dive photos and videos on the desktop (docs/architecture.md, 11.6): the objects of the plugin's `media*` calls, kept as
// files <userData>/media/<sha-256 of the content>. Uploads and downloads are streamed between a file and a signed URL in
// this process, so that a video never crosses the bridge; the web layer sends and receives paths and hashes only. Plain
// Node (no Electron), so that node:test drives it against a real HTTP server (tests/desktop/media.test.mjs).
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const HASH = /^[0-9a-f]{64}$/;
/** The largest object kept: a video of the phone. */
const MAX_OBJECT = 8 * 1024 ** 3;

/** @param {string} code @param {string} [message] */
function fail(code, message) {
  const e = new Error(code);
  /** @type {any} */ (e).code = code;
  if (message) e.message = `${code}: ${message}`;
  return e;
}

/** @param {unknown} hash */
function checkHash(hash) {
  if (typeof hash !== 'string' || !HASH.test(hash)) throw fail('BAD_REQUEST', 'hash');
  return hash;
}

/** SHA-256 and size of a file, read as a stream. @param {string} file @returns {Promise<{ hash: string, size: number }>} */
function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    let size = 0;
    fs.createReadStream(file)
      .on('data', (chunk) => {
        h.update(chunk);
        size += chunk.length;
      })
      .on('error', reject)
      .on('end', () => resolve({ hash: h.digest('hex'), size }));
  });
}

/**
 * A signed address: https, or http for this machine's development storage only.
 * @param {unknown} text @returns {URL}
 */
function signedUrl(text) {
  let url;
  try {
    url = new URL(String(text));
  } catch {
    throw fail('BAD_REQUEST', 'url');
  }
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw fail('BAD_REQUEST', 'not an allowed address');
  return url;
}

/**
 * @param {{ userData: string, tempDir: string }} options
 */
function createMedia({ userData, tempDir }) {
  const dir = path.join(userData, 'media');

  /** @param {string} hash */
  const fileOf = (hash) => path.join(dir, checkHash(hash));

  /** Moves a verified file to its name; an object already there wins and the new file goes. @param {string} from @param {string} hash */
  function keep(from, hash) {
    fs.mkdirSync(dir, { recursive: true });
    const target = fileOf(hash);
    if (fs.existsSync(target)) fs.rmSync(from, { force: true });
    else {
      try {
        fs.renameSync(from, target);
      } catch {
        // Another drive (temp and data folders): copy, then remove.
        fs.copyFileSync(from, `${target}.tmp`);
        fs.renameSync(`${target}.tmp`, target);
        fs.rmSync(from, { force: true });
      }
    }
  }

  /** @param {string} p @returns {boolean} */
  const isStaged = (p) => {
    const rel = path.relative(tempDir, path.resolve(String(p)));
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  };

  const ops = {
    /** @param {{ path: string }} o */
    async adopt(o) {
      if (!isStaged(o?.path)) throw fail('BAD_REQUEST', 'path');
      if (!fs.existsSync(o.path)) throw fail('NOT_FOUND');
      const { hash, size } = await hashFile(o.path);
      if (size === 0 || size > MAX_OBJECT) throw fail('BAD_REQUEST', 'size');
      keep(o.path, hash);
      return { hash, size };
    },

    /** @param {{ base64: string }} o */
    async putBytes(o) {
      const bytes = Buffer.from(String(o?.base64 ?? ''), 'base64');
      if (!bytes.length) throw fail('BAD_REQUEST', 'data');
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(fileOf(hash))) {
        fs.writeFileSync(`${fileOf(hash)}.tmp`, bytes);
        fs.renameSync(`${fileOf(hash)}.tmp`, fileOf(hash));
      }
      return { hash, size: bytes.length };
    },

    /** @param {{ hash: string }} o */
    async stat(o) {
      const file = fileOf(o?.hash);
      try {
        const st = fs.statSync(file);
        return { exists: true, size: st.size, path: file };
      } catch {
        return { exists: false, size: 0, path: '' };
      }
    },

    /** @param {{ hash: string, url: string, headers?: Record<string, string> }} o */
    async upload(o) {
      const file = fileOf(o?.hash);
      if (!fs.existsSync(file)) throw fail('NOT_FOUND');
      const url = signedUrl(o?.url);
      const size = fs.statSync(file).size;
      const headers = { ...(o?.headers ?? {}), 'Content-Length': String(size) };
      return new Promise((resolve, reject) => {
        const request = (url.protocol === 'https:' ? https : http).request(url, { method: 'PUT', headers }, (response) => {
          response.resume();
          response.on('end', () => resolve({ status: response.statusCode ?? 0 }));
        });
        request.setTimeout(10 * 60 * 1000, () => request.destroy(new Error('timeout')));
        request.on('error', () => reject(fail('NETWORK')));
        fs.createReadStream(file).on('error', () => request.destroy(new Error('read'))).pipe(request);
      });
    },

    /** @param {{ hash: string, url: string }} o */
    async download(o) {
      const target = fileOf(o?.hash);
      const url = signedUrl(o?.url);
      fs.mkdirSync(dir, { recursive: true });
      const part = `${target}.${process.pid}.part`;
      try {
        await new Promise((resolve, reject) => {
          const request = (url.protocol === 'https:' ? https : http).get(url, (response) => {
            if (response.statusCode !== 200) {
              response.resume();
              reject(fail(`HTTP_${response.statusCode}`));
              return;
            }
            pipeline(response, fs.createWriteStream(part)).then(resolve, () => reject(fail('NETWORK')));
          });
          request.setTimeout(10 * 60 * 1000, () => request.destroy(new Error('timeout')));
          request.on('error', () => reject(fail('NETWORK')));
        });
        const { hash, size } = await hashFile(part);
        if (hash !== o.hash) throw fail('HASH_MISMATCH');
        keep(part, hash);
        return { size };
      } finally {
        fs.rmSync(part, { force: true });
      }
    },

    /** @param {{ hash: string }} o */
    async delete(o) {
      fs.rmSync(fileOf(o?.hash), { force: true });
    },
  };

  return {
    dir,
    /** @param {string} op @param {any} options */
    call(op, options) {
      if (!Object.hasOwn(ops, op)) return Promise.reject(fail('BAD_REQUEST', `unknown media operation ${op}`));
      return /** @type {any} */ (ops)[op](options ?? {});
    },
    /** The file of an object for the app:// handler, or '' when it is not there. @param {string} hash */
    fileFor(hash) {
      if (!HASH.test(hash)) return '';
      const file = path.join(dir, hash);
      return fs.existsSync(file) ? file : '';
    },
  };
}

module.exports = { createMedia, hashFile };
