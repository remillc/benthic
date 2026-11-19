// A logbook of a thousand dives with profiles is about 100 MB. It ran the Android Java heap (256 MB) out of memory,
// twice, because the whole file crossed the plugin's bridge as one string (base64 of a shared file, the text of an
// export). These tests drive the web layer's large-file paths over a fake of the plugin that refuses any call
// carrying more than a few MB, with a synthetic logbook of 40 MB (the generator's output, repeated; the 130 MB run
// is tools/perf/large-logbook-check.mjs). The JVM heap itself is not testable here: what is shown is that no call
// carries more than one piece, so the heap use of the plugin does not grow with the size of the file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { checkSharedFile } from '../../app/src/lib/deep-link.js';
import { openSharedFile, completeStagedSites } from '../../app/src/lib/shared-file.js';
import { SCAN_CHUNK, STAGE_CHUNK, scanBlob, scanLogbook, stageFile } from '../../app/src/lib/staged-file.js';
import { summariseScan } from '../../app/src/lib/import-summary.js';
import { BRIDGE_LIMIT, fakeStagedCore } from './fake-staged-core.mjs';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** One dive with a long profile, the way Subsurface writes it. */
function dive(n, site) {
  const samples = Array.from({ length: 400 }, (_, i) => `  <sample time='${Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')} min' depth='${(i % 30) / 2} m' />`).join('\n');
  return `<dive number='${n}' date='${2008 + (n % 18)}-0${1 + (n % 9)}-1${n % 9}' time='10:00:00' duration='40:00 min'${site ? ` divesiteid='${site}'` : ''}>\n  <divecomputer model='synthetic'>\n${samples}\n  </divecomputer>\n</dive>\n`;
}

/** A logbook of at least `bytes`, its sites listed, and a dive naming a site the file does not hold. */
function logbook(bytes, { missing = '' } = {}) {
  const head = `<divelog program='subsurface' version='3'>\n<settings>\n</settings>\n<divesites>\n<site uuid='7f3a2b01' name='Reef' gps='1.000000 2.000000'>\n</site>\n</divesites>\n<dives>\n`;
  const parts = [head];
  let size = head.length;
  for (let n = 1; size < bytes; n++) {
    const d = dive(n, n === 3 ? '7f3a2b01' : '');
    parts.push(d);
    size += d.length;
  }
  if (missing) parts.push(dive(99999, missing));
  parts.push('</dives>\n</divelog>\n');
  return Buffer.from(parts.join(''));
}

const MB = 1024 * 1024;

test('a file picked is sent in pieces: no call carries more than one piece, and the file arrives whole', async () => {
  const bytes = logbook(40 * MB);
  const staging = fakeStagedCore();
  const staged = await stageFile(staging.core, new File([bytes], 'Carnet.ssrf'));
  assert.equal(staged.size, bytes.length);
  assert.ok(staging.files.get(staged.path).equals(bytes));
  assert.ok(staging.stats.calls >= Math.floor(bytes.length / STAGE_CHUNK));
  assert.ok(staging.stats.largestPiece < Math.ceil((STAGE_CHUNK * 4) / 3) + 8, `largest piece ${staging.stats.largestPiece}`);
  assert.ok(staging.stats.largestPiece < BRIDGE_LIMIT * 2);
  // A failure half way leaves no partial file.
  const failing = fakeStagedCore();
  let calls = 0;
  const original = failing.core.stageImport;
  failing.core.stageImport = async (o) => {
    if (++calls === 3) throw new Error('disk full');
    return original(o);
  };
  await assert.rejects(stageFile(failing.core, new File([bytes], 'x.ssrf')), /disk full/);
  assert.equal(failing.files.size, 0);
});

test('the scan reads a window at a time and finds what straddles a border', async () => {
  const filler = Buffer.alloc(SCAN_CHUNK - 40, 32);
  // A dive's site attribute that starts 12 bytes before the border of the first window and ends in the second.
  const text = `<divelog><divesites>\n</divesites>\n<dives>\n<dive number='1' date='2019-04-01'`;
  const pad = SCAN_CHUNK - 12 - text.length - 0;
  const body = Buffer.concat([Buffer.from(text), Buffer.alloc(pad, 32), Buffer.from(` divesiteid='abcd1234'>\n</dive>\n<dive number='2' date='2021-01-01'></dive>\n</dives>\n</divelog>\n`), filler]);
  assert.ok(body.indexOf('divesiteid') < SCAN_CHUNK && body.indexOf('divesiteid') + 20 > SCAN_CHUNK, 'the attribute straddles the border');
  const staging = fakeStagedCore();
  const staged = staging.put('b.ssrf', body);
  const scan = await scanLogbook(staging.core, staged.path, staged.size);
  assert.deepEqual([...scan.referenced], [0xabcd1234]);
  assert.equal(scan.firstYear, 2019);
  assert.equal(scan.lastYear, 2021);
  assert.equal(scan.hasDivelog && scan.hasDives && scan.hasDive && scan.hasDivesites, true);
  assert.equal(body.toString('latin1').slice(scan.divesitesEnd, scan.divesitesEnd + 12), '</divesites>');
  assert.equal(body.toString('latin1').slice(scan.divesStart, scan.divesStart + 6), '<dives');
  // The same pass over a picked file (no plugin call).
  const blobScan = await scanBlob(new Blob([body]));
  assert.deepEqual([...blobScan.referenced], [0xabcd1234]);
  assert.equal(blobScan.lastYear, 2021);
});

test('a shared logbook of 40 MB: only its path moves; the sites it lacks are added by assembling, never by reading it whole', async () => {
  const bytes = logbook(40 * MB, { missing: 'deadbeef' });
  const staging = fakeStagedCore();
  const log = { choices: [], imported: [], notes: [] };
  const deps = {
    stage: async () => staging.put('Subsurface.ssrf', bytes),
    core: staging.core,
    check: checkSharedFile,
    welcome: () => false,
    remembered: () => ({}),
    keep: () => {},
    listSites: async () => [],
    siteChange: async () => ({}),
    importData: async (name, data) => {
      assert.deepEqual(Object.keys(data), ['path'], 'the core is given a path, not contents');
      log.imported.push({ name, size: staging.files.get(data.path).length, text: staging.text(data.path) });
      return 1386;
    },
    toFirstLaunch: () => {},
    confirm: () => {},
    refuse: (key) => log.notes.push(key),
    notify: () => {},
    imported: (n) => log.notes.push(`imported ${n}`),
    importFailed: (e) => log.notes.push(`failed ${e}`),
    choose: (o, actions) => log.choices.push({ o, actions }),
    canCreateLogbook: () => false,
    replaceEligibility: () => 'ok',
    replaceLogbook: async () => {},
  };
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'confirm-dives');
  assert.deepEqual(log.notes, []);
  // One file in the cache: the completed copy replaced the first one.
  assert.equal(staging.files.size, 1);
  assert.ok(staging.stats.largestPiece <= Math.ceil((SCAN_CHUNK + 4096) * 4 / 3) + 8, `largest piece ${staging.stats.largestPiece}`);
  await log.choices[0].actions.merge();
  const [imported] = log.imported;
  assert.equal(imported.name, 'Subsurface.ssrf');
  // The missing site is now defined (a placeholder, inside <divesites>), the rest is byte for byte the file.
  assert.match(imported.text, /<divesites>[^]*<site uuid='deadbeef' name='Site deadbeef'>\n<\/site>\n<\/divesites>/);
  assert.equal(imported.size, bytes.length + Buffer.byteLength("<site uuid='deadbeef' name='Site deadbeef'>\n</site>\n"));
  assert.equal(imported.text.replace("<site uuid='deadbeef' name='Site deadbeef'>\n</site>\n", ''), bytes.toString('utf8'));
  // The file is deleted once imported (the plugin deletes it with the import; the screen's discard is a no-op after).
  assert.equal(staging.files.size, 0);
});

test('a shared logbook at first launch is handed over as a staged file with its summary, nothing is imported', async () => {
  const bytes = logbook(6 * MB);
  const staging = fakeStagedCore();
  const first = [];
  const deps = {
    stage: async () => staging.put('Carnet.ssrf', bytes),
    core: staging.core,
    check: checkSharedFile,
    welcome: () => true,
    remembered: () => ({}),
    keep: () => {},
    listSites: async () => [],
    siteChange: async () => ({}),
    importData: async () => assert.fail('nothing is imported before the diver confirms'),
    toFirstLaunch: (name, staged, summary) => first.push({ name, staged, summary }),
    confirm: () => {},
    refuse: (key) => assert.fail(key),
    notify: () => {},
    imported: () => {},
    importFailed: () => {},
  };
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'first-launch');
  assert.equal(first.length, 1);
  assert.equal(staging.files.has(first[0].staged.path), true, 'the file stays for the import step');
  assert.deepEqual(summariseScan(1386, { hasDivelog: true, hasDives: true, ...first[0].summary }), { dives: 1386, sites: 1, firstYear: first[0].summary.firstYear, lastYear: first[0].summary.lastYear });
  assert.ok(first[0].summary.firstYear >= 2008);
});

test('a refused or cancelled shared file leaves nothing in the cache', async () => {
  const staging = fakeStagedCore();
  const deps = {
    stage: async () => staging.put('photo.jpg', Buffer.from('JFIF....')),
    core: staging.core,
    check: checkSharedFile,
    welcome: () => false,
    refuse: () => {},
  };
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'refused');
  assert.equal(staging.files.size, 0);
  // « Annuler » of the choice: the discard action removes the staged file.
  const choices = [];
  const ok = {
    ...deps,
    stage: async () => staging.put('x.ssrf', logbook(1 * MB)),
    remembered: () => ({}),
    choose: (o, actions) => choices.push(actions),
    confirm: () => {},
  };
  assert.equal(await openSharedFile(ok, 'content://x/2'), 'confirm-dives');
  assert.equal(staging.files.size, 1);
  await choices[0].discard();
  assert.equal(staging.files.size, 0);
});

test('the sites of an old-format file (a <dives> root) are cleaned in memory only up to 48 MB; above, the file is refused', async () => {
  const old = Buffer.from(`<dives>\n<dive number='1' date='2020-01-01' divesiteid='abcd1234'>\n</dive>\n</dives>\n`);
  const staging = fakeStagedCore();
  const staged = staging.put('old.ssrf', old);
  const scan = await scanLogbook(staging.core, staged.path, staged.size);
  const fixed = await completeStagedSites(staging.core, staged, scan, {});
  assert.equal(fixed.tooBig, false);
  assert.doesNotMatch(staging.text(fixed.staged.path), /divesiteid/);
  const huge = await completeStagedSites(staging.core, { ...staged, size: 49 * MB }, scan, {});
  assert.equal(huge.tooBig, true);
});

test('the paths are wired: Kotlin and Swift stream a shared file, nothing returns a logbook as one string', () => {
  const kotlin = read('plugins/opendives-core/android/src/main/java/org/opendives/core/OpenDivesCorePlugin.kt');
  const swift = read('plugins/opendives-core/ios/Plugin/OpenDivesCorePlugin.swift');
  for (const method of ['stageSharedFile', 'readFileChunk', 'assembleFile']) {
    assert.match(kotlin, new RegExp(`fun ${method}\\(call: PluginCall\\)`), `Android ${method}`);
    assert.match(swift, new RegExp(`func ${method}\\(_ call: CAPPluginCall\\)`), `iOS ${method}`);
    assert.match(swift, new RegExp(`name: "${method}"`), `iOS registers ${method}`);
  }
  // The shared file is copied in 64 KB pieces and never base64-encoded whole.
  const staged = kotlin.slice(kotlin.indexOf('fun stageSharedFile'), kotlin.indexOf('fun readSharedFile'));
  assert.match(staged, /ByteArray\(64 \* 1024\)/);
  assert.doesNotMatch(staged, /Base64\.encodeToString|ByteArrayOutputStream|readBytes|readText/);
  // The old call is capped: it can never again allocate a whole logbook.
  assert.match(kotlin, /fun readSharedFile[^]*?MAX_INLINE_FILE/);
  // exportDives refuses a text above the cap and offers `stage`.
  assert.match(kotlin, /MAX_INLINE_FILE[^]*?TOO_BIG/);
  assert.match(kotlin, /call\.getBoolean\("stage", false\)/);
  // The web layer no longer asks for a logbook as text or base64.
  for (const file of ['app/src/lib/alpha-logbook.js', 'app/src/lib/full-export.js', 'app/src/lib/logbook.svelte.js', 'app/src/lib/open-link.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /exportDives\(\{[^}]*ids: (dives|ids)[^}]*text: true/, `${file} exports a logbook as text`);
    assert.doesNotMatch(source, /readSharedFile/, `${file} reads a shared file whole`);
  }
});
