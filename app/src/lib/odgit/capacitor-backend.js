// @ts-check
// The working copies on a phone or a tablet: plain files in the app's data folder, through @capacitor/filesystem
// (Directory.Data: the app's private storage, not backed up to the photo library, removed with the app). Everything
// of a logbook lives under `odgit/<one folder per logbook>`.
import { Directory, Filesystem } from '@capacitor/filesystem';
import { base64ToBytes, bytesToBase64, fsError, normalisePath } from './fs-adapter.js';

const ROOT = 'odgit';

/** @param {string} path */
const full = (path) => `${ROOT}${normalisePath(path)}`;

/** The plugin's errors are messages; the codes git looks at are rebuilt from them. @param {unknown} e @param {string} path */
function mapError(e, path) {
  const message = e instanceof Error ? e.message : String(e);
  if (/exist|not found|no such|ENOENT|couldn't|could not be found/i.test(message) && !/already/i.test(message)) return fsError('ENOENT', path);
  if (/already|EEXIST/i.test(message)) return fsError('EEXIST', path);
  if (/not empty|ENOTEMPTY/i.test(message)) return fsError('ENOTEMPTY', path);
  return e instanceof Error ? e : new Error(message);
}

/** @type {import('./fs-adapter.js').GitFsBackend} */
export const capacitorBackend = {
  async readFile(path) {
    try {
      const { data } = await Filesystem.readFile({ path: full(path), directory: Directory.Data });
      return typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(await data.arrayBuffer());
    } catch (e) {
      throw mapError(e, path);
    }
  },
  async writeFile(path, data) {
    try {
      await Filesystem.writeFile({ path: full(path), directory: Directory.Data, data: bytesToBase64(data), recursive: true });
    } catch (e) {
      throw mapError(e, path);
    }
  },
  async unlink(path) {
    try {
      await Filesystem.deleteFile({ path: full(path), directory: Directory.Data });
    } catch (e) {
      throw mapError(e, path);
    }
  },
  async readdir(path) {
    try {
      const { files } = await Filesystem.readdir({ path: full(path), directory: Directory.Data });
      return files.map((f) => f.name);
    } catch (e) {
      throw mapError(e, path);
    }
  },
  async mkdir(path) {
    try {
      await Filesystem.mkdir({ path: full(path), directory: Directory.Data, recursive: true });
    } catch (e) {
      const mapped = mapError(e, path);
      if (/** @type {any} */ (mapped).code !== 'EEXIST') throw mapped;
    }
  },
  async rmdir(path) {
    try {
      await Filesystem.rmdir({ path: full(path), directory: Directory.Data, recursive: true });
    } catch (e) {
      throw mapError(e, path);
    }
  },
  async stat(path) {
    try {
      const s = await Filesystem.stat({ path: full(path), directory: Directory.Data });
      return { type: s.type === 'directory' ? 'dir' : 'file', size: s.size, mtimeMs: s.mtime ?? 0 };
    } catch (e) {
      throw mapError(e, path);
    }
  },
};
