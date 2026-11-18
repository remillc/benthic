'use strict';
// The file operations of the git working copies (app/src/lib/odgit/desktop-backend.js), done in the main process, in
// one folder of the app's data. The page names paths inside that folder; nothing outside it can be reached.

const fs = require('node:fs');
const path = require('node:path');

/** @param {string} code @param {string} p */
function coded(code, p) {
  const e = /** @type {Error & { code: string }} */ (new Error(`${code}: ${p}`));
  e.code = code;
  return e;
}

/**
 * @param {string} root the folder holding all the working copies (created when missing)
 * @returns {(op: string, p: string, data?: Uint8Array) => Promise<any>}
 */
function createOdgitFs(root) {
  const base = path.resolve(root);
  fs.mkdirSync(base, { recursive: true });
  /** @param {unknown} p @returns {string} */
  const inside = (p) => {
    if (typeof p !== 'string' || p.includes('\0')) throw coded('EACCES', String(p));
    const target = path.resolve(base, '.' + path.posix.normalize('/' + p.replace(/\\/g, '/')));
    if (target !== base && !target.startsWith(base + path.sep)) throw coded('EACCES', p);
    return target;
  };
  /** @template T @param {() => Promise<T>} run @param {string} p @returns {Promise<T>} */
  const keep = (run, p) =>
    run().catch((/** @type {any} */ e) => {
      throw e?.code ? coded(e.code, p) : e;
    });
  return async (op, p, data) => {
    const target = inside(p);
    switch (op) {
      case 'readFile':
        return keep(() => fs.promises.readFile(target), p);
      case 'writeFile':
        if (!(data instanceof Uint8Array)) throw new Error('BAD_ARGUMENT: no data');
        await keep(() => fs.promises.mkdir(path.dirname(target), { recursive: true }), p);
        return keep(() => fs.promises.writeFile(target, data), p);
      case 'unlink':
        return keep(() => fs.promises.unlink(target), p);
      case 'readdir':
        return keep(() => fs.promises.readdir(target), p);
      case 'mkdir':
        await keep(() => fs.promises.mkdir(target, { recursive: true }), p);
        return null;
      case 'rmdir':
        if (target === base) throw coded('EACCES', p);
        return keep(() => fs.promises.rm(target, { recursive: true }), p);
      case 'stat': {
        const s = await keep(() => fs.promises.stat(target), p);
        return { type: s.isDirectory() ? 'dir' : 'file', size: s.size, mtimeMs: s.mtimeMs };
      }
      default:
        throw new Error(`BAD_ARGUMENT: unknown operation ${op}`);
    }
  };
}

module.exports = { createOdgitFs };
