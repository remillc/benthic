// SPDX-License-Identifier: GPL-2.0
// The download from a dive computer, step by step (tasks 2026-11-23-357 and 358), run by tests/e2e/navigation.mjs
// (`--download-only`). The page is the app's own; only what the dive computer would give is replaced, in the page:
// the Bluetooth status, the scan, the progress events, the end of the download (`BenthicCore`, the module the page
// imports). The remembered computer and the dives come through the app's own state. With BC_SHOTS=<folder> each step is
// also saved as a screenshot, for a look against the task's mock-ups.

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function downloadFlows(h) {
  const { openTab, sleep, expect, shot } = h;

  /** Replaces what the dive computer gives, in the page, and returns the controls the flow drives. */
  const fake = (tab, { remembered, offer }) =>
    tab.run(
      async (remembered, offer) => {
        const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /benthic-core[^/]*(\/core-api)?\.js|core-api\.js/.test(n));
        const { BenthicCore: core } = await import(url);
        const { logbook } = await import('/src/lib/logbook.svelte.js');
        const { computerOffer } = await import('/src/lib/inventory.svelte.js');
        const listeners = {};
        const calls = { download: 0, keep: 0, scan: 0 };
        window.__dl = { listeners, calls, computerOffer, logbook };
        core.bluetoothStatus = async () => ({ bluetooth: 'on', permission: 'granted' });
        core.bluetoothModels = async () => [
          { vendor: 'Shearwater', products: [{ name: 'Perdix 2', ble: true, classic: false }, { name: 'Petrel 3', ble: true, classic: false }] },
          { vendor: 'Suunto', products: [{ name: 'D5', ble: true, classic: false }] },
        ];
        core.startBluetoothScan = async () => (calls.scan++, undefined);
        core.stopBluetoothScan = async () => undefined;
        core.addListener = async (name, fn) => ((listeners[name] ||= []).push(fn), { remove: async () => undefined });
        core.getPrefs = async () => logbook.prefs;
        core.cancelDownload = async () => undefined;
        core.downloadPartial = async ({ action }) => (action === 'keep' ? (calls.keep++, { downloaded: 2, undo: '', diveComputerList: [] }) : { dives: 2 });
        core.downloadDives = () =>
          new Promise((resolve, reject) => {
            calls.download++;
            window.__dl.finish = resolve;
            window.__dl.fail = (code) => reject(Object.assign(new Error(code), { code }));
          });
        core.listLoadedDives = async () => logbook.dives;
        logbook.prefs = { ...logbook.prefs, diveComputers: remembered ? [{ slot: 1, vendor: 'Shearwater', product: 'Perdix 2', device: 'LE:AA:BB:CC:DD:EE:01', name: 'Perdix 2' }] : [] };
        window.__dl.emit = (name, payload) => (listeners[name] ?? []).forEach((fn) => fn(payload));
        window.__dl.dive = (n) => ({ date: `2026-11-2${n}T10:0${n}:00`, maxDepthMm: 18000 + n * 3000, durationSeconds: 2400 + n * 300, profile: [0, 0, 300, 5000, 1200, 18000, 2000, 12000, 2400, 0] });
        window.__dl.offer = offer;
        return 1;
      },
      remembered,
      offer,
    );

  /** Opens the download page in the view on screen. */
  const open = (tab) =>
    tab.run(() => {
      const view = document.querySelector('.views .tab-active.view, .views > .view.tab-active') || document.querySelector('.view-main');
      view.f7View.router.navigate('/download');
      return 1;
    });
  const emit = (tab, name, payload) => tab.run((n, p) => (window.__dl.emit(n, p), 1), name, payload);
  const read = () => {
    const page = document.querySelector('.page.bc-download');
    const text = (el) => el?.innerText?.replace(/\s+/g, ' ').trim() ?? '';
    const box = (el) => {
      const r = el?.getBoundingClientRect();
      return r ? { width: Math.round(r.width), height: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top) } : null;
    };
    const buttons = [...(page?.querySelectorAll('button, a.link') ?? [])].filter((b) => b.getClientRects().length).map((b) => text(b) || b.getAttribute('aria-label') || '');
    return {
      open: !!page,
      text: text(page?.querySelector('.bc-download--content')),
      title: text(page?.querySelector('.navbar .title, .bc-download--dialog-head h1')),
      buttons,
      mine: box(page?.querySelector('.bc-download--mine')),
      primary: box(page?.querySelector('.bc-download--primary')),
      dialog: box(page?.querySelector('.bc-download--dialog')),
      bar: box(page?.querySelector('.bc-download--actions-bar')),
      content: box(page?.querySelector('.bc-download--content')),
      pageBox: box(page),
    };
  };
  /** Taps the first visible button whose text matches. */
  const tap = (tab, pattern) =>
    tab.run((p) => {
      const re = new RegExp(p);
      const page = document.querySelector('.page.bc-download') ?? document;
      const b = [...page.querySelectorAll('button, a.link')].find((x) => x.getClientRects().length && (re.test((x.innerText || '').trim()) || re.test(x.getAttribute('aria-label') || '')));
      if (!b) return false;
      b.click();
      return true;
    }, pattern);
  const shots = (tab, name) => (process.env.BC_SHOTS ? shot(tab, `download-${name}`) : undefined);

  /** @param {string} name @param {number} w @param {number} h @param {{ theme: 'md'|'ios', desktop?: boolean, mobile?: boolean, kind: string }} o */
  const walk = async (name, w, hgt, o) => {
    console.log(`Download flow: ${name}`);
    const slug = name.replace(/\W+/g, '-');
    const tabOpts = { theme: o.theme };
    const near = { phone: 'du téléphone', iphone: 'de l’iPhone', tablet: 'de la tablette' }[o.kind];

    // First time: nothing remembered, nothing found.
    let tab = await openTab(w, hgt, o.mobile ?? true, false, !!o.desktop, tabOpts);
    await fake(tab, { remembered: false });
    await open(tab);
    await sleep(1200);
    let page = await tab.run(read);
    expect(`${name}: title`, { open: true }, page);
    if (!o.desktop) {
      expect(`${name}: the search step, three steps and the help button`, { steps: true, help: true, tapHint: true }, {
        steps: /Allumez l’ordinateur de plongée\./.test(page.text) && /Mettez-le en mode transfert Bluetooth\./.test(page.text) && new RegExp(`moins d’un mètre ${near}`).test(page.text),
        help: page.buttons.includes('Mon ordinateur n’apparaît pas'),
        tapHint: /Dès qu’il apparaît, touchez-le pour lancer le téléchargement\./.test(page.text),
      });
    }
    expect(`${name}: the page title`, { title: 'Télécharger des plongées' }, page);
    await shots(tab, `${slug}-1-search`);
    // Something nearby: the choice (known computer, unknown device).
    await emit(tab, 'bluetoothDevice', { mac: 'AA:BB:CC:DD:EE:02', name: 'Petrel 3', le: true, classic: false, computer: { vendor: 'Shearwater', product: 'Petrel 3' } });
    await emit(tab, 'bluetoothDevice', { mac: 'AA:BB:CC:DD:EE:03', name: 'XR-300', le: true, classic: false, computer: null });
    await tab.run(async () => ((await import('/src/lib/settings.svelte.js')).settings.showAllBluetooth = true, 1));
    await sleep(600);
    page = await tab.run(read);
    expect(`${name}: another computer nearby has its own « Télécharger », an unknown one « Choisir le modèle »`, { tonal: true, choose: true }, {
      tonal: page.buttons.filter((b) => b === 'Télécharger').length >= 1,
      choose: page.buttons.includes('Choisir le modèle'),
    });
    await shots(tab, `${slug}-1b-choice-others`);
    tab.ws.close();

    // A remembered computer in range: one tap starts the download.
    tab = await openTab(w, hgt, o.mobile ?? true, false, !!o.desktop, tabOpts);
    await fake(tab, { remembered: true });
    await open(tab);
    await sleep(1200);
    await emit(tab, 'bluetoothDevice', { mac: 'AA:BB:CC:DD:EE:01', name: 'Perdix 2', le: true, classic: false, computer: { vendor: 'Shearwater', product: 'Perdix 2' } });
    await emit(tab, 'bluetoothDevice', { mac: 'AA:BB:CC:DD:EE:02', name: 'Petrel 3', le: true, classic: false, computer: { vendor: 'Shearwater', product: 'Petrel 3' } });
    await emit(tab, 'bluetoothDevice', { mac: 'AA:BB:CC:DD:EE:03', name: 'XR-300', le: true, classic: false, computer: null });
    await sleep(700);
    page = await tab.run(read);
    expect(`${name}: the choice shows « Votre ordinateur », its state and the hint`, { mine: true, inRange: true, hint: true, noRetelecharger: true }, {
      mine: /Votre ordinateur/.test(page.text) && /Perdix 2/.test(page.text),
      inRange: /À portée, prêt/.test(page.text),
      hint: o.desktop ? /Branchez l’ordinateur de plongée en USB/.test(page.text) : new RegExp(`près ${near}\\.`).test(page.text),
      noRetelecharger: !/Tout retélécharger/.test(page.text) && !page.buttons.includes('Tout retélécharger'),
    });
    if (!o.desktop) expect(`${name}: the remembered computer's button is full width, ${o.theme === 'ios' ? 50 : 56} high`, { height: o.theme === 'ios' ? 50 : 56 }, page.primary ?? {});
    else expect(`${name}: the desktop button is 48 px`, { height: 48 }, page.primary ?? {});
    if (o.desktop) expect(`${name}: the dialog is 640 px wide`, { width: 640 }, page.dialog ?? {});
    await shots(tab, `${slug}-2-choice`);
    // The ⋮ menu: « Tout retélécharger », « Montrer tous les appareils Bluetooth », « Aide au téléchargement ».
    expect(`${name}: the ⋮ button exists`, { more: true }, { more: await tap(tab, '^Plus d’options$') });
    await sleep(500);
    const menu = await tab.run(() => [...document.querySelectorAll('.popover.modal-in .item-title, .popover.modal-in .item-inner')].map((e) => e.innerText.trim()).filter(Boolean));
    expect(`${name}: the menu has the three items`, { all: true }, {
      all: ['Tout retélécharger', 'Montrer tous les appareils Bluetooth', 'Aide au téléchargement'].every((x) => menu.some((m) => m.startsWith(x))),
    });
    await shots(tab, `${slug}-3-menu`);
    await tab.run(() => ((window.__dl.calls.download = 0), 1));
    // One tap starts it (a click on the page first closes a menu left open).
    await tab.run(() => (document.querySelectorAll('.popover.modal-in').forEach((p) => p.f7Modal?.close?.()), 1));
    await sleep(300);
    const started = await tap(tab, '^Télécharger depuis Perdix 2$');
    await sleep(500);
    expect(`${name}: one tap on « Télécharger » starts the download`, { started: true, calls: 1 }, { started, calls: await tab.run(() => window.__dl.calls.download) });
    await shots(tab, `${slug}-4-connecting`);
    page = await tab.run(read);
    if (!o.desktop) expect(`${name}: the connection step`, { text: true }, { text: /Connexion au Perdix 2…/.test(page.text) && /La première fois, .* demande le code affiché sur l’ordinateur\./.test(page.text) });
    // Progress, two dives.
    await emit(tab, 'downloadProgress', { state: 'connected', fraction: 0.34, dives: 1, newDives: [await tab.run(() => window.__dl.dive(1))] });
    await emit(tab, 'downloadProgress', { state: 'connected', fraction: 0.46, dives: 2, newDives: [await tab.run(() => window.__dl.dive(2))] });
    await sleep(900);
    page = await tab.run(read);
    expect(`${name}: in progress`, { received: true, reading: true, near: true, chip: true, stop: true }, {
      received: /2 plongées reçues/.test(page.text),
      reading: /Lecture du Perdix 2…/.test(page.text) && /Reçues jusqu’ici/.test(page.text),
      near: o.desktop ? /Gardez l’ordinateur de plongée près de cet ordinateur\./.test(page.text) : new RegExp(`Gardez ${o.kind === 'iphone' ? 'l’iPhone' : o.kind === 'tablet' ? 'la tablette' : 'le téléphone'} près de l’ordinateur\\.`).test(page.text),
      chip: /Nouvelle/.test(page.text),
      stop: page.buttons.includes('Arrêter le téléchargement'),
    });
    await shots(tab, `${slug}-5-progress`);
    // Connection lost.
    await tab.run(() => (window.__dl.fail('FAILED'), 1));
    await sleep(900);
    page = await tab.run(read);
    expect(`${name}: connection lost keeps the dives and offers to try again`, { lost: true, retry: true, close: true, kept: true }, {
      lost: /Connexion perdue/.test(page.text) && /Les 2 plongées reçues sont gardées dans le carnet\. Rapprochez l’ordinateur : le téléchargement reprendra où il s’est arrêté\./.test(page.text),
      retry: page.buttons.includes('Réessayer'),
      close: page.buttons.includes('Fermer'),
      kept: (await tab.run(() => window.__dl.calls.keep)) === 1,
    });
    await shots(tab, `${slug}-6-lost`);
    // Try again, then nothing new.
    await tap(tab, '^Réessayer$');
    await sleep(500);
    await tab.run(() => (window.__dl.finish({ downloaded: 0, vendor: 'Shearwater', product: 'Perdix 2', serial: 1, firmware: 1, undo: '', diveComputerList: [] }), 1));
    await sleep(800);
    page = await tab.run(read);
    expect(`${name}: Réessayer reads on; finished with the 2 dives kept`, { done: true, see: true }, {
      done: /2 nouvelles plongées/.test(page.text) && /Téléchargées du Perdix 2 et ajoutées au carnet\./.test(page.text),
      see: page.buttons.includes('Voir dans le carnet'),
    });
    await shots(tab, `${slug}-7-done`);
    // The same screen with the new computer offer (Benthic+).
    await tab.run(() => ((window.__dl.computerOffer.computer = { vendor: 'Shearwater', model: 'Shearwater Petrel 3', serial: '1', firmware: '1' }), 1));
    await sleep(600);
    page = await tab.run(read);
    expect(`${name}: the offer card « Ajouter le … à votre équipement ? »`, { offer: true, later: true, add: true }, {
      offer: /Ajouter le Perdix 2 à votre équipement \?/.test(page.text),
      later: page.buttons.includes('Plus tard'),
      add: page.buttons.includes('Ajouter'),
    });
    if (o.desktop) expect(`${name}: with the offer the footer has only « Voir dans le carnet »`, { onlySee: true }, { onlySee: page.buttons.includes('Voir dans le carnet') && !page.buttons.includes('Terminer') });
    await shots(tab, `${slug}-8-done-offer`);
    await tab.run(() => ((window.__dl.computerOffer.computer = null), 1));
    tab.ws.close();

    // Nothing new.
    tab = await openTab(w, hgt, o.mobile ?? true, false, !!o.desktop, tabOpts);
    await fake(tab, { remembered: true });
    await tab.run(async () => ((await import('/src/lib/device-store.js')).deviceStore.setItem('bc.downloadHistory', JSON.stringify({ 'AA:BB:CC:DD:EE:01': { at: '2026-11-20T09:00:00Z', lastDive: '2026-11-19T15:30:00' } })), 1));
    await open(tab);
    await sleep(1200);
    await emit(tab, 'bluetoothDevice', { mac: 'AA:BB:CC:DD:EE:01', name: 'Perdix 2', le: true, classic: false, computer: { vendor: 'Shearwater', product: 'Perdix 2' } });
    await sleep(500);
    page = await tab.run(read);
    expect(`${name}: the card says the last download`, { last: true }, { last: /Shearwater · dernier téléchargement le /.test(page.text) });
    await tap(tab, '^Télécharger depuis Perdix 2$');
    await sleep(400);
    await emit(tab, 'downloadProgress', { state: 'connected', fraction: 0.9, dives: 0, newDives: [] });
    await tab.run(() => (window.__dl.finish({ downloaded: 0, vendor: 'Shearwater', product: 'Perdix 2', serial: 1, firmware: 1, undo: '', diveComputerList: [] }), 1));
    await sleep(900);
    page = await tab.run(read);
    expect(`${name}: nothing new`, { title: true, text: true, last: true, end: true, again: true }, {
      title: /Aucune nouvelle plongée/.test(page.text),
      text: /Le carnet est déjà à jour avec le Perdix 2\./.test(page.text),
      last: /Dernière plongée reçue : /.test(page.text),
      end: page.buttons.includes('Terminer'),
      again: page.buttons.includes('Tout retélécharger…'),
    });
    await shots(tab, `${slug}-9-nothing`);
    // « Terminer » leaves.
    await tap(tab, '^Terminer$');
    await sleep(900);
    expect(`${name}: « Terminer » closes the download`, { open: false }, await tab.run(read));
    tab.ws.close();
  };

  await walk('phone md', 390, 844, { theme: 'md', kind: 'phone' });
  await walk('phone ios', 390, 844, { theme: 'ios', kind: 'iphone' });
  await walk('tablet md landscape', 1280, 800, { theme: 'md', kind: 'tablet', mobile: false });
  await walk('tablet md portrait', 800, 1280, { theme: 'md', kind: 'tablet', mobile: false });
  await walk('desktop', 1400, 900, { theme: 'md', kind: 'desktop', mobile: false, desktop: true });
}
