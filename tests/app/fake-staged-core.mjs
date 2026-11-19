// A fake of the plugin's staged-file calls (stageImport, readFileChunk, assembleFile, discardImport) over files in
// memory, for the tests of the large-logbook paths. It enforces what the real plugin enforces, and records the
// largest piece that crossed the "bridge", so that a test can show no call carried a whole logbook.
import { Buffer } from 'node:buffer';

/** The most one call may carry: the plugin's 4 MB for a piece read, and its Java heap for a piece written. */
export const BRIDGE_LIMIT = 4 * 1024 * 1024;

export function fakeStagedCore() {
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  let n = 0;
  const stats = { largestPiece: 0, calls: 0, discarded: 0 };
  const guard = (path) => {
    if (!files.has(path)) throw Object.assign(new Error('BAD_REQUEST'), { code: 'BAD_REQUEST' });
    return files.get(path);
  };
  const seen = (text) => {
    stats.calls++;
    stats.largestPiece = Math.max(stats.largestPiece, typeof text === 'string' ? text.length : 0);
    if (typeof text === 'string' && text.length > BRIDGE_LIMIT * 2) throw new Error('OutOfMemoryError: a string this big crossed the bridge');
  };
  const core = {
    async stageImport(o) {
      seen(o.data);
      const bytes = Buffer.from(o.data, 'base64');
      if (o.append) {
        files.set(o.path, Buffer.concat([guard(o.path), bytes]));
        return { path: o.path };
      }
      const path = `/cache/import-${++n}-${String(o.name).replace(/[^A-Za-z0-9._-]/g, '_')}`;
      files.set(path, bytes);
      return { path };
    },
    async readFileChunk({ path, offset, length }) {
      const file = guard(path);
      const piece = file.subarray(offset, offset + Math.min(length, BRIDGE_LIMIT));
      const data = piece.toString('base64');
      seen(data);
      return { data, size: file.length };
    },
    async assembleFile({ name, parts }) {
      const out = [];
      for (const part of parts) {
        if (typeof part.text === 'string') out.push(Buffer.from(part.text, 'utf8'));
        else out.push(guard(part.path).subarray(part.start, part.end));
      }
      const path = `/cache/import-${++n}-${name}`;
      files.set(path, Buffer.concat(out));
      return { path };
    },
    async discardImport({ path }) {
      if (files.delete(path)) stats.discarded++;
    },
  };
  return {
    core,
    files,
    stats,
    /** A file as the plugin's stageSharedFile would leave it. */
    put(name, bytes) {
      const path = `/cache/import-${++n}-${name}`;
      files.set(path, Buffer.from(bytes));
      return { path, name, size: bytes.length };
    },
    text: (path) => guard(path).toString('utf8'),
  };
}
