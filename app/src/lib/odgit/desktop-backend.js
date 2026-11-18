// @ts-check
// The working copies in the desktop app: the main process does the file work (desktop/odgit-fs.cjs, reached through
// `odDesktop.odgit.fs`, confined to its own folder in the app's data) and answers with plain bytes.
import { fsError } from './fs-adapter.js';

/** @returns {{ fs: (op: string, path: string, data?: Uint8Array) => Promise<any> }|null} */
function bridge() {
  return /** @type {any} */ (globalThis).odDesktop?.odgit ?? null;
}

/** @param {string} op @param {string} path @param {Uint8Array} [data] */
async function call(op, path, data) {
  const b = bridge();
  if (!b) throw new Error('NOT_AVAILABLE');
  try {
    return await b.fs(op, path, data);
  } catch (e) {
    // The main process throws `CODE: message`; Electron prefixes the IPC error with its own text.
    const m = /\b(ENOENT|EEXIST|ENOTDIR|ENOTEMPTY|EACCES|EISDIR)\b/.exec(e instanceof Error ? e.message : String(e));
    throw m ? fsError(m[1], path) : e;
  }
}

/** @type {import('./fs-adapter.js').GitFsBackend} */
export const desktopBackend = {
  readFile: async (path) => new Uint8Array(await call('readFile', path)),
  writeFile: (path, data) => call('writeFile', path, data),
  unlink: (path) => call('unlink', path),
  readdir: (path) => call('readdir', path),
  mkdir: (path) => call('mkdir', path),
  rmdir: (path) => call('rmdir', path),
  stat: (path) => call('stat', path),
};

export const desktopBackendAvailable = () => !!bridge();
