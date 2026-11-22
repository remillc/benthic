// A file another app shares (« Open with », « Share to »): what it is, how Subsurface-mobile's two files (the dives
// .ssrf and the dive sites .xml) meet in either order, and where each goes (app/src/lib/shared-file.js).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { checkSharedFile } from '../../app/src/lib/deep-link.js';
import { fakeStagedCore } from './fake-staged-core.mjs';
import {
  applySitesMerge,
  bytesToBase64,
  completeSiteReferences,
  isSitesOnly,
  missingSites,
  openSharedFile,
  placeholderName,
  planSitesMerge,
  readSites,
  remember,
  siteXml,
} from '../../app/src/lib/shared-file.js';

// What Subsurface writes (core/save-xml.cpp): the whole log, sites first, a dive naming its site by uuid (%8x, so
// a short uuid is padded with spaces).
const DIVES = `<divelog program='subsurface' version='3'>
<settings>
</settings>
<divesites>
<site uuid='7f3a2b01' name='Blue Hole &amp; Reef' gps='43.123456 6.654321' description='North side'>
  <notes>Strong current </notes>
  <geo cat='2' origin='2' value='Egypt'/>
  <geo cat='5' origin='2' value='Dahab'/>
</site>
<site uuid=' 1c2d3e' name='Wreck' gps='-12.500000 130.250000'>
</site>
</divesites>
<dives>
<dive number='1' date='2020-05-01' time='10:00:00' duration='40:00 min' divesiteid='7f3a2b01'>
  <divecomputer model='manually added dive'>
  </divecomputer>
</dive>
<dive number='2' date='2020-05-02' time='10:00:00' duration='35:00 min' divesiteid=' 1c2d3e'>
  <divecomputer model='manually added dive'>
  </divecomputer>
</dive>
</dives>
</divelog>
`;

// The same log's dive sites export (export_dive_sites_xslt, divesites-export.xslt): root <divesites>.
const SITES = `<divesites program='subsurface' version='3'>
<site uuid='7f3a2b01' name='Blue Hole &amp; Reef' gps='43.123456 6.654321' description='North side'>
  <notes>Strong current </notes>
  <geo cat='2' origin='2' value='Egypt'/>
  <geo cat='5' origin='2' value='Dahab'/>
</site>
<site uuid=' 1c2d3e' name='Wreck' gps='-12.500000 130.250000'>
</site>
<site uuid='0abc0def' name='Lake' />
</divesites>
`;

// A dives file that names sites it does not hold (the sites travel in the other file).
const DIVES_WITHOUT_SITES = DIVES.replace(/<divesites>[\s\S]*<\/divesites>\n/, '<divesites>\n</divesites>\n');

const b64 = (text) => bytesToBase64(new TextEncoder().encode(text));

test('a sites export is recognised by its contents, other formats by their extension', () => {
  assert.deepEqual(checkSharedFile('Subsurface_divesites.xml', SITES.slice(0, 300), 500), { ok: true, name: 'Subsurface_divesites.xml' });
  assert.deepEqual(checkSharedFile('document:12', SITES.slice(0, 300), 500), { ok: true, name: 'document:12.ssrf' });
  assert.deepEqual(checkSharedFile('trip.UDDF', '<uddf>', 10), { ok: true, name: 'trip.UDDF' });
  assert.deepEqual(checkSharedFile('Descent.fit', '\u000e\u0010', 10), { ok: true, name: 'Descent.fit' });
  assert.deepEqual(checkSharedFile('TestDiveDM3.SDE', 'xx', 10), { ok: true, name: 'TestDiveDM3.SDE' });
  assert.deepEqual(checkSharedFile('log.csv', 'a,b', 10), { ok: false, reason: 'CSV' });
  assert.deepEqual(checkSharedFile('holiday.jpg', 'xx', 10), { ok: false, reason: 'NOT_A_LOGBOOK' });
  assert.deepEqual(checkSharedFile('x.ssrf', '<html>', 10), { ok: false, reason: 'NOT_A_LOGBOOK' });
});

test('the sites file is read: uuid, name, position, notes, place', () => {
  const sites = readSites(SITES);
  assert.equal(sites.length, 3);
  assert.deepEqual(sites[0], {
    uuid: 0x7f3a2b01,
    name: 'Blue Hole & Reef',
    hasLocation: true,
    latUdeg: 43123456,
    lonUdeg: 6654321,
    description: 'North side',
    notes: 'Strong current',
    country: 'Egypt',
    region: '',
    city: 'Dahab',
  });
  assert.equal(sites[1].uuid, 0x1c2d3e);
  assert.equal(sites[1].latUdeg, -12500000);
  assert.equal(sites[2].hasLocation, false);
  assert.equal(isSitesOnly(SITES), true);
  assert.equal(isSitesOnly(DIVES), false);
  // The writer and the reader agree.
  assert.deepEqual(readSites(siteXml(sites[0])), [sites[0]]);
});

test('one self-contained .ssrf keeps its sites: nothing is added to it', () => {
  assert.deepEqual(missingSites(DIVES), []);
  const out = completeSiteReferences(DIVES, {});
  assert.equal(out.text, DIVES);
  const sample = fs.readFileSync(new URL('../../third_party/subsurface/dives/SampleDivesV2.ssrf', import.meta.url), 'utf8');
  assert.equal(completeSiteReferences(sample, {}).text, sample);
  assert.equal(isSitesOnly(sample), false);
});

test('dives first, sites after: the link survives through a placeholder that the sites file completes', () => {
  assert.deepEqual(missingSites(DIVES_WITHOUT_SITES).sort(), [0x1c2d3e, 0x7f3a2b01].sort());
  const fixed = completeSiteReferences(DIVES_WITHOUT_SITES, {});
  assert.equal(fixed.placeholders, 2);
  assert.deepEqual(missingSites(fixed.text), []);
  const placeholders = readSites(fixed.text);
  assert.deepEqual(placeholders.map((s) => s.name).sort(), [placeholderName(0x1c2d3e), placeholderName(0x7f3a2b01)].sort());
  // The core read them: they are now the logbook's sites, still without data.
  const existing = placeholders.map((s) => ({ uuid: s.uuid, name: s.name, hasLocation: false, latUdeg: 0, lonUdeg: 0 }));
  const plan = planSitesMerge(readSites(SITES), existing);
  assert.deepEqual(plan.complete.map((s) => s.uuid).sort(), [0x1c2d3e, 0x7f3a2b01].sort());
  assert.deepEqual(plan.add.map((s) => s.name), ['Lake']);
  assert.equal(plan.present, 0);
});

test('sites first, dives after: the dives find the sites the sites file gave, without a copy', () => {
  const sites = readSites(SITES);
  const memory = remember({}, sites);
  const fixed = completeSiteReferences(DIVES_WITHOUT_SITES, memory);
  assert.equal(fixed.linked, 2);
  assert.equal(fixed.placeholders, 0);
  // The injected entries are the same sites: the core's import takes them for the ones in the logbook.
  const injected = readSites(fixed.text);
  assert.deepEqual(injected.find((s) => s.uuid === 0x7f3a2b01), sites[0]);
  const existing = sites.map((s) => ({ uuid: s.uuid + 1, name: s.name, hasLocation: s.hasLocation, latUdeg: s.latUdeg, lonUdeg: s.lonUdeg }));
  assert.equal(planSitesMerge(sites, existing).add.length, 0);
});

test('a site already in the logbook is never overwritten or duplicated', () => {
  const sites = readSites(SITES);
  const existing = [
    { uuid: 0x7f3a2b01, name: 'My own name', hasLocation: true, latUdeg: 1, lonUdeg: 2 },
    { uuid: 99, name: 'Wreck', hasLocation: true, latUdeg: -12500000, lonUdeg: 130250000 },
  ];
  const plan = planSitesMerge(sites, existing);
  assert.equal(plan.complete.length, 0);
  assert.deepEqual(plan.add.map((s) => s.name), ['Lake']);
  assert.equal(plan.present, 2);
  // The same file twice adds nothing the second time.
  assert.deepEqual(planSitesMerge([sites[2], sites[2]], []).add.length, 1);
});

test('the merge is a list of site changes, a created site then its details', async () => {
  const calls = [];
  const siteChange = async (o) => {
    calls.push(o);
    return o.action === 'create' ? { uuid: 500 } : {};
  };
  const [blue, , lake] = readSites(SITES);
  const done = await applySitesMerge({ complete: [{ ...blue, uuid: 7 }], add: [lake] }, siteChange);
  assert.deepEqual(done, { added: 1, completed: 1 });
  assert.deepEqual(calls[0], { action: 'edit', uuid: 7, field: 'name', value: 'Blue Hole & Reef' });
  assert.deepEqual(calls[1], { action: 'edit', uuid: 7, field: 'location', value: '', lat: 43123456, lon: 6654321 });
  assert.ok(calls.some((c) => c.field === 'city' && c.value === 'Dahab'));
  assert.deepEqual(calls.at(-1), { action: 'create', value: 'Lake' });
});

/** Fake screen and core. */
function fake({ welcome = false, name = 'Subsurface.ssrf', text = DIVES, raw, existing = [] } = {}) {
  const log = { confirms: [], refused: [], notes: [], first: [], imported: [], changes: [], kept: {} };
  const bytes = raw ?? new TextEncoder().encode(text);
  // The plugin streams the shared file into its cache: the web layer only gets the path (never the contents).
  const staging = fakeStagedCore();
  log.staging = staging;
  const deps = {
    stage: async () => staging.put(name, bytes),
    core: staging.core,
    check: checkSharedFile,
    welcome: () => welcome,
    remembered: () => log.kept,
    keep: (s) => (log.kept = s),
    listSites: async () => existing,
    siteChange: async (o) => (log.changes.push(o), o.action === 'create' ? { uuid: 900 + log.changes.length } : {}),
    importData: async (n, data) => (log.imported.push({ n, text: staging.text(data.path) }), 2),
    toFirstLaunch: (n, staged, summary) => log.first.push({ n, text: staging.text(staged.path), summary }),
    confirm: (o, run) => log.confirms.push({ o, run }),
    refuse: (key, values) => log.refused.push({ key, values }),
    notify: (key, values) => log.notes.push({ key, values }),
    imported: (n) => log.notes.push({ key: 'imported', values: { n } }),
    importFailed: (e) => log.notes.push({ key: 'failed', values: { e } }),
  };
  return { deps, log };
}

test('first launch: the file goes to « Importer un carnet », nothing is imported', async () => {
  const { deps, log } = fake({ welcome: true });
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'first-launch');
  assert.equal(log.first.length, 1);
  assert.equal(log.first[0].n, 'Subsurface.ssrf');
  assert.equal(log.first[0].text, DIVES);
  assert.equal(log.confirms.length, 0);
  assert.equal(log.imported.length, 0);
});

test('a logbook is open: a confirmation first, then the import; Cancel imports nothing', async () => {
  const { deps, log } = fake();
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'confirm-dives');
  assert.equal(log.imported.length, 0, 'never silently');
  assert.equal(log.confirms[0].o.textKey, 'link.fileText');
  await log.confirms[0].run();
  assert.equal(log.imported.length, 1);
  assert.deepEqual(log.notes.at(-1), { key: 'imported', values: { n: 2 } });
  // No « share the sites too » message: the .ssrf holds them.
  assert.equal(log.notes.some((n) => /sites/i.test(n.key)), false);
});

test('a dives file that lacks its sites is completed before the core reads it', async () => {
  const { deps, log } = fake({ text: DIVES_WITHOUT_SITES, name: 'Dives.ssrf' });
  await openSharedFile(deps, 'content://x/1');
  await log.confirms[0].run();
  assert.deepEqual(missingSites(log.imported[0].text), []);
});

test('the sites file: refused at first launch, merged after a confirmation in a logbook', async () => {
  const first = fake({ welcome: true, name: 'Subsurface_divesites.xml', text: SITES });
  assert.equal(await openSharedFile(first.deps, 'content://x/2'), 'refused');
  assert.equal(first.log.refused[0].key, 'link.sitesFirstLaunch');

  const open = fake({ name: 'Subsurface_divesites.xml', text: SITES, existing: [{ uuid: 0x7f3a2b01, name: 'Mine', hasLocation: true, latUdeg: 1, lonUdeg: 1 }] });
  assert.equal(await openSharedFile(open.deps, 'content://x/2'), 'confirm-sites');
  assert.equal(open.log.changes.length, 0, 'never silently');
  await open.log.confirms[0].run();
  // Two sites are new, the one the logbook has is left alone.
  assert.equal(open.log.changes.filter((c) => c.action === 'create').length, 2);
  assert.deepEqual(open.log.notes.at(-1), { key: 'link.sitesDone', values: { added: 2, completed: 0, present: 1 } });
  assert.equal(Object.keys(open.log.kept).length, 3, 'remembered for the dives file shared next');
});

test('an unsupported file gets a clear message and nothing else happens', async () => {
  for (const [name, text, key] of [
    ['photo.jpg', 'JFIF', 'link.fileNotLogbook'],
    ['dives.csv', 'a,b', 'link.fileCsv'],
    ['empty.ssrf', '', 'link.fileEmpty'],
  ]) {
    const { deps, log } = fake({ name, text });
    assert.equal(await openSharedFile(deps, 'content://x/3'), 'refused', name);
    assert.equal(log.refused[0].key, key, name);
    assert.equal(log.confirms.length + log.first.length + log.imported.length, 0, name);
  }
  const broken = fake();
  broken.deps.stage = async () => {
    throw Object.assign(new Error('x'), { code: 'TOO_BIG' });
  };
  await openSharedFile(broken.deps, 'content://x/4');
  assert.equal(broken.log.refused[0].key, 'link.fileTooBig');
});

test('a file that arrives before the logbook is ready waits for it', async () => {
  const { deps, log } = fake();
  let release = () => {};
  deps.ready = () => new Promise((done) => (release = done));
  const pending = openSharedFile(deps, 'content://x/1');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(log.confirms.length, 0, 'nothing before the logbook is read');
  release();
  assert.equal(await pending, 'confirm-dives');
  assert.equal(log.confirms.length, 1);
});

test('the wiring: manifest filters, plugin event, first launch and the two languages', () => {
  const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  const manifest = read('app/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.intent\.action\.SEND"/);
  assert.match(manifest, /android\.intent\.action\.SEND_MULTIPLE/);
  for (const mime of ['application/octet-stream', 'application/xml', 'text/xml', 'text/plain', 'application/x-subsurface']) assert.ok(manifest.includes(`mimeType="${mime}"`), mime);
  for (const ext of ['ssrf', 'xml', 'uddf', 'fit', 'dld', 'sde', 'jlb']) assert.ok(manifest.includes(`\\\\.${ext}"`), ext);
  assert.match(read('plugins/benthic-core/android/src/main/java/app/benthicdivelog/core/BenthicCorePlugin.kt'), /notifyListeners\("sharedFile"/);
  assert.match(read('app/src/lib/open-link.js'), /addListener\('sharedFile'/);
  assert.match(read('app/src/components/FirstLaunchSteps.svelte'), /sharedFile\.staged/);
  assert.match(read('app/src/lib/open-link.js'), /stageSharedFile/);
  assert.match(read('app/ios/App/App/Info.plist'), /app\.benthicdivelog\.divefile/);
  const fr = JSON.parse(read('app/src/i18n/fr.json'));
  const en = JSON.parse(read('app/src/i18n/en.json'));
  for (const key of ['fileCsv', 'sitesText', 'sitesAction', 'sitesDone', 'sitesNothing', 'sitesFirstLaunch', 'sitesFailed']) {
    assert.ok(fr.link[key] && en.link[key], key);
  }
});

/** The screen's choice for a dives file: records the actions it is given. */
function withChoice(options = {}) {
  const f = fake(options);
  f.log.choices = [];
  f.log.created = [];
  f.deps.choose = (o, actions) => f.log.choices.push({ o, actions });
  f.deps.logbookName = () => 'Mon carnet';
  return f;
}

test('a logbook is open and this device can hold another: the choice offers « Nouveau carnet » and « Ajouter à ce carnet »', async () => {
  const { deps, log } = withChoice();
  deps.newLogbook = async (n, data) => log.created.push({ n, text: log.staging.text(data.path) });
  assert.equal(await openSharedFile(deps, 'content://x/1'), 'confirm-dives');
  assert.equal(log.confirms.length, 0, 'the single confirmation is replaced by the choice');
  assert.equal(log.choices[0].o.canCreate, true);
  assert.ok(log.choices[0].actions.create && log.choices[0].actions.merge);
  assert.equal(log.imported.length + log.created.length, 0, 'never silently');
});

test('« Nouveau carnet » creates a logbook from the file and never imports into the open one', async () => {
  const { deps, log } = withChoice();
  deps.newLogbook = async (n, data) => log.created.push({ n, text: log.staging.text(data.path) });
  await openSharedFile(deps, 'content://x/1');
  await log.choices[0].actions.create();
  assert.equal(log.created.length, 1);
  assert.equal(log.created[0].n, 'Subsurface.ssrf');
  assert.equal(log.created[0].text, DIVES);
  assert.equal(log.imported.length, 0, 'the open logbook is untouched');
  assert.equal(log.changes.length, 0);
});

test('« Ajouter à ce carnet » is today\'s merge, with its Undo', async () => {
  const { deps, log } = withChoice();
  deps.newLogbook = async () => {};
  await openSharedFile(deps, 'content://x/1');
  await log.choices[0].actions.merge();
  assert.equal(log.imported.length, 1);
  assert.deepEqual(log.notes.at(-1), { key: 'imported', values: { n: 2 } });
});

test('a device that holds one logbook at a time does not offer « Nouveau carnet » and replaces nothing', async () => {
  const { deps, log } = withChoice();
  deps.newLogbook = async (n) => log.created.push(n);
  deps.canCreateLogbook = () => false;
  await openSharedFile(deps, 'content://x/1');
  assert.equal(log.choices[0].o.canCreate, false);
  assert.equal(log.choices[0].actions.create, undefined);
  await log.choices[0].actions.merge();
  assert.equal(log.created.length, 0);
});

test('the sites file names the open logbook; nothing is merged before the diver confirms; no logbook keeps them for later', async () => {
  const open = withChoice({ name: 'Subsurface_divesites.xml', text: SITES });
  assert.equal(await openSharedFile(open.deps, 'content://x/2'), 'confirm-sites');
  assert.equal(open.log.confirms[0].o.values.logbook, 'Mon carnet');
  assert.equal(open.log.changes.length, 0);
  const first = withChoice({ welcome: true, name: 'Subsurface_divesites.xml', text: SITES });
  assert.equal(await openSharedFile(first.deps, 'content://x/2'), 'refused');
  assert.equal(first.log.changes.length, 0);
});

test('the choice texts exist in both languages, the choice is wired in open-link.js', () => {
  const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  for (const l of ['fr', 'en']) {
    const j = JSON.parse(read(`app/src/i18n/${l}.json`));
    for (const k of ['fileChoose', 'fileChooseOne', 'fileNew', 'fileMerge']) assert.ok(j.link[k], `${l} ${k}`);
    assert.match(j.link.sitesText, /\{logbook\}/);
  }
  assert.match(read('app/src/lib/open-link.js'), /choose:/);
});
