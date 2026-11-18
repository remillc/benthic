// Bundles the browser harness and reports the size isomorphic-git (+ LightningFS, fflate) would add to the app.
import { build } from 'esbuild';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
const web = path.resolve(import.meta.dirname, '../../build/spike-git/web');
fs.mkdirSync(web, { recursive: true });
await build({ entryPoints: [path.resolve(import.meta.dirname, 'browser-entry.js')], bundle: true, format: 'iife', outfile: path.join(web, 'bundle.js'), minify: false, platform: 'browser', define: { global: 'window' }, inject: [path.resolve(import.meta.dirname, 'buffer-shim.js')], alias: { buffer: 'buffer/' }, logLevel: 'error' });
fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><meta charset=utf-8><script src="bundle.js"></script>');
const size = async (name, entry, stdin) => {
  const r = await build({ stdin: { contents: stdin, resolveDir: import.meta.dirname }, bundle: true, minify: true, write: false, format: 'esm', platform: 'browser', define: { global: 'window' }, inject: [path.resolve(import.meta.dirname, 'buffer-shim.js')], alias: { buffer: 'buffer/' }, logLevel: 'error' });
  const b = r.outputFiles[0].contents;
  return { name, minKB: +(b.length / 1024).toFixed(1), gzipKB: +(zlib.gzipSync(b).length / 1024).toFixed(1) };
};
const rows = [
  await size('isomorphic-git (clone, fetch, merge, push, add, commit, status, log) + http/web', 0, `import git from 'isomorphic-git'; import http from 'isomorphic-git/http/web'; window.x = [git, http];`),
  await size('LightningFS (IndexedDB fs)', 0, `import L from '@isomorphic-git/lightning-fs'; window.x = L;`),
  await size('fflate (zip)', 0, `import { unzipSync } from 'fflate'; window.x = unzipSync;`),
  await size('all three', 0, `import git from 'isomorphic-git'; import http from 'isomorphic-git/http/web'; import L from '@isomorphic-git/lightning-fs'; window.x = [git, http, L];`),
];
console.table(rows);
fs.writeFileSync(path.join(web, '../bundle-size.json'), JSON.stringify(rows, null, 1));
