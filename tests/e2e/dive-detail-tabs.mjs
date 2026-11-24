// SPDX-License-Identifier: GPL-2.0
// The dive detail's tabs on every device (tasks 2026-11-24-382, 386 and 387), run by tests/e2e/navigation.mjs
// (`--dive-tabs-only`).
//  - desktop: the dive type of the Gaz tab (the four modes, the cards that follow, the cylinders kept), the kit menu, « Date et
//    heure » and the Signatures card of the Informations tab;
//  - tablet, landscape and portrait: the tabs under the header, every field edited in place, the ⋮ menu without « Modifier la plongée »;
//  - phone: one page of five groups, the tab row sticky and following the scroll, a tap on a tab scrolling to its group, a list
//    field opening a bottom sheet, the date picker, the ⋮ menu.
// With BC_SHOTS=<folder> the screens are also saved as screenshots, for a visual check.

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function diveDetailTabsFlows(h) {
  const { openTab, closeOtherTabs, sleep, expect, shot, tapDive } = h;

  /** A tab made ready for a block: the visible one, the live page only. @param {any} tab */
  const prepare = async (tab) => {
    await tab.run(() => {
      window.__liveAll = (selector) => [...document.querySelectorAll(selector)].filter((e) => !e.closest('.bc-pane-opening'));
      window.__live = (selector) => window.__liveAll(selector)[0] ?? null;
      return 1;
    });
    await closeOtherTabs?.(tab.targetId);
    await tab.send('Page.bringToFront');
    await tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await tab.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  };
  /** Polls the page until `check` is true. @param {any} tab @param {() => boolean} check */
  const waitFor = async (tab, check, arg) => {
    for (let i = 0; i < 100; i++) {
      if (await tab.run(check, arg).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  };
  const click = (tab, selector) => tab.run((s) => (/** @type {HTMLElement|null} */ (window.__live(s))?.click(), 1), selector);

  // ================================================================================================================
  console.log('Desktop, 1440x900: the Gaz tab by dive type, the kit menu, Date et heure and Signatures');
  const desk = await openTab(1440, 900, false, false, true, { theme: 'md' });
  await prepare(desk);
  await waitFor(desk, () => !!window.__live('.bc-desktop-logbook--row'));
  await desk.run(() => window.__benthicPlusAccount({ signedIn: true, subscribed: true, email: 'diver@benthic.test' }));
  await sleep(800);
  // The sample dive with cylinders: the first row.
  await desk.run(() => (window.__live('.bc-desktop-logbook--row')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), 1));
  await waitFor(desk, () => !!window.__live('[role="tab"][data-tab="gas"]'));

  // --- Informations: Date et heure first, Signatures after Personnes (Benthic+) -------------------------------------
  await click(desk, '[role="tab"][data-tab="info"]');
  await waitFor(desk, () => !!window.__live('[data-card="tags"]'));
  let state = await desk.run(() => ({ names: [...window.__live('.bc-desktop-dive-fields--info').querySelectorAll('.bc-desktop-equipment-card')].map((c) => c.getAttribute('data-card')).join(',') }));
  expect('desktop Informations: Date et heure first, Signatures after Personnes', { names: 'datetime,site,people,signatures,rating,conditions,tags' }, state);
  state = await desk.run(() => ({
    labels: [...window.__live('[data-card="datetime"]').querySelectorAll('.bc-desktop-pick-field--label')].map((l) => l.textContent.trim()).join(','),
    note: /clic droit/.test(window.__live('[data-card="datetime"]').textContent),
    sign: !!window.__live('[data-card="signatures"] [data-field="sign"]'),
  }));
  expect('desktop Date et heure: « Date » and « Entrée dans l’eau », the right-click helper, « Faire signer » in the Signatures card', { labels: 'Date,Entrée dans l’eau', note: true, sign: true }, state);
  if (process.env.BC_SHOTS) await shot(desk, 'dive-tabs-desktop-info');
  await click(desk, '[data-card="datetime"] [data-field="date"] button');
  await sleep(500);
  state = await desk.run(() => ({ dialog: !!document.querySelector('.bc-md3-dialog') }));
  expect('desktop: the date opens the MD3 date picker', { dialog: true }, state);
  await desk.run(() => (document.querySelector('.bc-md3-dialog')?.dispatchEvent(new CustomEvent('bc-cancel')), 1));
  await sleep(300);

  // --- Gaz: the four dive types ------------------------------------------------------------------------------------
  await click(desk, '[role="tab"][data-tab="gas"]');
  await waitFor(desk, () => !!window.__live('[data-field="divemode"]'));
  const gas = () =>
    desk.run(() => {
      const root = window.__live('.bc-desktop-dive-fields--gas');
      const radios = [...(root?.querySelectorAll('[data-field="divemode"] [role="radio"]') ?? [])];
      return {
        radios: radios.map((r) => r.textContent.trim()).join(','),
        checked: radios.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent.trim()).join(','),
        tiles: [...(root?.querySelectorAll('[data-tile]') ?? [])].map((t) => t.getAttribute('data-tile')).join(','),
        wide: Math.round(root?.querySelector('.bc-desktop-gas-cards--wide')?.getBoundingClientRect().width ?? 0),
        cards: [...(root?.querySelectorAll('.bc-desktop-equipment-card') ?? [])].map((c) => c.getAttribute('data-card')).join(','),
        sac: /SAC/.test(root?.textContent ?? ''),
        noGas: !!root?.querySelector('[data-field="no-gas"]'),
        fieldBlocks: root?.querySelectorAll('[data-cylinder]').length ?? 0,
        rebreatherDrawings: root?.querySelectorAll('.bc-rebreather-drawing').length ?? 0,
      };
    });
  /** The dive's cylinders as the core has them. @param {number} id */
  const cylindersOf = (id) => desk.run(async (n) => JSON.parse(await window.benthicDesktop.core('getDive', { id: n })).cylinders.length, id);
  const diveId = await desk.run(() => Number(window.__live('.bc-desktop-logbook--row').getAttribute('data-dive')));
  // A closed-circuit dive needs a diluent and an oxygen cylinder: the dive's first cylinder becomes the diluent and an oxygen one is added.
  await desk.run(async (id) => {
    const { saveDiveChanges } = await import('/src/lib/logbook.svelte.js');
    await saveDiveChanges(id, {
      cylinders: [
        JSON.stringify({ index: 0, use: 'diluent' }),
        JSON.stringify({ index: -1, description: '', use: 'oxygen', sizeMl: 3000, workingPressureMbar: 200000, startMbar: 200000, endMbar: 150000, o2Permille: 1000, hePermille: 0 }),
      ],
    });
    return 1;
  }, diveId);
  await sleep(600);
  const cylinderCount = { id: diveId, n: await cylindersOf(diveId) };
  await click(desk, '[role="tab"][data-tab="equipment"]');
  await click(desk, '[role="tab"][data-tab="gas"]');
  await sleep(500);
  state = await gas();
  expect('desktop Gaz: the dive type selector holds « Circuit ouvert, Recycleur CCR, Recycleur pSCR, Apnée »', { radios: 'Circuit ouvert,Recycleur CCR,Recycleur pSCR,Apnée' }, state);
  const openCircuit = state;
  if (process.env.BC_SHOTS) await shot(desk, 'dive-tabs-desktop-gas-oc');

  const choose = async (label) => {
    await desk.run((l) => ([...window.__liveAll('[data-field="divemode"] [role="radio"]')].find((r) => r.textContent.trim() === l)?.click(), 1), label);
    await sleep(900);
  };
  for (const [label, check] of [
    ['Recycleur CCR', 'ccr'],
    ['Recycleur pSCR', 'pscr'],
    ['Apnée', 'apnee'],
    ['Circuit ouvert', 'oc'],
  ]) {
    await choose(label);
    state = await gas();
    const dive = await cylindersOf(cylinderCount.id);
    if (check === 'ccr') expect('desktop CCR: « Recycleur CCR » checked, the rebreather tile (308 px) then ordinary tiles, a « Recycleur » card with the setpoints, no SAC', { checked: 'Recycleur CCR', wide: 308, recycleur: true, sac: false, drawing: true }, { checked: state.checked, wide: state.wide, recycleur: state.cards.includes('rebreather'), sac: state.sac, drawing: state.rebreatherDrawings > 0 });
    if (check === 'pscr') expect('desktop pSCR: « Recycleur pSCR » checked, the one-cylinder tile, no setpoints, no SAC', { checked: 'Recycleur pSCR', recycleur: false, sac: false, drawing: true }, { checked: state.checked, recycleur: state.cards.includes('rebreather'), sac: state.sac, drawing: state.rebreatherDrawings > 0 });
    if (check === 'apnee') expect('desktop apnée: one card « Pas de gaz en apnée », no tile', { checked: 'Apnée', noGas: true, tiles: '' }, { checked: state.checked, noGas: state.noGas, tiles: state.tiles });
    if (check === 'oc') expect('desktop: back in open circuit the tiles are those of the start, « Consommation » is back, the cylinders are intact', { checked: 'Circuit ouvert', tiles: openCircuit.tiles, consumption: true }, { checked: state.checked, tiles: state.tiles, consumption: state.cards.includes('consumption') || /Consommation/.test(await desk.run(() => window.__live('.bc-desktop-dive-fields--gas').textContent)) });
    expect(`desktop ${label}: the dive keeps its ${cylinderCount.n} cylinder(s)`, { n: cylinderCount.n }, { n: dive });
    if (process.env.BC_SHOTS) await shot(desk, `dive-tabs-desktop-gas-${check}`);
  }

  // --- Équipement: the kit as a menu -------------------------------------------------------------------------------
  await click(desk, '[role="tab"][data-tab="equipment"]');
  await waitFor(desk, () => !!window.__live('[data-card="kit"] [data-field="kit"]'));
  state = await desk.run(() => ({ changeKit: /Changer de kit/.test(window.__live('[data-card="kit"]').textContent), field: !!window.__live('[data-card="kit"] [data-field="kit"]') }));
  expect('desktop Équipement: no « Changer de kit », the kit is a grey field', { changeKit: false, field: true }, state);
  await click(desk, '[data-card="kit"] [data-field="kit"]');
  await sleep(500);
  state = await desk.run(() => ({ menu: [...document.querySelectorAll('.bc-row-menu--label')].map((l) => l.textContent.trim()).join('|') }));
  expect('desktop kit menu: « Plongée précédente » (when a dive precedes it) and « Gérer les kits » at the end', { manage: true }, { manage: state.menu.endsWith('Gérer les kits') });
  if (process.env.BC_SHOTS) await shot(desk, 'dive-tabs-desktop-kit-menu');
  await desk.run(() => (document.querySelector('.bc-row-menu')?.dispatchEvent(new CustomEvent('bc-cancel')), 1));
  desk.ws.close();

  // ================================================================================================================
  for (const [label, width, height] of [
    ['landscape', 1280, 800],
    ['portrait', 800, 1280],
  ]) {
    console.log(`Tablet ${label}, ${width}x${height}: tabs and in-place editing`);
    const tablet = await openTab(width, height, true, false, false, { theme: 'md' });
    await prepare(tablet);
    await tablet.run(() => window.__benthicPlusAccount({ signedIn: true, subscribed: true, email: 'diver@benthic.test' }));
    await sleep(800);
    await tapDive(tablet);
    await waitFor(tablet, () => !!window.__live('.bc-dive-detail [role="tab"][data-tab="gas"]'));
    state = await tablet.run(() => {
      const bar = document.querySelector('.page-current .navbar, .page-master-detail .navbar');
      return {
        tabs: [...window.__liveAll('.bc-dive-detail [role="tablist"] [role="tab"]')].map((x) => x.textContent.trim()).join(','),
        floating: !!document.querySelector('.bc-floating-toolbar'),
        edit: [...document.querySelectorAll('.bc-dive-detail a, .bc-dive-detail button')].some((b) => /^\s*Modifier la plongée\s*$/.test(b.textContent)),
        more: !!document.querySelector('.bc-dive-detail .navbar a[data-popover], .bc-dive-detail .navbar .popover-open'),
        bar: !!bar,
      };
    });
    expect(`tablet ${label}: the tabs Informations, Équipement, Gaz, Notes, Carte, no floating bar`, { tabs: 'Informations,Équipement,Gaz,Notes,Carte', floating: false }, state);
    if (process.env.BC_SHOTS) await shot(tablet, `dive-tabs-tablet-${label}-info`);
    for (const key of ['equipment', 'gas', 'notes', 'map']) {
      await click(tablet, `.bc-dive-detail [role="tab"][data-tab="${key}"]`);
      await sleep(600);
      if (process.env.BC_SHOTS) await shot(tablet, `dive-tabs-tablet-${label}-${key}`);
    }
    // In-place editing without leaving the detail: the notes, then the dive type, then the suit.
    const route = await tablet.run(() => document.querySelector('.bc-dive-detail')?.f7Page?.route?.url ?? '');
    await click(tablet, '.bc-dive-detail [role="tab"][data-tab="notes"]');
    await sleep(500);
    const note = `tablet ${label} ${Date.now()}`;
    await tablet.run((text) => {
      const rest = window.__live('.bc-dive-detail [data-field="notes"] .bc-desktop-edit-field--rest');
      rest.focus();
      return 1;
    }, note);
    await sleep(300);
    await tablet.run((text) => {
      const area = window.__live('.bc-dive-detail [data-field="notes"] textarea');
      area.value = text;
      area.dispatchEvent(new Event('input', { bubbles: true }));
      area.blur();
      return 1;
    }, note);
    await sleep(800);
    state = await tablet.run(() => ({ shown: window.__live('.bc-dive-detail [data-field="notes"]')?.textContent ?? '', same: (document.querySelector('.bc-dive-detail')?.f7Page?.route?.url ?? '') }));
    expect(`tablet ${label}: the notes are edited in place and kept, the page does not change`, { shown: true, same: route }, { shown: state.shown.includes(note), same: state.same });
    await click(tablet, '.bc-dive-detail [role="tab"][data-tab="gas"]');
    await sleep(500);
    await tablet.run(() => ([...window.__liveAll('.bc-dive-detail [data-field="divemode"] [role="radio"]')].find((r) => /pSCR/.test(r.textContent))?.click(), 1));
    await sleep(800);
    state = await tablet.run(() => ({ checked: [...window.__liveAll('.bc-dive-detail [data-field="divemode"] [role="radio"]')].filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent.trim()).join(','), labels: [...window.__liveAll('.bc-dive-detail [data-field="divemode"] [role="radio"]')].map((r) => r.textContent.trim()).join(',') }));
    expect(`tablet ${label}: the dive type is set in place`, { checked: 'pSCR' }, state);
    expect(`tablet ${label}: the narrow card takes the short labels`, { labels: 'Ouvert,CCR,pSCR,Apnée' }, state);
    if (process.env.BC_SHOTS) await shot(tablet, `dive-tabs-tablet-${label}-pscr`);
    await tablet.run(() => ([...window.__liveAll('.bc-dive-detail [data-field="divemode"] [role="radio"]')].find((r) => /Ouvert/.test(r.textContent))?.click(), 1));
    await sleep(500);
    // The ⋮ menu: the actions, no « Modifier la plongée ».
    await tablet.run(() => (window.__live('.bc-dive-detail .navbar a.popover-open')?.click(), 1));
    await sleep(600);
    state = await tablet.run(() => ({ items: [...document.querySelectorAll('.popover.modal-in .item-title')].map((e) => e.textContent.trim()).join('|') }));
    expect(`tablet ${label}: the ⋮ menu holds the actions without « Modifier la plongée »`, { items: 'Planifier depuis cette plongée|Partager|Renuméroter la plongée|Renuméroter à partir d’ici|Supprimer la plongée' }, state);
    if (process.env.BC_SHOTS) await shot(tablet, `dive-tabs-tablet-${label}-menu`);
    tablet.ws.close();
  }

  // ================================================================================================================
  console.log('Phone, 390x844: one page of five groups, the tab row sticky');
  const phone = await openTab(390, 844, true, false, false, { theme: 'md' });
  await prepare(phone);
  await phone.run(() => window.__benthicPlusAccount({ signedIn: true, subscribed: true, email: 'diver@benthic.test' }));
  await sleep(800);
  if (process.env.BC_SHOTS) await shot(phone, 'dive-tabs-phone-start');
  await tapDive(phone);
  await waitFor(phone, () => !!window.__live('.bc-dive-detail [role="tab"][data-tab="gas"]'));
  await sleep(600);
  if (process.env.BC_SHOTS) await shot(phone, 'dive-tabs-phone-top');
  state = await phone.run(() => ({
    tabs: [...window.__liveAll('.bc-dive-detail [role="tab"]')].map((x) => x.textContent.trim()).join(','),
    groups: [...document.querySelectorAll('.bc-dive-detail [data-group]')].map((g) => g.getAttribute('data-group')).join(','),
    titles: [...document.querySelectorAll('.bc-dive-detail .bc-dive-detail--group-title')].map((g) => g.textContent.trim()).join(','),
    floating: !!document.querySelector('.bc-floating-toolbar'),
  }));
  if (!state.tabs) console.log('   page logs:', JSON.stringify(phone.logs?.slice(-6)), await phone.run(() => document.querySelector('.page-current')?.className));
  expect('phone: five tabs and their five groups with their titles, no floating bar', { tabs: 'Informations,Équipement,Gaz,Notes,Carte', groups: 'info,equipment,gas,notes,map', titles: 'Informations,Équipement,Gaz,Notes,Carte', floating: false }, state);
  // Scrolled: the row sticks under the top bar.
  await phone.run(() => (document.querySelector('.bc-dive-detail .page-content').scrollTo(0, 1200), 1));
  await sleep(500);
  console.log('   scroll:', JSON.stringify(await phone.run(() => { const pc = document.querySelector('.bc-dive-detail .page-content'); return { top: pc.scrollTop, sh: pc.scrollHeight, ch: pc.clientHeight, ov: getComputedStyle(pc).overflowY, pos: getComputedStyle(document.querySelector('.bc-dive-detail .bc-dive-detail--tabs-wrap')).position }; })));
  state = await phone.run(() => {
    const wrap = document.querySelector('.bc-dive-detail .bc-dive-detail--tabs-wrap').getBoundingClientRect();
    const bar = document.querySelector('.bc-dive-detail .navbar').getBoundingClientRect();
    return { stuck: Math.abs(wrap.top - bar.bottom) <= 2, selected: document.querySelector('.bc-dive-detail [role="tab"][aria-selected="true"]')?.textContent.trim() };
  });
  expect('phone: scrolled, the tab row sits right under the top bar', { stuck: true }, { stuck: state.stuck });
  if (process.env.BC_SHOTS) await shot(phone, 'dive-tabs-phone-scrolled');
  await phone.run(() => (document.querySelector('.bc-dive-detail [role="tab"][data-tab="gas"]').click(), 1));
  await sleep(1200);
  state = await phone.run(() => {
    const group = document.querySelector('.bc-dive-detail [data-group="gas"]').getBoundingClientRect();
    const wrap = document.querySelector('.bc-dive-detail .bc-dive-detail--tabs-wrap').getBoundingClientRect();
    return { gap: Math.round(group.top - wrap.bottom), reached: group.top >= wrap.bottom - 4 && group.top <= wrap.bottom + 80, selected: document.querySelector('.bc-dive-detail [role="tab"][aria-selected="true"]')?.textContent.trim() };
  });
  expect('phone: a tap on « Gaz » scrolls to its group and selects the tab', { reached: true, selected: 'Gaz' }, state);
  if (process.env.BC_SHOTS) await shot(phone, 'dive-tabs-phone-gas');
  // A list field opens a bottom sheet, never a new page; a choice is saved at once.
  await phone.run(() => (document.querySelector('.bc-dive-detail [data-group="info"]').scrollIntoView(), 1));
  await sleep(500);
  const page = await phone.run(() => document.querySelector('.bc-dive-detail').f7Page.route.url);
  await phone.run(() => (document.querySelector('.bc-dive-detail [data-card="site"] .bc-desktop-edit-field--rest').click(), 1));
  await sleep(700);
  state = await phone.run(() => ({ sheet: !!document.querySelector('.bc-detail-sheet'), rows: [...document.querySelectorAll('.bc-detail-sheet--label')].map((e) => e.textContent.trim()).join('|'), cancel: !!document.querySelector('.bc-detail-sheet--cancel') }));
  expect('phone: the site opens a bottom sheet with « Annuler » and the logbook’s sites', { sheet: true, cancel: true, lock: true }, { sheet: state.sheet, cancel: state.cancel, lock: /Lock 23/.test(state.rows) });
  if (process.env.BC_SHOTS) await shot(phone, 'dive-tabs-phone-site-sheet');
  await phone.run(() => (document.querySelector('.bc-detail-sheet [data-value="Lock 23"]').click(), 1));
  await sleep(1200);
  state = await phone.run(() => ({ site: document.querySelector('.bc-dive-detail .bc-dive-detail--site')?.textContent.trim(), sheet: !!document.querySelector('.bc-detail-sheet'), page: document.querySelector('.bc-dive-detail').f7Page.route.url }));
  expect('phone: choosing a site saves it at once, the sheet closes, the page is the same', { site: 'Lock 23', sheet: false, page }, state);
  await phone.run(() => (document.querySelector('.bc-dive-detail [data-field="date"] button').click(), 1));
  await sleep(600);
  state = await phone.run(() => ({ picker: !!document.querySelector('.bc-md3-dialog') }));
  expect('phone: the date opens the date picker over the page', { picker: true }, state);
  await phone.run(() => (document.querySelector('.bc-md3-dialog').dispatchEvent(new CustomEvent('bc-cancel')), 1));
  await sleep(400);
  await phone.run(() => (document.querySelector('.bc-dive-detail .navbar a.popover-open').click(), 1));
  await sleep(600);
  state = await phone.run(() => ({ items: [...document.querySelectorAll('.popover.modal-in .item-title')].map((e) => e.textContent.trim()).join('|') }));
  expect('phone: the ⋮ menu holds the actions, no « Modifier »', { items: 'Planifier depuis cette plongée|Partager|Renuméroter la plongée|Renuméroter à partir d’ici|Supprimer la plongée' }, state);
  phone.ws.close();

  // ================================================================================================================
  console.log('iPhone, 390x844: « ‹ Carnet », the circled menu, the segmented control');
  const iphone = await openTab(390, 844, true, false, false, { theme: 'ios' });
  await prepare(iphone);
  await tapDive(iphone);
  await waitFor(iphone, () => !!window.__live('.bc-dive-detail [role="tab"][data-tab="gas"]'));
  await sleep(600);
  state = await iphone.run(() => ({
    tabs: [...window.__liveAll('.bc-dive-detail [role="tab"]')].map((x) => x.textContent.trim()).join(','),
    infoName: window.__live('.bc-dive-detail [role="tab"][data-tab="info"]').getAttribute('aria-label'),
    back: document.querySelector('.bc-dive-detail .navbar .left a')?.textContent.trim(),
    menu: !!document.querySelector('.bc-dive-detail .navbar .right a.popover-open'),
    edit: [...document.querySelectorAll('.bc-dive-detail .navbar a')].some((a) => /^(Modifier|Edit)$/.test(a.textContent.trim())),
  }));
  expect('iPhone: « Infos, Équipement, Gaz, Notes, Carte » with « Informations » as the name of the first, « ‹ Carnet », the menu, no « Modifier »', { tabs: 'Infos,Équipement,Gaz,Notes,Carte', infoName: 'Informations', back: 'Carnet', menu: true, edit: false }, state);
  await iphone.run(() => (document.querySelector('.bc-dive-detail .page-content').scrollTo(0, 1500), 1));
  await sleep(500);
  state = await iphone.run(() => {
    const wrap = document.querySelector('.bc-dive-detail .bc-dive-detail--tabs-wrap').getBoundingClientRect();
    const bar = document.querySelector('.bc-dive-detail .navbar').getBoundingClientRect();
    return { stuck: Math.abs(wrap.top - bar.bottom) <= 2, title: document.querySelector('.bc-dive-detail .bc-dive-detail--bar-title-shown')?.textContent.trim() };
  });
  expect('iPhone: scrolled, the segmented control sits under the navigation bar, whose title is the site', { stuck: true, title: true }, { stuck: state.stuck, title: !!state.title });
  if (process.env.BC_SHOTS) await shot(iphone, 'dive-tabs-iphone-scrolled');
  iphone.ws.close();
}
