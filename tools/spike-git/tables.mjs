// Medians of the runs as markdown tables: node tables.mjs  (reads build/spike-git/results-*.jsonl)
import fs from 'node:fs';
import path from 'node:path';
import { WORK, median } from './lib.mjs';

const read = (f) => (fs.existsSync(path.join(WORK, f)) ? fs.readFileSync(path.join(WORK, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const rows = [...read('results-node.jsonl').map((r) => ({ env: 'node', ...r })), ...read('results-browser.jsonl').map((r) => ({ env: 'browser', ...r }))];
const sizes = [300, 1000, 3000];
const fmt = (ms) => (ms == null ? '-' : ms >= 60000 ? `${(ms / 60000).toFixed(1)} min` : ms >= 10000 ? `${(ms / 1000).toFixed(0)} s` : `${(ms / 1000).toFixed(2)} s`);
function cell(label, n, lat, key = 'ms') {
  const rs = rows.filter((r) => r.label === label && r.n === n && r.lat === lat && !r.error && r[key] != null);
  if (!rs.length) {
    const err = rows.find((r) => r.label === label && r.n === n && r.lat === lat && r.error);
    return err ? 'error' : '-';
  }
  return `${fmt(median(rs.map((r) => r[key])))}${rs.length < 3 ? ` (${rs.length})` : ''}`;
}
function table(title, labels, key = 'ms', lats = [0, 80]) {
  console.log(`\n${title}\n`);
  const head = ['Method', ...sizes.flatMap((n) => lats.map((l) => `${n} dives, ${l ? l + ' ms RTT' : 'local'}`))];
  console.log(`| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|`);
  for (const [label, name] of labels) console.log(`| ${name} | ${sizes.flatMap((n) => lats.map((l) => cell(label, n, l, key))).join(' | ')} |`);
}
const up = [['up-contents-b5', 'Contents API, 5 dives per commit (estimate from timed commits)'], ['up-contents-b50', 'Contents API, 50 dives per commit (estimate)'], ['up-iso', 'isomorphic-git (Node, fs): init, add, commit, push'], ['up-cli', 'git CLI: init, add, commit, push'], ['b-up-iso', 'isomorphic-git (Chromium 4x CPU, LightningFS)']];
table('Initial upload', up);
table('Clone', [['cl-raw', 'Tree list + raw files, 4 at a time (today)'], ['cl-zip', 'Archive zip + fflate unzip'], ['cl-iso-d1', 'isomorphic-git, depth 1 (Node)'], ['cl-iso-full', 'isomorphic-git, full (Node)'], ['cl-cli-d1', 'git CLI, depth 1'], ['cl-cli-full', 'git CLI, full'], ['b-cl-iso-d1', 'isomorphic-git depth 1 (Chromium 4x)'], ['b-cl-iso-full', 'isomorphic-git full (Chromium 4x)']]);
table('Edit round trip (push of 1 dive + 1 gear file, then pull on a second copy)', [['ed-contents', 'Contents API (read 2 shas, commit, tree list, fetch changed)'], ['ed-iso', 'isomorphic-git (Node)'], ['ed-cli', 'git CLI'], ['b-ed-iso', 'isomorphic-git (Chromium 4x)']]);
console.log('\nPhases of the round trip, push / pull:\n');
for (const label of ['ed-contents', 'ed-iso', 'ed-cli', 'b-ed-iso']) for (const lat of [0, 80]) {
  const cs = sizes.map((n) => { const rs = rows.filter((r) => r.label === label && r.n === n && r.lat === lat && r.phases); return rs.length ? `${fmt(median(rs.map((r) => r.phases.push)))} / ${fmt(median(rs.map((r) => r.phases.pull)))}` : '-'; });
  console.log(`- ${label}, ${lat} ms: ${cs.join(' | ')}`);
}
console.log('\nLocal operations (isomorphic-git, local lat 0; ms, median):\n');
for (const env of ['local-iso', 'b-local']) for (const n of sizes) {
  const rs = rows.filter((r) => r.label === env && r.n === n && !r.error);
  if (rs.length) console.log(`- ${env} ${n}: ` + ['statusClean', 'statusDirty', 'statusOneFile', 'log20', 'peakHeapMB', 'rssMB'].filter((k) => rs[0][k] != null).map((k) => `${k} ${Math.round(median(rs.map((r) => r[k])))}`).join(', '));
}
console.log('\nPeak memory (Node RSS MB, max over the median case) and sizes:\n');
for (const label of ['up-contents-b5', 'up-contents-b50', 'up-iso', 'up-cli', 'cl-raw', 'cl-zip', 'cl-iso-d1', 'cl-iso-full', 'cl-cli-full', 'ed-iso']) {
  console.log(`- ${label}: ` + sizes.map((n) => { const rs = rows.filter((r) => r.label === label && r.n === n && r.lat === 0 && !r.error); return rs.length ? `${median(rs.map((r) => r.rssMB))} MB RSS${rs[0].repoMB ? `, .git ${median(rs.map((r) => r.repoMB))} MB` : ''}${rs[0].downloadMB ? `, download ${rs[0].downloadMB} MB` : ''}${rs[0].uploadMB ? `, body ${rs[0].uploadMB} MB (max ${rs[0].maxBodyMB})` : ''}` : '-'; }).join(' | '));
}
console.log('\nBrowser heap (peak JS heap MB):\n');
for (const label of ['b-up-iso', 'b-cl-iso-d1', 'b-cl-iso-full', 'b-ed-iso', 'b-local']) console.log(`- ${label}: ` + sizes.map((n) => { const rs = rows.filter((r) => r.label === label && r.n === n && !r.error && r.peakHeapMB != null); return rs.length ? `${Math.max(...rs.map((r) => r.peakHeapMB))} MB` : '-'; }).join(' | '));
console.log('\nBrowser upload, write of the files to LightningFS (not in the table above), median:\n');
for (const lat of [0]) console.log(sizes.map((n) => { const rs = rows.filter((r) => r.label === 'b-up-iso' && r.n === n && r.lat === lat && r.phases); return rs.length ? `${n}: ${fmt(median(rs.map((r) => r.phases.writeFiles)))} (add ${fmt(median(rs.map((r) => r.phases.add)))}, commit ${fmt(median(rs.map((r) => r.phases.commit)))}, push ${fmt(median(rs.map((r) => r.phases.push)))})` : `${n}: -`; }).join('; '));
console.log('\nErrors:\n');
for (const r of rows.filter((r) => r.error)) console.log(`- ${r.env} ${r.label} n=${r.n} lat=${r.lat}: ${String(r.error).slice(0, 200).replace(/\n/g, ' ')}`);
