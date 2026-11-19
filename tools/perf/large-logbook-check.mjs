// SPDX-License-Identifier: GPL-2.0
// Large-logbook check: the web layer's file paths and (optionally) the real core, on a logbook of ~100 MB or more.
// usage: node tools/perf/large-logbook-check.mjs <logbook.ssrf> [opendives-host executable]
//   (make one with: node tools/perf/gen-logbook.mjs 1386 build/perf/big.ssrf 1 3 70)
// It stages the file in pieces through a plugin fake backed by real files (what the desktop bridge does), scans it,
// runs the shared-file flow (sites a dives file lacks are added by assembling), and reports the largest piece any call
// carried and the peak heap of this process; with a host executable the core then imports the staged path.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { checkSharedFile } from '../../app/src/lib/deep-link.js';
import { openSharedFile } from '../../app/src/lib/shared-file.js';
import { scanLogbook, stageFile } from '../../app/src/lib/staged-file.js';

const [source, hostExe] = process.argv.slice(2);
if (!source) {
  console.error('usage: node tools/perf/large-logbook-check.mjs <logbook.ssrf> [opendives-host]');
  process.exit(2);
}
const MB = 1024 * 1024;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-large-'));
const stats = { largestCall: 0, calls: 0, peakHeap: 0, peakRss: 0 };
const sampler = setInterval(() => {
  const m = process.memoryUsage();
  stats.peakHeap = Math.max(stats.peakHeap, m.heapUsed + m.arrayBuffers);
  stats.peakRss = Math.max(stats.peakRss, m.rss);
}, 20);
let n = 0;
const noted = (text) => {
  stats.calls++;
  if (typeof text === 'string') stats.largestCall = Math.max(stats.largestCall, text.length);
};
const own = (p) => {
  if (path.dirname(p) !== dir || !path.basename(p).startsWith('import-')) throw new Error('BAD_REQUEST');
  return p;
};
/** The plugin's staged-file calls over real files: nothing is read whole. */
const core = {
  async stageImport(o) {
    noted(o.data);
    if (o.append) {
      fs.appendFileSync(own(o.path), Buffer.from(o.data, 'base64'));
      return { path: o.path };
    }
    const file = path.join(dir, `import-${++n}-${o.name.replace(/[^A-Za-z0-9._-]/g, '_')}`);
    fs.writeFileSync(file, Buffer.from(o.data, 'base64'));
    return { path: file };
  },
  async readFileChunk({ path: file, offset, length }) {
    const handle = fs.openSync(own(file), 'r');
    try {
      const buffer = Buffer.alloc(Math.min(length, 4 * MB));
      const read = fs.readSync(handle, buffer, 0, buffer.length, offset);
      const data = buffer.subarray(0, read).toString('base64');
      noted(data);
      return { data, size: fs.fstatSync(handle).size };
    } finally {
      fs.closeSync(handle);
    }
  },
  async assembleFile({ name, parts }) {
    const file = path.join(dir, `import-${++n}-${name}`);
    const out = fs.openSync(file, 'w');
    const buffer = Buffer.alloc(64 * 1024);
    for (const part of parts) {
      if (typeof part.text === 'string') fs.writeSync(out, Buffer.from(part.text));
      else {
        const input = fs.openSync(own(part.path), 'r');
        for (let at = part.start; at < part.end; ) {
          const read = fs.readSync(input, buffer, 0, Math.min(buffer.length, part.end - at), at);
          fs.writeSync(out, buffer, 0, read);
          at += read;
        }
        fs.closeSync(input);
      }
    }
    fs.closeSync(out);
    return { path: file };
  },
  async discardImport({ path: file }) {
    fs.rmSync(own(file), { force: true });
  },
};

const time = async (label, run) => {
  const start = Date.now();
  const value = await run();
  console.log(`${label}: ${((Date.now() - start) / 1000).toFixed(1)} s`);
  return value;
};

let host = null;
try {
  const size = fs.statSync(source).size;
  console.log(`logbook ${path.basename(source)}: ${(size / MB).toFixed(1)} MB`);
  const blob = await fs.openAsBlob(source);
  const staged = await time('stage in pieces (a file picked)', () => stageFile(core, new File([blob], 'Big.ssrf')));
  const scan = await time('scan', () => scanLogbook(core, staged.path, staged.size));
  console.log(`  sites ${scan.sites}, years ${scan.firstYear}-${scan.lastYear}, referenced ${scan.referenced.size}`);
  await core.discardImport({ path: staged.path });

  // The shared-file flow: the plugin streamed the file into the cache (here: copied), the web layer only sees a path.
  const shared = path.join(dir, `import-${++n}-Subsurface.ssrf`);
  fs.copyFileSync(source, shared);
  /** @type {{ path: string } | null} */
  let handed = null;
  const deps = {
    stage: async () => ({ name: 'Subsurface.ssrf', size, path: shared }),
    core,
    check: checkSharedFile,
    welcome: () => true,
    remembered: () => ({}),
    keep: () => {},
    listSites: async () => [],
    siteChange: async () => ({}),
    importData: async () => 0,
    toFirstLaunch: (name, file) => (handed = file),
    confirm: () => {},
    refuse: (key) => {
      throw new Error(`refused: ${key}`);
    },
    notify: () => {},
    imported: () => {},
    importFailed: () => {},
  };
  const result = await time('shared-file flow', () => openSharedFile(deps, 'content://x/1'));
  console.log(`  result: ${result}`);

  if (hostExe && handed) {
    const child = spawn(hostExe, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    host = child;
    const pending = new Map();
    let id = 0;
    createInterface({ input: child.stdout }).on('line', (line) => {
      const message = JSON.parse(line);
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if ('error' in message) waiting.reject(new Error(message.error));
      else waiting.resolve(message.result);
    });
    const call = (method, args) =>
      new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject });
        child.stdin.write(`${JSON.stringify({ id, method, args })}\n`);
      });
    const home = path.join(dir, 'home');
    fs.mkdirSync(home);
    await call('init', { home });
    const repo = `${home.replace(/\\/g, '/')}/carnet[main]`;
    const dives = await time('the core imports the staged path', () => call('importFile', { source: handed.path, repo }));
    console.log(`  dives imported by the core: ${dives}`);
    child.stdin.end();
  }
} finally {
  clearInterval(sampler);
  if (host && !host.killed) host.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`calls ${stats.calls}, largest string carried by one call ${(stats.largestCall / MB).toFixed(2)} MB`);
console.log(`peak heap+buffers of this process ${(stats.peakHeap / MB).toFixed(0)} MB, peak rss ${(stats.peakRss / MB).toFixed(0)} MB`);
