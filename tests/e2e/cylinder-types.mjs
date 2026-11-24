// SPDX-License-Identifier: GPL-2.0
// Settings › Équipement › Types de bouteilles (task 2026-11-23-373), run by tests/e2e/navigation.mjs (`--cylinder-types-only`).
// Phone (390x844): one list of the logbook's types and the diver's own, no « Standard » section; « Nouveau type » shows the
// « Tailles courantes » chips and a chip fills the name, the volume and the pressure; the saved type is in the list as « Ajouté
// par vous · dans aucune plongée » with « Inutilisé »; its page has « Supprimer ce type », which removes it; Réglages ›
// Équipement has no « Proposer les tailles standard »; the default cylinder menu lists the common sizes under a divider.
// Desktop (1400x900): the same list in the Équipement card, the dialog with the chips, and the deletion.

/** @param {object} h the harness of navigation.mjs */
export async function cylinderTypeFlows(h) {
  const { openTab, closeOtherTabs, sleep, expect } = h;

  /** @param {any} tab */
  const waiter = (tab) => async (/** @type {() => boolean} */ check, /** @type {any} */ arg) => {
    for (let i = 0; i < 80; i++) {
      if (await tab.run(check, arg).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  };

  console.log('Phone, 390x844: one list of cylinder types, the chips, a new type, its deletion');
  {
    const tab = await openTab(390, 844, true);
    await closeOtherTabs?.(tab.targetId);
    const waitFor = waiter(tab);
    const go = (/** @type {string} */ path) => tab.run((p) => { document.querySelector('.views > .view.tab-active').f7View.router.navigate(p); return 1; }, path);
    const page = '.page-current';

    // Réglages › Équipement: no « Proposer les tailles standard »; the default cylinder menu lists the common sizes.
    await go('/settings/equipment');
    await waitFor(() => !!document.querySelector('.view.tab-active .page-current .bc-settings'));
    await sleep(500);
    const equipment = await tab.run(() => document.querySelector('.view.tab-active .page-current')?.textContent ?? '');
    expect('Équipement: no « Proposer les tailles standard »', { has: false }, { has: /tailles standard/i.test(equipment) });
    expect('Équipement: « Types de bouteilles » is the first row', { has: true }, { has: equipment.includes('Types de bouteilles'), text: equipment.slice(0, 300) });
    await tab.run(() => {
      const row = [...document.querySelectorAll('.view.tab-active .page-current button, .view.tab-active .page-current a')].find((b) => b.textContent.includes('Bouteille, circuit ouvert'));
      /** @type {HTMLElement|null} */ (row)?.click();
      return 1;
    });
    await waitFor(() => !!document.querySelector('.bc-row-menu'));
    const menu = await tab.run(() => ({
      options: [...document.querySelectorAll('.bc-row-menu [role="option"]')].map((o) => o.textContent.trim()),
      heading: document.querySelector('.bc-row-menu--heading')?.textContent?.trim() ?? '',
    }));
    expect('default cylinder menu: « Aucune » first', { first: true }, { first: menu.options[0]?.startsWith('Aucune') });
    expect('default cylinder menu: a divider « Tailles courantes » then common sizes', { heading: 'Tailles courantes', sizes: true }, { heading: menu.heading, sizes: menu.options.some((o) => /^(AL80|HP100|10L 232 bar|12L 232 bar)/.test(o)) });
    await tab.run(() => { document.querySelector('.bc-row-menu--scrim')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return 1; });
    await sleep(300);

    // The list.
    await go('/settings/cylinders/');
    await waitFor(() => document.querySelectorAll('.view.tab-active .page-current .bc-cylinder-types--row').length > 0);
    const list = await tab.run(() => ({
      text: document.querySelector('.view.tab-active .page-current')?.textContent ?? '',
      titles: document.querySelectorAll('.view.tab-active .page-current .bc-cylinder-types--title').length,
      rows: [...document.querySelectorAll('.view.tab-active .page-current .bc-cylinder-types--row')].map((r) => r.textContent.trim()),
    }));
    expect('list: one list, no « Vos types » or « Standard » section', { titles: 0, standard: false, yours: false, more: false }, {
      titles: list.titles, standard: /Standard/.test(list.text), yours: /Vos types/.test(list.text), more: /autres types standard/.test(list.text),
    });
    const says = (/** @type {string} */ r) => /Dans\s.+\splongées?|dans aucune plongée/.test(r);
    expect('list: every row says how many dives use it', { all: true }, { all: list.rows.length > 0 && list.rows.every(says), rows: list.rows.filter((r) => !says(r)) });
    expect('list: the intro of one list', { intro: true }, { intro: list.text.includes('Les types de bouteilles de votre carnet, et ceux que vous ajoutez.') });

    // A new type through a chip.
    await go('/settings/cylinders/new');
    await waitFor(() => document.querySelectorAll('.view.tab-active .page-current .bc-cylinder-size-chips--chip').length > 0);
    const chips = await tab.run(() => ({
      title: document.querySelector('.view.tab-active .page-current .bc-cylinder-size-chips--title')?.textContent ?? '',
      note: document.querySelector('.view.tab-active .page-current .bc-cylinder-size-chips--note')?.textContent ?? '',
      names: [...document.querySelectorAll('.view.tab-active .page-current .bc-cylinder-size-chips--chip')].map((c) => c.textContent.trim()),
    }));
    expect('new type: « Tailles courantes » and its note', { title: 'Tailles courantes', note: 'Touchez une taille pour remplir le nom, le volume et la pression.' }, chips);
    expect('new type: metric chips (litres and bar), not the imperial names', { metric: true, imperial: false }, { metric: chips.names.some((n) => /L/.test(n)), imperial: chips.names.includes('AL80') });
    // A size with a working pressure (« 10.0L » and « 11.1L » are size-only).
    const chosen = chips.names.find((n) => /bar/.test(n)) ?? chips.names[0];
    await tab.run((name) => { /** @type {HTMLElement} */ ([...document.querySelectorAll('.view.tab-active .page-current .bc-cylinder-size-chips--chip')].find((c) => c.textContent.trim() === name)).click(); return 1; }, chosen);
    await sleep(300);
    const fields = await tab.run(() => [...document.querySelectorAll('.view.tab-active .page-current .bc-form-surface input')].map((i) => /** @type {HTMLInputElement} */ (i).value));
    expect('a chip fills the name, the volume and the pressure', { name: chosen, volume: true, pressure: true }, { name: fields[0], volume: !!fields[1], pressure: !!fields[2] });
    await tab.run(() => {
      const save = [...document.querySelectorAll('.view.tab-active .page-current .navbar .right a')].find((a) => /Enregistrer/.test(a.textContent));
      /** @type {HTMLElement|null} */ (save)?.click();
      return 1;
    });
    await waitFor(() => !!document.querySelector('.view.tab-active .page-current .bc-cylinder-types--row'));
    await sleep(500);
    const after = await tab.run((name) => {
      const rows = [...document.querySelectorAll('.view.tab-active .page-current .bc-cylinder-types--row')].map((r) => r.textContent.trim());
      return { rows: rows.filter((r) => r.startsWith(name)) };
    }, chosen);
    expect('the saved type is one row, « Ajouté par vous · dans aucune plongée », « Inutilisé »', { count: 1, added: true, unused: true }, {
      count: after.rows.length, added: /Ajouté par vous · dans aucune plongée/.test(after.rows[0] ?? ''), unused: /Inutilisé/.test(after.rows[0] ?? ''),
    });

    // Its page: the same screen for every type, with « Supprimer ce type ».
    await tab.run((name) => {
      const row = [...document.querySelectorAll('.view.tab-active .page-current .bc-cylinder-types--row')].find((r) => r.textContent.trim().startsWith(name));
      /** @type {HTMLElement|null} */ (row)?.click();
      return 1;
    }, chosen);
    await waitFor(() => !!document.querySelector('.view.tab-active .page-current .bc-cylinder-type--delete'));
    const edit = await tab.run(() => ({
      title: document.querySelector('.view.tab-active .page-current .navbar .title')?.textContent?.trim() ?? '',
      button: document.querySelector('.view.tab-active .page-current .bc-cylinder-type--delete')?.textContent?.trim() ?? '',
      chips: document.querySelectorAll('.view.tab-active .page-current .bc-cylinder-size-chips--chip').length,
    }));
    expect('the edit page: « Modifier le type », « Supprimer ce type », no chips', { title: 'Modifier le type', button: 'Supprimer ce type', chips: 0 }, edit);
    await tab.run(() => { /** @type {HTMLElement} */ (document.querySelector('.view.tab-active .page-current .bc-cylinder-type--delete')).click(); return 1; });
    await waitFor(() => !!document.querySelector('.view.tab-active .page-current .bc-cylinder-types--row') && !document.querySelector('.view.tab-active .page-current .bc-cylinder-type--delete'));
    await sleep(500);
    const gone = await tab.run((name) => [...document.querySelectorAll('.view.tab-active .page-current .bc-cylinder-types--row')].filter((r) => r.textContent.trim().startsWith(name)).length, chosen);
    expect('deleting an unused added type removes its row without a dialog', { rows: 0 }, { rows: gone });
    void page;
    tab.ws.close();
  }

  console.log('Desktop, 1400x900: the Équipement card, the dialog with the chips, the deletion');
  {
    const tab = await openTab(1400, 900, false, false, true, { theme: 'md' });
    await closeOtherTabs?.(tab.targetId);
    await tab.send('Page.bringToFront');
    await tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const waitFor = waiter(tab);
    await tab.run(() => { document.querySelector('.views > .view.tab-active').f7View.router.navigate('/settings/'); return 1; });
    await waitFor(() => !!document.querySelector('.bc-desktop-settings--category[data-category="equipment"]'));
    await tab.run(() => { /** @type {HTMLElement} */ (document.querySelector('.bc-desktop-settings--category[data-category="equipment"]')).click(); return 1; });
    await waitFor(() => !!document.querySelector('.bc-desktop-cylinder-types'));
    await sleep(500);
    const card = await tab.run(() => ({
      text: document.querySelector('.bc-desktop-cylinder-types')?.textContent ?? '',
      page: document.querySelector('.bc-desktop-settings')?.textContent ?? '',
      rows: document.querySelectorAll('.bc-desktop-cylinder-types--row').length,
    }));
    expect('desktop: one list, no « Standard », no « autres types standard »', { standard: false, more: false, intro: true }, {
      standard: /Standard/.test(card.text), more: /autres types standard/.test(card.text), intro: card.text.includes('Les types de bouteilles de votre carnet, et ceux que vous ajoutez.'),
    });
    expect('desktop: no « Proposer les tailles standard »', { has: false }, { has: /tailles standard/i.test(card.page) });
    await tab.run(() => { /** @type {HTMLElement} */ (document.querySelector('.bc-desktop-cylinder-types--add-button')).click(); return 1; });
    await waitFor(() => document.querySelectorAll('.bc-desktop-cylinder-type .bc-cylinder-size-chips--chip').length > 0);
    // A size with a working pressure (« 10.0L » and « 11.1L » are size-only).
    const chip = await tab.run(() => [...document.querySelectorAll('.bc-desktop-cylinder-type .bc-cylinder-size-chips--chip')].map((c) => c.textContent.trim()).find((n) => /bar/.test(n)) ?? '');
    await tab.run((name) => { /** @type {HTMLElement} */ ([...document.querySelectorAll('.bc-desktop-cylinder-type .bc-cylinder-size-chips--chip')].find((c) => c.textContent.trim() === name)).click(); return 1; }, chip);
    await sleep(300);
    const filled = await tab.run(() => [...document.querySelectorAll('.bc-desktop-cylinder-type input')].map((i) => /** @type {HTMLInputElement} */ (i).value));
    expect('desktop: a chip fills the name, the volume and the pressure', { name: chip, volume: true, pressure: true }, { name: filled[0], volume: !!filled[1], pressure: !!filled[2] });
    await tab.run(() => {
      const save = [...document.querySelectorAll('.bc-desktop-cylinder-type button')].find((b) => /Enregistrer/.test(b.textContent));
      /** @type {HTMLElement|null} */ (save)?.click();
      return 1;
    });
    await waitFor(() => !document.querySelector('.bc-desktop-cylinder-type'));
    await sleep(500);
    const added = await tab.run((name) => [...document.querySelectorAll('.bc-desktop-cylinder-types--row')].map((r) => r.textContent.trim()).filter((r) => r.startsWith(name)), chip);
    expect('desktop: the saved type is one row, added by you and unused', { count: 1, added: true }, { count: added.length, added: /Ajouté par vous · dans aucune plongée/.test(added[0] ?? '') });
    await tab.run((name) => {
      const row = [...document.querySelectorAll('.bc-desktop-cylinder-types--row')].find((r) => r.textContent.trim().startsWith(name));
      /** @type {HTMLElement|null} */ (row)?.click();
      return 1;
    }, chip);
    await waitFor(() => !!document.querySelector('.bc-desktop-cylinder-type--delete'));
    const dialog = await tab.run(() => ({
      button: document.querySelector('.bc-desktop-cylinder-type--delete')?.textContent?.trim() ?? '',
      chips: document.querySelectorAll('.bc-desktop-cylinder-type .bc-cylinder-size-chips--chip').length,
    }));
    expect('desktop: « Modifier le type » has « Supprimer ce type » and no chips', { button: 'Supprimer ce type', chips: 0 }, dialog);
    await tab.run(() => { /** @type {HTMLElement} */ (document.querySelector('.bc-desktop-cylinder-type--delete')).click(); return 1; });
    await waitFor(() => !document.querySelector('.bc-desktop-cylinder-type'));
    await sleep(500);
    const left = await tab.run((name) => [...document.querySelectorAll('.bc-desktop-cylinder-types--row')].filter((r) => r.textContent.trim().startsWith(name)).length, chip);
    expect('desktop: the deleted type is gone from the list', { rows: 0 }, { rows: left });
    tab.ws.close();
  }
}
