// Chromium headless + CPU throttling (default 4x): node browser-run.mjs <nDives> [runs] [cpuRate]
// The page comes from the proxy on 3100; the git host is reached through it (no latency) or through 3180 (80 ms RTT):
// that is a cross-origin call, so the CORS headers of the proxy are exercised.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { makeLogbook } from './gen.mjs';
import { WORK, DIRECT, USER, token, seedRepo, createRepo, deleteRepo, rmrf, median } from './lib.mjs';

const n = Number(process.argv[2]);
const RUNS = Number(process.argv[3] ?? 3);
const CPU = Number(process.argv[4] ?? 4);
const LATENCIES = (process.env.LATENCIES ?? '0,80').split(',').map(Number);
const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const resultsFile = path.join(WORK, 'results-browser.jsonl');
const tok = await token();
const baseFor = (lat) => (lat ? `http://127.0.0.1:${3100 + lat}` : 'http://127.0.0.1:3100');
const { files, diveIds, gearIds } = makeLogbook(n);
const divePath = `dives/${diveIds[0].slice(0, 2)}/${diveIds[0]}/dive.json`;
const gearPath = `gear/${gearIds[0]}.json`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
async function page() {
  const ctx = await browser.createBrowserContext(); // fresh IndexedDB
  const p = await ctx.newPage();
  p.setDefaultTimeout(0);
  await p.goto('http://127.0.0.1:3100/__web/index.html');
  const cdp = await p.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  return { p, ctx };
}
const log = (o) => { fs.appendFileSync(resultsFile, JSON.stringify({ n, cpu: CPU, ...o }) + '\n'); console.log(JSON.stringify(o)); };
const call = async (p, fn, arg) => p.evaluate((f, a) => window.spike[f](a), fn, arg);

for (const lat of LATENCIES) {
  const base = baseFor(lat);
  const url = (repo) => `${base}/${USER}/${repo}.git`;
  // initial upload
  for (let i = 0; i < RUNS; i++) {
    const repo = await createRepo('bup');
    const { p, ctx } = await page();
    try { log({ lat, label: 'b-up-iso', run: i, ...(await call(p, 'upload', { n, url: url(repo), token: tok, dbName: `up${i}` })) }); }
    catch (e) { log({ lat, label: 'b-up-iso', run: i, error: String(e).slice(0, 300) }); }
    await ctx.close(); await deleteRepo(repo);
  }
  // clones + local + edit round trip
  const seedDir = path.join(WORK, `bseed-${n}`);
  const repo = await seedRepo(files, seedDir);
  rmrf(seedDir);
  for (const [label, depth] of [['b-cl-iso-d1', 1], ['b-cl-iso-full', 0]]) {
    for (let i = 0; i < RUNS; i++) {
      const { p, ctx } = await page();
      try { log({ lat, label, run: i, ...(await call(p, 'clone', { url: url(repo), token: tok, depth, dbName: `cl${i}` })) }); }
      catch (e) { log({ lat, label, run: i, error: String(e).slice(0, 300) }); }
      await ctx.close();
    }
  }
  {
    const { p, ctx } = await page();
    try {
      await call(p, 'clone', { url: url(repo), token: tok, depth: 0, dbName: 'A' });
      await call(p, 'clone', { url: url(repo), token: tok, depth: 0, dbName: 'B' });
      for (let i = 0; i < RUNS; i++) {
        try { log({ lat, label: 'b-ed-iso', run: i, ...(await call(p, 'editRoundTrip', { url: url(repo), token: tok, dbNameA: 'A', dbNameB: 'B', divePath, gearPath })) }); }
        catch (e) { log({ lat, label: 'b-ed-iso', run: i, error: String(e).slice(0, 300) }); }
      }
      if (lat === LATENCIES[0]) for (let i = 0; i < RUNS; i++) log({ lat, label: 'b-local', run: i, ...(await call(p, 'local', { dbName: 'A', divePath })) });
    } catch (e) { log({ lat, label: 'b-edit-setup', error: String(e).slice(0, 300) }); }
    await ctx.close();
  }
  await deleteRepo(repo);
}
await browser.close();
