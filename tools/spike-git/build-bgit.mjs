// Bundles bgit-entry.js (the app's real git layer in a page) for bgit-run.mjs.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const web = path.resolve(import.meta.dirname, '../../build/spike-git/web');
fs.mkdirSync(web, { recursive: true });
await build({
  entryPoints: [path.resolve(import.meta.dirname, 'bgit-entry.js')],
  bundle: true,
  format: 'iife',
  outfile: path.join(web, 'bgit.js'),
  platform: 'browser',
  define: { global: 'window' },
  inject: [path.resolve(import.meta.dirname, 'buffer-shim.js')],
  alias: { buffer: 'buffer/' },
  logLevel: 'error',
});
fs.writeFileSync(path.join(web, 'bgit.html'), '<!doctype html><meta charset=utf-8><script src="bgit.js"></script>');
console.log('built');
