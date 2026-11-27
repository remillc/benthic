// SPDX-License-Identifier: GPL-2.0
// The right to the desktop app (task 2026-11-27-414), run by tests/e2e/navigation.mjs (`--access-only`): the sign-in screen of a
// window with no logbook (bureau-acces-connexion-requise), the yellow band from day 25 (bureau-acces-avertissement), and the
// read-only logbook (bureau-acces-lecture-seule): grey band with its three actions, no + button, no editable field, « — » for an
// empty one, the core refusing a write. The tabs are opened with `&access=1` (app/vite.e2e.config.js): the other flows keep a
// desktop that is not read only. With BC_SHOTS=<folder> a screenshot of each state is saved, for a visual check.

/**
 * @param {object} h the harness of navigation.mjs
 */
export async function desktopAccessFlows(h) {
  const { openTab, closeOtherTabs, sleep, expect, shot } = h;

  /** A desktop tab (1440x900) in the given state of the right. */
  async function open(access) {
    const tab = await openTab(1440, 900, false, false, true, { theme: 'md', access });
    await closeOtherTabs?.(tab.targetId);
    await tab.send('Page.bringToFront');
    await tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    return tab;
  }
  const waitFor = async (tab, check, ...args) => {
    for (let i = 0; i < 100; i++) {
      if (await tab.run(check, ...args).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  };
  const text = (tab, selector) => tab.run((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? '', selector);

  console.log('Desktop access, no logbook and no account: « Benthic sur ordinateur demande Benthic+ ou Benthic Desktop »');
  let tab = await open({ noLogbook: true, signedIn: false });
  await waitFor(tab, () => !!document.querySelector('.bc-desktop-first-launch .bc-plus--title'));
  await sleep(600);
  let r = await tab.run(() => ({
    title: document.querySelector('.bc-desktop-first-launch .bc-plus--title')?.textContent?.trim(),
    providers: [...document.querySelectorAll('.bc-desktop-first-launch .bc-plus--provider')].map((b) => b.textContent.trim()),
    buy: document.querySelector('.bc-plus--buy')?.textContent?.trim(),
    buyHref: document.querySelector('.bc-plus--buy')?.getAttribute('href'),
    readOnly: [...document.querySelectorAll('.bc-plus--text-link')].map((b) => b.textContent.trim()),
    banner: !!document.querySelector('.bc-access-banner'),
    back: !!document.querySelector('.bc-first-launch--back'),
  }));
  expect('access: the sign-in screen asks for a Benthic+ account', { title: 'Benthic sur ordinateur demande Benthic+ ou Benthic Desktop' }, r);
  expect('access: the three ways to sign in', { providers: r.providers.join('|').replace(/\|/g, ' | ') }, { providers: ['Continuer avec Google', 'Continuer avec Apple', 'Continuer avec mon courriel'].join(' | ') });
  expect('access: Acheter Benthic Desktop opens the purchase address, and the read-only door is there', { buy: 'Acheter Benthic Desktop', readOnly: 'Ouvrir un carnet en lecture seule', banner: false, back: false },
    { buy: r.buy, readOnly: r.readOnly[0], banner: r.banner, back: r.back });
  expect('access: the purchase address is https', { https: /^https:\/\//.test(r.buyHref ?? '') }, { https: /^https:\/\//.test(r.buyHref ?? '') });
  if (process.env.BC_SHOTS) await shot(tab, 'access-1-connexion-requise');

  // « Ouvrir un carnet en lecture seule »: the start screen, in read-only form (nothing to create or import), under the band.
  await tab.run(() => [...document.querySelectorAll('.bc-plus--text-link')].find((b) => /lecture seule/.test(b.textContent))?.click());
  await waitFor(tab, () => !!document.querySelector('.bc-access-banner--readOnly'));
  await sleep(600);
  r = await tab.run(() => ({
    band: document.querySelector('.bc-access-banner--readOnly')?.textContent?.replace(/\s+/g, ' ').trim(),
    createRow: !!document.querySelector('.bc-first-launch--rows'),
    empty: document.querySelector('.bc-first-launch--lead')?.textContent?.trim(),
    top: Math.round(document.querySelector('.bc-desktop-first-launch').getBoundingClientRect().top),
    bandH: Math.round(document.querySelector('.bc-access-banner').getBoundingClientRect().height),
  }));
  expect('access: read only without a logbook: the band says so, nothing creates or imports, the screen starts under the band', { createRow: false, empty: 'Aucun carnet sur cet ordinateur. Connectez-vous pour en créer un.', top: r.bandH },
    { createRow: r.createRow, empty: r.empty, top: r.top });
  expect('access: the band of a signed-out window says no account is signed in', { ok: /^Lecture seule\. Aucun compte Benthic n’est connecté\./.test(r.band) }, { ok: /^Lecture seule\. Aucun compte Benthic n’est connecté\./.test(r.band) });
  if (process.env.BC_SHOTS) await shot(tab, 'access-2-sans-carnet-lecture-seule');
  tab.ws.close();

  console.log('Desktop access, day 26 without a check: the yellow band');
  tab = await open({ signedIn: true, granted: true, daysAgo: 26 });
  await waitFor(tab, () => !!document.querySelector('.bc-desktop-logbook--row'));
  await sleep(500);
  r = await tab.run(() => ({
    band: document.querySelector('.bc-access-banner--text')?.textContent?.replace(/\s+/g, ' ').trim(),
    retry: [...document.querySelectorAll('.bc-access-banner--button')].map((b) => b.textContent.trim()),
    readOnlyClass: document.documentElement.classList.contains('bc-access-read-only'),
    plus: [...document.querySelectorAll('[class*="bc-fab"]')].some((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0),
    rowsEditable: document.querySelectorAll('.bc-desktop-logbook--row').length > 0,
    bandTop: Math.round(document.querySelector('.bc-access-banner').getBoundingClientRect().top),
    bandH: Math.round(document.querySelector('.bc-access-banner').getBoundingClientRect().height),
    railTop: Math.round(document.querySelector('.bc-nav-rail')?.getBoundingClientRect().top ?? -1),
  }));
  expect('access: from day 25 the yellow band asks to connect, with Réessayer', {
    band: 'Benthic n’a pas pu vérifier votre compte depuis 26 jours. Connectez-vous à Internet d’ici 4 jours pour garder l’accès.', retry: 'Réessayer', readOnlyClass: false, rowsEditable: true,
  }, { band: r.band, retry: r.retry.join('|'), readOnlyClass: r.readOnlyClass, rowsEditable: r.rowsEditable });
  expect('access: the band is at the top of the window and pushes the rail down', { bandTop: 0, railBelow: true, plus: true }, { bandTop: r.bandTop, railBelow: r.railTop >= r.bandH, plus: r.plus });
  if (process.env.BC_SHOTS) await shot(tab, 'access-3-avertissement');
  tab.ws.close();

  console.log('Desktop access, day 10: nothing shown');
  tab = await open({ signedIn: true, granted: true, daysAgo: 10 });
  await waitFor(tab, () => !!document.querySelector('.bc-desktop-logbook--row'));
  expect('access: within 25 days there is no band', { band: false }, await tab.run(() => ({ band: !!document.querySelector('.bc-access-banner') })));
  tab.ws.close();

  console.log('Desktop access, the right ended: the read-only logbook');
  tab = await open({ signedIn: true, granted: false, daysAgo: 3, endedOn: '2026-11-20' });
  await waitFor(tab, () => !!document.querySelector('.bc-desktop-logbook--row'));
  await sleep(600);
  r = await tab.run(() => ({
    band: document.querySelector('.bc-access-banner--readOnly')?.textContent?.replace(/\s+/g, ' ').trim(),
    actions: [...document.querySelectorAll('.bc-access-banner--button')].map((b) => b.textContent.trim()),
    readOnlyClass: document.documentElement.classList.contains('bc-access-read-only'),
    fab: [...document.querySelectorAll('[class*="bc-fab"]')].some((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0),
  }));
  expect('access: the grey band says when the right ended and offers three actions', { actions: 'Exporter le carnet|Se connecter|Renouveler', readOnlyClass: true, fab: false },
    { actions: r.actions.join('|'), readOnlyClass: r.readOnlyClass, fab: r.fab });
  expect('access: the band text', { ok: /^Lecture seule\. Votre abonnement Benthic\+ a pris fin le .*2026.*Vous pouvez consulter et exporter le carnet ; rien ne s’ajoute, ne se modifie ni ne se synchronise\./.test(r.band) }, { ok: /^Lecture seule\. Votre abonnement Benthic\+ a pris fin le .*2026.*Vous pouvez consulter et exporter le carnet ; rien ne s’ajoute, ne se modifie ni ne se synchronise\./.test(r.band) });
  if (process.env.BC_SHOTS) await shot(tab, 'access-4-lecture-seule');

  // A dive opens and reads; its fields are plain text, an empty one shows a dash; nothing edits.
  await tab.run(() => document.querySelector('.bc-desktop-logbook--row')?.click());
  await waitFor(tab, () => !!document.querySelector('.bc-desktop-edit-field, .bc-desktop-dive-fields'));
  await sleep(800);
  r = await tab.run(() => {
    const live = (s) => [...document.querySelectorAll(s)].filter((e) => !e.closest('.bc-pane-opening'));
    const dashes = live('.bc-desktop-edit-field--value').filter((e) => e.textContent.trim() === '—').length;
    return {
      editable: live('.bc-desktop-edit-field--rest').length,
      plain: live('.bc-desktop-edit-field--value').length,
      dashes,
      chipsAdd: live('.bc-desktop-chips--add').filter((e) => getComputedStyle(e).display !== 'none').length,
    };
  });
  expect('access: in a dive no field is editable, empty ones show a dash and no chip can be added', { editable: 0, hasPlain: true, hasDash: true, chipsAdd: 0 },
    { editable: r.editable, hasPlain: r.plain > 0, hasDash: r.dashes > 0, chipsAdd: r.chipsAdd });
  if (process.env.BC_SHOTS) await shot(tab, 'access-5-plongee-lecture-seule');

  // The core refuses a write under the screens, and still reads.
  r = await tab.run(async () => {
    const lb = await import('/src/lib/logbook.svelte.js');
    const outcome = { dives: lb.logbook.dives.length };
    try {
      await lb.saveDiveChanges(lb.logbook.dives[0].id, { notes: 'x' });
      outcome.edit = 'accepted';
    } catch (e) {
      outcome.edit = e?.code ?? String(e?.message);
    }
    return outcome;
  });
  expect('access: the core refuses a write while read only, and still reads', { edit: 'READ_ONLY', reads: true }, { edit: r.edit, reads: r.dives > 0 });

  // « Se connecter » opens the sign-in screen over the logbook; « Ouvrir un carnet en lecture seule » gives the logbook back.
  await tab.run(() => [...document.querySelectorAll('.bc-access-banner--button')].find((b) => b.textContent.trim() === 'Se connecter')?.click());
  await waitFor(tab, () => !!document.querySelector('.bc-desktop-first-launch .bc-plus--title-access'));
  await sleep(500);
  r = await tab.run(() => ({ title: document.querySelector('.bc-plus--title-access')?.textContent?.trim(), band: !!document.querySelector('.bc-access-banner') }));
  expect('access: « Se connecter » shows the sign-in screen, without the band', { title: 'Benthic sur ordinateur demande Benthic+ ou Benthic Desktop', band: false }, r);
  await tab.run(() => [...document.querySelectorAll('.bc-plus--text-link')].find((b) => /lecture seule/.test(b.textContent))?.click());
  await sleep(600);
  expect('access: « Ouvrir un carnet en lecture seule » closes it', { screen: false }, await tab.run(() => ({ screen: !!document.querySelector('.bc-desktop-first-launch') })));
  tab.ws.close();

  console.log('Desktop access, the grace period is over');
  tab = await open({ signedIn: true, granted: true, daysAgo: 31 });
  await waitFor(tab, () => /30.jours/.test(document.querySelector('.bc-access-banner--readOnly')?.textContent ?? ''));
  await sleep(300);
  expect('access: 31 days after the last check the logbook is read only', { band: true, text: true }, await tab.run(() => {
    const band = document.querySelector('.bc-access-banner--readOnly');
    return { band: !!band, text: /30.jours/.test(band?.textContent ?? '') };
  }));
  if (process.env.BC_SHOTS) await shot(tab, 'access-6-delai-depasse');
  tab.ws.close();

  console.log('Desktop access, signed in with the right: the logbook is not read only');
  tab = await open({ signedIn: true, granted: true, daysAgo: 1 });
  await waitFor(tab, () => !!document.querySelector('.bc-desktop-logbook--row'));
  await sleep(500);
  expect('access: with the right there is no band and the + button is there', { band: false, readOnlyClass: false }, await tab.run(() => ({
    band: !!document.querySelector('.bc-access-banner'),
    readOnlyClass: document.documentElement.classList.contains('bc-access-read-only'),
  })));
  tab.ws.close();
  void text;
}
