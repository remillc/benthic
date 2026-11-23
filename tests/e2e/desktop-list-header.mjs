// SPDX-License-Identifier: GPL-2.0
// Desktop logbook list header at several column widths (task 2026-11-23-372), run by tests/e2e/navigation.mjs
// (`--list-header-only`). Wide column: the search box, the columns button and the more button. Under 560 px: the search
// becomes a 40 px magnifier button left of the other two, which stay visible down to the narrowest column; the magnifier or
// Ctrl+F opens the field across the header in place of the title, the cross or Escape closes it, and a search shows the
// same rows as in the wide column. With BC_SHOTS=<folder>: a screenshot at each width.

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function desktopListHeaderFlows(h) {
  const { openTab, closeOtherTabs, sleep, expect, shot } = h;
  console.log('Desktop, 1400x900: the logbook list header at three column widths');
  const tab = await openTab(1400, 900, false, false, true, { theme: 'md' });
  await tab.run(() => {
    window.__live = (selector) => [...document.querySelectorAll(selector)].filter((e) => !e.closest('.bc-pane-opening'))[0] ?? null;
    return 1;
  });
  await closeOtherTabs?.(tab.targetId);
  await tab.send('Page.bringToFront');
  await tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const waitFor = async (check) => {
    for (let i = 0; i < 100; i++) {
      if (await tab.run(check).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  };
  await waitFor(() => !!window.__live('.bc-desktop-logbook--row'));
  // A dive is open, as in the task's test.
  await tab.run(() => (window.__live('.bc-desktop-logbook--row')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), 1));
  await waitFor(() => !!window.__live('.bc-dive-detail'));

  const read = () =>
    tab.run(() => {
      const bar = window.__live('.bc-desktop-logbook--bar');
      const box = (el) => {
        const r = el?.getBoundingClientRect();
        return r ? { left: r.left, right: r.right, width: r.width, height: r.height } : null;
      };
      const visible = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
      const field = bar.querySelector('.bc-desktop-logbook--search input');
      const button = bar.querySelector('.bc-desktop-logbook--search-button');
      const columns = bar.querySelector('.bc-desktop-logbook--columns-anchor > button');
      const more = bar.querySelector(':scope > button.bc-desktop-logbook--icon-button:last-of-type');
      const titles = bar.querySelector('.bc-desktop-logbook--titles');
      const boxes = [button ?? bar.querySelector('.bc-desktop-logbook--search'), columns, more].map(box);
      return {
        bar: Math.round(bar.getBoundingClientRect().width),
        field: !!field,
        button: !!button,
        buttonSize: button ? Math.round(button.getBoundingClientRect().width) : 0,
        columns: visible(columns),
        more: visible(more),
        titles: visible(titles),
        // The three never overlap, left to right: search, columns, more.
        ordered: boxes.every((b, i) => b && (i === 0 || b.left >= boxes[i - 1].right - 0.5)) && boxes[2].right <= bar.getBoundingClientRect().right + 0.5,
        focused: !!field && document.activeElement === field,
        closeLabel: bar.querySelector('.bc-desktop-logbook--search-close')?.getAttribute('aria-label') ?? '',
        openLabel: button?.getAttribute('aria-label') ?? '',
        rows: [...document.querySelectorAll('.bc-desktop-logbook--row')].filter((r) => !r.closest('.bc-pane-opening')).map((r) => /^\d+/.exec(r.textContent.trim())?.[0] ?? ''),
      };
    });
  const key = (k, mod = false) =>
    tab.run(
      (k, mod) => {
        const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
        target.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: mod, bubbles: true, cancelable: true }));
        return 1;
      },
      k,
      mod
    );
  const type = async (text) => {
    await tab.run((text) => {
      const input = window.__live('.bc-desktop-logbook--search input');
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 1;
    }, text);
    await sleep(600);
  };
  const click = (selector) => tab.run((s) => (window.__live(s)?.click(), 1), selector);
  /** Moves the handle with the arrow keys until the header is at most `limit` px wide (or no longer shrinks). */
  const narrowTo = async (limit) => {
    let last = -1;
    for (let i = 0; i < 40; i++) {
      const w = (await read()).bar;
      if (w <= limit || w === last) return w;
      last = w;
      await tab.run(() => {
        const handle = window.__live('.bc-desktop-logbook--handle');
        handle.focus();
        handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
        return 1;
      });
      await sleep(120);
    }
    return (await read()).bar;
  };

  // Wide: unchanged.
  let s = await read();
  expect('wide column: the search box, the columns button and the more button', { field: true, button: false, columns: true, more: true, titles: true, ordered: true }, s);
  expect('wide column is at least 560 px', { wide: true }, { wide: s.bar >= 560 });
  if (process.env.BC_SHOTS) await shot(tab, 'list-header-wide');
  // Just over the threshold: still the wide layout, with nothing pushed out or overlapping.
  const over = await narrowTo(575);
  s = await read();
  console.log(`  just over the threshold: header ${over} px`);
  expect('just over the threshold: the wide layout, the three controls in order and inside the header', { field: true, button: false, columns: true, more: true, titles: true, ordered: true }, s);
  if (process.env.BC_SHOTS) await shot(tab, 'list-header-over');
  // The search of the wide column: the reference rows.
  const query = 'Escoumins';
  await type(query);
  const wideRows = (await read()).rows;
  expect('wide column: the search filters the rows', { some: true }, { some: wideRows.length > 0 });
  await type('');

  for (const [label, limit] of [['just under the threshold', 559], ['the narrowest column', 0]]) {
    const width = await narrowTo(limit);
    s = await read();
    console.log(`  ${label}: header ${width} px`);
    expect(`${label}: the magnifier (40 px), the columns button and the more button, in order`, { field: false, button: true, buttonSize: 40, columns: true, more: true, titles: true, ordered: true }, s);
    expect(`${label}: the magnifier is named`, { openLabel: 'Rechercher dans le carnet (Ctrl+F)' }, s);
    if (process.env.BC_SHOTS) await shot(tab, `list-header-${limit ? 'under' : 'narrowest'}`);

    // The magnifier opens the field over the title.
    await click('.bc-desktop-logbook--search-button');
    await sleep(300);
    s = await read();
    expect(`${label}: the magnifier opens the field, focused, in place of the title`, { field: true, button: false, titles: false, focused: true, columns: true, more: true, ordered: true }, s);
    expect(`${label}: the close button is named`, { closeLabel: 'Fermer la recherche (Échap)' }, s);
    if (process.env.BC_SHOTS) await shot(tab, `list-header-${limit ? 'under' : 'narrowest'}-open`);
    // Escape with an empty field closes it.
    await key('Escape');
    await sleep(300);
    s = await read();
    expect(`${label}: Escape closes the empty field`, { field: false, button: true, titles: true }, s);
    // Ctrl+F opens it again; a search shows the rows of the wide column, and the field stays open.
    await key('f', true);
    await sleep(300);
    s = await read();
    expect(`${label}: Ctrl+F opens the field`, { field: true, titles: false, focused: true }, s);
    await type(query);
    s = await read();
    expect(`${label}: the same search shows the same rows`, { rows: JSON.stringify(wideRows) }, { rows: JSON.stringify(s.rows) });
    expect(`${label}: the field stays open while a search is active`, { field: true, titles: false, columns: true, more: true }, s);
    // Escape empties it first, then closes it; the cross closes it and clears the search.
    await key('Escape');
    await sleep(500);
    s = await read();
    expect(`${label}: Escape empties the field and keeps it open`, { field: true }, s);
    await key('Escape');
    await sleep(300);
    expect(`${label}: a second Escape closes it`, { field: false, button: true }, await read());
    await click('.bc-desktop-logbook--search-button');
    await sleep(200);
    await type(query);
    await click('.bc-desktop-logbook--search-close');
    await sleep(600);
    s = await read();
    expect(`${label}: the cross clears the search and closes the field`, { field: false, button: true, titles: true }, s);
    expect(`${label}: the log is whole again`, { whole: true }, { whole: s.rows.length >= wideRows.length });
  }
  tab.close?.();
}