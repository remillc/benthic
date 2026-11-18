// @ts-check
// The backend over Node's `fs`: the tests, and the harnesses that measure the git layer outside a phone. Not imported by
// the app (the bundler never sees it). `root` is the folder the backend's paths are relative to.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fsError } from './fs-adapter.js';

/**
 * @param {string} root
 * @returns {import('./fs-adapter.js').GitFsBackend}
 */
export function nodeBackend(root) {
  /** @param {string} p */
  const full = (p) => {
    const target = path.join(root, p);
    if (target !== root && !target.startsWith(root + path.sep)) throw fsError('EACCES', p);
    return target;
  };
  /** @template T @param {Promise<T>} promise @param {string} p @returns {Promise<T>} */
  const wrap = (promise, p) =>
    promise.catch((/** @type {any} */ e) => {
      throw e?.code ? fsError(e.code, p) : e;
    });
  return {
    readFile: async (p) => new Uint8Array(await wrap(fs.readFile(full(p)), p)),
    async writeFile(p, data) {
      await wrap(fs.mkdir(path.dirname(full(p)), { recursive: true }), p);
      await wrap(fs.writeFile(full(p), data), p);
    },
    unlink: (p) => wrap(fs.unlink(full(p)), p),
    readdir: (p) => wrap(fs.readdir(full(p)), p),
    mkdir: async (p) => void (await wrap(fs.mkdir(full(p), { recursive: true }), p)),
    rmdir: (p) => wrap(fs.rm(full(p), { recursive: true, force: false }), p),
    async stat(p) {
      const s = await wrap(fs.stat(full(p)), p);
      return { type: s.isDirectory() ? 'dir' : 'file', size: s.size, mtimeMs: s.mtimeMs };
    },
  };
}
