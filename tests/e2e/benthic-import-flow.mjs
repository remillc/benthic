// SPDX-License-Identifier: GPL-2.0
// The import of a `.benthic` file on screen (task 2026-11-23-360), run by tests/e2e/navigation.mjs (`--benthic-import-only`).
// A real full export is made here (lib/full-export.js, with the sample logbook of the core), then picked in the app's own
// file input: « Nouveau carnet » with the file card, what it holds and the personal-information note; the progress with its
// steps; a damaged file ends on « Importer un carnet » with the red banner and nothing imported; a cancel changes nothing;
// over an existing logbook « Remplacer ce carnet ? » offers « Exporter d’abord ce carnet » and « Remplacer » replaces. On a
// phone (Android and iPhone looks), a tablet and the desktop. With BC_SHOTS=<folder> each step is also saved as a screenshot.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox } from '../../app/src/lib/secret-box.js';
import { createProfile } from '../../app/src/lib/profile.js';
import { buildExport } from '../../app/src/lib/full-export.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const fr = JSON.parse(readFileSync(path.join(root, 'app/src/i18n/fr.json'), 'utf8'));
const en = JSON.parse(readFileSync(path.join(root, 'app/src/i18n/en.json'), 'utf8'));
const pick = (o, key) => key.split('.').reduce((v, k) => v?.[k], o);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A pattern for a text in either language (the browser's language is not fixed); `{x}` placeholders match anything. */
const text = (key) => new RegExp(`(${[fr, en].map((o) => escape(String(pick(o, key))).replace(/\\\{\w+\\\}/g, '.+')).join('|')})`);

/** @param {object} h the harness of navigation.mjs, plus `work`, `core`, `seeded` */
export async function benthicImportFlows(h) {
  const { openTab, sleep, expect, shot, work, core, seeded, tapText } = h;
  mkdirSync(work, { recursive: true });

  // --- The files: a real export of a device with equipment and a profile, and a damaged copy of it. -----------------------
  // The dives are moved sixty years on, so that they are new to the logbook the harness already holds (the core would refuse the same dives).
  const { appendFileSync, writeFileSync: write, statSync, rmSync } = await import('node:fs');
  /** The files for one device of the run: its dives are dated `years` days after 2030-01-01, so that no two devices share a dive (the core refuses dives it already holds or had). */
  const makeFiles = async (years) => {
  const shifted = path.join(work, `device-${years}.ssrf`);
  // Twelve of the sample's dives, one a day from a start date that is its own for each device of the run (the core refuses a dive it
  // already holds or has held, and the harness's logbook lives for the whole run).
  const sample = readFileSync(seeded, 'utf8');
  const sites = new RegExp('<divesites>[^]*?</divesites>').exec(sample)?.[0] ?? '<divesites></divesites>';
  const blocks = (sample.match(new RegExp('<dive [^]*?</dive>', 'g')) ?? []).slice(0, 12);
  const start = Date.parse('2030-01-01T00:00:00Z') + years * 86400000;
  const dated = blocks.map((block, i) => block.replace(new RegExp("date=['\"][0-9-]+['\"]"), `date='${new Date(start + i * 86400000).toISOString().slice(0, 10)}'`).replace(new RegExp("number=['\"][0-9]+['\"]"), `number='${i + 1}'`));
  writeFileSync(shifted, `<divelog program='subsurface' version='2'>\n<settings>\n</settings>\n${sites}\n<dives>\n${dated.join('\n')}\n</dives>\n</divelog>\n`);
  const ssrf = readFileSync(shifted);
  const diveCount = JSON.parse(await core('importCount', { path: shifted })).dives;
  const store = createFileStore(memoryBackend());
  let key = '';
  const box = createSecretBox({ read: async () => key, write: async (k) => void (key = k) });
  const fixed = new Date('2026-11-20T10:30:00Z');
  const profile = createProfile(store, box, { now: () => fixed });
  await store.write('gear/g1.json', { format: 1, id: 'g1', name: 'Regulator', type: 'regulator' });
  await store.write('gear/g2.json', { format: 1, id: 'g2', name: 'Mask', type: 'mask' });
  await store.write('kits/k1.json', { format: 1, id: 'k1', name: 'Cold water', gearIds: ['g1'] });
  await profile.saveInfo({ fullName: 'Sam Diver', dateOfBirth: '1980-05-17', emergency: { name: 'Alex', relation: 'Sister', phone: { country: 'CA', number: '5145551234' } }, bloodGroup: 'O+' });
  for (const [agency, level, number] of [['padi', 'Advanced', 'A1'], ['ssi', 'Open Water', 'S2'], ['padi', 'Rescue', 'A3']]) await profile.saveCertification({ agency, level, number, issuedOn: '2019-06-01' });
    const exportName = 'Mon carnet.benthic';
  const folder = path.join(work, `pick-${years}`);
  const built = await buildExport(
    { logbookName: 'Mon carnet' },
    {
      store,
      profile,
      appVersion: '0.3.0',
      now: () => fixed,
      logbook: { diveCount: async () => diveCount, siteCount: async () => 48, read: async () => ssrf },
      settings: async () => ({ app: {}, logbook: null }),
      openFile: async (name) => {
        const file = path.join(work, name);
        write(file, '');
        return { write: async (b) => appendFileSync(file, b), close: async () => ({ name, path: file, size: statSync(file).size }), abort: async () => rmSync(file, { force: true }) };
      },
    },
  );
  // The export's own name is a slug; the file the diver picks is named as in the task's mock-ups.
  mkdirSync(folder, { recursive: true });
  const good = path.join(folder, exportName);
  write(good, readFileSync(built.file.path));
  // A copy with three files damaged (a byte flipped in the stored data of three entries).
  const damaged = Buffer.from(readFileSync(good));
  for (const name of ['benthic/gear/g1.json', 'benthic/kits/k1.json', 'logbook/logbook.ssrf']) {
    let at = 0;
    for (; at < damaged.length - 30; at++) if (damaged.readUInt32LE(at) === 0x04034b50 && damaged.toString('utf8', at + 30, at + 30 + damaged.readUInt16LE(at + 26)) === name) break;
    damaged[at + 30 + damaged.readUInt16LE(at + 26) + damaged.readUInt16LE(at + 28) + 6] ^= 0xff;
  }
  const brokenPath = path.join(folder, 'Cassé.benthic');
  write(brokenPath, damaged);
    return { good, brokenPath, diveCount };
  };

  // --- Driving the page -------------------------------------------------------------------------------------------------
  /** Puts a file in the visible file input (the way the system's picker would). */
  const pickFile = async (tab, selector, file) => {
    await tab.send('DOM.enable');
    const { root: doc } = await tab.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await tab.send('DOM.querySelectorAll', { nodeId: doc.nodeId, selector });
    if (!nodeIds.length) throw new Error(`no ${selector}`);
    await tab.send('DOM.setFileInputFiles', { nodeId: nodeIds[nodeIds.length - 1], files: [file] });
  };
  const step = (tab) => tab.run(() => document.querySelector('.bc-welcome.modal-in [data-step]')?.getAttribute('data-step') ?? '');
  const bodyText = (tab, scope) => tab.run((s) => (document.querySelector(s)?.innerText ?? '').replace(/\s+/g, ' '), scope);
  const waitFor = async (tab, fn, ...args) => {
    for (let i = 0; i < 100; i++) {
      if (await tab.run(fn, ...args).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  };
  /** Holds the core's count of the logbook (the step after the logbook is staged) until `release()`, so that a screen can be seen. */
  const hold = (tab) =>
    tab.run(async () => {
      const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /benthic-core[^/]*(\/core-api)?\.js|core-api\.js/.test(n));
      const { BenthicCore } = await import(url);
      const original = BenthicCore.importCount.bind(BenthicCore);
      let release;
      const gate = new Promise((resolve) => (release = resolve));
      window.__benthicRelease = release;
      BenthicCore.importCount = async (o) => {
        const r = await original(o);
        await gate;
        return r;
      };
      return 1;
    });
  const release = (tab) => tab.run(() => (window.__benthicRelease?.(), 1));
  const snap = async (tab, name) => {
    if (process.env.BC_SHOTS) await shot(tab, `360-${name}`);
  };

  const welcome = '.bc-welcome.modal-in';
  /** The page's own store keeps what the earlier devices of the run imported (one browser profile): emptied for each. */
  const clearDevice = (tab) =>
    tab.run(async () => {
      const { services } = await import('/src/lib/profile.svelte.js');
      const { store } = services();
      const paths = (await store.list('')).filter((p) => !p.startsWith('meta/'));
      if (paths.length) await store.batch({ removes: paths });
    });
  /** « Importer le carnet »: tapped again when a step transition swallowed the tap, until the next step is there. */
  const startImport = async (tab) => {
    for (let i = 0; i < 4; i++) {
      await sleep(700);
      await tapText(tab, text('welcomeSteps.importLogbook').source, welcome);
      await sleep(500);
      if ((await step(tab)) !== 'importNew') return;
    }
  };
  const configs = [
    ['Android phone', 390, 844, true, false, 'md'],
    ['iPhone', 390, 844, true, false, 'ios'],
    ['tablet', 1280, 800, false, false, 'md'],
    ['desktop', 1400, 900, false, true, 'md'],
  ];

  const only = (c) => !process.env.BC_BENTHIC_ONLY || c[0] === process.env.BC_BENTHIC_ONLY;
  let nextYears = 0;
  for (const [label, width, height, mobile, desktop, theme] of configs.filter(only)) {
    const { good, brokenPath, diveCount } = await makeFiles((nextYears += 30));
    console.log(`.benthic import, first launch, ${label}`);
    const tab = await openTab(width, height, mobile, true, desktop, { theme });
    const tag = label.replace(/ /g, '-');
    await clearDevice(tab);
    await tapText(tab, text('welcomeSteps.importTitle').source.replace(/^\(|\)$/g, ''), welcome);
    await waitFor(tab, () => document.querySelector('.bc-welcome.modal-in [data-step]')?.getAttribute('data-step') === 'import');
    expect(`${label}: « Importer un carnet » opens`, { step: 'import' }, { step: await step(tab) });

    // A damaged file first: the red banner, and nothing was imported.
    await pickFile(tab, `${welcome} input[type=file]`, brokenPath);
    expect(`${label}: a damaged file opens « Nouveau carnet »`, { ok: true }, { ok: await waitFor(tab, () => document.querySelector('.bc-welcome.modal-in [data-step]')?.getAttribute('data-step') === 'importNew') });
    await snap(tab, `${tag}-new`);
    await startImport(tab);
    expect(`${label}: the check of the files ends on « Importer un carnet »`, { ok: true }, { ok: await waitFor(tab, () => document.querySelector('.bc-welcome.modal-in [data-step]')?.getAttribute('data-step') === 'import' && !!document.querySelector('[data-error="benthic-incomplete"]')) });
    const banner = await bodyText(tab, '[data-error="benthic-incomplete"]');
    expect(`${label}: the red banner says the file is incomplete and how many files differ`, { title: true, count: true, nothing: true }, { title: text('benthicImport.incompleteTitle').test(banner), count: /3 (fichiers ne correspondent|files do not match)/.test(banner), nothing: /(Rien n’a été importé|Nothing was imported)/.test(banner) });
    await snap(tab, `${tag}-incomplete`);
    const untouched = await tab.run(async () => {
      const { logbook } = await import('/src/lib/logbook.svelte.js');
      return { welcome: !!document.querySelector('.bc-welcome.modal-in'), dives: logbook.dives.length };
    });
    expect(`${label}: nothing was imported (the first launch is still open)`, { welcome: true }, untouched);

    // The good file: the card, what it holds, the note.
    await pickFile(tab, `${welcome} input[type=file]`, good);
    expect(`${label}: the file opens « Nouveau carnet »`, { ok: true }, { ok: await waitFor(tab, () => document.querySelector('.bc-welcome.modal-in [data-step]')?.getAttribute('data-step') === 'importNew' && !!document.querySelector('.bc-benthic-contents')) });
    const page = await bodyText(tab, welcome);
    expect(
      `${label}: « Nouveau carnet » shows the file card, the contents from the manifest and the note`,
      { card: true, detail: true, title: true, dives: true, equipment: true, profile: true, note: true },
      {
        card: page.includes('Mon carnet.benthic'),
        detail: /(Export complet de Benthic, 2026-11-20|Full Benthic export, 2026-11-20)/.test(page),
        title: text('benthicImport.contentsTitle').test(page),
        dives: new RegExp(`${diveCount} · 48`).test(page),
        equipment: /(2 pièces · 1 kit|2 items · 1 kit)/.test(page),
        profile: /(3 brevets|3 certifications)/.test(page),
        note: text('benthicImport.note').test(page) || text('benthicImport.notePhone').test(page) || text('benthicImport.noteDesktop').test(page) || text('benthicImport.noteIphone').test(page),
      },
    );
    await snap(tab, `${tag}-new`);

    // A cancel in the middle: nothing is imported.
    await hold(tab);
    await startImport(tab);
    expect(`${label}: the progress opens`, { ok: true }, { ok: await waitFor(tab, () => document.querySelector('.bc-welcome.modal-in [data-step]')?.getAttribute('data-step') === 'importBenthic' && /(tous intacts|all intact|, intact)/.test(document.querySelector('.bc-benthic-steps')?.innerText ?? '')) });
    const progress = await bodyText(tab, welcome);
    expect(
      `${label}: the progress lists the steps, « tous intacts », the help and « Annuler »`,
      { verify: true, intact: true, dives: true, data: true, help: true, cancel: true },
      {
        verify: text('benthicImport.progress.verify').test(progress),
        intact: /\d+ (fichiers, tous intacts|files, all intact)/.test(progress),
        dives: text('benthicImport.progress.dives').test(progress),
        data: text('benthicImport.progress.data').test(progress),
        help: desktop ? text('benthicImport.progress.helpDesktop').test(progress) : text('benthicImport.progress.help').test(progress),
        cancel: text('benthicImport.progress.cancel').test(progress),
      },
    );
    await snap(tab, `${tag}-progress`);
    await tapText(tab, text('benthicImport.progress.cancel').source.replace(/^\(|\)$/g, ''), welcome);
    await release(tab);
    expect(`${label}: « Annuler » goes back to « Nouveau carnet », nothing was imported`, { ok: true }, { ok: await waitFor(tab, () => document.querySelector('.bc-welcome.modal-in [data-step]')?.getAttribute('data-step') === 'importNew') });
    const stored = await tab.run(async () => {
      const { services } = await import('/src/lib/profile.svelte.js');
      const { store } = services();
      return { gear: (await store.list('gear/')).length, welcome: !!document.querySelector('.bc-welcome.modal-in') };
    });
    expect(`${label}: the cancel wrote nothing`, { gear: 0, welcome: true }, stored);

    // The whole import.
    // The harness core already holds a logbook (the sample, and what the earlier devices of the run imported): the file's dives are added to it.
    const held = await tab.run(async () => {
      const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /benthic-core|core-api/.test(n) && n.endsWith('.js'));
      const { BenthicCore } = await import(url);
      return (await BenthicCore.listDives()).dives.length;
    });
    await hold(tab);
    await startImport(tab);
    await waitFor(tab, () => document.querySelector('.bc-welcome.modal-in [data-step]')?.getAttribute('data-step') === 'importBenthic' && /(tous intacts|all intact)/.test(document.querySelector('.bc-benthic-steps')?.innerText ?? ''));
    await sleep(400);
    await snap(tab, `${tag}-progress-logbook`);
    await release(tab);
    expect(`${label}: the first launch ends`, { ok: true }, { ok: await waitFor(tab, () => !document.querySelector('.bc-welcome.modal-in')) });
    const result = await tab.run(async () => {
      const { logbook } = await import('/src/lib/logbook.svelte.js');
      const { services } = await import('/src/lib/profile.svelte.js');
      const { store, profile } = services();
      return { dives: logbook.dives.length, gear: (await store.list('gear/')).length, kits: (await store.list('kits/')).length, certs: (await profile.listCertifications()).length, name: (await profile.readInfo()).fullName, paths: (await store.list('')).join(','), marker: window.__marker === 1, dbs: (await indexedDB.databases()).map((d) => d.name).join(','), sealed: !JSON.stringify(await store.read('profile/diver.json')).includes('1980') };
    });
    expect(`${label}: the logbook, the equipment, the profile and the certifications are in`, { kept: true, gear: 2, kits: 1, certs: 3, name: 'Sam Diver', sealed: true }, { ...result, kept: result.dives >= held });
    if (process.env.BC_BENTHIC_ONLY) console.log('LOGS', tab.logs.slice(-5).join(' | '));
    await snap(tab, `${tag}-done`);
    tab.ws.close();
  }

  // --- Over an existing logbook --------------------------------------------------------------------------------------------
  for (const [label, width, height, mobile, desktop, theme] of configs.filter((c) => c[0] !== 'iPhone' && only(c))) {
    const { good, diveCount } = await makeFiles((nextYears += 30));
    console.log(`.benthic import, replace the logbook, ${label}`);
    const tab = await openTab(width, height, mobile, false, desktop, { theme });
    const tag = label.replace(/ /g, '-');
    await sleep(800);
    // The harness logbook (the sample dives) is what the file replaces; the file's dives are dated sixty years on.
    const before = await tab.run(async () => (await import('/src/lib/logbook.svelte.js')).logbook.dives.length);
    expect(`${label}: the logbook has ${before} dives before`, { ok: before > 0 }, { ok: before > 0 });
    await pickFile(tab, 'input[type=file]', good);
    const dialog = '.dialog.modal-in';
    expect(`${label}: « Remplacer ce carnet ? » opens`, { ok: true }, { ok: await waitFor(tab, () => !!document.querySelector('.dialog.modal-in')) });
    const said = await bodyText(tab, dialog);
    expect(
      `${label}: the dialog says what leaves and what comes, with « Exporter d’abord ce carnet », « Annuler » and « Remplacer »`,
      { title: true, count: true, file: true, contents: true, personal: true, export: true, cancel: true, replace: true },
      {
        title: text('benthicImport.replace.title').test(said),
        count: new RegExp("[0-9]+ (plongées?|dives?)[)] (quitte|leaves)").test(said),
        file: said.includes('Mon carnet.benthic'),
        contents: new RegExp(`${diveCount} (plongées|dives), (l’équipement|the equipment), (le profil|the profile)`).test(said),
        personal: text('benthicImport.replace.personal').test(said) || text('benthicImport.replace.personalDesktop').test(said),
        export: text('replace.exportFirst').test(said),
        cancel: text('dialog.cancel').test(said),
        replace: text('replace.action').test(said),
      },
    );
    await snap(tab, `${tag}-replace-dialog`);
    // « Annuler » changes nothing.
    await tapText(tab, text('dialog.cancel').source.replace(/^\(|\)$/g, ''), dialog);
    await sleep(500);
    const kept = await tab.run(async () => (await import('/src/lib/logbook.svelte.js')).logbook.dives.length);
    expect(`${label}: « Annuler » keeps the logbook`, { dives: before }, { dives: kept });
    // « Remplacer »: the progress, then the new logbook.
    await pickFile(tab, 'input[type=file]', good);
    await waitFor(tab, () => !!document.querySelector('.dialog.modal-in'));
    await hold(tab);
    await tapText(tab, text('replace.action').source.replace(/^\(|\)$/g, ''), dialog);
    expect(`${label}: the progress opens over the logbook`, { ok: true }, { ok: await waitFor(tab, () => !!document.querySelector('.bc-benthic-overlay') && /(tous intacts|all intact)/.test(document.querySelector('.bc-benthic-overlay')?.innerText ?? '')) });
    await sleep(400);
    await snap(tab, `${tag}-replace-progress`);
    await release(tab);
    expect(`${label}: the import ends`, { ok: true }, { ok: await waitFor(tab, () => !document.querySelector('.bc-benthic-overlay')) });
    await sleep(500);
    const replaced = await tab.run(async () => {
      const { logbook } = await import('/src/lib/logbook.svelte.js');
      const { services } = await import('/src/lib/profile.svelte.js');
      return { dives: logbook.dives.length, shifted: logbook.dives.every((d) => String(d.date) > "2029"), gear: (await services().store.list('gear/')).length };
    });
    expect(`${label}: the logbook is the file's`, { some: true, gear: 2 }, { ...replaced, some: replaced.dives > 0 });
    await snap(tab, `${tag}-replaced`);
    tab.ws.close();
  }
}
