// « Remplacer ce carnet » (decided on 18 November 2026): one logbook at a time on a phone or a tablet, moving to
// another one by files. The guarded flow, what may be replaced, the archive of several logbooks, the wiring.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { checkSharedFile } from '../../app/src/lib/deep-link.js';
import { fakeStagedCore } from './fake-staged-core.mjs';
import { bytesToBase64, openSharedFile } from '../../app/src/lib/shared-file.js';
import { logbooksInFile, replaceEligibility, replaceOffer, replacementFromFile, runReplace } from '../../app/src/lib/replace-logbook.js';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const DIVES = `<divelog program='subsurface' version='3'>
<dives>
<dive number='1' date='2020-05-01' time='10:00:00' duration='40:00 min'>
  <divecomputer model='manually added dive'>
  </divecomputer>
</dive>
</dives>
</divelog>
`;

function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const body = deflateRawSync(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(8, 10);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(e.data.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    parts.push(local, name, body);
    central.push(head, name);
    offset += local.length + name.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, dir, end]));
}

const enc = (s) => new TextEncoder().encode(s);

/** The screen's side of the flow: answers in order, everything it was asked is recorded. */
function screen({ answers = ['replace'], confirm = true, name = 'Neuf', exportOk = true, replaceFails = false } = {}) {
  const log = { explained: [], exports: 0, confirms: [], names: [], replaced: [], done: [], failed: [] };
  const queue = [...answers];
  const deps = {
    explain: async (o) => (log.explained.push(o), queue.shift() ?? 'cancel'),
    exportCurrent: async () => (log.exports++, exportOk),
    confirmRemoval: async (o) => (log.confirms.push(o), confirm),
    askName: async (s) => (log.names.push(s), name),
    replace: async (n, d) => {
      if (replaceFails) throw new Error('NO_DIVES');
      log.replaced.push({ n, d });
      return 3;
    },
    done: (n, c) => log.done.push({ n, c }),
    failed: (e) => log.failed.push(e),
  };
  return { deps, log };
}
const what = { logbook: 'Mon carnet', file: 'Autre.ssrf', data: { path: '/cache/import-1-Autre.ssrf' } };

test('only a logbook of the device is replaceable; the server and an account are not', () => {
  assert.equal(replaceEligibility({ email: '', benthicPlus: false, repository: '' }), 'ok');
  assert.equal(replaceEligibility({ email: 'a@b.c', benthicPlus: true, repository: 'https://x' }), 'server');
  assert.equal(replaceEligibility({ email: 'a@b.c', benthicPlus: false }), 'account');
  assert.equal(replaceEligibility({ email: '', repository: 'https://git.example/x' }), 'account');
  assert.deepEqual(replaceOffer({ benthicPlus: true }), { replace: false, why: 'server' });
  assert.deepEqual(replaceOffer({}), { replace: true, why: '' });
});

test('nothing is removed before the explanation is answered; Cancel leaves everything', async () => {
  const s = screen({ answers: ['cancel'] });
  assert.equal(await runReplace(s.deps, what), 'cancelled');
  assert.equal(s.log.replaced.length, 0);
  assert.equal(s.log.confirms.length + s.log.names.length, 0);
  assert.deepEqual(s.log.explained[0], { logbook: 'Mon carnet', file: 'Autre.ssrf', pending: 0, exported: false });
});

test('« Remplacer » without an export asks a second time; refusing it replaces nothing', async () => {
  const s = screen({ answers: ['replace'], confirm: false });
  assert.equal(await runReplace(s.deps, what), 'cancelled');
  assert.equal(s.log.confirms.length, 1);
  assert.equal(s.log.replaced.length, 0);
  assert.equal(s.log.names.length, 0, 'the name step comes after the confirmations');
});

test('« Exporter d’abord ce carnet » exports, comes back to the explanation, and « Remplacer » then needs no second question', async () => {
  const s = screen({ answers: ['export', 'replace'] });
  assert.equal(await runReplace(s.deps, what), 'replaced');
  assert.equal(s.log.exports, 1);
  assert.equal(s.log.explained.length, 2);
  assert.equal(s.log.explained[1].exported, true);
  assert.equal(s.log.confirms.length, 0);
  assert.deepEqual(s.log.replaced, [{ n: 'Neuf', d: { path: '/cache/import-1-Autre.ssrf' } }]);
  assert.deepEqual(s.log.done, [{ n: 'Neuf', c: 3 }]);
  assert.deepEqual(s.log.names, ['Autre'], 'the name is suggested from the file');
});

test('an export the diver closed does not count: the second confirmation still comes', async () => {
  const s = screen({ answers: ['export', 'replace'], exportOk: false });
  await runReplace(s.deps, what);
  assert.equal(s.log.confirms.length, 1);
});

test('unsynchronised changes are warned about, and asked again even after an export', async () => {
  const s = screen({ answers: ['export', 'replace'] });
  await runReplace(s.deps, { ...what, pending: 4 });
  assert.equal(s.log.explained[0].pending, 4);
  assert.deepEqual(s.log.confirms, [{ logbook: 'Mon carnet', pending: 4 }]);
});

test('cancelling the name keeps the logbook; a replacement that fails reports and does not say done', async () => {
  const noName = screen({ answers: ['export', 'replace'], name: null });
  assert.equal(await runReplace(noName.deps, what), 'cancelled');
  assert.equal(noName.log.replaced.length, 0);
  const bad = screen({ answers: ['export', 'replace'], replaceFails: true });
  assert.equal(await runReplace(bad.deps, what), 'failed');
  assert.equal(bad.log.done.length, 0);
  assert.equal(bad.log.failed.length, 1);
});

/** The shared-file side: what the dialog of a file offers for each kind of open logbook. */
function shared({ raw, name = 'Autre.ssrf', eligibility = 'ok' }) {
  const bytes = raw ?? enc(DIVES);
  const log = { choices: [], replaced: [], merged: [] };
  const staging = fakeStagedCore();
  log.staging = staging;
  const deps = {
    stage: async () => staging.put(name, bytes),
    core: staging.core,
    check: checkSharedFile,
    welcome: () => false,
    remembered: () => ({}),
    keep: () => {},
    listSites: async () => [],
    siteChange: async () => ({}),
    importData: async (n, d) => (log.merged.push({ n, d }), 1),
    toFirstLaunch: () => {},
    confirm: () => {},
    refuse: () => {},
    notify: () => {},
    imported: () => {},
    importFailed: () => {},
    choose: (o, actions) => log.choices.push({ o, actions }),
    canCreateLogbook: () => false,
    newLogbook: async () => {},
    replaceEligibility: () => eligibility,
    replaceLogbook: async (w) => void log.replaced.push({ ...w, text: staging.text(w.data.path) }),
  };
  return { deps, log };
}

test('a device logbook: « Remplacer ce carnet » replaces « Nouveau carnet »; nothing runs before the diver chooses', async () => {
  const { deps, log } = shared({});
  await openSharedFile(deps, 'content://x/1');
  const c = log.choices[0];
  assert.equal(c.o.canCreate, false);
  assert.equal(c.o.canReplace, true);
  assert.equal(c.actions.create, undefined);
  assert.equal(log.replaced.length + log.merged.length, 0);
  await c.actions.replace();
  assert.equal(log.replaced.length, 1);
  assert.equal(log.replaced[0].file, 'Autre.ssrf');
  assert.equal(log.replaced[0].text, DIVES);
  assert.equal(log.merged.length, 0);
  // The staged file is deleted once the replacement is over.
  assert.equal(log.staging.files.size, 0);
});

test('the Benthic+ server logbook and an account logbook are never offered « Remplacer »; they say why', async () => {
  for (const eligibility of ['server', 'account']) {
    const { deps, log } = shared({ eligibility });
    await openSharedFile(deps, 'content://x/1');
    const c = log.choices[0];
    assert.equal(c.actions.replace, undefined, eligibility);
    assert.equal(c.o.canReplace, false);
    assert.equal(c.o.whyNot, eligibility);
    assert.ok(c.actions.merge, 'adding stays possible');
  }
});

test('an archive of several logbooks: only the main one is taken, and the dialog says so', async () => {
  const archive = zip([
    { name: 'b/second.ssrf', data: enc(DIVES.replace("number='1'", "number='2'")) },
    { name: 'a/first.ssrf', data: enc(DIVES) },
    { name: 'readme.txt', data: enc('x') },
  ]);
  const inside = await logbooksInFile('all.zip', archive);
  assert.equal(inside.count, 2);
  assert.equal(inside.main.name, 'first.ssrf');
  const { deps, log } = shared({ raw: archive, name: 'all.zip' });
  await openSharedFile(deps, 'content://x/1');
  assert.deepEqual(log.choices[0].o.several, { count: 2, main: 'first' });
  await log.choices[0].actions.replace();
  assert.equal(log.replaced[0].fileName, 'first.ssrf');
  assert.equal(log.replaced[0].text, DIVES);
  assert.equal(log.staging.files.size, 0, 'the archive and the extracted logbook are gone');
});

test('Benthic’ own export keeps its main logbook; a plain file or an archive without a logbook is not an archive of logbooks', async () => {
  const own = zip([
    { name: 'benthic/settings.json', data: enc('{}') },
    { name: 'logbook/logbook.ssrf', data: enc(DIVES) },
  ]);
  const inside = await logbooksInFile('benthic-data-2026-11-18.zip', own);
  assert.equal(inside.count, 1);
  assert.equal(inside.main.name, 'logbook.ssrf');
  assert.equal(await logbooksInFile('Autre.ssrf', enc(DIVES)), null);
  assert.equal(await logbooksInFile('x.zip', zip([{ name: 'a.fit', data: enc('x') }])), null);
});

test('« + › Importer un fichier »: a Subsurface file or an archive can replace; a dive computer file only adds', async () => {
  const staging = fakeStagedCore();
  const file = (name, bytes) => new File([bytes], name);
  const one = await replacementFromFile(staging.core, file('Autre.ssrf', enc(DIVES)));
  assert.equal(one.name, 'Autre.ssrf');
  assert.equal(one.several, null);
  assert.equal(staging.files.size, 0, 'nothing is staged until the diver chooses « Remplacer »');
  const staged = await one.stage();
  assert.equal(staging.text(staged.path), DIVES);
  const archive = await replacementFromFile(staging.core, file('all.zip', zip([{ name: 'logbook/logbook.ssrf', data: enc(DIVES) }])));
  assert.equal(archive.name, 'logbook.ssrf');
  assert.equal(staging.text((await archive.stage()).path), DIVES);
  assert.equal(await replacementFromFile(staging.core, file('dive.fit', enc('FIT'))), null);
  assert.equal(await replacementFromFile(staging.core, file('notes.xml', enc('<other/>'))), null);
});

test('the core call refuses an account logbook and keeps a copy to put the logbook back; the dialogs and the entry points are wired', () => {
  const core = read('app/src/lib/logbook.svelte.js');
  assert.match(core, /export async function replaceDeviceLogbook[^]*?NOT_REPLACEABLE[^]*?stage: true[^]*?wipeDeviceLogbook[^]*?importDives[^]*?catch[^]*?wipeDeviceLogbook[^]*?importDives/);
  assert.match(read('app/src/lib/open-link.js'), /replaceLogbook: startReplace/);
  const page = read('app/src/pages/Logbook.svelte');
  assert.match(page, /offerReplace/);
  assert.match(page, /startReplace/);
  const ui = read('app/src/lib/replace-logbook-ui.js');
  assert.match(ui, /exportFile\(ids, 'ssrf'/);
  assert.match(ui, /replace\.exportFirst/);
  for (const l of ['fr', 'en']) {
    const j = JSON.parse(read(`app/src/i18n/${l}.json`));
    for (const k of ['title', 'text', 'several', 'pending', 'exportFirst', 'action', 'confirmTitle', 'confirmText', 'confirmPending', 'confirmAction', 'nameTitle', 'done', 'failed']) assert.ok(j.replace[k], `${l} replace.${k}`);
    for (const k of ['fileReplace', 'fileChooseReplace', 'replace_server', 'replace_account']) assert.ok(j.link[k], `${l} link.${k}`);
  }
  assert.match(JSON.parse(read('app/src/i18n/fr.json')).replace.several, /Ce fichier contient \{count\} carnets : seul « \{main\} » est importé\./);
  assert.match(read('docs/ui-specification.md'), /one logbook at a time/i);
});
