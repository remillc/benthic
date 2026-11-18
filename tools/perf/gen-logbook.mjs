// SPDX-License-Identifier: GPL-2.0
// Synthetic logbook generator for the performance audit (docs/performance-audit.md).
// usage: node tools/perf/gen-logbook.mjs <dives> <out.ssrf> [seed] [sample-step-seconds] [dive-minutes]
// Writes a Subsurface XML (.ssrf) logbook: ~300 sites with GPS, trips, tags, buddies, suits,
// 1 to 4 cylinders (air, nitrox, trimix), profiles sampled every 10 s with temperature and
// tank pressure. Data is random; no personal data.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [count = '500', out = 'build/perf/logbook.ssrf', seedArg = '1', stepArg = '10', minutesArg = ''] = process.argv.slice(2);
const N = Number(count);
let s = Number(seedArg) >>> 0 || 1;
const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&apos;');
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')} min`;

const countries = ['Egypt', 'Philippines', 'Mexico', 'France', 'Spain', 'Thailand', 'Indonesia', 'Malta', 'Croatia', 'Norway'];
const words = ['Reef', 'Wall', 'Wreck', 'Cave', 'Bay', 'Point', 'Garden', 'Arch', 'Canyon', 'Pinnacle', 'Jetty', 'Cove'];
const sites = Array.from({ length: 300 }, (_, i) => ({
  uuid: (0x10000000 + i * 7919).toString(16).padStart(8, '0'),
  name: `${pick(words)} ${i + 1}, ${pick(countries)}`,
  lat: between(-40, 55), lon: between(-120, 150),
}));
const buddies = ['Alex', 'Sam', 'Marie', 'Jean', 'Lena', 'Omar', 'Chen', 'Ines', 'Paolo', 'Nina', 'Tom', 'Zoe'];
const suits = ['wet, 3mm', 'wet, 5mm', 'wet, 7mm', 'drysuit', 'shorty'];
const tags = ['boat', 'shore', 'night', 'training', 'deep', 'wreck', 'drift', 'photo'];
const cylTypes = [
  ['AL80', 11.1, 207], ['Steel 12L', 12, 232], ['Steel 15L', 15, 232], ['AL40', 5.7, 207], ['Twinset 2x12', 24, 232],
];

const parts = [];
parts.push(`<divelog program='subsurface' version='2'>\n<settings>\n  <autogroup state='1' />\n</settings>\n<divesites>`);
for (const x of sites) parts.push(`<site uuid='${x.uuid}' name='${esc(x.name)}' gps='${x.lat.toFixed(6)} ${x.lon.toFixed(6)}'>\n</site>`);
parts.push('</divesites>\n<dives>');

let t = Date.UTC(2008, 0, 5, 9, 0, 0);
let tripOpen = false;
let tripLeft = 0;
let total = 0;
const closeTrip = () => { if (tripOpen) { parts.push('</trip>'); tripOpen = false; } };
for (let n = 1; n <= N; n++) {
  if (tripLeft <= 0) {
    closeTrip();
    tripLeft = 4 + Math.floor(rnd() * 20);
    const site = pick(sites);
    t += (1 + rnd() * 20) * 86400e3;
    const d = new Date(t);
    parts.push(`<trip date='${d.toISOString().slice(0, 10)}' time='08:00:00' location='${esc(site.name)}'>`);
    tripOpen = true;
  }
  tripLeft--;
  t += (4 + rnd() * 6) * 3600e3;
  const d = new Date(t);
  const maxD = between(8, rnd() < 0.1 ? 70 : 38);
  const dur = minutesArg ? Number(minutesArg) * 60 : Math.round(between(25, rnd() < 0.1 ? 90 : 60)) * 60;
  const nCyl = rnd() < 0.7 ? 1 : 1 + Math.floor(rnd() * 3);
  const site = pick(sites);
  const dtags = rnd() < 0.5 ? ` tags='${[pick(tags), pick(tags)].filter((v, i, a) => a.indexOf(v) === i).join(', ')}'` : '';
  const rating = rnd() < 0.6 ? ` rating='${1 + Math.floor(rnd() * 5)}'` : '';
  parts.push(`<dive number='${n}'${dtags}${rating} divesiteid='${site.uuid}' date='${d.toISOString().slice(0, 10)}' time='${d.toISOString().slice(11, 19)}' duration='${mmss(dur)}'>`);
  parts.push(`  <divemaster>${pick(buddies)}</divemaster>\n  <buddy>${pick(buddies)}, ${pick(buddies)}</buddy>`);
  if (rnd() < 0.5) parts.push(`  <notes>Synthetic dive ${n}. Good visibility, light current, ${pick(words).toLowerCase()} on the left.</notes>`);
  parts.push(`  <suit>${pick(suits)}</suit>`);
  const cyls = [];
  for (let c = 0; c < nCyl; c++) {
    const [desc, size, wp] = pick(cylTypes);
    const o2 = c === 0 ? (rnd() < 0.7 ? 21 : 32) : pick([50, 80, 21]);
    const he = maxD > 50 && c === 0 ? 30 : 0;
    const start = Math.round(between(190, 230));
    const end = Math.round(between(40, 110));
    cyls.push({ start, end });
    parts.push(`  <cylinder size='${size} l' workpressure='${wp} bar' description='${desc}'${o2 !== 21 ? ` o2='${o2}.0%'` : ''}${he ? ` he='${he}.0%'` : ''} start='${start}.0 bar' end='${end}.0 bar' />`);
  }
  parts.push(`  <weightsystem weight='${(2 + Math.floor(rnd() * 8)).toFixed(1)} kg' description='belt' />`);
  parts.push(`  <divecomputer model='Synthetic DC' deviceid='11112222' diveid='${n.toString(16).padStart(8, '0')}'>`);
  parts.push(`  <depth max='${maxD.toFixed(2)} m' mean='${(maxD * 0.6).toFixed(2)} m' />`);
  const water = between(8, 29);
  parts.push(`  <temperature air='${(water + 3).toFixed(1)} C' water='${water.toFixed(1)} C' />`);
  const step = Number(stepArg);
  const ns = Math.floor(dur / step);
  for (let i = 1; i <= ns; i++) {
    const f = i / ns;
    let depth;
    if (f < 0.1) depth = maxD * (f / 0.1);
    else if (f < 0.75) depth = maxD * (0.75 + 0.25 * Math.sin(i * 0.37 + n) * Math.cos(i * 0.11));
    else if (f < 0.9) depth = maxD * 0.75 * (1 - (f - 0.75) / 0.15) + 5 * ((f - 0.75) / 0.15);
    else depth = 5 * (1 - (f - 0.9) / 0.1);
    depth = Math.max(0, depth);
    const pr = cyls[0].start - (cyls[0].start - cyls[0].end) * f;
    parts.push(`  <sample time='${mmss(i * step)}' depth='${depth.toFixed(2)} m'${i % 6 === 0 ? ` temp='${(water + Math.sin(i)).toFixed(1)} C'` : ''} pressure='${pr.toFixed(2)} bar' />`);
    total++;
  }
  parts.push('  </divecomputer>\n</dive>');
}
closeTrip();
parts.push('</dives>\n</divelog>');
mkdirSync(dirname(out), { recursive: true });
const text = parts.join('\n');
writeFileSync(out, text);
console.log(`${out}: ${N} dives, ${total} samples, ${(text.length / 1e6).toFixed(1)} MB`);
