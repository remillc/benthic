// The real git layer in Chromium at phone CPU speed: node bgit-run.mjs <nDives> [kind=lightning|bridge] [cpuRate=4] [rounds=3]
// Needs the dev stack, proxy.mjs 3100 0, and BC_FORGEJO_USER / BC_FORGEJO_PASSWORD in the environment.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { makeLogbook } from './gen.mjs';
import { WORK, USER, token, seedRepo, deleteRepo, rmrf } from './lib.mjs';
import { nodeBackend } from '../../app/src/lib/bgit/node-backend.js';

const n = Number(process.argv[2]);
const kind = process.argv[3] ?? 'lightning';
const CPU = Number(process.argv[4] ?? 4);
const ROUNDS = Number(process.argv[5] ?? 3);
const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tok = await token();
const base = 'http://127.0.0.1:3100';
const { files, diveIds, gearIds } = makeLogbook(n);
const divePath = `dives/${diveIds[0].slice(0, 2)}/${diveIds[0]}/dive.json`;
const gearPath = `gear/${gearIds[0]}.json`;

const bridgeRoot = path.join(WORK, 'bridge');
rmrf(bridgeRoot);
const backends = {};
async function odfs(name, op, p, data) {
  const b = (backends[name] ??= nodeBackend(path.join(bridgeRoot, name)));
  try {
    switch (op) {
      case 'readFile': return { data: Buffer.from(await b.readFile(p)).toString('base64') };
      case 'writeFile': await b.writeFile(p, Buffer.from(data, 'base64')); return {};
      case 'unlink': await b.unlink(p); return {};
      case 'readdir': return { names: await b.readdir(p) };
      case 'mkdir': await b.mkdir(p); return {};
      case 'rmdir': await b.rmdir(p); return {};
      case 'stat': return { stat: await b.stat(p) };
    }
  } catch (e) {
    return { err: e.code ?? 'EIO' };
  }
}

const seedDir = path.join(WORK, `oseed-${n}`);
const repo = await seedRepo(files, seedDir);
rmrf(seedDir);
const url = `${base}/${USER}/${repo}.git`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--enable-precise-memory-info'] });
const ctx = await browser.createBrowserContext();
const p = await ctx.newPage();
p.setDefaultTimeout(0);
await p.exposeFunction('__odfs', odfs);
await p.goto(`${base}/__web/bgit.html`);
const cdp = await p.createCDPSession();
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
const call = (fn, arg) => p.evaluate((f, a) => window.odbench[f](a), fn, arg);
const out = { n, kind, cpu: CPU };
try {
  out.clone = await call('clone', { kind, name: 'A', url, token: tok });
  await call('clone', { kind, name: 'B', url, token: tok });
  out.roundTrip = await call('roundTrip', { a: 'A', b: 'B', divePath, gearPath, rounds: ROUNDS });
  out.local = await call('local', { name: 'A', divePath });
} catch (e) {
  out.error = String(e).slice(0, 400);
}
console.log(JSON.stringify(out));
fs.appendFileSync(path.join(WORK, 'results-bgit.jsonl'), JSON.stringify(out) + '\n');
await browser.close();
await deleteRepo(repo);
rmrf(bridgeRoot);
