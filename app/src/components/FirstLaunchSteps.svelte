<script>
  // @ts-check
  // The right-hand column of the release edition's first launch, in steps (task 2026-11-15-218; mock-ups
  // docs/mockups/android-tablette-premier-lancement-production-*.dc.html; docs/system-design.md, « Steps of the
  // first launch »). The order of the steps is in lib/first-launch-steps.js, their state in
  // lib/first-launch.svelte.js. Moving between steps plays the forward shared-axis X transition on this column
  // only (« Retour » plays it backwards); the blue panel next to it does not move.
  import { onMount, untrack } from 'svelte';
  import { sharedFile } from '../lib/shared-file.svelte.js';
  import { f7 } from 'framework7-svelte';
  import { Capacitor } from '@capacitor/core';
  import { BenthicCore } from 'benthic-core';
  import Icon from './Icon.svelte';
  import ReleaseChoiceRow from './ReleaseChoiceRow.svelte';
  import ReleaseField from './ReleaseField.svelte';
  import WelcomeHelpLink from './WelcomeHelpLink.svelte';
  import RecentLogbooks from './RecentLogbooks.svelte';
  import ImportFormats from './ImportFormats.svelte';
  import CsvImportDialog from './CsvImportDialog.svelte';
  import { pickCsvFiles } from '../lib/csv-import.js';
  import { canTryDemo, tryDemo } from '../lib/demo.svelte.js';
  import FirstLaunchGit from './FirstLaunchGit.svelte';
  import FirstLaunchDivelogs from './FirstLaunchDivelogs.svelte';
  import FirstLaunchWebdav from './FirstLaunchWebdav.svelte';
  import FirstLaunchServer from './FirstLaunchServer.svelte';
  import FirstLaunchServerCreate from './FirstLaunchServerCreate.svelte';
  import FirstLaunchBenthicPlus from './FirstLaunchBenthicPlus.svelte';
  import { flow, go, goBack, goBackTo, editName, currentStep, importIsRead, resetFlow } from '../lib/first-launch.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { CLOUD_CONNECTION_AVAILABLE, connectionNext } from '../lib/cloud-connection.js';
  import { hasBack, hasLogbookTitle, chooseOutcome, leavesFirstLaunch, offerShowsSignIn, systemBack } from '../lib/first-launch-steps.js';
  import { setWelcomeBack, welcomeBack } from '../lib/first-launch-back.js';
  import { entryRows } from '../lib/server-signin.js';
  import { logbookFileName, nameFromFile, sanitiseLogbookName } from '../lib/logbook-name.js';
  import { summariseImport, summariseScan, summaryText } from '../lib/import-summary.js';
  import { scanBlob, scanLogbook, stageFile } from '../lib/staged-file.js';
  import { CLOUD_SERVICES, ICLOUD_SERVICE, cloudServices, cloudComing, createDeviceLogbook, downloadedFile, readImportFile } from '../lib/release-welcome.js';
  import { logbook, startWithoutAccount, deleteDives, importFile, importData, importCsvFile, accountReady } from '../lib/logbook.svelte.js';
  import { deviceStore } from '../lib/device-store.js';
  import { importProgress } from '../lib/import-progress.svelte.js';
  import { isCancelled } from '../lib/import-progress.js';
  import { alphaLogbookFile, findAlphaLogbooks, markAlphaImportDone } from '../lib/alpha-logbook.js';
  import { isRelease } from '../lib/edition.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { importErrorKey, isSubsurfaceXml } from '../lib/deep-link.js';
  import { errorCode } from '../lib/account.js';
  import { reducedMotion } from '../lib/reduced-motion.js';
  import { IMPORT_FORMAT_COUNT } from '../lib/import-formats.js';
  import { deviceKind, deviceKey, iosPhone } from '../lib/first-launch-phone.js';
  import { layout, ios, desktopApp, desktopMac } from '../lib/layout.svelte.js';
  import { noLogbook } from '../lib/desktop-logbooks.svelte.js';
  import { cloudErrorKey, creationErrorKey } from '../lib/desktop-logbooks.js';
  import { DROP_STEPS, droppedFiles, nameFromGitUrl, parkPending, pendingFromSource, signInFailure, signInTo, PENDING_IMPORT_KEY } from '../lib/desktop-first-launch.js';
  import { t, locale } from '../lib/i18n.js';
  import { formatInstantDate } from '../lib/format.js';

  /**
   * `recents`: the desktop window without a logbook, after first use (task 2026-11-16-241): the first step shows the
   * recent logbooks above the three choices, which are compact and neutral, and no demo link.
   * @type {{ f7router: any, recents?: boolean, shown?: boolean }}
   */
  let { f7router, recents = false, shown = true } = $props();

  const step = $derived(currentStep());
  /** « Retour » of the tablet's offer (task 2026-11-18-282), except right after a sign-in where the code is spent. */
  const tabletOfferBack = $derived(step === 'benthicPlusOffer' && !layout.phone && !desktopApp && offerShowsSignIn(flow.stack));
  /** The first step's rows are 12 dp high on an Android phone (mock-up android-premier-lancement-production). */
  const denseRows = $derived(layout.phone && !ios);
  /** The iPhone variant of the first launch (task 2026-11-16-261): iCloud Drive first, iOS rows and alert. */
  const iphone = $derived(iosPhone(ios, layout.phone));
  /** The device the texts name: this tablet, phone, iPhone or computer (one `deviceKey` for all). */
  const kind = $derived(deviceKind({ phone: layout.phone, ios, desktop: desktopApp }));
  /** The icon of the device choice: a computer on the desktop, a phone on a phone, a tablet on a tablet. */
  const deviceIcon = $derived(kind === 'desktop' ? 'desktop' : layout.phone ? 'device' : 'tablet');
  /** The services of the lists; iCloud Drive first on an iPhone, before WebDAV on macOS (tasks 2026-11-16-228, 261). */
  const services = $derived(cloudServices({ iphone, mac: desktopMac }));
  const service = $derived([ICLOUD_SERVICE, ...CLOUD_SERVICES].find((s) => s.key === flow.service) ?? CLOUD_SERVICES[0]);
  /**
   * The desktop app's window without a logbook: it takes the logbook this first launch makes (the main process
   * creates it and the window reloads on it), and the cloud connection is the desktop app's own (desktop/cloud.cjs).
   */
  const windowTakes = desktopApp && noLogbook;
  const serviceName = $derived(t(service.text));
  const fileName = $derived(logbookFileName(flow.name, []));
  const nameInvalid = $derived(!fileName);
  const nameError = $derived(flow.name.trim() && nameInvalid ? t('welcomeSteps.nameInvalid') : '');
  let busy = $state(false);
  /** The name of the file the core could not read: the error block of « Importer un carnet » (task 223). */
  let unreadable = $state('');
  $effect(() => {
    if (step !== 'import') unreadable = '';
  });
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();


  // --- The transition between steps (docs/system-design.md, « Steps of the first launch ») ---------

  /**
   * The step that arrives or leaves: the CSS classes below carry the shared-axis X animation (30 dp, the
   * outgoing content fades out in the first 30 %, the incoming one fades in over the rest, `spatial-default` for
   * the slide and `effects-default` for the fades); this only keeps a leaving step on screen until it is done.
   * @param {HTMLElement} node
   * @param {{ kind: 'in'|'out' }} options
   */
  function move(node, { kind }) {
    const cls = `bc-first-launch--${kind}-${flow.direction}`;
    node.classList.add(cls);
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bc-motion-spatial-default-ms')) || 350;
    // The arriving step drops its animation class when the move is done, so that a later move starts clean.
    if (kind === 'in') setTimeout(() => node.classList.remove(cls), ms + 50);
    return { duration: reducedMotion() ? 0 : ms, css: () => '' };
  }

  // --- What each choice does -------------------------------------------------------------------------

  function cloud() {
    cloudComing(showSnackbar, t);
  }

  /** @param {string} key */
  function pickService(key) {
    flow.service = key;
    // iCloud Drive uses the Apple account of the device: no sign-in screen, straight to the connected one.
    if (key === 'icloud') flow.account = t(iphone ? 'welcomeSteps.icloudAccountIphone' : 'welcomeSteps.icloudAccountDesktop');
    go(key === 'webdav' ? 'webdav' : key === 'icloud' ? 'icloud' : 'service');
  }

  /**
   * « Créer le carnet » on the iCloud Drive screen of an iPhone: the logbook's folder is created in the app's iCloud
   * Drive container (plugin, iOS only). The core does not read a logbook from that container yet, so the screen ends
   * with the « coming » message once the folder exists; iCloud Drive turned off says so.
   */
  async function createInIcloud() {
    if (busy || nameInvalid) return;
    busy = true;
    try {
      await BenthicCore.createIcloudLogbook({ name: fileName });
      cloud();
    } catch (e) {
      if (errorCode(e) === 'NOT_AVAILABLE') f7.dialog.create({ title: t('welcomeSteps.icloud'), text: t('welcomeSteps.icloudUnavailable'), buttons: [{ text: t('dialog.ok') }] }).open();
      else failed(e);
    } finally {
      busy = false;
    }
  }

  /** @returns {any} the desktop app's bridge (window.benthicDesktop) */
  const bridge = () => /** @type {any} */ (globalThis).benthicDesktop;

  /**
   * The cloud connection is real in the desktop app's window without a logbook, on the path that creates a logbook:
   * the main process signs in (desktop/cloud.cjs) and creates the file in the service. Opening a logbook of the
   * account is not built yet (the main process cannot list an account's logbooks), so that path keeps its message.
   */
  const realCloud = $derived(windowTakes && (step === 'cloudConnect' || step === 'cloudConnected'));
  /** Another account is being chosen from the connected screen. */
  let switching = $state(false);
  /** Each sign-in has a number: the answer of one that was cancelled, or left with « Retour », is dropped. */
  let signInRun = 0;

  /**
   * « Se connecter à {service} » and « Réessayer »: the provider's page opens in the browser and the screen
   * waits for the answer. In the desktop app's window without a logbook the sign-in is real; elsewhere idea #74 is
   * not built yet: nothing opens and the message says so.
   */
  function signIn() {
    if (realCloud) return void desktopSignIn(step === 'cloudConnected');
    if (!CLOUD_CONNECTION_AVAILABLE) return cloud();
    flow.connection = connectionNext(flow.connection, 'start');
  }

  /** @param {boolean} another « Changer de compte »: the connected screen stays, the account changes */
  async function desktopSignIn(another) {
    const run = ++signInRun;
    const provider = flow.service;
    if (another) switching = true;
    else flow.connection = connectionNext(flow.connection, 'start');
    try {
      const status = await signInTo(bridge().logbooks, provider, another);
      if (run !== signInRun) return;
      flow.account = status.account || serviceName;
      if (!another) go('connected');
    } catch (e) {
      if (run !== signInRun) return;
      const failure = signInFailure(e);
      if (failure === 'unavailable') {
        flow.connection = 'idle';
        cloud();
      } else if (failure === 'cancelled') {
        flow.connection = 'idle';
      } else if (another) {
        showSnackbar(t(cloudErrorKey(/** @type {any} */ (e), provider)));
      } else {
        flow.connection = connectionNext(flow.connection, 'refused');
      }
    } finally {
      if (run === signInRun) switching = false;
    }
  }

  /** « Rouvrir la page »: the provider's page again, in the browser. */
  function reopenPage() {
    if (realCloud) return void bridge().logbooks.cloudReopenSignIn({ provider: flow.service });
    if (!CLOUD_CONNECTION_AVAILABLE) return cloud();
  }

  /** The sign-in waiting in the browser is given up (« Annuler », « Retour »). */
  function abandonSignIn() {
    signInRun++;
    switching = false;
    if (realCloud && flow.connection === 'waiting') bridge().logbooks.cloudCancelSignIn({ provider: flow.service });
  }

  /** « Annuler » of the connection in progress: back to « Se connecter ». */
  function cancelConnection() {
    abandonSignIn();
    flow.connection = connectionNext(flow.connection, 'cancel');
  }

  /** « Retour »: one step back; a sign-in still waiting in the browser is given up. */
  function back() {
    abandonSignIn();
    if (leavesFirstLaunch(flow.stack, flow.origin === 'menu')) leave();
    else goBack();
  }

  /** « Retour » on the first screen of a first launch entered from the logbook's menu: the logbook stays as it was. */
  function leave() {
    // Opened from the account sheet: leaving shows the sheet again, as it was (its « #compte » entry comes back).
    const toAccount = flow.returnTo === 'account';
    logbook.welcome = false;
    resetFlow();
    if (toAccount) navigation.accountOpen = true;
  }

  /** « Changer de compte » of « Aucun carnet dans ce compte »: the list of services. */
  function otherAccount() {
    goBackTo('openCloudService');
  }

  /** The dives to bring into the new logbook, once it is open (nothing for an empty logbook). */
  function importer() {
    const source = flow.source;
    if (!source) return null;
    if (source.kind === 'file') return source.csv ? () => importCsvFile(source.file, source.csv.params, source.csv.companion) : () => importFile(source.file);
    // Already in the app's cache: the core reads it where it is (and deletes it).
    if (source.kind === 'staged') return () => importData(source.fileName, { path: source.path });
    return async () => {
      // A resumable download is several files (one per batch), each imported then discarded.
      let added = 0;
      for (const path of source.paths ?? [source.path]) {
        const file = await downloadedFile(path, (p) => Capacitor.convertFileSrc(p), (u) => fetch(u));
        added += await importFile(file);
        await BenthicCore.discardImport({ path }).catch(() => {});
      }
      return added;
    };
  }

  /** The name is kept as the logbook's label on this device (see report: the file itself is not renamed). */
  function rememberName() {
    try {
      deviceStore.setItem('od.logbookName', sanitiseLogbookName(flow.name));
    } catch {
      // Not fatal.
    }
  }

  /** Git: the label, then the imported dives, after the repository is connected. */
  async function afterGit() {
    rememberName();
    const bring = importer();
    if (bring) await bring();
    resetFlow();
  }

  /**
   * The desktop app's window without a logbook: the main process creates the logbook (the system's save dialog, a
   * git repository or a cloud service) and this window reloads on it. What the diver brought is parked first and
   * imported once the logbook is open (lib/desktop-pending-import.js).
   * @param {Record<string, unknown>} where `where` and what it needs (provider, address…)
   * @param {string} [name] the logbook's name; the one typed by default
   * @returns {Promise<boolean>} false when the diver cancelled (the save dialog)
   * @throws the main process's error: the callers show it
   */
  async function createInWindow(where, name = sanitiseLogbookName(flow.name)) {
    let parked = false;
    try {
      if (flow.source) {
        const pending = await pendingFromSource(flow.source, async (file) => (await stageFile(BenthicCore, file)).path);
        parkPending(sessionStorage, pending);
        parked = true;
      }
      const result = await bridge().logbooks.create({ ...where, name });
      if (result.canceled || !result.opened) throw Object.assign(new Error(result.canceled ? 'CANCELLED' : 'NOT_OPENED'), { cancelled: !!result.canceled });
      return true;
    } catch (e) {
      if (parked) {
        // Nothing was created: what was parked is not needed (the staged files go with the temp folder).
        try {
          sessionStorage.removeItem(PENDING_IMPORT_KEY);
        } catch {
          // Not fatal.
        }
      }
      if (/** @type {any} */ (e)?.cancelled) return false;
      throw e;
    }
  }

  /** The error of a creation in this window, as a message. @param {unknown} e @param {string} [provider] */
  function creationFailed(e, provider = '') {
    console.error('Creating the logbook', /** @type {any} */ (e)?.message);
    showSnackbar(t(provider ? cloudErrorKey(/** @type {any} */ (e), provider) : creationErrorKey(/** @type {any} */ (e))));
  }

  /** « Créer le carnet » of the connected screen: in the desktop app's window the file is created in the service. */
  async function createCloud() {
    // iCloud Drive: the Mac's own account cannot be reached from here yet (no Mac to try it on): the message says so.
    if (!windowTakes || service.key === 'icloud') return cloud();
    if (busy || nameInvalid) return;
    busy = true;
    try {
      await createInWindow({ where: 'cloud', provider: flow.service });
    } catch (e) {
      creationFailed(e, flow.service);
    } finally {
      busy = false;
    }
  }

  /** The WebDAV form, in the window without a logbook: the logbook is created on the server, which checks the account. */
  async function createWebdav() {
    await createInWindow({ where: 'cloud', provider: 'webdav', server: flow.webdav.url.trim(), username: flow.webdav.user.trim(), password: flow.webdav.password });
  }

  /** The git form, in the window without a logbook (an empty repository gets the logbook; one that holds it is opened). */
  async function createGit(/** @type {{ url: string, username: string, branch: string, token: string }} */ access) {
    await createInWindow({ where: 'git', ...access }, step === 'git' ? sanitiseLogbookName(flow.name) : nameFromGitUrl(access.url, t('welcomeSteps.defaultName')));
  }

  /** « Seulement sur cette tablette »: the logbook is created on the device and opened, no extra screen. */
  async function createOnDevice() {
    if (busy) return;
    busy = true;
    if (windowTakes) {
      try {
        await createInWindow({ where: 'computer' });
      } catch (e) {
        creationFailed(e);
      } finally {
        busy = false;
      }
      return;
    }
    try {
      rememberName();
      await createDeviceLogbook(
        {
          deviceLogExists: async () => (await BenthicCore.listDives()).exists,
          start: startWithoutAccount,
          sampleIds: () => logbook.dives.map((d) => d.id),
          remove: deleteDives,
        },
        importer(),
      );
      if (flow.source?.alpha) markAlphaImportDone(deviceStore);
      resetFlow();
    } catch (e) {
      failed(e);
    } finally {
      busy = false;
    }
  }

  /**
   * @param {unknown} e
   * @param {File} [file] the file being read, when there is one
   */
  function failed(e, file) {
    const code = String(/** @type {any} */ (e)?.message ?? '');
    console.error('First launch', code);
    const key = importErrorKey(code);
    if (step === 'import' && file && (key === 'logbook.importFailed' || key === 'logbook.importNoDives')) {
      // iPhone: a native alert (task 2026-11-16-261) instead of the inline card; « Autre fichier » reopens the picker.
      if (iphone) unreadableAlert(file.name);
      else unreadable = file.name;
      return;
    }
    f7.dialog.create({ title: t('logbook.importTitle'), text: t(key), buttons: [{ text: t('dialog.ok') }] }).open();
  }

  /** The iOS alert of an unreadable file: « Annuler » and « Autre fichier », which opens the Files picker again. */
  function unreadableAlert(/** @type {string} */ name) {
    f7.dialog
      .create({
        title: t('welcomeSteps.fileUnreadable'),
        text: t('welcomeSteps.fileUnreadableHelp', { name }),
        buttons: [{ text: t('welcomeSteps.cancel') }, { text: t('welcomeSteps.otherFile'), bold: true, onClick: () => fileInput?.click() }],
      })
      .open();
  }

  /** The CSV file being mapped (task 2026-11-16-224): its column mapping waits for the new logbook. */
  let csv = $state(/** @type {{ file: File, companion: File|null }|null} */ (null));

  /** @param {{ params: import('benthic-core').CsvParams, companion: File|null, dives: number }} result */
  function csvConfirmed(result) {
    const chosen = csv;
    if (!chosen) return;
    flow.source = {
      kind: 'file',
      file: chosen.file,
      name: nameFromFile(chosen.file.name, t('welcomeSteps.defaultName')),
      summary: summariseImport(result.dives),
      csv: { params: result.params, companion: result.companion },
    };
    flow.name = flow.source.name;
    csv = null;
    go('file');
  }

  /**
   * The logbooks the alpha left on this device (decided on 18 November 2026): offered once on « Importer un carnet »,
   * read from the alpha's local copy, without the network and without an account. Empty when there is none, or once it
   * was imported; several when the alpha synced more than one account.
   * @type {import('../lib/alpha-logbook.js').AlphaLogbook[]}
   */
  let alphaFound = $state([]);
  let alphaLooked = false;
  $effect(() => {
    if (step !== 'import' || alphaLooked || windowTakes) return;
    alphaLooked = true;
    void findAlphaLogbooks(BenthicCore, deviceStore, isRelease).then((found) => (alphaFound = found));
  });

  /** « Carnet de la version précédente »: its dives become a file in memory, then « Nouveau carnet » as for any file. */
  /** @param {import('../lib/alpha-logbook.js').AlphaLogbook} found */
  async function useAlphaLogbook(found) {
    if (busy) return;
    busy = true;
    try {
      const name = t('welcomeSteps.alphaName');
      // The core writes the alpha's dives to a file in the app's cache; only its path comes back.
      await importProgress.session(['read', 'check'], name, async () => {
        importProgress.phase('read');
        const staged = await alphaLogbookFile(BenthicCore, found, name);
        let scan;
        try {
          importProgress.phase('check', staged.size);
          scan = await scanLogbook(BenthicCore, staged.path, staged.size, importProgress.reporter('check'));
        } catch (e) {
          await BenthicCore.discardImport({ path: staged.path }).catch(() => {});
          throw e;
        }
        flow.source = { kind: 'staged', path: staged.path, fileName: staged.name, name, summary: summariseScan(found.dives, scan), alpha: true };
        flow.name = name;
        go('file');
      });
    } catch (e) {
      if (isCancelled(e)) showSnackbar(t('importFlow.cancelled'));
      else failed(e);
    } finally {
      busy = false;
    }
  }

  /** « Essayer avec un carnet d’exemple »: only on a device without a logbook (lib/demo.svelte.js). */
  let demoOffered = $state(false);
  // Asked when the steps are on screen, not when they are built: the first-launch popup is built at every start, and the
  // question counts the device logbook's dives in the core (about 1.4 s on a tablet), which delayed the logbook's first dive.
  let demoAsked = false;
  $effect(() => {
    if (!shown) {
      demoAsked = false;
      return;
    }
    if (demoAsked) return;
    demoAsked = true;
    void canTryDemo().then((yes) => (demoOffered = yes));
  });

  /** A file is being dragged over the window, on a step that takes it (the drop line lights up). */
  let dragging = $state(false);

  // Desktop app: a file dropped on the first screen or on « Importer un carnet » starts the import with it. A drop
  // anywhere is kept from opening the file in the window.
  onMount(() => {
    if (!desktopApp) return;
    const takes = () => DROP_STEPS.includes(currentStep()) && !busy;
    /** @param {DragEvent} e */
    const over = (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      dragging = takes();
    };
    /** @param {DragEvent} e */
    const drop = (e) => {
      dragging = false;
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      const files = droppedFiles(e.dataTransfer);
      if (!files.length || !takes()) return;
      if (currentStep() === 'start') go('import');
      void bring(files);
    };
    const leave = (/** @type {DragEvent} */ e) => {
      if (!e.relatedTarget) dragging = false;
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('dragleave', leave);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('dragleave', leave);
    };
  });

  // A logbook file another app shared (« Open with », « Share to », lib/open-link.js): « Importer un carnet »
  // with the file already read, then « Nouveau carnet » with its summary. Nothing is created before the diver
  // confirms there. Waits while another file is being read.
  $effect(() => {
    const file = sharedFile.file;
    if (!file || busy) return;
    untrack(() => {
      sharedFile.file = null;
      resetFlow();
      go('import');
      void bring([file]);
    });
  });
  // A big logbook shared with the app arrives already in the app's cache (only its path): counted by the core, then
  // « Nouveau carnet »; if the diver leaves, the staged file is deleted.
  $effect(() => {
    const staged = sharedFile.staged;
    if (!staged || busy) return;
    untrack(() => {
      sharedFile.staged = null;
      resetFlow();
      go('import');
      void bringStaged(staged);
    });
  });

  /** @param {NonNullable<typeof sharedFile.staged>} staged */
  async function bringStaged(staged) {
    busy = true;
    unreadable = '';
    try {
      importProgress.begin(['read']);
      importProgress.phase('read');
      const { dives } = await BenthicCore.importCount({ path: staged.path });
      if (!dives) throw new Error('NO_DIVES');
      const summary = staged.summary ? { dives, sites: staged.summary.sites || null, firstYear: staged.summary.firstYear, lastYear: staged.summary.lastYear } : summariseImport(dives);
      flow.source = { kind: 'staged', path: staged.path, fileName: staged.name, name: nameFromFile(staged.name, t('welcomeSteps.defaultName')), summary };
      flow.name = flow.source.name;
      go('file');
    } catch (e) {
      await BenthicCore.discardImport({ path: staged.path }).catch(() => {});
      failed(e, null);
    } finally {
      importProgress.end();
      busy = false;
    }
  }

  /** A file picked for the import (« Un fichier »). */
  async function fileChosen() {
    const files = fileInput?.files ? Array.from(fileInput.files) : [];
    if (fileInput) fileInput.value = '';
    await bring(files);
  }

  /**
   * Files brought for the import, picked or (desktop app) dropped on the window: read without touching anything,
   * then « Nouveau carnet » with its summary.
   * @param {File[]} files
   */
  async function bring(files) {
    const picked = files.length ? pickCsvFiles(files) : null;
    const file = picked?.csv ?? files[0];
    if (!file || busy) return;
    unreadable = '';
    if (picked) {
      csv = { file: picked.csv, companion: picked.companion };
      return;
    }
    busy = true;
    try {
      // One line: the copy into the app, the core counting the dives, the pass over the file (lib/import-progress.js).
      importProgress.begin(['copy', 'read', 'check']);
      importProgress.phase('copy', file.size);
      const dives = await readImportFile(file, {
        stage: (f) => stageFile(BenthicCore, f, undefined, importProgress.reporter('copy')),
        count: (o) => {
          importProgress.phase('read');
          return BenthicCore.importCount(o);
        },
        discard: (o) => BenthicCore.discardImport(o),
      });
      // The sites and years come from a streaming pass (a window of 2 MB at a time), not from the file as one text.
      const head = await file.slice(0, 2048).text();
      importProgress.phase('check', file.size);
      const summary = isSubsurfaceXml(head) ? summariseScan(dives, await scanBlob(file, importProgress.reporter('check'))) : summariseImport(dives);
      flow.source = { kind: 'file', file, name: nameFromFile(file.name, t('welcomeSteps.defaultName')), summary };
      flow.name = flow.source.name;
      go('file');
    } catch (e) {
      if (isCancelled(e)) showSnackbar(t('importFlow.cancelled'));
      else failed(e, file);
    } finally {
      importProgress.end();
      busy = false;
    }
  }

  /** @param {{ path: string, paths?: string[], dives: number }} read the divelogs.de download, read */
  function divelogsRead(read) {
    importIsRead({ kind: 'divelogs', path: read.path, paths: read.paths, name: t('welcomeSteps.defaultName'), summary: summariseImport(read.dives) });
  }

  /** « Voir mes carnets »: the logbooks of the account, the only one opened at once (idea #74). */
  function seeLogbooks() {
    const outcome = chooseOutcome(flow.found);
    if (outcome === 'open') cloud();
    else go('list');
  }

  /** @param {number} ms */
  const changed = (ms) => formatInstantDate(ms);

  /** The steps whose page title is the step's own title (no logbook name above it). */
  const titles = /** @type {Record<string, string>} */ ({
    start: 'welcomeSteps.startTitle',
    new: 'welcomeSteps.newTitle',
    importNew: 'welcomeSteps.newTitle',
    import: 'welcomeSteps.importTitle',
    importDivelogs: 'welcomeSteps.divelogsFormTitle',
    importProgress: 'welcomeSteps.divelogsFormTitle',
    open: 'welcomeSteps.openTitle',
    openCloudService: 'welcomeSteps.openTitle',
    openCloudConnect: 'welcomeSteps.openTitle',
    openCloudConnected: 'welcomeSteps.openTitle',
    openChoose: 'welcomeSteps.chooseTitle',
    openWebdav: 'welcomeSteps.openTitle',
    openGit: 'welcomeSteps.openTitle',
    createChoice: 'serverCreate.title',
    createName: 'serverCreate.nameTitle',
    createSend: 'serverCreate.sendingTitle',
  });

  /** The steps that draw their own heading (the server's, the Benthic+ screens and the two stops of an upload). */
  const OWN_HEADING = ['server', 'serverCode', 'serverDownload', 'serverOffline', 'createInterrupted', 'createOffline', 'benthicPlusConnect', 'benthicPlusOffer', 'benthicPlusAll', 'benthicPlusReady', 'benthicPlusWelcome'];

  /**
   * « Ouvrir mon carnet » of « Votre carnet est prêt »: the core downloaded the logbook through the git sync (mobile), so
   * it opens now; in the desktop window without a logbook the main process opens it in a window of its own, which
   * downloads it. The snackbar says where the logbook is now (mock-ups …-serveur-carnet).
   */
  async function serverOpened() {
    if (windowTakes) {
      try {
        await createInWindow({ where: 'git', ...(await serverGitAccess()) }, serverLogbookName());
      } catch (e) {
        creationFailed(e);
      }
      return;
    }
    await accountReady();
    showSnackbar(t(deviceKey('serverSteps.downloaded', kind)));
    resetFlow();
  }

  /** The signed-in account's repository, for the main process of the desktop app (the token goes there, never back). */
  async function serverGitAccess() {
    const access = await BenthicCore.serverSessionAccess();
    return { url: access.repositoryUrl, username: access.username, branch: access.branch, token: access.token };
  }

  /** The name the desktop window gives the logbook: the one typed at « Nouveau carnet », else the repository's. */
  function serverLogbookName() {
    return flow.create.name.trim() ? sanitiseLogbookName(flow.create.name) : t('welcomeSteps.defaultName');
  }

  /**
   * « Créer le carnet » with the desktop window without a logbook: the main process creates the logbook in the account's
   * repository (the core makes the branch and pushes it) and the window reloads on it; the dives of a file are parked
   * and imported once it is open, then the normal sync sends them (lib/desktop-pending-import.js).
   * @param {File|null} file
   * @returns {Promise<boolean>} false when the diver cancelled
   */
  async function openInWindow(file) {
    if (file) flow.source = { kind: 'file', file, name: nameFromFile(file.name, t('welcomeSteps.defaultName')), summary: summariseImport(flow.create.total) };
    return createInWindow({ where: 'git', ...(await serverGitAccess()) }, serverLogbookName());
  }

  /** The logbook is on the server and on this device: it opens, the snackbar says where it is. */
  async function serverCreated() {
    logbook.welcomeHold = false;
    await accountReady();
    showSnackbar(t(deviceKey('serverCreate.created', kind)));
    resetFlow();
  }

  /** « Plus tard » and « Ne pas attendre »: the logbook opens; what is not sent yet goes at the next sync. */
  async function serverLater() {
    logbook.welcomeHold = false;
    await accountReady();
    resetFlow();
  }

  /** « Continuer sans compte » and « Continuer sans abonnement »: back to the first step, nothing was created. */
  function withoutAccount() {
    // Entered from the logbook's menu (the free account sheet): nothing to go back to, the first launch closes.
    if (flow.origin === 'menu') leave();
    else goBackTo('start');
  }

  /**
   * The system Back (Android key, gesture and predictive back; lib/back-button.js) and the iOS edge swipe: the same as
   * « Retour », by the rules of `systemBack`. Returns false on the first step, where the app goes to the background.
   */
  function systemBackStep() {
    const action = systemBack(flow.stack, flow.origin === 'menu');
    if (action.kind === 'minimize') return false;
    if (action.kind === 'leave') leave();
    else if (action.kind === 'back') back();
    else if (action.kind === 'without') withoutAccount();
    else if (action.kind === 'cancel') document.querySelector(/** @type {string} */ (action.selector))?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  }

  onMount(() => {
    setWelcomeBack(systemBackStep);
    // iOS has no back key: a swipe from the left edge goes back (F7's swipe-back only applies to router pages).
    /** @type {{ x: number, y: number }|null} */
    let from = null;
    /** @param {TouchEvent} e */
    const start = (e) => {
      const touch = e.touches[0];
      from = ios && !desktopApp && e.touches.length === 1 && touch.clientX <= 24 ? { x: touch.clientX, y: touch.clientY } : null;
    };
    /** @param {TouchEvent} e */
    const end = (e) => {
      const touch = e.changedTouches[0];
      const begun = from;
      from = null;
      if (!begun || !touch) return;
      if (document.querySelector('.bc-welcome.modal-in') && touch.clientX - begun.x > 60 && Math.abs(touch.clientY - begun.y) < 60) welcomeBack();
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchend', end);
      setWelcomeBack(null);
    };
  });
</script>

{#snippet backButton()}
  {#if (hasBack(step, flow.origin === 'menu') && step !== 'benthicPlusAll') || tabletOfferBack}
    <button type="button" class="bc-first-launch--back" onclick={step === 'start' ? leave : back}>
      <span class="bc-first-launch--back-icon"><Icon name="chevron" size={20} weight={2.2} /></span>{t('welcomeSteps.back')}
    </button>
  {/if}
{/snippet}

<!-- Desktop app, task 2026-11-16-228: a logbook file dropped on the window starts the import with that file. -->
{#snippet dropLine()}
  {#if desktopApp}
    <p class="bc-first-launch--drop">{t('welcomeSteps.dropLine')}</p>
  {/if}
{/snippet}

{#snippet logbookTitle()}
  <button type="button" class="bc-first-launch--name" aria-label={t('welcomeSteps.renameLabel')} onclick={editName}>
    <span class="bc-first-launch--title">{flow.name.trim() || t('welcomeSteps.defaultName')}</span>
    <Icon name="edit" size={22} weight={2} />
  </button>
{/snippet}

{#snippet serviceList()}
  <div class="bc-first-launch--list">
    {#each services as s (s.key)}
      <button type="button" class="bc-first-launch--list-row" onclick={() => pickService(s.key)}>
        <span class="bc-first-launch--list-tile"><Icon name={s.icon === 'server' ? 'server' : 'cloudUpload'} size={22} /></span>
        {#if s.help}
          <span class="bc-first-launch--list-text">
            <span class="bc-first-launch--list-title">{t(s.text)}</span>
            <span class="bc-first-launch--list-detail">{t(s.help)}</span>
          </span>
        {:else}
          <span class="bc-first-launch--list-title">{t(s.text)}</span>
        {/if}
        <span class="bc-first-launch--list-chevron"><Icon name="chevron" size={20} weight={2} /></span>
      </button>
    {/each}
  </div>
{/snippet}

{#snippet hero(/** @type {'idle'|'waiting'|'refused'|'connected'} */ state)}
  {@const connected = state === 'connected'}
  <div class="bc-first-launch--hero">
    <div class="bc-first-launch--hero-end">
      <span class="bc-first-launch--hero-tile"><img src="logo-light.svg" alt="" width="48" height="48" /></span>
      <span class="bc-first-launch--hero-name">{t('welcomeSteps.appName')}</span>
    </div>
    <div class="bc-first-launch--hero-link" class:bc-first-launch--hero-linked={connected} class:bc-first-launch--hero-waiting={state === 'waiting'} class:bc-first-launch--hero-refused={state === 'refused'}>
      <span class="bc-first-launch--hero-line"></span>
      <span class="bc-first-launch--hero-badge">
        {#if state === 'waiting'}
          <span class="bc-first-launch--spinner" aria-hidden="true"></span>
        {:else if state === 'refused'}
          <span class="bc-first-launch--hero-question" aria-hidden="true">?</span>
        {:else}
          <Icon name={connected ? 'check' : 'link'} size={connected ? 16 : 14} weight={connected ? 2.6 : 1.8} />
        {/if}
      </span>
      <span class="bc-first-launch--hero-line"></span>
    </div>
    <div class="bc-first-launch--hero-end">
      <span class="bc-first-launch--hero-tile"><Icon name={service.icon === 'server' ? 'server' : 'cloudUpload'} size={34} /></span>
      <span class="bc-first-launch--hero-name">{serviceName}</span>
    </div>
  </div>
{/snippet}

{#snippet connecting()}
  {@render hero(flow.connection)}
  {#if flow.connection === 'waiting'}
    <p class="bc-first-launch--status" role="status">{t('welcomeSteps.connecting')}</p>
    <p class="bc-first-launch--status-help">{t('welcomeSteps.connectingHelp')}</p>
    <div class="bc-first-launch--buttons">
      <button type="button" class="bc-first-launch--outlined" onclick={cancelConnection}>{t('welcomeSteps.cancel')}</button>
      <button type="button" class="bc-first-launch--quiet" onclick={reopenPage}>
        <Icon name="openInNew" size={18} />{t('welcomeSteps.reopenPage')}
      </button>
    </div>
  {:else if flow.connection === 'refused'}
    <p class="bc-first-launch--status bc-first-launch--status-error" role="alert">{t('welcomeSteps.refusedTitle')}</p>
    <p class="bc-first-launch--status-help">{t('welcomeSteps.refusedHelp')}</p>
    <button type="button" class="bc-first-launch--action" onclick={signIn}>
      <Icon name="openInNew" size={18} />{t('welcomeSteps.retry')}
    </button>
  {:else}
    <p class="bc-first-launch--status">{t('welcomeSteps.notConnected')}</p>
    <button type="button" class="bc-first-launch--action bc-first-launch--action-centre" onclick={signIn}>
      <Icon name="openInNew" size={18} />{t('welcomeSteps.connect', { service: serviceName })}
    </button>
    <p class="bc-first-launch--hint">{t('welcomeSteps.connectHint')}</p>
  {/if}
{/snippet}

{#snippet nameStep()}
  {#if flow.source}
    <div class="bc-first-launch--summary">
      <span class="bc-first-launch--summary-icon"><Icon name="file" size={20} /></span>
      <span class="bc-first-launch--summary-text">
        <span class="bc-first-launch--summary-name">{flow.source.kind === 'file' ? flow.source.file.name : flow.source.kind === 'staged' ? flow.source.fileName : t('welcomeSteps.divelogsTitle')}</span>
        <span class="bc-first-launch--summary-detail">{summaryText(flow.source.summary, t)}</span>
      </span>
    </div>
  {/if}
  <ReleaseField class="bc-first-launch--name-field" label={t('welcomeSteps.nameLabel')} bind:value={flow.name} tall error={nameError} help={t('welcomeSteps.nameHelp')} />
  {#if step === 'importNew'}
    <button type="button" class="bc-first-launch--action" disabled={busy || nameInvalid} onclick={createOnDevice}>{t('welcomeSteps.importLogbook')}</button>
  {:else}
    <button type="button" class="bc-first-launch--action" disabled={busy || nameInvalid} onclick={createOnDevice}>{t('welcomeSteps.createLogbook')}</button>
  {/if}
{/snippet}

<div class="bc-first-launch" class:bc-first-launch--first={step === 'start'} class:bc-first-launch--dragging={dragging} class:bc-first-launch--desktop={desktopApp}>
  <div class="bc-first-launch--stage">
    {#key step}
      <section class="bc-first-launch--step" data-step={step} in:move={{ kind: 'in' }} out:move={{ kind: 'out' }}>
        {@render backButton()}

        {#if hasLogbookTitle(step)}
          {@render logbookTitle()}
        {:else if step === 'start' && recents}
          <RecentLogbooks />
        {:else if !OWN_HEADING.includes(step)}
          <h2 class="bc-first-launch--title">{t(titles[step])}</h2>
        {/if}

        {#if step === 'start' && recents}
          <h3 class="bc-first-launch--or">{t('desktopLogbooks.recents.orElse')}</h3>
          <nav class="bc-first-launch--rows bc-first-launch--rows-compact" aria-label={t('desktopLogbooks.recents.otherChoices')}>
            <ReleaseChoiceRow compact icon="plus" title={t('welcomeSteps.createTitle')} help={t('welcomeSteps.createHelp')} onclick={() => go('create')} />
            <ReleaseChoiceRow compact icon="upload" title={t('welcomeSteps.importTitle')} help={t('welcomeSteps.importHelp')} onclick={() => go('import')} />
            <ReleaseChoiceRow compact icon="logbook" title={t('welcomeSteps.openTitle')} help={t('welcomeSteps.openHelp')} onclick={() => go('open')} />
          </nav>
          {@render dropLine()}
        {:else if step === 'start'}
          <nav class="bc-first-launch--rows bc-first-launch--rows-start" aria-label={t('welcomeSteps.startTitle')}>
            <!-- Task 2026-11-17-263: sign in (the Benthic+ chip above its title), then a logbook on the device, then the import. -->
            <ReleaseChoiceRow main prominent plus dense={denseRows} icon="login" title={t('welcomeSteps.signInTitle')} help={t('welcomeSteps.signInHelp')} onclick={() => go('signIn')} />
            <ReleaseChoiceRow dense={denseRows} icon={deviceIcon} title={t(deviceKey('welcomeSteps.localTitle', kind))} help={t('welcomeSteps.localHelp')} onclick={() => go('create')} />
            <ReleaseChoiceRow dense={denseRows} icon="upload" title={t('welcomeSteps.importTitle')} help={t('welcomeSteps.importStartHelp')} onclick={() => go('import')} />
          </nav>
          <div class="bc-first-launch--text-buttons">
            {#if demoOffered}
              <button type="button" class="bc-first-launch--text-button" disabled={busy} onclick={() => void tryDemo()}>{t('demoLogbook.link')}</button>
            {/if}
            <button type="button" class="bc-first-launch--text-button bc-first-launch--text-button-quiet" onclick={() => go('discover')}>{t('welcomeSteps.discoverPlus')}</button>
          </div>
          {@render dropLine()}
        {:else if step === 'new' || step === 'importNew'}
          {@render nameStep()}
        {:else if step === 'cloudService'}
          <h3 class="bc-first-launch--subtitle">{t('welcomeSteps.serviceTitle')}</h3>
          <p class="bc-first-launch--lead">{t('welcomeSteps.serviceHelp')}</p>
          {@render serviceList()}
        {:else if step === 'cloudConnect' || step === 'cloudConnected'}
          <h3 class="bc-first-launch--subtitle">{t('welcomeSteps.connectTitle', { service: serviceName })}</h3>
          {#if step === 'cloudConnect'}
            {@render connecting()}
          {:else}
            {@render hero('connected')}
            <p class="bc-first-launch--status">{flow.account}</p>
            <p class="bc-first-launch--status-help">{t('welcomeSteps.connectedCreate', { file: fileName })}</p>
            {#if service.key !== 'icloud'}
              <button type="button" class="bc-first-launch--text-link" disabled={switching} onclick={signIn}>{t('welcomeSteps.changeAccount')}</button>
            {/if}
            <button type="button" class="bc-first-launch--action" disabled={busy} onclick={iphone && service.key === 'icloud' ? createInIcloud : createCloud}>{t('welcomeSteps.createLogbook')}</button>
          {/if}
        {:else if step === 'webdav'}
          <h3 class="bc-first-launch--subtitle">{t('welcomeSteps.webdavTitle')}</h3>
          <FirstLaunchWebdav create oncoming={cloud} onsubmit={windowTakes ? createWebdav : undefined} onfail={windowTakes ? (e) => creationFailed(e, 'webdav') : undefined} />
        {:else if step === 'git'}
          <h3 class="bc-first-launch--subtitle">{t('welcomeSteps.gitStepTitle')}</h3>
          <FirstLaunchGit create router={f7router} afterConnect={afterGit} onswitch={() => go('openLink')} onconnect={windowTakes ? createGit : undefined} />
        {:else if step === 'import'}
          <p class="bc-first-launch--lead">{t('welcomeSteps.importQuestion')}</p>
          {#if unreadable}
            <div class="bc-first-launch--error" role="alert">
              <span class="bc-first-launch--error-icon"><Icon name="error" size={22} /></span>
              <span class="bc-first-launch--error-text">
                <span class="bc-first-launch--error-title">{t('welcomeSteps.fileUnreadable')}</span>
                <span class="bc-first-launch--error-detail">{t('welcomeSteps.fileUnreadableHelp', { name: unreadable })}</span>
              </span>
            </div>
          {/if}
          <nav class="bc-first-launch--rows" aria-label={t('welcomeSteps.importQuestion')}>
            {#each alphaFound as found (found.id)}
              <ReleaseChoiceRow icon="logbook" title={t('welcomeSteps.alphaTitle')} help={alphaFound.length > 1 ? t('welcomeSteps.alphaHelpDated', { n: found.dives, date: formatInstantDate(found.modified * 1000) }) : t('welcomeSteps.alphaHelp', { n: found.dives })} disabled={busy} onclick={() => useAlphaLogbook(found)} />
            {/each}
            <ReleaseChoiceRow main icon="file" title={t('welcomeSteps.fileTitle')} help={t('welcomeSteps.fileHelp', { n: IMPORT_FORMAT_COUNT })} disabled={busy} onclick={() => fileInput?.click()} />
            <!-- Task 2026-11-16-226: the link sits right under « Un fichier », a 48 dp target 4 dp from each row. -->
            <ImportFormats />
            <ReleaseChoiceRow icon="globe" title={t('welcomeSteps.divelogsTitle')} help={t('welcomeSteps.divelogsHelp')} onclick={() => go('divelogs')} />
          </nav>
          {@render dropLine()}
          <input type="file" multiple class="bc-first-launch--file" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={fileChosen} />
          {#if csv}
            <CsvImportDialog file={csv.file} companion={csv.companion} onclose={() => (csv = null)} onconfirm={csvConfirmed} onfail={(e) => { const file = csv?.file; csv = null; failed(e, file); }} />
          {/if}
        {:else if step === 'importDivelogs' || step === 'importProgress'}
          <FirstLaunchDivelogs {step} onread={divelogsRead} />
        {:else if step === 'open'}
          <p class="bc-first-launch--lead">{t('welcomeSteps.openWhere')}</p>
          <nav class="bc-first-launch--rows" aria-label={t('welcomeSteps.openWhere')}>
            <!-- The OpenDives server only: the beta never opens a logbook in a cloud drive or a personal git repository. -->
            {#each entryRows('open') as row (row.key)}
              <ReleaseChoiceRow main={row.main} icon="server" title={t('serverSteps.rowTitle')} help={t('serverSteps.openHelp')} onclick={() => go('server')} />
            {/each}
          </nav>
        {:else if step === 'openCloudService'}
          <p class="bc-first-launch--lead">{t('welcomeSteps.openService')}</p>
          {@render serviceList()}
        {:else if step === 'openCloudConnect' || step === 'openCloudConnected'}
          <p class="bc-first-launch--lead bc-first-launch--lead-tight">{t('welcomeSteps.connectTitle', { service: serviceName })}</p>
          {#if step === 'openCloudConnect'}
            {@render connecting()}
          {:else}
            {@render hero('connected')}
            <p class="bc-first-launch--status">{flow.account}</p>
            <p class="bc-first-launch--status-help">{t('welcomeSteps.openConnectedHelp')}</p>
            {#if service.key !== 'icloud'}
              <button type="button" class="bc-first-launch--text-link" onclick={signIn}>{t('welcomeSteps.changeAccount')}</button>
            {/if}
            <button type="button" class="bc-first-launch--action" onclick={seeLogbooks}>{t('welcomeSteps.seeLogbooks')}</button>
          {/if}
        {:else if step === 'openChoose'}
          <p class="bc-first-launch--lead">{t('welcomeSteps.chooseHelp', { account: flow.account, service: serviceName })}</p>
          {#if chooseOutcome(flow.found) === 'none'}
            <!-- Nothing in the OpenDives folder (mock-up …-ouvrir-aucun-carnet-paysage). -->
            <div class="bc-first-launch--empty">
              <span class="bc-first-launch--empty-tile"><Icon name="logbook" size={24} /></span>
              <p class="bc-first-launch--empty-title">{t('welcomeSteps.noLogbookTitle')}</p>
              <p class="bc-first-launch--empty-text">{t('welcomeSteps.noLogbookText')}</p>
            </div>
            <div class="bc-first-launch--buttons bc-first-launch--buttons-even">
              <button type="button" class="bc-first-launch--outlined" onclick={otherAccount}>{t('welcomeSteps.changeAccount')}</button>
              <button type="button" class="bc-first-launch--action bc-first-launch--action-inline" onclick={() => go('createHere')}>{t('welcomeSteps.createHere')}</button>
            </div>
          {/if}
          <div class="bc-first-launch--list" hidden={chooseOutcome(flow.found) === 'none'}>
            {#each flow.found as found (found.id)}
              <button type="button" class="bc-first-launch--list-row" onclick={cloud}>
                <span class="bc-first-launch--list-tile"><Icon name="logbook" size={22} /></span>
                <span class="bc-first-launch--list-text">
                  <span class="bc-first-launch--list-title">{found.name}</span>
                  <span class="bc-first-launch--list-detail">{t('welcomeSteps.foundLogbook', { n: found.dives, date: changed(Date.parse(found.changed)) })}</span>
                </span>
                <span class="bc-first-launch--list-chevron"><Icon name="chevron" size={20} weight={2} /></span>
              </button>
            {/each}
          </div>
        {:else if step === 'openWebdav'}
          <p class="bc-first-launch--lead bc-first-launch--lead-tight">{t('welcomeSteps.webdavTitle')}</p>
          <FirstLaunchWebdav create={false} oncoming={cloud} />
        {:else if step === 'openGit'}
          <h3 class="bc-first-launch--subtitle">{t('welcomeSteps.gitStepTitle')}</h3>
          <FirstLaunchGit create={false} router={f7router} afterConnect={async () => resetFlow()} onswitch={() => go('createLink')} onconnect={windowTakes ? createGit : undefined} />
        {:else if step === 'server' || step === 'serverCode' || step === 'serverOffline' || step === 'serverDownload'}
          <FirstLaunchServer {step} />
        {:else if step === 'createChoice' || step === 'createName' || step === 'createSend' || step === 'createInterrupted' || step === 'createOffline'}
          <FirstLaunchServerCreate {step} {openInWindow} onfinished={serverCreated} onlater={serverLater} />
        {:else if step === 'benthicPlusConnect' || step === 'benthicPlusOffer' || step === 'benthicPlusAll' || step === 'benthicPlusReady' || step === 'benthicPlusWelcome'}
          <FirstLaunchBenthicPlus {step} onwithout={withoutAccount} onopen={serverOpened} />
        {/if}
      </section>
    {/key}
  </div>

  <!-- Task 2026-11-15-219: pinned 28 dp above the bottom of the column on every step, so that it does not move. -->
  <WelcomeHelpLink />
</div>

<style>
  @layer od.components {
    .bc-first-launch {
      position: relative;
      box-sizing: border-box;
      flex: 1;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      /* Room for the help link pinned at the bottom. */
      padding: 24px 64px 76px;
      overflow: hidden;
    }

    .bc-first-launch--stage {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template: 1fr / 1fr;
      overflow-y: auto;
    }

    /* The leaving and the arriving step lie on the same cell, centred. */
    .bc-first-launch--step {
      grid-area: 1 / 1;
      align-self: center;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    /* Shared axis X: 30 dp, the outgoing fades out in the first 30 %, the incoming fades in over the rest. */
    @keyframes -global-od-first-launch-in-forward {
      from { translate: 30px 0; }
      to { translate: 0 0; }
    }
    @keyframes -global-od-first-launch-in-back {
      from { translate: -30px 0; }
      to { translate: 0 0; }
    }
    @keyframes -global-od-first-launch-out-forward {
      to { translate: -30px 0; }
    }
    @keyframes -global-od-first-launch-out-back {
      to { translate: 30px 0; }
    }
    @keyframes -global-od-first-launch-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes -global-od-first-launch-fade-out {
      to { opacity: 0; }
    }

    .bc-first-launch--stage :global(.bc-first-launch--in-forward),
    .bc-first-launch--stage :global(.bc-first-launch--in-back) {
      animation:
        var(--bc-first-launch-slide) var(--bc-motion-spatial-default-ms, 350ms) var(--bc-motion-spatial-default, cubic-bezier(0.2, 0, 0, 1)) both,
        od-first-launch-fade-in calc(var(--bc-motion-effects-default-ms, 200ms) * 1) var(--bc-motion-effects-default, ease-out)
          calc(var(--bc-motion-spatial-default-ms, 350ms) * 0.3) both;
    }

    .bc-first-launch--stage :global(.bc-first-launch--in-forward) { --bc-first-launch-slide: od-first-launch-in-forward; }
    .bc-first-launch--stage :global(.bc-first-launch--in-back) { --bc-first-launch-slide: od-first-launch-in-back; }

    .bc-first-launch--stage :global(.bc-first-launch--out-forward),
    .bc-first-launch--stage :global(.bc-first-launch--out-back) {
      pointer-events: none;
      animation:
        var(--bc-first-launch-slide) var(--bc-motion-spatial-default-ms, 350ms) var(--bc-motion-spatial-default, cubic-bezier(0.2, 0, 0, 1)) both,
        od-first-launch-fade-out calc(var(--bc-motion-spatial-default-ms, 350ms) * 0.3) var(--bc-motion-effects-default, ease-out) both;
    }

    .bc-first-launch--stage :global(.bc-first-launch--out-forward) { --bc-first-launch-slide: od-first-launch-out-forward; }
    .bc-first-launch--stage :global(.bc-first-launch--out-back) { --bc-first-launch-slide: od-first-launch-out-back; }

    @media (prefers-reduced-motion: reduce) {
      .bc-first-launch--stage :global(.bc-first-launch--in-forward),
      .bc-first-launch--stage :global(.bc-first-launch--in-back),
      .bc-first-launch--stage :global(.bc-first-launch--out-forward),
      .bc-first-launch--stage :global(.bc-first-launch--out-back) {
        animation: none;
      }
    }

    .bc-first-launch--back {
      width: auto;
      align-self: flex-start;
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 0 0 16px -8px;
      padding: 6px 12px 6px 4px;
      border: none;
      border-radius: 18px;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      font-size: 15px;
      line-height: 20px;
      font-weight: 500;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
      }
    }

    .bc-first-launch--back-icon {
      display: flex;
      transform: rotate(180deg);
    }

    .bc-first-launch--title {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .bc-first-launch--name {
      width: auto;
      align-self: flex-start;
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      cursor: pointer;

      :global(svg) {
        color: var(--bc-release-row-main);
      }

      @media (hover: hover) {
        &:hover :global(svg) {
          color: var(--bc-release-row-main-hover);
        }

        &:hover .bc-first-launch--title {
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: 4px;
      }
    }

    .bc-first-launch--subtitle {
      margin: 2px 0 6px;
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-first-launch--lead {
      margin: 0 0 20px;
      font-size: 15px;
      line-height: 21px;
      color: var(--bc-text-2);
    }

    .bc-first-launch--lead-tight {
      margin-bottom: 14px;
    }

    .bc-first-launch--rows {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-first-launch--rows-start {
      margin-top: 14px;
    }

    /* The recent logbooks screen (task 2026-11-16-241): « Ou bien » and the three compact choices under the list. */
    .bc-first-launch--or {
      margin: 28px 0 10px;
      font-size: 15px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-first-launch--rows-compact {
      gap: 8px;
    }

    :global(.bc-first-launch--name-field) {
      margin: 8px 0 4px;
    }

    /* The file that could not be read (mock-up …-importer-fichier-erreur-paysage). */
    .bc-first-launch--error {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin: 0 0 22px;
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--bc-error-container);
      color: var(--bc-on-error-container);
    }

    .bc-first-launch--error-icon {
      flex: none;
      color: var(--bc-error);
      display: flex;
    }

    .bc-first-launch--error-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .bc-first-launch--error-title {
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .bc-first-launch--error-detail {
      font-size: 14px;
      line-height: 19px;
    }

    .bc-first-launch--file {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    /* A grouped list: the services, the logbooks found. */
    .bc-first-launch--list {
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-first-launch--list-row {
      box-sizing: border-box;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border: none;
      border-bottom: 1px solid var(--bc-release-divider);
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background-color 0.15s;

      &:last-child {
        border-bottom: none;
      }

      @media (hover: hover) {
        &:hover {
          background: var(--bc-surface-2);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: -2px;
      }
    }

    .bc-first-launch--list-tile {
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-release-tile);
      color: var(--bc-release-tile-icon);
    }

    .bc-first-launch--list-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .bc-first-launch--list-title {
      flex: 1;
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .bc-first-launch--list-text .bc-first-launch--list-title {
      flex: none;
    }

    .bc-first-launch--list-detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-first-launch--list-chevron {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    /* The link between OpenDives and the service. */
    .bc-first-launch--hero {
      margin-top: 14px;
      padding: 22px 64px 18px;
      border-radius: 24px;
      background: linear-gradient(180deg, var(--bc-release-hero) 0%, var(--bc-background) 100%);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .bc-first-launch--hero-end {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      width: 96px;
    }

    .bc-first-launch--hero-tile {
      width: 80px;
      height: 80px;
      border-radius: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-surface);
      box-shadow: 0 2px 8px var(--bc-release-row-shadow-hover);
      color: var(--bc-release-tile-icon);
    }

    .bc-first-launch--hero-name {
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      text-align: center;
    }

    .bc-first-launch--hero-link {
      flex: 1;
      height: 80px;
      display: flex;
      align-items: center;
      gap: 0;
      padding: 0 8px;
    }

    .bc-first-launch--hero-line {
      flex: 1;
      border-top: 2px dashed var(--bc-release-line);
    }

    .bc-first-launch--hero-badge {
      flex: none;
      width: 28px;
      height: 28px;
      margin: 0 -2px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-release-line-soft);
      color: var(--bc-text-2);
    }

    .bc-first-launch--hero-linked {
      .bc-first-launch--hero-line {
        border-top: 3px solid var(--bc-release-ok);
      }

      .bc-first-launch--hero-badge {
        background: var(--bc-release-ok);
        color: var(--bc-release-on-panel);
      }
    }

    .bc-first-launch--hero-waiting {
      .bc-first-launch--hero-line {
        border-top-color: var(--bc-release-row-main);
      }

      .bc-first-launch--hero-badge {
        background: var(--bc-surface);
        box-shadow: 0 1px 4px var(--bc-release-row-shadow-hover);
      }
    }

    .bc-first-launch--hero-refused {
      .bc-first-launch--hero-line {
        border-top-color: var(--bc-alarm);
      }

      .bc-first-launch--hero-badge {
        background: var(--bc-error-container);
        color: var(--bc-alarm);
      }
    }

    .bc-first-launch--hero-question {
      font-size: 14px;
      line-height: 14px;
      font-weight: 700;
    }

    /* The wait for the provider's page: a ring turning on the link. */
    @keyframes od-first-launch-spin {
      to { rotate: 360deg; }
    }

    .bc-first-launch--spinner {
      box-sizing: border-box;
      width: 18px;
      height: 18px;
      border: 2px solid var(--bc-release-track);
      border-top-color: var(--bc-release-row-main);
      border-radius: 50%;
      animation: od-first-launch-spin 0.9s linear infinite;

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    }

    .bc-first-launch--status-error {
      color: var(--bc-alarm);
    }

    .bc-first-launch--status {
      margin: 28px 0 0;
      text-align: center;
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .bc-first-launch--status-help {
      margin: 2px 0 0;
      text-align: center;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    /* « Se connecter à… » is centred, and so is the two-line hint under it (task 2026-11-16-230). */
    .bc-first-launch--action.bc-first-launch--action-centre {
      align-self: center;
    }

    .bc-first-launch--hint {
      align-self: center;
      margin: 8px 0 0;
      text-align: center;
      white-space: pre-line;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-first-launch--buttons {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 24px;
      margin-top: 22px;
    }

    .bc-first-launch--outlined {
      width: auto;
      height: 48px;
      padding: 0 22px;
      border: 1px solid var(--bc-release-field-border);
      border-radius: 24px;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s;

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: 2px;
      }
    }

    /* A text button: « Rouvrir la page ». */
    .bc-first-launch--quiet {
      width: auto;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: transparent;
      color: var(--bc-release-link);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s;

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
      }
    }

    .bc-first-launch--action.bc-first-launch--action-inline {
      margin-top: 0;
    }

    /* « Aucun carnet dans ce compte ». */
    .bc-first-launch--empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 28px 32px 30px;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 24px;
      background: var(--bc-surface);
      text-align: center;
    }

    .bc-first-launch--empty-tile {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-release-tile);
      color: var(--bc-release-tile-icon);
    }

    .bc-first-launch--empty-title {
      margin: 14px 0 0;
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
    }

    .bc-first-launch--empty-text {
      margin: 4px 0 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-first-launch--text-link {
      width: auto;
      align-self: center;
      margin: 6px 0 0;
      padding: 2px 4px;
      border: none;
      background: transparent;
      color: var(--bc-release-row-main);
      font: inherit;
      font-size: 13px;
      line-height: 18px;
      text-decoration: underline;
      cursor: pointer;

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          color: var(--bc-release-row-main-hover);
        }
      }
    }

    /* The two text buttons under the three choices of the first step (task 2026-11-17-263): « Essayer avec un carnet
       d’exemple » and « Découvrir Benthic+ », centred, Material 3 text buttons: 40 dp high, 12 dp side padding, 8 dp
       apart, 16 dp above and below the group. */
    .bc-first-launch--text-buttons {
      align-self: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      margin: 16px 0;
    }

    .bc-first-launch--text-button {
      width: auto;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: transparent;
      color: var(--bc-release-link);
      font: inherit;
      font-size: 15px;
      line-height: 20px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s;
      -webkit-tap-highlight-color: transparent;

      &.bc-first-launch--text-button-quiet {
        color: var(--bc-text-2);
      }

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          background: var(--bc-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-link);
        outline-offset: 2px;
      }
    }

    /* Desktop app (task 2026-11-16-228): the line under the choices of « Pour commencer » and « Importer un carnet »;
       it lights up while a file is dragged over the window. */
    .bc-first-launch--drop {
      margin: 12px 0 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-first-launch--dragging .bc-first-launch--drop {
      color: var(--bc-release-link);
      font-weight: 600;
      outline: 2px dashed var(--bc-release-link);
      outline-offset: 8px;
      border-radius: 4px;
    }

    .bc-first-launch--action {
      width: auto;
      align-self: flex-end;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 22px;
      height: 48px;
      padding: 0 24px;
      border: none;
      border-radius: 24px;
      background: var(--bc-text);
      color: var(--bc-background);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;

      @media (hover: hover) {
        &:hover {
          opacity: 0.88;
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: 2px;
      }
    }

    /* The summary of an imported file. */
    .bc-first-launch--summary {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 4px;
      padding: 12px 14px;
      border-radius: 16px;
      background: var(--bc-release-note);
    }

    .bc-first-launch--summary-icon {
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-surface);
      color: var(--bc-release-row-main);
    }

    .bc-first-launch--summary-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .bc-first-launch--summary-name {
      font-size: 15px;
      line-height: 20px;
      font-weight: 600;
    }

    .bc-first-launch--summary-detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    @media (orientation: portrait) {
      .bc-first-launch {
        padding: 0 120px 76px;
      }

    }

    /* Phone (task 2026-11-16-227; mock-ups docs/mockups/android-premier-lancement-production*.dc.html): the column
       has 16 dp side margins (task 2026-11-16-248, MD3 compact) and its content starts at the top (16 dp under the 96 dp band, 20 dp under the
       330 dp one); the page scrolls when a step is taller than the screen, and the help link follows the
       content, at the bottom of the screen when there is room. */
    @media (max-width: 767.98px) {
      .bc-first-launch {
        padding: 16px 16px 0;
        overflow: visible;
      }

      .bc-first-launch--first {
        padding-top: 20px;
      }

      .bc-first-launch--stage {
        overflow: visible;
      }

      .bc-first-launch--step {
        align-self: start;
      }

      .bc-first-launch :global(.bc-welcome-help-link) {
        margin: auto auto calc(var(--f7-safe-area-bottom) + 28px);
        padding-top: 24px;
      }

      /* Android: the extra height of a tall screen goes above the link (auto margin), as in the mock-up, and the link
         ends 20 dp above the system bar (--f7-safe-area-bottom is the native navigation bar inset, lib/safe-area.js). */
      :global(.md) .bc-first-launch :global(.bc-welcome-help-link) {
        margin-bottom: calc(var(--f7-safe-area-bottom) + 20px);
      }

      .bc-first-launch--title {
        font-size: 24px;
        line-height: 30px;
      }

      .bc-first-launch--hero {
        padding: 22px 0 18px;
        justify-content: center;
      }

      .bc-first-launch--hero-end {
        width: 84px;
      }

      .bc-first-launch--hero-tile {
        width: 64px;
        height: 64px;
        border-radius: 20px;
      }

      .bc-first-launch--hero-link {
        flex: none;
        width: 56px;
        height: 64px;
        padding: 0;
      }

      .bc-first-launch--action,
      .bc-first-launch--action.bc-first-launch--action-centre {
        align-self: stretch;
        justify-content: center;
      }

      .bc-first-launch--hint {
        align-self: center;
        text-align: center;
      }

      /* « Changer de compte » and « Créer un carnet ici »: two buttons of the same width, their text on two lines. */
      .bc-first-launch--buttons-even {
        gap: 12px;

        > button {
          flex: 1 1 0;
          min-width: 0;
          height: auto;
          min-height: 48px;
          padding: 8px 16px;
          justify-content: center;
          text-align: center;
        }
      }
    }

    /* Desktop app (task 2026-11-16-228; mock-ups docs/mockups/bureau-premier-lancement-production-*.dc.html): the
       link between OpenDives and the service is compact and centred (80 dp tiles under 104 dp names, a 120 dp
       line), and the words under it are a little larger. */
    .bc-first-launch--desktop {
      /* A step taller than the window scrolls from its top: auto margins centre it only when there is room. */
      .bc-first-launch--step {
        align-self: start;
        margin-block: auto;
      }

      .bc-first-launch--hero {
        padding: 24px 16px 18px;
        justify-content: center;
      }

      .bc-first-launch--hero-end {
        width: 104px;
        gap: 8px;
      }

      .bc-first-launch--hero-tile {
        width: 80px;
        height: 80px;
        border-radius: 24px;
      }

      .bc-first-launch--hero-name {
        font-size: 14px;
        line-height: 19px;
      }

      .bc-first-launch--hero-link {
        flex: none;
        width: 120px;
        height: 80px;
        padding: 0;
      }

      .bc-first-launch--action {
        align-self: flex-end;

        &.bc-first-launch--action-centre {
          align-self: center;
        }
      }

      .bc-first-launch--status {
        font-size: 17px;
        line-height: 22px;
      }

      .bc-first-launch--status-help {
        font-size: 15px;
        line-height: 21px;
      }
    }
  }
</style>
