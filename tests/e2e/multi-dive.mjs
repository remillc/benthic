// SPDX-License-Identifier: GPL-2.0
// Actions on several selected dives (tasks 2026-11-24-383, 384 and 385), run by tests/e2e/navigation.mjs (`--multi-dive-only`):
//  - « Décaler la date et l'heure… »: the dialog (wheels, preview), the shift of two dives, their interval, the undo;
//  - « Modifier ensemble… »: four tabs, one height from tab to tab, the new fields (Visibilité, Type de plongée, « Ajouter aux
//    notes »), one undoable change, no cylinder removed; the phone's sheet with the same tabs.
// The host must be built from this checkout (the shift and the new fields are in the core).

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function multiDiveFlows(h) {
  const { openTab, closeOtherTabs, sleep, expect, tapText, shot } = h;

  /** What the logbook holds of two dives: start and number, by id, and what the core has of their edited fields. */
  const snapshot = (tab, ids) =>
    tab.run(async (ids) => {
      const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /benthic-core[^/]*(\/core-api)?\.js|core-api\.js/.test(n));
      const { BenthicCore: core } = await import(url);
      const { logbook } = await import('/src/lib/logbook.svelte.js');
      const out = {};
      for (const id of ids) {
        const d = await core.getDive({ id });
        out[id] = {
          date: logbook.dives.find((x) => x.id === id)?.date ?? '',
          number: d.number,
          visibility: d.visibility,
          mode: d.divemode,
          notes: d.notes,
          cylinders: (d.cylinders ?? []).length,
        };
      }
      return out;
    }, ids);

  /** The text with its no-break spaces as plain spaces. */
  const plain = (text) => String(text ?? '').replace(/[\u00a0\u202f]/g, ' ');
  const minutes = (iso) => Date.parse(`${iso.slice(0, 19)}Z`) / 60000;

  /** Clicks the first visible element matching `selector` whose text matches `pattern`. */
  const click = (tab, selector, pattern) =>
    tab.run(
      (selector, pattern) => {
        const re = new RegExp(pattern);
        const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length && re.test((e.getAttribute('aria-label') || '') + ' ' + e.textContent));
        if (!el) return false;
        el.click();
        return true;
      },
      selector,
      pattern,
    );

  const waitFor = async (tab, check, ...args) => {
    for (let i = 0; i < 80; i++) {
      if (await tab.run(check, ...args).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  };

  // --- Desktop -------------------------------------------------------------------------------------------------------
  console.log('Multi-dive actions: desktop, 1440x900');
  const tab = await openTab(1440, 900, false, false, true, { theme: 'md' });
  await closeOtherTabs?.(tab.targetId);
  await tab.send('Page.bringToFront');
  await waitFor(tab, () => document.querySelectorAll('.bc-desktop-logbook--row[data-dive]').length >= 3);

  /** The two selected dives: rows 2 and 3 of the list. */
  const ids = await tab.run(() => {
    const rows = [...document.querySelectorAll('.bc-desktop-logbook--row[data-dive]')];
    const pick = (row, ctrl) => row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: ctrl }));
    pick(rows[1], false);
    pick(rows[2], true);
    return [rows[1], rows[2]].map((r) => Number(r.getAttribute('data-dive')));
  });
  await sleep(500);
  const menu = async (pattern) => {
    await tab.run((id) => {
      const row = document.querySelector(`.bc-desktop-logbook--row[data-dive="${id}"]`);
      const r = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 40, clientY: r.y + 10 }));
    }, ids[1]);
    await sleep(300);
    return click(tab, '[role=menuitem]', pattern);
  };

  const before = await snapshot(tab, ids);
  const menuTexts = await (async () => {
    await tab.run((id) => {
      const row = document.querySelector(`.bc-desktop-logbook--row[data-dive="${id}"]`);
      const r = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 40, clientY: r.y + 10 }));
    }, ids[1]);
    await sleep(300);
    const texts = await tab.run(() => [...document.querySelectorAll('[role=menuitem]')].map((e) => e.textContent.trim().replace(/\s+/g, ' ')));
    await tab.run(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await sleep(200);
    return texts;
  })();
  const at = menuTexts.findIndex((x) => /Modifier ensemble/.test(x));
  expect('desktop: « Décaler la date et l’heure… » follows « Modifier ensemble… » in the right-click menu', { next: true }, { next: /Décaler la date et l.heure/.test(menuTexts[at + 1] ?? '') });

  // « Décaler la date et l'heure… »: 1 h 05 later.
  await menu('Décaler la date');
  const dialog = await waitFor(tab, () => !!document.querySelector('.bc-shift-time [role=spinbutton]'));
  expect('desktop: the shift dialog opens', { open: true }, { open: dialog });
  const start = await tab.run(() => ({
    applyDisabled: document.querySelector('.bc-shift-time--apply')?.disabled ?? null,
    wheels: [...document.querySelectorAll('.bc-shift-time [role=spinbutton]')].map((w) => w.getAttribute('aria-valuenow')),
    intro: document.querySelector('.bc-md3-dialog--text')?.textContent ?? '',
    previewRows: document.querySelectorAll('.bc-shift-time--dive').length,
  }));
  expect('desktop: « Décaler » is disabled at zero; three wheels at 0; two preview rows', { disabled: true, wheels: '0,0,0', rows: 2 }, { disabled: start.applyDisabled, wheels: start.wheels.join(','), rows: start.previewRows });
  expect('desktop: the dialog says how many dives are selected', { two: true }, { two: /2 plongées sélectionnées/.test(plain(start.intro)) });
  // The arrow keys on the hours wheel, a typed number on the minutes wheel.
  await tab.run(() => {
    const [, hours, minutes] = document.querySelectorAll('.bc-shift-time [role=spinbutton]');
    hours.focus();
    hours.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    minutes.focus();
    minutes.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true }));
  });
  await sleep(500);
  const set = await tab.run(() => ({
    wheels: [...document.querySelectorAll('.bc-shift-time [role=spinbutton]')].map((w) => w.getAttribute('aria-valuenow')),
    disabled: document.querySelector('.bc-shift-time--apply')?.disabled,
    struck: [...document.querySelectorAll('.bc-shift-time--before')].map((e) => e.textContent.trim()),
    bold: [...document.querySelectorAll('.bc-shift-time--after')].map((e) => e.textContent.trim()),
  }));
  expect('desktop: arrow key and typed number set 1 h 05', { wheels: '0,1,5', disabled: false }, { wheels: set.wheels.join(','), disabled: set.disabled });
  const shown = (iso) => iso.slice(11, 16).replace(/^0/, '');
  expect('desktop: the preview shows the old time struck through and the new one in bold', { struck: true, bold: true }, {
    struck: set.struck.length === 2 && set.struck.every((x, i) => x.replace(/\D/g, '').length >= 3 && x !== set.bold[i]),
    bold: set.bold.length === 2 && set.bold.every((x) => x.length > 0),
  });
  if (process.env.BC_SHOTS) await shot(tab, 'multi-shift-dialog');
  await tab.run(() => document.querySelector('.bc-shift-time--apply').click());
  await waitFor(tab, () => !document.querySelector('.bc-shift-time'));
  await sleep(600);
  const after = await snapshot(tab, ids);
  expect('desktop: both dives start 1 h 05 later', { first: 65, second: 65 }, { first: minutes(after[ids[0]].date) - minutes(before[ids[0]].date), second: minutes(after[ids[1]].date) - minutes(before[ids[1]].date) });
  expect('desktop: the interval between them is the same, numbers unchanged', { gap: minutes(before[ids[0]].date) - minutes(before[ids[1]].date), same: true }, {
    gap: minutes(after[ids[0]].date) - minutes(after[ids[1]].date),
    same: after[ids[0]].number === before[ids[0]].number && after[ids[1]].number === before[ids[1]].number,
  });
  const snack = await tab.run(() => document.querySelector('.toast')?.textContent ?? '');
  expect('desktop: the snackbar says « 2 plongées décalées »', { said: true }, { said: /2 plongées décalées/.test(plain(snack)) });
  await click(tab, '.toast button, .toast .toast-button', 'Annuler');
  await sleep(900);
  const undone = await snapshot(tab, ids);
  expect('desktop: « Annuler » puts both start times back', { first: before[ids[0]].date, second: before[ids[1]].date }, { first: undone[ids[0]].date, second: undone[ids[1]].date });

  // « Modifier ensemble… »: four tabs, one height, the new fields.
  await tab.run(() => {
    const rows = [...document.querySelectorAll('.bc-desktop-logbook--row[data-dive]')];
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    rows[2].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
  });
  await sleep(400);
  await menu('Modifier ensemble');
  await waitFor(tab, () => !!document.querySelector('.bc-edit-together [role=tab]'));
  const tabs = await tab.run(() => ({
    names: [...document.querySelectorAll('.bc-edit-together [role=tab]')].map((e) => e.textContent.trim()),
    subtitle: document.querySelector('.bc-edit-together .bc-md3-dialog--text')?.textContent ?? '',
    title: document.querySelector('.bc-edit-together h2')?.textContent ?? '',
    note: document.querySelector('.bc-edit-together .bc-md3-dialog--footer')?.textContent?.trim() ?? '',
  }));
  expect('desktop: four tabs, no « Carte »', { names: 'Informations,Équipement,Gaz,Notes' }, { names: tabs.names.join(',') });
  expect('desktop: the subtitle is only the dive numbers', { ok: true }, { ok: /^N°\s*\d+ et \d+$/.test(tabs.subtitle.replace(/[\u00a0\u202f]/g, ' ').trim()) });
  expect('desktop: the title and the note above the buttons', { title: 'Modifier 2 plongées', note: 'La date, la durée, la profondeur, les bouteilles et le voyage restent propres à chaque plongée.' }, { title: plain(tabs.title.trim()), note: plain(tabs.note) });
  if (process.env.BC_SHOTS) await shot(tab, 'multi-edit-info');
  const heights = [];
  for (const name of ['Informations', 'Équipement', 'Gaz', 'Notes']) {
    await click(tab, '.bc-edit-together [role=tab]', name);
    await sleep(250);
    heights.push(await tab.run(() => Math.round(document.querySelector('.bc-edit-together .bc-md3-dialog--surface').getBoundingClientRect().height)));
  }
  expect('desktop: the dialog keeps one height from tab to tab', { same: true }, { same: new Set(heights).size === 1 });
  // Visibilité (4 stars) on Informations, CCR on Gaz, a note on Notes.
  await click(tab, '.bc-edit-together [role=tab]', 'Informations');
  await sleep(200);
  await tab.run(() => document.querySelector('.bc-edit-together [data-field=visibility] [data-star="4"]').click());
  await click(tab, '.bc-edit-together [role=tab]', 'Gaz');
  await sleep(200);
  await click(tab, '.bc-edit-together [role=radio]', 'Recycleur CCR');
  await click(tab, '.bc-edit-together [role=tab]', 'Notes');
  await sleep(200);
  await tab.run(() => {
    const area = document.querySelector('.bc-edit-together textarea');
    area.value = 'Ligne ajoutée par le test';
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  if (process.env.BC_SHOTS) await shot(tab, 'multi-edit-notes');
  await click(tab, '.bc-edit-together [role=tab]', 'Informations');
  await sleep(200);
  const kept = await tab.run(() => document.querySelector('.bc-edit-together [data-field=visibility] [aria-checked=true]')?.getAttribute('data-star'));
  expect('desktop: switching tabs keeps what was changed', { star: '4' }, { star: kept });
  const applyLabel = await tab.run(() => document.querySelector('.bc-edit-together .button-fill')?.textContent.trim());
  expect('desktop: « Appliquer aux 2 plongées »', { label: 'Appliquer aux 2 plongées' }, { label: plain(applyLabel) });
  await tab.run(() => document.querySelector('.bc-edit-together .button-fill').click());
  await waitFor(tab, () => !document.querySelector('.bc-edit-together'));
  await sleep(900);
  const edited = await snapshot(tab, ids);
  expect('desktop: both dives have the visibility, the mode and the appended note; cylinders intact', { ok: true }, {
    ok: ids.every((id) => edited[id].visibility === 4 && edited[id].mode === 'CCR' && edited[id].notes.endsWith('Ligne ajoutée par le test') && edited[id].cylinders === before[id].cylinders),
  });
  expect('desktop: the note is on a new line after the existing notes', { ok: true }, {
    ok: ids.every((id) => (before[id].notes ? edited[id].notes === `${before[id].notes}\nLigne ajoutée par le test` : edited[id].notes === 'Ligne ajoutée par le test')),
  });
  await click(tab, '.toast button, .toast .toast-button', 'Annuler');
  await sleep(900);
  const restored = await snapshot(tab, ids);
  expect('desktop: one « Annuler » restores everything', { ok: true }, {
    ok: ids.every((id) => restored[id].visibility === before[id].visibility && restored[id].mode === before[id].mode && restored[id].notes === before[id].notes),
  });
  tab.ws.close();

  // --- Phone ---------------------------------------------------------------------------------------------------------
  console.log('Multi-dive actions: Android phone, 390x844');
  const phone = await openTab(390, 844, true, false, false, { theme: 'md' });
  await closeOtherTabs?.(phone.targetId);
  await waitFor(phone, () => document.querySelectorAll('.page-current a.bc-dive-row--link').length >= 3);
  const rowBox = (n) =>
    phone.run((n) => {
      const r = document.querySelectorAll('.page-current a.bc-dive-row--link')[n]?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 30) } : null;
    }, n);
  const first = await rowBox(1);
  await phone.touch('touchStart', first.x, first.y);
  await sleep(900);
  await phone.touch('touchEnd', first.x, first.y);
  await sleep(600);
  const second = await rowBox(2);
  await phone.tapAt(second.x, second.y);
  await sleep(500);
  const checked = await phone.run(() => [...document.querySelectorAll('.page-current [role=checkbox][aria-checked=true]')].length);
  expect('phone: two dives are selected', { n: 2 }, { n: checked });
  const phoneIds = await phone.run(async () => {
    const { logbook } = await import('/src/lib/logbook.svelte.js');
    return logbook.dives.slice(1, 3).map((d) => d.id);
  });
  await click(phone, '.page-current button', 'Plus d.options');
  await waitFor(phone, () => !!document.querySelector('.bc-logbook-menu.modal-in, .bc-logbook-menu.popover-on'));
  await sleep(400);
  const items = await phone.run(() => [...document.querySelectorAll('.bc-logbook-menu a')].map((e) => e.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean));
  const i = items.findIndex((x) => /Modifier ensemble/.test(x));
  expect('phone: « Décaler la date et l’heure… » follows « Modifier ensemble… » in the ⋮ menu', { next: true }, { next: /Décaler la date et l.heure/.test(items[i + 1] ?? ''), items: items.slice(0, 14).join(' | ') });
  // The ⋮ menu is the logbook's popover; the sheet is opened through the route it navigates to (« Modifier ensemble… »).
  await phone.run(() => {
    document.querySelector('.view-main').f7View.app.popover.close('.bc-logbook-menu', false);
    return 1;
  });
  await sleep(600);
  await phone.run((ids) => {
    document.querySelector('.page-current').closest('.view').f7View.router.navigate(`/dives/edit-together?ids=${ids.join(',')}`);
    return 1;
  }, phoneIds);
  await waitFor(phone, () => !!document.querySelector('.bc-multi-edit .bc-multi-edit-tabs'));
  if (process.env.BC_SHOTS) await shot(phone, 'multi-edit-phone');
  const phoneTabs = await phone.run(() => ({
    names: [...document.querySelectorAll('.bc-multi-edit .bc-multi-edit-tabs [role=tab]')].map((e) => e.textContent.trim()),
    subtitle: document.querySelector('.bc-multi-edit .subtitle')?.textContent ?? '',
    foot: document.querySelector('.bc-multi-edit .bc-multi-edit--footnote')?.textContent ?? '',
  }));
  expect('phone: four tabs and a subtitle with the dive numbers', { names: 'Informations,Équipement,Gaz,Notes', numbers: true }, { names: phoneTabs.names.join(','), numbers: /^N°\s*\d+ et \d+$/.test(phoneTabs.subtitle.replace(/[\u00a0\u202f]/g, ' ').trim()) });
  expect('phone: the note under the fields has no sentence about « Plusieurs valeurs »', { none: true }, { none: !/Plusieurs valeurs/.test(phoneTabs.foot) });
  // The sheet may still be sliding in (a hidden page has no box): the tab is pressed in the DOM.
  await phone.run(() => [...document.querySelectorAll('.bc-multi-edit .bc-multi-edit-tabs [role=tab]')].find((e) => e.textContent.trim() === 'Gaz')?.click());
  await sleep(300);
  const modes = await phone.run(() => [...document.querySelectorAll('.bc-multi-edit .bc-desktop-segments [role=radio]')].map((e) => e.textContent.trim()));
  expect('phone: the dive type has the short labels', { modes: 'Ouvert,CCR,pSCR,Apnée' }, { modes: modes.join(',') });
  phone.ws.close();
}
