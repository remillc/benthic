// @ts-check
// Deep links and files sent to the app (decided on 13 November 2026): acts on what
// lib/deep-link.js understood. A link opens the matching screen of the main view, or the
// closest collection with a short message when its target is not in this logbook; a
// logbook file is imported after a confirmation, never silently.
//
// Cold start: App.getLaunchUrl(). Running app: the "appUrlOpen" event; a file shared with « Share to » (Android
// ACTION_SEND) comes as the plugin's "sharedFile" event. Both give the
// address of an https link (App Links, Universal Links), of benthic://, or of a file
// (Android content://, iOS file://).
import { App as CapacitorApp } from '@capacitor/app';
import { f7 } from 'framework7-svelte';
import { BenthicCore } from 'benthic-core';
import { logbook, importData } from './logbook.svelte.js';
import { diveUrl, diveUrlOfCore } from './dive-id.js';
import { replaceEligibility } from './replace-logbook.js';
import { benthicProblemDialog, startBenthicReplace, startReplace } from './replace-logbook-ui.js';
import { openBenthicSource } from './benthic-import.svelte.js';
import { goToSection, openOver, backToFirstScreen } from './navigation.svelte.js';
import { anyDirty } from './leave-guard.js';
import { checkSharedFile, importErrorKey, parseLink } from './deep-link.js';
import { confirmAction } from './dialogs.js';
import { showSnackbar } from './snackbar.js';
import { offerUndo } from './undo.js';
import { t } from './i18n.js';
import { deviceStore } from './device-store.js';
import { siteChange } from './sites.svelte.js';
import { openSharedFile } from './shared-file.js';
import { sharedFile } from './shared-file.svelte.js';
import { importProgress } from './import-progress.svelte.js';

/** The sites of a shared sites file, kept for the dives file shared next (lib/shared-file.js). */
const SITES_KEY = 'bc.sharedSites';

/** How long a link waits for the logbook to be read (cold start), in ms. */
const READY_LIMIT = 20000;

/** @param {number} ms */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** The logbook is read: the screens are built and the dives are known. */
async function whenReady() {
  const start = Date.now();
  while (logbook.loading && Date.now() - start < READY_LIMIT) await sleep(100);
  return !logbook.loading;
}

/**
 * The view of a section, back on its first screen.
 * @param {import('./deep-link.js').LinkSection} section
 */
async function freshView(section) {
  goToSection(section);
  const view = f7.views.get(`#view-${section}`);
  const router = view?.router;
  // Waited for: a navigate made before the back is over is dropped (a link from one tool
  // to another left the Tools list).
  if (router && router.history.length > 1) await backToFirstScreen(router);
  return view;
}

/** Closes what floats over the screens (side menu, sheets), so that the target shows. */
function clearOverlays() {
  f7.panel.close(undefined, false);
  f7.actions.close(undefined, false);
  f7.sheet.close(undefined, false);
  f7.dialog.close();
}

/**
 * @param {import('./deep-link.js').LinkSection} section the collection to show
 * @param {string} messageKey the short message saying why
 */
async function fallBackTo(section, messageKey) {
  await freshView(section);
  showSnackbar(t(messageKey));
}

/** @param {import('./deep-link.js').LinkTarget} target */
async function openTarget(target) {
  if (target.kind === 'route') {
    if (target.over) {
      openOver(target.path);
      return;
    }
    const view = await freshView(target.section);
    const root = { logbook: '/', sites: '/sites/', statistics: '/statistics/', tools: '/tools/', account: '/account' }[target.section];
    if (target.path !== root) /** @type {any} */ (view?.router).navigate(target.path, { reloadDetail: true });
    return;
  }
  if (target.kind === 'dive') {
    // A link holds the dive's Benthic id (the start time in the links shared before the ids, lib/deep-link.js); the core's id is only valid until the next load.
    const dive = target.benthicId ? logbook.dives.find((d) => d.benthicId === target.benthicId) : logbook.dives.find((d) => d.date.slice(0, 19) === target.date);
    if (!dive) {
      await fallBackTo('logbook', 'link.diveNotFound');
      return;
    }
    const view = await freshView('logbook');
    /** @type {any} */ (view?.router).navigate(diveUrl(dive), { reloadDetail: true });
    return;
  }
  if (target.kind === 'site') {
    let found = false;
    try {
      const site = await BenthicCore.siteQuery({ kind: 'site', uuid: target.uuid });
      found = !!site?.uuid;
    } catch {
      found = false;
    }
    if (!found) {
      await fallBackTo('sites', 'link.siteNotFound');
      return;
    }
    const view = await freshView('sites');
    view?.router.navigate(`/sites/${target.uuid}`);
  }
}

/** What the screen and the core give to lib/shared-file.js. */
const sharedDeps = {
  // The file is streamed into the app's cache by the plugin: only its path comes back (never the contents).
  // `stageProgress` events give the bytes copied while it runs; « Annuler » stops the copy (cancelStage).
  stage: async (/** @type {string} */ uri, /** @type {((done: number, total: number) => void)|undefined} */ onProgress) => {
    /** @type {{ remove: () => Promise<void> }|undefined} */
    let handle;
    try {
      handle = await BenthicCore.addListener('stageProgress', (/** @type {{ uri: string, done: number, total: number }} */ e) => {
        if (e.uri === uri) onProgress?.(e.done, e.total);
      });
    } catch {
      // The desktop plugin has no events: the line stays indeterminate until the copy is over.
    }
    try {
      return await BenthicCore.stageSharedFile({ uri });
    } finally {
      void handle?.remove();
    }
  },
  cancelStage: (/** @type {string} */ uri) => BenthicCore.cancelStage({ uri }).catch(() => {}),
  progress: importProgress,
  core: BenthicCore,
  check: checkSharedFile,
  welcome: () => logbook.welcome,
  remembered: () => {
    try {
      return JSON.parse(deviceStore.getItem(SITES_KEY) ?? '{}');
    } catch {
      return {};
    }
  },
  keep: (/** @type {Record<string, any>} */ sites) => deviceStore.setItem(SITES_KEY, JSON.stringify(sites)),
  listSites: () => BenthicCore.siteQuery({ kind: 'list' }),
  siteChange,
  importData,
  toFirstLaunch: (/** @type {string} */ name, /** @type {{ path: string, size: number }} */ staged, /** @type {any} */ summary) => {
    sharedFile.staged = { path: staged.path, size: staged.size, name, summary };
  },
  // A .benthic file (the full export) takes the in-app path of « Un fichier » (lib/benthic-import.svelte.js).
  openBenthic: openBenthicSource,
  benthicProblem: benthicProblemDialog,
  toFirstLaunchBenthic: (/** @type {{ path: string, size: number, name: string }} */ staged, /** @type {any} */ inspection) => {
    sharedFile.benthic = { path: staged.path, size: staged.size, name: staged.name, inspection };
  },
  replaceBenthic: (/** @type {{ name: string }} */ file, /** @type {any} */ inspection) => startBenthicReplace(/** @type {File} */ (file), inspection),
  logbookName: () => deviceStore.getItem('bc.logbookName') || logbook.email || t('welcomeSteps.defaultName'),
  // One logbook at a time on a phone or a tablet (the device's copy, or the account's): no « Nouveau carnet »; its
  // place is « Remplacer ce carnet », a guarded flow for the device's own logbook (lib/replace-logbook-ui.js). The
  // desktop opens one logbook per window and takes no shared file.
  canCreateLogbook: () => false,
  replaceEligibility: () => replaceEligibility(logbook),
  replaceLogbook: startReplace,
  choose: (/** @type {any} */ o, /** @type {{ merge: () => Promise<void>, create?: () => Promise<void>, replace?: () => Promise<void>, discard: () => Promise<void> }} */ actions) => {
    /** @type {any[]} */
    const buttons = [{ text: t('dialog.cancel'), onClick: () => void actions.discard() }];
    if (actions.create) buttons.push({ text: t('link.fileNew'), bold: true, onClick: actions.create });
    if (actions.replace) buttons.push({ text: t('link.fileReplace'), onClick: actions.replace });
    buttons.push({ text: t('link.fileMerge'), bold: !actions.create, onClick: actions.merge });
    const key = actions.create ? 'link.fileChoose' : actions.replace ? 'link.fileChooseReplace' : 'link.fileChooseOne';
    const text = [t(key, { name: o.name }), o.whyNot ? t(`link.replace_${o.whyNot}`) : '', o.several ? t('replace.several', o.several) : ''].filter(Boolean).join('\n\n');
    f7.dialog.create({ title: t('link.fileTitle'), text, buttons, verticalButtons: buttons.length > 2 }).open();
  },
  confirm: (/** @type {any} */ o, /** @type {() => Promise<void>} */ run, /** @type {(() => void)|undefined} */ cancel) =>
    confirmAction({ title: t('link.fileTitle'), text: t(o.textKey, o.values), action: t(o.actionKey), onConfirm: run, onCancel: cancel }),
  refuse: (/** @type {string} */ key, /** @type {Record<string, string|number>} */ values) =>
    f7.dialog.create({ title: t('link.fileTitle'), text: t(key, values), buttons: [{ text: t('dialog.ok') }] }).open(),
  notify: (/** @type {string} */ key, /** @type {Record<string, string|number>} */ values) => showSnackbar(t(key, values)),
  imported: (/** @type {number} */ n) => offerUndo(t('logbook.imported', { n })),
  importFailed: (/** @type {unknown} */ e) => {
    const code = String(/** @type {any} */ (e)?.message ?? '');
    console.error('Import a shared file', code);
    f7.dialog.create({ title: t('logbook.importTitle'), text: t(importErrorKey(code)), buttons: [{ text: t('dialog.ok') }] }).open();
  },
};

/** Opens a dive of the logbook by its identifier (after a dive received by QR code). @param {number} id */
export async function openDiveById(id) {
  clearOverlays();
  const view = await freshView('logbook');
  /** @type {any} */ (view?.router).navigate(diveUrlOfCore(id), { reloadDetail: true });
}

/** Opens the list of planned dives (after a plan received by QR code). */
export async function openPlans() {
  clearOverlays();
  const view = await freshView('tools');
  /** @type {any} */ (view?.router).navigate('/plans/', { reloadDetail: true });
}

/** One address at a time, and the same address twice in a row (launch URL and event) once. */
let queue = Promise.resolve();
let lastUrl = '';
let lastAt = 0;

/** @param {string} url */
export function handleLink(url) {
  const now = Date.now();
  if (url === lastUrl && now - lastAt < 2000) return;
  lastUrl = url;
  lastAt = now;
  queue = queue
    .then(async () => {
      const target = parseLink(url);
      if (target.kind === 'unknown') {
        showSnackbar(t('link.unknown'));
        return;
      }
      if (!(await whenReady())) return;
      // First launch, before any way to start was chosen: nothing to open a link in yet; a logbook file
      // goes to « Importer un carnet ».
      if (logbook.welcome && target.kind !== 'file') {
        showSnackbar(t('link.notReady'));
        return;
      }
      // A form with unsaved changes is not left behind by a link.
      if (!logbook.welcome && anyDirty()) {
        showSnackbar(t('link.unsaved'));
        return;
      }
      clearOverlays();
      if (target.kind === 'file') {
        if ((await openSharedFile(sharedDeps, target.uri)) === 'cancelled') showSnackbar(t('importFlow.cancelled'));
      }
      else await openTarget(target);
    })
    .catch((e) => console.error('Open a link', e));
}

/** Listens for links: the one that started the app, then those that come while it runs. */
export function enableDeepLinks() {
  CapacitorApp.addListener('appUrlOpen', (event) => handleLink(event.url));
  // « Share to Benthic » (Android ACTION_SEND): the plugin keeps the event until this listener exists.
  try {
    Promise.resolve(BenthicCore.addListener('sharedFile', (/** @type {{ uri: string }} */ e) => handleLink(e.uri))).catch(() => {});
  } catch {
    // The desktop plugin has no events: nothing is shared to it.
  }
  CapacitorApp.getLaunchUrl()
    .then((launch) => {
      if (launch?.url) handleLink(launch.url);
    })
    .catch(() => {});
}
