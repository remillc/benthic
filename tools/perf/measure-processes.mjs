// SPDX-License-Identifier: GPL-2.0
// Performance audit: processes of the desktop app (Electron main, renderers, GPU, helper per window) and their memory.
// usage: node tools/perf/measure-processes.mjs <logbook.ssrf> <label>   (production build in build/perf/stage-prod, reuses ud-<label>)
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { attachLogbook, sleep } from './cdp.mjs';
import { killMine } from './kill-mine.mjs';

const [ssrf, label = 'run'] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '../..');
const MAIN = process.env.MAIN || 'F:/projets/benthic';
killMine();
await sleep(1500);
const env = { ...process.env, BC_HOST: `${MAIN}/build/desktop/win-x64/bin/benthic-host.exe`, BC_STAGE: path.join(root, 'build/perf/stage-prod'), BC_USER_DATA: path.join(root, 'build/perf', `ud-${label}`) };
delete env.ELECTRON_RUN_AS_NODE; delete env.BC_DEV_URL;
const child = spawn(`${MAIN}/desktop/node_modules/electron/dist/electron.exe`, [path.join(root, 'desktop'), `--remote-debugging-port=${process.env.CDP_PORT || 9391}`, "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows", path.resolve(ssrf)], { env, stdio: 'ignore' });
const p = await attachLogbook();
await sleep(5000);
const ps = `$all=Get-CimInstance Win32_Process; $root=${child.pid}; $ids=@($root); $grow=$true; while($grow){$grow=$false; foreach($x in $all){ if($ids -contains $x.ParentProcessId -and -not ($ids -contains $x.ProcessId)){$ids+=$x.ProcessId;$grow=$true}}}; $cmd=@{}; foreach($x in $all){$cmd[$x.ProcessId]=$x.CommandLine}; foreach($i in $ids){ $pr=Get-Process -Id $i -ErrorAction SilentlyContinue; if($pr){ $c=$cmd[[uint32]$i]; $ty=if($c -match "--type=([a-z-]+)"){$Matches[1]}else{"main"}; ($ty+"|"+[math]::Round($pr.WorkingSet64/1MB)+"|"+$pr.ProcessName) } }`;
const lines = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(/\r?\n/);
const rows = lines.map((l) => { const [type, mb, name] = l.split('|'); return { type, workingSetMB: Number(mb), name }; });
console.log(JSON.stringify({ label, windows: (await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9391}/json`)).json()).filter((x) => x.type === 'page').length, processes: rows, totalMB: +rows.reduce((a, r) => a + r.workingSetMB, 0).toFixed(0) }));
p.close(); child.kill(); killMine();
