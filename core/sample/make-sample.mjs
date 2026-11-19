// Builds core/sample/SampleLogbook.ssrf, the sample logbook the app ships (task 2026-11-19-301): 40 synthetic dives
// over 2023-2026 at 8 sites, one trip of 6 dives, one rebreather dive. Nothing here comes from a real person's log.
// The build scripts copy the result under the name the plugins read (SampleDivesV2.ssrf).
// Run: node core/sample/make-sample.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FT = 0.3048;

/** id, name, GPS, salt water */
const SITES = {
  mem: ['a1b20001', 'Lac Memphrémagog', '45.1500 -72.2000', false],
  l23: ['a1b20002', 'Lock 23', '45.4000 -75.6800', false],
  esc: ['a1b20003', 'Les Escoumins', '48.3500 -69.4000', true],
  cap: ['a1b20004', 'Cap-de-Bon-Désir', '48.2500 -69.5700', true],
  gat: ['a1b20005', 'Parc de la Gatineau', '45.5000 -75.8000', false],
  pea: ['a1b20006', 'Lake Pearson', '-43.0700 171.6500', false],
  col: ['a1b20007', 'Lake Coleridge', '-43.3500 171.5500', false],
  tek: ['a1b20008', 'Lake Tekapo', '-44.0000 170.4800', false],
};

// number, date, time, site (null: none), depth ft, minutes
const T = `
1 2023-05-14 09:30 mem 54 48
2 2023-05-28 10:10 mem 62 52
3 2023-06-11 09:45 l23 48 44
4 2023-06-25 13:20 l23 66 57
5 2023-07-09 10:00 esc 82 58
6 2023-07-23 09:25 esc 95 61
7 2023-08-13 11:05 cap 71 55
8 2023-09-03 09:50 esc 104 63
9 2023-09-17 10:35 gat 58 49
10 2023-10-08 12:15 mem 45 42
11 2024-05-12 09:40 l23 52 46
12 2024-05-26 10:20 l23 70 59
13 2024-06-09 09:15 mem 64 51
14 2024-06-22 14:00 gat 61 54
15 2024-07-06 09:35 esc 88 60
16 2024-07-13 10:50 esc 112 64
17 2024-07-20 09:20 cap 76 57
18 2024-08-10 10:05 esc 99 62
19 2024-08-24 11:30 cap 83 58
20 2024-09-07 09:55 l23 67 55
21 2024-09-21 10:40 esc 106 63
22 2024-10-12 12:00 mem 47 43
23 2025-03-30 09:40 pea 58 55
24 2025-03-31 10:15 col 96 70
25 2025-04-01 09:50 tek 74 62
26 2025-04-02 10:00 col 128 78
27 2025-04-03 09:30 pea 62 58
28 2025-04-04 10:20 col 110 74
29 2025-05-17 09:45 l23 58 50
30 2025-05-31 10:15 mem 55 47
31 2025-06-14 09:30 esc 92 60
32 2025-07-05 10:00 esc 109 65
33 2025-07-19 09:20 cap 79 56
34 2025-08-09 11:10 esc 101 62
35 2025-08-23 09:50 cap 86 59
36 2025-09-27 11:55 esc 113 66
37 2026-01-12 10:30 mem 33 38
38 2026-01-24 09:40 l23 41 41
39 2026-01-31 10:05 l23 56 50
40 2026-02-07 09:09 - 91 55
`.trim().split('\n').map((l) => {
  const [n, date, time, site, ft, min] = l.split(' ');
  return { n: +n, date, time, site: site === '-' ? null : site, ft: +ft, min: +min };
});

/** A small deterministic generator, so that the file is the same at every run. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;

/** The depth (m) every 20 s: a descent, a bottom that slowly gets shallower, the ascent and a stop at 5 m. */
function profile(maxM, minutes, rand) {
  const total = minutes * 60;
  const stop = maxM > 12 ? 180 : 0;
  const upFrom5 = 5 / 0.15;
  const ascToStop = Math.max(0, (maxM - 5) / 0.17);
  const tDesc = Math.round(maxM / 0.3);
  const tBottomEnd = total - upFrom5 - stop - ascToStop;
  const out = [];
  for (let t = 0; t <= total; t += 20) {
    let d;
    if (t <= tDesc) d = (t / tDesc) * maxM;
    else if (t <= tBottomEnd) {
      const f = (t - tDesc) / Math.max(1, tBottomEnd - tDesc);
      const base = f < 0.1 ? maxM : maxM * (1 - 0.45 * ((f - 0.1) / 0.9));
      d = Math.min(maxM, base + (rand() - 0.5) * 0.9);
    } else if (t <= tBottomEnd + ascToStop) {
      const f = (t - tBottomEnd) / ascToStop;
      const from = maxM * 0.55;
      d = from + (5 - from) * f;
    } else if (t <= tBottomEnd + ascToStop + stop) d = 5 + (rand() - 0.5) * 0.3;
    else d = Math.max(0, 5 - (t - tBottomEnd - ascToStop - stop) * 0.15);
    out.push([t, Math.max(0, d)]);
  }
  out[out.length - 1][1] = 0;
  // The deepest point is exactly the figure of the list.
  let k = 0;
  out.forEach((p, i) => { if (p[1] > out[k][1]) k = i; });
  out[k][1] = maxM;
  return out;
}

let xml = `<divelog program='subsurface' version='2'>\n<settings>\n  <autogroup state='1' />\n</settings>\n<divesites>\n`;
for (const [id, name, gps] of Object.values(SITES)) xml += `<site uuid='${id}' name='${name}' gps='${gps}'>\n</site>\n`;
xml += `</divesites>\n<dives>\n`;

const dive = (r) => {
  const rand = rng(r.n * 7919);
  const maxM = +(r.ft * FT).toFixed(2);
  const prof = profile(maxM, r.min, rand);
  const site = r.site ? SITES[r.site] : null;
  const salt = site ? site[3] : false;
  const ccr = r.n === 26;
  const month = +r.date.slice(5, 7);
  const water = site ? (salt ? 4 + (month - 3) * 0.6 : month < 5 || month > 10 ? 4 : 10 + rand() * 6) : 3;
  const mean = +(maxM * 0.62).toFixed(2);
  let s = `<dive number='${r.n}'${site ? ` divesiteid='${site[0]}'` : ''} date='${r.date}' time='${r.time}:00' duration='${mmss(r.min * 60)}'>\n`;
  s += `  <buddy>Alex</buddy>\n`;
  if (ccr) {
    s += `  <cylinder size='3.0 l' workpressure='200.0 bar' description='Diluent' o2='21.0%' he='35.0%' use='diluent' />\n`;
    s += `  <cylinder size='3.0 l' workpressure='200.0 bar' description='Oxygen' o2='100.0%' use='oxygen' />\n`;
  } else {
    const end = 60 + Math.round(rand() * 40);
    s += `  <cylinder size='11.094 l' workpressure='206.843 bar' description='AL80' start='200.0 bar' end='${end}.0 bar' />\n`;
  }
  s += `  <divecomputer model='Sample'${ccr ? " dctype='CCR'" : ''}>\n`;
  s += `  <depth max='${maxM} m' mean='${mean} m' />\n`;
  s += `  <temperature water='${water.toFixed(1)} C' />\n`;
  s += `  <water salinity='${salt ? 1025 : 1000} g/l' />\n`;
  prof.forEach(([t, d], i) => {
    const po2 = ccr ? ` dc_supplied_ppo2='${(d > 6 ? 1.3 : 0.9).toFixed(2)} bar'` : '';
    s += `  <sample time='${mmss(t)}' depth='${d.toFixed(2)} m'${i === 0 ? ` temp='${(water + 1).toFixed(1)} C'` : ''}${po2} />\n`;
  });
  s += `  </divecomputer>\n</dive>\n`;
  return s;
};

for (const r of T) {
  if (r.n === 23) xml += `<trip date='2025-03-30' time='09:40:00'>\n`;
  xml += dive(r);
  if (r.n === 28) xml += `</trip>\n`;
}
xml += `</dives>\n</divelog>\n`;
writeFileSync(fileURLToPath(new URL('./SampleLogbook.ssrf', import.meta.url)), xml);
console.log(`${T.length} dives`);
