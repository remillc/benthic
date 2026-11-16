// SPDX-License-Identifier: GPL-2.0
// Performance audit: micro-benchmarks on the live logbook (dev server): the cost of Svelte's deep $state proxy on
// logbook.dives, sorting with localeCompare vs plain comparison, and the table's selection restyle.
// usage: node tools/perf/measure-micro.mjs <logbook.ssrf> <label>
import { spawn } from 'node:child_process';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run'] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '../..');
const MAIN = process.env.MAIN || 'F:/projets/OpenDives';
killMine();
await sleep(1500);
const env = { ...process.env, OD_DEV_URL: 'http://localhost:5241', OD_HOST: `${MAIN}/build/desktop/win-x64/bin/opendives-host.exe`, OD_STAGE: `${MAIN}/build/desktop/stage`, OD_USER_DATA: path.join(root, 'build/perf', `ud-${label}`) };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), '--remote-debugging-port=9391', path.resolve(ssrf)], { env, stdio: 'ignore' });
const p = await attachLogbook();
await sleep(8000);
const r = await p.eval(`(async()=>{
  const { logbook } = await import('/src/lib/logbook.svelte.js');
  const { $state: _ } = {};
  const time = (f, n = 5) => { f(); const a = performance.now(); for (let i = 0; i < n; i++) f(); return +((performance.now() - a) / n).toFixed(1); };
  const proxied = logbook.dives;
  const raw = JSON.parse(JSON.stringify(proxied));
  const out = { dives: proxied.length };
  out.sortDateLocaleCompare_proxy_ms = time(() => [...proxied].sort((a, b) => a.date.localeCompare(b.date)));
  out.sortDateLocaleCompare_raw_ms = time(() => [...raw].sort((a, b) => a.date.localeCompare(b.date)));
  out.sortDatePlainCompare_raw_ms = time(() => [...raw].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
  out.filterMap_proxy_ms = time(() => proxied.filter((d) => d.maxDepthMm > 20000).map((d) => d.id));
  out.filterMap_raw_ms = time(() => raw.filter((d) => d.maxDepthMm > 20000).map((d) => d.id));
  out.jsonParse_listBytes = JSON.stringify(raw).length;
  out.jsonParse_ms = time(() => JSON.parse(JSON.stringify(raw)), 3);
  // Selection restyle: toggle a class on one row of the table and force a style+layout.
  const rows = document.querySelectorAll('.od-desktop-logbook--row');
  out.rowsInDom = rows.length;
  out.toggleClassOnOneRow_styleAndLayout_ms = time(() => { rows[5].classList.toggle('od-desktop-logbook--selected'); void document.body.offsetHeight; }, 10);
  out.forceFullLayout_ms = time(() => { document.querySelector('.od-desktop-logbook table').style.width = (Math.random() > 0.5 ? '99%' : '100%'); void document.body.offsetHeight; }, 5);
  return out;
})()`);
console.log(JSON.stringify(r, null, 1));
p.close(); child.kill(); killMine();
