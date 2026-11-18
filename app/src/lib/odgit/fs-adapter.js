// @ts-check
// The `fs` object isomorphic-git wants (`fs.promises.readFile`, `stat`, ...), built over a small backend: seven
// operations on whole files and folders. The backends are the app data folder through @capacitor/filesystem
// (capacitor-backend.js), the desktop app's folder through the Electron bridge (desktop-backend.js) and Node's `fs`
// (node-backend.js, tests). Paths are POSIX and absolute inside the backend's root; the working copy of a logbook
// is one folder of it, never shared with another git implementation (docs/spike-git-on-device.md: a working copy
// whose index another program wrote is rehashed in full by the first status).

/**
 * @typedef {Object} GitFsBackend
 * @property {(path: string) => Promise<Uint8Array>} readFile rejects with `code: 'ENOENT'` when there is no such file
 * @property {(path: string, data: Uint8Array) => Promise<void>} writeFile creates the missing parent folders
 * @property {(path: string) => Promise<void>} unlink
 * @property {(path: string) => Promise<string[]>} readdir the names (ENOENT when missing, ENOTDIR for a file)
 * @property {(path: string) => Promise<void>} mkdir creates the missing parents; no error when it exists
 * @property {(path: string) => Promise<void>} rmdir an empty folder, or a folder and all it holds
 * @property {(path: string) => Promise<{ type: 'file'|'dir', size: number, mtimeMs: number }>} stat ENOENT when missing
 */

/** @param {string} code @param {string} path */
export function fsError(code, path) {
  const e = /** @type {Error & { code: string, errno?: number }} */ (new Error(`${code}: ${path}`));
  e.code = code;
  return e;
}

/**
 * @param {string} path
 * @param {{ type: 'file'|'dir', size: number, mtimeMs: number }} s
 */
function toStats(path, s) {
  const dir = s.type === 'dir';
  const t = Math.floor(s.mtimeMs || 0);
  return {
    type: s.type,
    mode: dir ? 0o40000 : 0o100644,
    size: dir ? 0 : s.size,
    ino: 0,
    mtimeMs: t,
    ctimeMs: t,
    uid: 1,
    gid: 1,
    dev: 1,
    isFile: () => !dir,
    isDirectory: () => dir,
    isSymbolicLink: () => false,
  };
}

/**
 * @param {GitFsBackend} backend
 * @returns {{ promises: Record<string, (...args: any[]) => Promise<any>> } & Record<string, any>}
 */
export function createGitFs(backend) {
  const stat = async (/** @type {string} */ path) => toStats(path, await backend.stat(path));
  const promises = {
    /** @param {string} path @param {any} [options] */
    async readFile(path, options) {
      const data = await backend.readFile(path);
      const encoding = typeof options === 'string' ? options : options?.encoding;
      return encoding ? new TextDecoder().decode(data) : data;
    },
    /** @param {string} path @param {string|Uint8Array} data */
    async writeFile(path, data) {
      await backend.writeFile(path, typeof data === 'string' ? new TextEncoder().encode(data) : data);
    },
    unlink: (/** @type {string} */ path) => backend.unlink(path),
    readdir: (/** @type {string} */ path) => backend.readdir(path),
    /** One level at a time is what git asks for; the backends create parents anyway. */
    mkdir: (/** @type {string} */ path) => backend.mkdir(path),
    rmdir: (/** @type {string} */ path) => backend.rmdir(path),
    stat,
    lstat: stat,
    readlink: (/** @type {string} */ path) => Promise.reject(fsError('ENOSYS', path)),
    symlink: (/** @type {string} */ _target, /** @type {string} */ path) => Promise.reject(fsError('ENOSYS', path)),
    chmod: () => Promise.resolve(),
  };
  return { promises };
}

/** @param {string} path @returns {string} the path without a trailing slash, and with a leading one */
export function normalisePath(path) {
  const clean = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  return clean.startsWith('/') ? clean : `/${clean}`;
}

/** @param {Uint8Array} bytes @returns {string} base64 */
export function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** @param {string} text base64 @returns {Uint8Array} */
export function base64ToBytes(text) {
  if (typeof Buffer !== 'undefined') {
    const b = Buffer.from(text, 'base64');
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
