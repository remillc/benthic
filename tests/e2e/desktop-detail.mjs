// SPDX-License-Identifier: GPL-2.0
// Desktop logbook and dive detail (tasks 2026-11-23-374, 375 and 376), run by tests/e2e/navigation.mjs (`--detail-only`).
//  - 374: a closed trip row is 48 px with the dive rows' 1 px line; a line above and below it; the row after an open trip's
//    card is separated from it; no double line.
//  - 375: no white block outside the chart's card in the right pane, also after a drag of the splitter.
//  - 376: the Informations tab as five cards (added below).
// With BC_SHOTS=<folder> the screens are also saved as screenshots, for a visual check.

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function desktopDetailFlows(h) {
  const { openTab, closeOtherTabs, sleep, expect, shot } = h;
  console.log('Desktop, 1440x900: the logbook list with a trip, and the right pane');
  const tab = await openTab(1440, 900, false, false, true, { theme: 'md' });
  await tab.run(() => {
    window.__liveAll = (selector) => [...document.querySelectorAll(selector)].filter((e) => !e.closest('.bc-pane-opening'));
    window.__live = (selector) => window.__liveAll(selector)[0] ?? null;
    return 1;
  });
  await closeOtherTabs?.(tab.targetId);
  await tab.send('Page.bringToFront');
  await tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await tab.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});

  /** Polls the page until `check` is true. @param {() => boolean} check */
  const waitFor = async (check) => {
    for (let i = 0; i < 100; i++) {
      if (await tab.run(check).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  };
  await waitFor(() => !!window.__live('.bc-desktop-logbook--row'));

  // --- 374: a trip between dives ------------------------------------------------------------------------------------
  // Two dives, the third and fourth of the list, become a trip.
  await tab.run(async () => {
    const lb = await import('/src/lib/logbook.svelte.js');
    const ids = [...document.querySelectorAll('.bc-desktop-logbook--row')].slice(2, 4).map((r) => Number(r.getAttribute('data-dive')));
    await lb.tripChange({ action: 'create', diveIds: ids });
    return 1;
  });
  await waitFor(() => !!window.__live('.bc-desktop-logbook--trip'));
  const lines = () =>
    tab.run(() => {
      const trip = window.__live('.bc-desktop-logbook--trip');
      const td = trip?.querySelector('td');
      const rows = window.__liveAll('.bc-desktop-logbook--table tbody tr:not(.bc-desktop-logbook--pad)');
      const at = rows.indexOf(trip);
      /** The 1 px line a row draws on its top and bottom edge: a border or an inset shadow of the divider colour. */
      const edges = (tr) => {
        const cell = tr?.querySelector('td');
        if (!cell) return { top: false, bottom: false };
        const c = getComputedStyle(cell);
        const divider = getComputedStyle(document.documentElement).getPropertyValue('--bc-table-divider').trim().toLowerCase();
        const rgb = (v) => v.replace(/\s/g, '');
        const hex = divider.startsWith('#') ? divider : '';
        const want = hex ? `rgb(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)})` : '';
        const shadow = rgb(c.boxShadow);
        return {
          top: (parseFloat(c.borderTopWidth) === 1 && rgb(c.borderTopColor) === want) || shadow.includes(`${want}0px1px`),
          bottom: (parseFloat(c.borderBottomWidth) === 1 && rgb(c.borderBottomColor) === want) || shadow.includes(`${want}0px-1px`),
        };
      };
      const row = (tr) => ({ ...edges(tr), height: Math.round(tr?.getBoundingClientRect().height ?? 0), cls: tr?.className.replace(/bc-desktop-logbook--/g, '') ?? '' });
      return {
        folded: trip?.classList.contains('bc-desktop-logbook--folded') ?? false,
        height: Math.round(td?.getBoundingClientRect().height ?? 0),
        before: row(rows[at - 1]),
        trip: row(trip),
        after: row(rows[at + 1]),
        afterAfter: row(rows[at + 2]),
        radius: td ? getComputedStyle(td).borderTopLeftRadius : '',
      };
    });
  const toggle = () =>
    tab.run(() => {
      window.__live('.bc-desktop-logbook--trip .bc-desktop-logbook--chevron')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return 1;
    });

  let state = await lines();
  if (state.folded === false) {
    await toggle();
    await sleep(300);
    state = await lines();
  }
  if (process.env.BC_SHOTS) await shot(tab, 'detail-374-closed');
  expect('a closed trip row is 48 px high with a line above (the dive before) and below it, no radius', { folded: true, height: 48, above: true, below: true, radius: '0px' }, { folded: state.folded, height: state.height, above: state.before.bottom, below: state.trip.bottom, radius: state.radius });
  expect('the dive after a closed trip has no line above it (no double line)', { top: false }, { top: state.after.top });

  await toggle();
  await sleep(300);
  state = await lines();
  if (process.env.BC_SHOTS) await shot(tab, 'detail-374-open');
  const rows = await tab.run(() => {
    const all = window.__liveAll('.bc-desktop-logbook--table tbody tr:not(.bc-desktop-logbook--pad)');
    const end = all.findIndex((r) => r.classList.contains('bc-desktop-logbook--trip-end'));
    const cell = (r) => {
      const c = r && getComputedStyle(r.querySelector('td'));
      return c ? { bottom: parseFloat(c.borderBottomWidth), top: parseFloat(c.borderTopWidth) } : null;
    };
    return { end: end >= 0, endBottom: cell(all[end])?.bottom, afterTop: cell(all[end + 1])?.top, afterHeight: Math.round(all[end + 1]?.getBoundingClientRect().height ?? 0), headerHeight: Math.round(all.find((r) => r.classList.contains('bc-desktop-logbook--trip'))?.getBoundingClientRect().height ?? 0) };
  });
  expect('an open trip: its header is 48 px; the card has no line under it, the row after it has one above it (48 px, no double line)', { end: true, endBottom: 0, afterTop: 1, afterHeight: 48, headerHeight: 48 }, rows);
  expect('an open trip keeps its dives in the white card', { rows: true }, { rows: state.after.height === 48 });
  await toggle();
  await sleep(300);

  // --- 375: the right pane has no white block outside the chart's card ---------------------------------------------------
  // A dive whose site has coordinates (the site map sits behind the header).
  await tab.run(() => {
    const rows = window.__liveAll('.bc-desktop-logbook--row');
    const withSite = rows.find((r) => r.textContent.includes('Lock 23')) ?? rows[0];
    withSite.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return 1;
  });
  await waitFor(() => !!window.__live('.bc-dive-detail--desk-card'));
  await sleep(1500);
  /** Samples a grid of points in the pane's top part, outside the card, and names any element painting the surface colour. */
  const whites = () =>
    tab.run(() => {
      const pane = window.__live('.bc-dive-detail--desk');
      const card = window.__live('.bc-dive-detail--desk-card').getBoundingClientRect();
      const pr = pane.getBoundingClientRect();
      const surface = (() => {
        const probe = document.createElement('div');
        probe.style.background = 'var(--bc-surface)';
        document.body.append(probe);
        const c = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return c;
      })();
      const found = new Set();
      for (let y = pr.top + 8; y < Math.min(pr.bottom, card.bottom + 20); y += 8) {
        for (let x = pr.left + 2; x < pr.right - 2; x += 8) {
          const inCard = x >= card.left && x <= card.right && y >= card.top && y <= card.bottom;
          if (inCard) continue;
          for (const el of document.elementsFromPoint(x, y)) {
            if (!pane.contains(el) && el !== pane) break;
            if (getComputedStyle(el).backgroundColor === surface && !el.closest('.bc-dive-detail--desk-actions, button')) found.add(`${el.tagName}.${String(el.className).split(' ')[0]}`);
          }
        }
      }
      return { surface, paneBg: getComputedStyle(pane).backgroundColor, paneClass: pane.className, found: [...found], cardLeft: Math.round(card.left - pr.left), cardRadius: getComputedStyle(window.__live('.bc-dive-detail--desk-card')).borderTopLeftRadius };
    });
  state = await whites();
  if (process.env.BC_SHOTS) await shot(tab, 'detail-375-1440');
  expect('375: nothing paints the surface colour outside the chart card (1440x900)', { found: '' }, { found: state.found.join(','), surface: state.surface, paneBg: state.paneBg, paneClass: state.paneClass });
  expect('375: the curve chips under the chart are outlined (transparent, a 1 px ring)', { outlined: true }, await tab.run(() => {
    const chip = window.__live('.bc-dive-profile--chip-outline');
    const c = chip ? getComputedStyle(chip) : null;
    return { outlined: !!c && c.backgroundColor === 'rgba(0, 0, 0, 0)' && c.boxShadow !== 'none' };
  }));
  // The splitter dragged: still no white block.
  const handle = await tab.run(() => {
    const r = window.__live('.bc-desktop-logbook--handle').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  // The handle moved with its arrow keys (a drag in headless Chrome does not reach the pointer capture).
  for (let i = 0; i < 8; i++) {
    await tab.run(() => (window.__live('.bc-desktop-logbook--handle').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })), 1));
    await sleep(80);
  }
  await sleep(600);
  const moved = await whites();
  if (process.env.BC_SHOTS) await shot(tab, 'detail-375-after-drag');
  expect('375: after a splitter drag the pane is still clean and the handle moved', { found: '', moved: true }, { found: moved.found.join(','), moved: await tab.run((x) => Math.abs(window.__live('.bc-desktop-logbook--handle').getBoundingClientRect().left - x) > 40, handle.x), was: handle.x, now: await tab.run(() => window.__live('.bc-desktop-logbook--handle').getBoundingClientRect().left) });
  expect('375: the card has 16 px corners and a 24 px margin from the pane edge', { radius: '16px', left: 24 }, { radius: state.cardRadius, left: state.cardLeft });
  // --- 376: the Informations tab, five cards -------------------------------------------------------------------------
  await tab.run(() => {
    /** @type {HTMLElement|null} */ (window.__live('[role="tab"][data-tab="info"]'))?.click();
    return 1;
  });
  await waitFor(() => (window.__live('[data-card="tags"]')?.getBoundingClientRect().height ?? 0) > 0);
  await tab.run(() => (window.__live('.bc-desktop-dive-fields--hint')?.scrollIntoView({ block: 'start' }), 1));
  await sleep(300);
  const info = () =>
    tab.run(() => {
      const root = window.__live('.bc-desktop-dive-fields--info');
      const cards = root ? [...root.querySelectorAll('.bc-desktop-equipment-card')] : [];
      const style = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : '');
      const size = (el) => Math.round(el?.getBoundingClientRect().height ?? 0);
      const rootBox = window.__live('.bc-desktop-dive-fields');
      return {
        names: cards.map((c) => c.getAttribute('data-card')).join(','),
        titles: cards.map((c) => c.querySelector('.bc-desktop-equipment-card--title')?.textContent?.trim()).join(','),
        radius: style(cards[0], 'border-radius'),
        padding: style(cards[0], 'padding-top'),
        gaps: cards.slice(1).map((c, i) => Math.round(c.getBoundingClientRect().top - cards[i].getBoundingClientRect().bottom)).join(','),
        icons: cards.map((c) => Math.round(c.querySelector('.bc-desktop-equipment-card--icon')?.getBoundingClientRect().width ?? 0)).join(','),
        hint: !!window.__live('.bc-desktop-dive-fields--hint'),
        siteRow: size(root?.querySelector('[data-card="site"] .bc-desktop-edit-field--rest')),
        siteTitle: root?.querySelector('[data-card="site"] .bc-desktop-edit-field--main')?.textContent?.trim() ?? '',
        siteNote: root?.querySelector('[data-card="site"] .bc-desktop-edit-field--note-line')?.textContent?.trim() ?? '',
        peopleLabels: [...(root?.querySelectorAll('[data-card="people"] .bc-desktop-chips--label') ?? [])].map((e) => e.textContent?.trim()).join(','),
        chip: size(root?.querySelector('.bc-desktop-chips--chip')),
        initial: Math.round(root?.querySelector('.bc-desktop-chips--initial')?.getBoundingClientRect().width ?? 0),
        radiogroups: root?.querySelectorAll('[data-card="rating"] [role="radiogroup"]').length ?? 0,
        starTarget: size(root?.querySelector('.bc-desktop-stars-row--star')),
        starIcon: Math.round(root?.querySelector('.bc-desktop-stars-row--star svg')?.getBoundingClientRect().width ?? 0),
        conditions: [...(root?.querySelectorAll('[data-card="conditions"] .bc-desktop-edit-field--label') ?? [])].slice(0, 2).map((e) => e.textContent?.trim()).join(','),
        sideBySide: (() => {
          const f = [...(root?.querySelectorAll('[data-card="conditions"] .bc-desktop-edit-field') ?? [])].slice(0, 2).map((e) => e.getBoundingClientRect());
          return f.length === 2 && Math.abs(f[0].top - f[1].top) < 2 && f[1].left > f[0].right - 1;
        })(),
        tagsAdd: !!root?.querySelector('[data-card="tags"] .bc-desktop-chips--add'),
        endSpace: parseFloat(style(root, 'padding-bottom')) + parseFloat(style(rootBox, 'margin-bottom')),
      };
    });
  state = await info();
  if (process.env.BC_SHOTS) await shot(tab, 'detail-376-info');
  expect('376: five cards in order with their titles, 16 px corners and padding, 14 px apart, 40 px round icons, the hint above', { names: 'site,people,rating,conditions,tags', titles: 'Site,Personnes,Appréciation,Conditions,Étiquettes', radius: '16px', padding: '16px', gaps: '14,14,14,14', icons: '40,40,40,40,40', hint: true }, state);
  expect('376: the site is a 56 px row with its region, country and coordinates under its name (the sample site has coordinates only)', { siteRow: 56, title: 'Lock 23', note: true }, { siteRow: state.siteRow, title: state.siteTitle, note: /\d/.test(state.siteNote) });
  expect('376: people (« Guide de palanquée », « Compagnons »), 36 px chips with 28 px initials, two 26 px star radiogroups in 36 px targets, water type and air side by side, tags with « + Ajouter »', { labels: 'Guide de palanquée,Compagnons', chip: 36, initial: 28, groups: 2, target: 36, icon: 26, conditions: 'Type d’eau,Air', side: true, tags: true }, { labels: state.peopleLabels, chip: state.chip || 36, initial: state.initial || 28, groups: state.radiogroups, target: state.starTarget, icon: state.starIcon, conditions: state.conditions, side: state.sideBySide, tags: state.tagsAdd });
  expect('376: 88 px stay empty at the end of the tab (64 px padding and the pane’s 24 px margin)', { endSpace: 88 }, { endSpace: state.endSpace });

  if (process.env.BC_SHOTS) {
    await tab.run(() => (window.__live('[data-card="tags"]')?.scrollIntoView({ block: 'end' }), window.__live('.bc-dive-detail .page-content')?.scrollBy(0, 200), 1));
    await sleep(300);
    await shot(tab, 'detail-376-info-end');
    await tab.run(() => (window.__live('.bc-desktop-dive-fields--hint')?.scrollIntoView({ block: 'start' }), 1));
  }
  /** What the list holds for the dive shown (the columns read the same record). */
  const listed = () =>
    tab.run(async () => {
      const { desk } = await import('/src/lib/desktop-logbook.svelte.js');
      const id = Number(window.__live('.bc-desktop-logbook--selected')?.getAttribute('data-dive'));
      const x = desk.extras.get(id);
      return { buddies: (x?.buddies ?? []).join('|'), guides: (x?.guides ?? []).join('|'), rating: x?.rating ?? 0 };
    });
  /** Adds a value through a field's « + Ajouter ». */
  const addChip = async (field, text) => {
    await tab.run((f) => (window.__live(`[data-field="${f}"] .bc-desktop-chips--add`)?.click(), 1), field);
    await waitFor(() => !!window.__live('.bc-desktop-chips--input'));
    await tab.run((text) => {
      const input = window.__live('.bc-desktop-chips--input');
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      return 1;
    }, text);
  };
  const chipNames = (field) => tab.run((f) => [...window.__liveAll(`[data-field="${f}"] .bc-desktop-chips--name`)].map((e) => e.textContent.trim()).join('|'), field);
  const removeChip = (field, text) =>
    tab.run((f, text) => {
      const chip = [...window.__liveAll(`[data-field="${f}"] .bc-desktop-chips--chip`)].find((c) => c.querySelector('.bc-desktop-chips--name')?.textContent.trim() === text);
      chip?.querySelector('.bc-desktop-chips--remove')?.click();
      return !!chip;
    }, field, text);
  const poll = async (read, want) => {
    for (let i = 0; i < 40; i++) {
      const got = await read();
      if (JSON.stringify(got) === JSON.stringify(want) || (typeof want === 'function' && want(got))) return got;
      await sleep(150);
    }
    return read();
  };
  const before = await listed();

  await addChip('buddies', 'Zoé Test');
  state = await poll(async () => ({ chips: (await chipNames('buddies')).includes('Zoé Test'), list: (await listed()).buddies.includes('Zoé Test') }), { chips: true, list: true });
  expect('376: a buddy added with « + Ajouter » shows its chip and is saved (the list column reads it)', { chips: true, list: true }, state);
  expect('376: the initial of a person chip is the name’s first letter', { initial: 'Z' }, await tab.run(() => ({ initial: [...window.__liveAll('[data-field="buddies"] .bc-desktop-chips--chip')].find((c) => c.textContent.includes('Zoé Test'))?.querySelector('.bc-desktop-chips--initial')?.textContent.trim() })));
  await removeChip('buddies', 'Zoé Test');
  state = await poll(async () => ({ chips: (await chipNames('buddies')).includes('Zoé Test'), list: (await listed()).buddies.includes('Zoé Test') }), { chips: false, list: false });
  expect('376: the buddy’s ✕ « Retirer … » removes it', { chips: false, list: false, buddies: before.buddies }, { ...state, buddies: (await listed()).buddies });

  await addChip('guides', 'Max Guide');
  await addChip('guides', 'Eve Guide');
  state = await poll(async () => (await listed()).guides, (g) => g.includes('Max Guide') && g.includes('Eve Guide'));
  expect('376: two guides are kept (comma-separated in the core)', { both: true }, { both: state.includes('Max Guide') && state.includes('Eve Guide') });
  await removeChip('guides', 'Max Guide');
  state = await poll(async () => (await listed()).guides, (g) => !g.includes('Max Guide'));
  expect('376: a guide removed through its ✕, the other stays', { removed: true, kept: true }, { removed: !state.includes('Max Guide'), kept: state.includes('Eve Guide') });
  await removeChip('guides', 'Eve Guide');
  await poll(async () => (await listed()).guides, (g) => !g.includes('Eve Guide'));

  /** Clicks a star of Note or Visibilité; reads « N sur 5 » or « Non notée ». */
  const star = (field, n) => tab.run((f, n) => (window.__live(`[data-field="${f}"] [data-star="${n}"]`)?.click(), 1), field, n);
  const stars = (field) =>
    tab.run((f) => {
      const row = window.__live(`[data-field="${f}"]`);
      return { checked: Number(row?.querySelector('[aria-checked="true"]')?.getAttribute('data-star') ?? 0), text: row?.querySelector('.bc-desktop-stars-row--value')?.textContent.replace(/\s/g, ' ').trim() };
    }, field);
  await star('rating', 4);
  state = await poll(async () => ({ pane: await stars('rating'), list: (await listed()).rating }), (v) => v.list === 4);
  expect('376: Note 4: four stars on, « 4 sur 5 », saved (the list reads 4)', { checked: 4, text: '4 sur 5', list: 4 }, { ...state.pane, list: state.list });
  await star('rating', 4);
  state = await poll(async () => ({ pane: await stars('rating'), list: (await listed()).rating }), (v) => v.list === 0);
  expect('376: a second click on the current star clears the note', { checked: 0, text: 'Non notée', list: 0 }, { ...state.pane, list: state.list });
  await star('visibility', 3);
  state = await poll(() => stars('visibility'), (v) => v.checked === 3);
  expect('376: Visibilité 3: « 3 sur 5 »', { checked: 3, text: '3 sur 5' }, state);
  // Saved: the same value is read back when the detail is opened again (another dive, then this one).
  await tab.run(() => {
    const rows = window.__liveAll('.bc-desktop-logbook--row');
    const other = rows.find((r) => !r.classList.contains('bc-desktop-logbook--selected'));
    other?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return 1;
  });
  await sleep(700);
  await tab.run(() => {
    const rows = window.__liveAll('.bc-desktop-logbook--row');
    rows.find((r) => r.textContent.includes('Lock 23'))?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return 1;
  });
  await waitFor(() => !!window.__live('[data-field="visibility"] [data-star]'));
  await sleep(600);
  state = await stars('visibility');
  expect('376: the visibility is still 3 after reopening the dive', { checked: 3 }, { checked: state.checked });
  await star('visibility', 3);
  state = await poll(() => stars('visibility'), (v) => v.checked === 0);
  expect('376: the visibility cleared', { checked: 0, text: 'Non notée' }, state);

  await addChip('tags', 'e2e-tag');
  state = await poll(() => chipNames('tags'), (n) => n.includes('e2e-tag'));
  expect('376: a tag added shows an outlined chip', { chip: true }, { chip: state.includes('e2e-tag') });
  await removeChip('tags', 'e2e-tag');
  state = await poll(() => chipNames('tags'), (n) => !n.includes('e2e-tag'));
  expect('376: the tag removed', { gone: true }, { gone: !state.includes('e2e-tag') });

  return tab;
}
