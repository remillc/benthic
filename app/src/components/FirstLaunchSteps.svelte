<script>
  // @ts-check
  // The right-hand column of the release edition's first launch, in steps (task 2026-11-15-218; mock-ups
  // docs/mockups/android-tablette-premier-lancement-production-*.dc.html; docs/system-design.md, « Steps of the
  // first launch »). The order of the steps is in lib/first-launch-steps.js, their state in
  // lib/first-launch.svelte.js. Moving between steps plays the forward shared-axis X transition on this column
  // only (« Retour » plays it backwards); the blue panel next to it does not move.
  import { onMount } from 'svelte';
  import { f7 } from 'framework7-svelte';
  import { Capacitor } from '@capacitor/core';
  import { OpenDivesCore } from 'opendives-core';
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
  import { flow, go, goBack, goBackTo, editName, currentStep, importIsRead, resetFlow } from '../lib/first-launch.svelte.js';
  import { CLOUD_CONNECTION_AVAILABLE, connectionNext } from '../lib/cloud-connection.js';
  import { hasBack, hasLogbookTitle, chooseOutcome } from '../lib/first-launch-steps.js';
  import { logbookFileName, nameFromFile, sanitiseLogbookName } from '../lib/logbook-name.js';
  import { summariseImport, summaryText } from '../lib/import-summary.js';
  import { openSignIn, openOffer } from '../lib/release-plus.js';
  import { CLOUD_SERVICES, ICLOUD_SERVICE, cloudServices, cloudComing, createDeviceLogbook, downloadedFile, readImportFile } from '../lib/release-welcome.js';
  import { logbook, startWithoutAccount, deleteDives, importFile, importCsvFile } from '../lib/logbook.svelte.js';
  import { deviceStore } from '../lib/device-store.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { importErrorKey, isSubsurfaceXml } from '../lib/deep-link.js';
  import { errorCode } from '../lib/account.js';
  import { reducedMotion } from '../lib/reduced-motion.js';
  import { IMPORT_FORMAT_COUNT } from '../lib/import-formats.js';
  import { deviceKind, deviceKey, iphoneKey, iosPhone } from '../lib/first-launch-phone.js';
  import { layout, ios, desktopApp, desktopMac } from '../lib/layout.svelte.js';
  import { layout, desktopApp, desktopMac } from '../lib/layout.svelte.js';
  import { noLogbook } from '../lib/desktop-logbooks.svelte.js';
  import { cloudErrorKey, creationErrorKey } from '../lib/desktop-logbooks.js';
  import { DROP_STEPS, droppedFiles, nameFromGitUrl, parkPending, pendingFromSource, signInFailure, signInTo, PENDING_IMPORT_KEY } from '../lib/desktop-first-launch.js';
  import { t, locale } from '../lib/i18n.js';

  /**
   * `recents`: the desktop window without a logbook, after first use (task 2026-11-16-241): the first step shows the
   * recent logbooks above the three choices, which are compact and neutral, and no demo link.
   * @type {{ f7router: any, recents?: boolean }}
   */
  let { f7router, recents = false } = $props();

  const step = $derived(currentStep());
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

  const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });

  // --- The transition between steps (docs/system-design.md, « Steps of the first launch ») ---------

  /**
   * The step that arrives or leaves: the CSS classes below carry the shared-axis X animation (30 dp, the
   * outgoing content fades out in the first 30 %, the incoming one fades in over the rest, `spatial-default` for
   * the slide and `effects-default` for the fades); this only keeps a leaving step on screen until it is done.
   * @param {HTMLElement} node
   * @param {{ kind: 'in'|'out' }} options
   */
  function move(node, { kind }) {
    const cls = `od-first-launch--${kind}-${flow.direction}`;
    node.classList.add(cls);
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--od-motion-spatial-default-ms')) || 350;
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
      await OpenDivesCore.createIcloudLogbook({ name: fileName });
      cloud();
    } catch (e) {
      if (errorCode(e) === 'NOT_AVAILABLE') f7.dialog.create({ title: t('welcomeSteps.icloud'), text: t('welcomeSteps.icloudUnavailable'), buttons: [{ text: t('dialog.ok') }] }).open();
      else failed(e);
    } finally {
      busy = false;
    }
  }

  /** @returns {any} the desktop app's bridge (window.odDesktop) */
  const bridge = () => /** @type {any} */ (globalThis).odDesktop;

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
    goBack();
  }

  /** « Retour » on the first screen of a first launch entered from the logbook's menu: the logbook stays as it was. */
  function leave() {
    logbook.welcome = false;
    resetFlow();
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
    return async () => {
      // A resumable download is several files (one per batch), each imported then discarded.
      let added = 0;
      for (const path of source.paths ?? [source.path]) {
        const file = await downloadedFile(path, (p) => Capacitor.convertFileSrc(p), (u) => fetch(u));
        added += await importFile(file);
        await OpenDivesCore.discardImport({ path }).catch(() => {});
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
        const pending = await pendingFromSource(flow.source, async (file) => (await OpenDivesCore.stageImport({ name: file.name, data: await readBase64(file) })).path);
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
          deviceLogExists: async () => (await OpenDivesCore.listDives()).exists,
          start: startWithoutAccount,
          sampleIds: () => logbook.dives.map((d) => d.id),
          remove: deleteDives,
        },
        importer(),
      );
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

  /** @param {File} file */
  function readBase64(file) {
    return /** @type {Promise<string>} */ (
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      })
    );
  }

  /** The CSV file being mapped (task 2026-11-16-224): its column mapping waits for the new logbook. */
  let csv = $state(/** @type {{ file: File, companion: File|null }|null} */ (null));

  /** @param {{ params: import('opendives-core').CsvParams, companion: File|null, dives: number }} result */
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

  /** « Essayer avec un carnet d’exemple »: only on a device without a logbook (lib/demo.svelte.js). */
  let demoOffered = $state(false);
  onMount(() => void canTryDemo().then((yes) => (demoOffered = yes)));

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
      const dives = await readImportFile(file, {
        readBase64,
        stage: (o) => OpenDivesCore.stageImport(o),
        count: (o) => OpenDivesCore.importCount(o),
        discard: (o) => OpenDivesCore.discardImport(o),
      });
      const head = await file.slice(0, 2048).text();
      const text = isSubsurfaceXml(head) ? await file.text() : '';
      flow.source = { kind: 'file', file, name: nameFromFile(file.name, t('welcomeSteps.defaultName')), summary: summariseImport(dives, text) };
      flow.name = flow.source.name;
      go('file');
    } catch (e) {
      failed(e, file);
    } finally {
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
  const changed = (ms) => dateFormat.format(new Date(ms));

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
  });
</script>

{#snippet backButton()}
  {#if hasBack(step, flow.origin === 'menu')}
    <button type="button" class="od-first-launch--back" onclick={step === 'start' ? leave : back}>
      <span class="od-first-launch--back-icon"><Icon name="chevron" size={20} weight={2.2} /></span>{t('welcomeSteps.back')}
    </button>
  {/if}
{/snippet}

<!-- Desktop app, task 2026-11-16-228: a logbook file dropped on the window starts the import with that file. -->
{#snippet dropLine()}
  {#if desktopApp}
    <p class="od-first-launch--drop">{t('welcomeSteps.dropLine')}</p>
  {/if}
{/snippet}

{#snippet logbookTitle()}
  <button type="button" class="od-first-launch--name" aria-label={t('welcomeSteps.renameLabel')} onclick={editName}>
    <span class="od-first-launch--title">{flow.name.trim() || t('welcomeSteps.defaultName')}</span>
    <Icon name="edit" size={22} weight={2} />
  </button>
{/snippet}

{#snippet serviceList()}
  <div class="od-first-launch--list">
    {#each services as s (s.key)}
      <button type="button" class="od-first-launch--list-row" onclick={() => pickService(s.key)}>
        <span class="od-first-launch--list-tile"><Icon name={s.icon === 'server' ? 'server' : 'cloudUpload'} size={22} /></span>
        {#if s.help}
          <span class="od-first-launch--list-text">
            <span class="od-first-launch--list-title">{t(s.text)}</span>
            <span class="od-first-launch--list-detail">{t(s.help)}</span>
          </span>
        {:else}
          <span class="od-first-launch--list-title">{t(s.text)}</span>
        {/if}
        <span class="od-first-launch--list-chevron"><Icon name="chevron" size={20} weight={2} /></span>
      </button>
    {/each}
  </div>
{/snippet}

{#snippet hero(/** @type {'idle'|'waiting'|'refused'|'connected'} */ state)}
  {@const connected = state === 'connected'}
  <div class="od-first-launch--hero">
    <div class="od-first-launch--hero-end">
      <span class="od-first-launch--hero-tile"><img src="logo-light.svg" alt="" width="48" height="48" /></span>
      <span class="od-first-launch--hero-name">{t('welcomeSteps.appName')}</span>
    </div>
    <div class="od-first-launch--hero-link" class:od-first-launch--hero-linked={connected} class:od-first-launch--hero-waiting={state === 'waiting'} class:od-first-launch--hero-refused={state === 'refused'}>
      <span class="od-first-launch--hero-line"></span>
      <span class="od-first-launch--hero-badge">
        {#if state === 'waiting'}
          <span class="od-first-launch--spinner" aria-hidden="true"></span>
        {:else if state === 'refused'}
          <span class="od-first-launch--hero-question" aria-hidden="true">?</span>
        {:else}
          <Icon name={connected ? 'check' : 'link'} size={connected ? 16 : 14} weight={connected ? 2.6 : 1.8} />
        {/if}
      </span>
      <span class="od-first-launch--hero-line"></span>
    </div>
    <div class="od-first-launch--hero-end">
      <span class="od-first-launch--hero-tile"><Icon name={service.icon === 'server' ? 'server' : 'cloudUpload'} size={34} /></span>
      <span class="od-first-launch--hero-name">{serviceName}</span>
    </div>
  </div>
{/snippet}

{#snippet connecting()}
  {@render hero(flow.connection)}
  {#if flow.connection === 'waiting'}
    <p class="od-first-launch--status" role="status">{t('welcomeSteps.connecting')}</p>
    <p class="od-first-launch--status-help">{t('welcomeSteps.connectingHelp')}</p>
    <div class="od-first-launch--buttons">
      <button type="button" class="od-first-launch--outlined" onclick={cancelConnection}>{t('welcomeSteps.cancel')}</button>
      <button type="button" class="od-first-launch--quiet" onclick={reopenPage}>
        <Icon name="openInNew" size={18} />{t('welcomeSteps.reopenPage')}
      </button>
    </div>
  {:else if flow.connection === 'refused'}
    <p class="od-first-launch--status od-first-launch--status-error" role="alert">{t('welcomeSteps.refusedTitle')}</p>
    <p class="od-first-launch--status-help">{t('welcomeSteps.refusedHelp')}</p>
    <button type="button" class="od-first-launch--action" onclick={signIn}>
      <Icon name="openInNew" size={18} />{t('welcomeSteps.retry')}
    </button>
  {:else}
    <p class="od-first-launch--status">{t('welcomeSteps.notConnected')}</p>
    <button type="button" class="od-first-launch--action od-first-launch--action-centre" onclick={signIn}>
      <Icon name="openInNew" size={18} />{t('welcomeSteps.connect', { service: serviceName })}
    </button>
    <p class="od-first-launch--hint">{t('welcomeSteps.connectHint')}</p>
  {/if}
{/snippet}

{#snippet nameStep()}
  {#if flow.source}
    <div class="od-first-launch--summary">
      <span class="od-first-launch--summary-icon"><Icon name="file" size={20} /></span>
      <span class="od-first-launch--summary-text">
        <span class="od-first-launch--summary-name">{flow.source.kind === 'file' ? flow.source.file.name : t('welcomeSteps.divelogsTitle')}</span>
        <span class="od-first-launch--summary-detail">{summaryText(flow.source.summary, t)}</span>
      </span>
    </div>
  {/if}
  <ReleaseField class="od-first-launch--name-field" label={t('welcomeSteps.nameLabel')} bind:value={flow.name} tall error={nameError} help={t('welcomeSteps.nameHelp')} />
  {#if step === 'importNew'}
    <button type="button" class="od-first-launch--action" disabled={busy || nameInvalid} onclick={createOnDevice}>{t('welcomeSteps.importLogbook')}</button>
  {:else}
    <button type="button" class="od-first-launch--action" disabled={busy || nameInvalid} onclick={createOnDevice}>{t('welcomeSteps.createLogbook')}</button>
  {/if}
{/snippet}

<div class="od-first-launch" class:od-first-launch--first={step === 'start'} class:od-first-launch--dragging={dragging} class:od-first-launch--desktop={desktopApp}>
  <div class="od-first-launch--stage">
    {#key step}
      <section class="od-first-launch--step" in:move={{ kind: 'in' }} out:move={{ kind: 'out' }}>
        {@render backButton()}

        {#if hasLogbookTitle(step)}
          {@render logbookTitle()}
        {:else if step === 'start' && recents}
          <RecentLogbooks />
        {:else}
          <h2 class="od-first-launch--title">{t(titles[step])}</h2>
        {/if}

        {#if step === 'start' && recents}
          <h3 class="od-first-launch--or">{t('desktopLogbooks.recents.orElse')}</h3>
          <nav class="od-first-launch--rows od-first-launch--rows-compact" aria-label={t('desktopLogbooks.recents.otherChoices')}>
            <ReleaseChoiceRow compact icon="plus" title={t('welcomeSteps.createTitle')} help={t('welcomeSteps.createHelp')} onclick={() => go('create')} />
            <ReleaseChoiceRow compact icon="upload" title={t('welcomeSteps.importTitle')} help={t('welcomeSteps.importHelp')} onclick={() => go('import')} />
            <ReleaseChoiceRow compact icon="logbook" title={t('welcomeSteps.openTitle')} help={t('welcomeSteps.openHelp')} onclick={() => go('open')} />
          </nav>
          {@render dropLine()}
        {:else if step === 'start'}
          <nav class="od-first-launch--rows od-first-launch--rows-start" aria-label={t('welcomeSteps.startTitle')}>
            <!-- Task 2026-11-17-263: sign in (the OpenDives+ chip above its title), then a logbook on the device, then the import. -->
            <ReleaseChoiceRow main prominent plus dense={denseRows} icon="login" title={t('welcomeSteps.signInTitle')} help={t('welcomeSteps.signInHelp')} onclick={() => openSignIn(showSnackbar, t)} />
            <ReleaseChoiceRow dense={denseRows} icon={deviceIcon} title={t(deviceKey('welcomeSteps.localTitle', kind))} help={t('welcomeSteps.localHelp')} onclick={() => go('create')} />
            <ReleaseChoiceRow dense={denseRows} icon="upload" title={t('welcomeSteps.importTitle')} help={t('welcomeSteps.importStartHelp')} onclick={() => go('import')} />
          </nav>
          <div class="od-first-launch--text-buttons">
            {#if demoOffered}
              <button type="button" class="od-first-launch--text-button" disabled={busy} onclick={() => void tryDemo()}>{t('demoLogbook.link')}</button>
            {/if}
            <button type="button" class="od-first-launch--text-button od-first-launch--text-button-quiet" onclick={() => openOffer(showSnackbar, t)}>{t('welcomeSteps.discoverPlus')}</button>
          </div>
          {@render dropLine()}
        {:else if step === 'new' || step === 'importNew'}
          {@render nameStep()}
        {:else if step === 'cloudService'}
          <h3 class="od-first-launch--subtitle">{t('welcomeSteps.serviceTitle')}</h3>
          <p class="od-first-launch--lead">{t('welcomeSteps.serviceHelp')}</p>
          {@render serviceList()}
        {:else if step === 'cloudConnect' || step === 'cloudConnected'}
          <h3 class="od-first-launch--subtitle">{t('welcomeSteps.connectTitle', { service: serviceName })}</h3>
          {#if step === 'cloudConnect'}
            {@render connecting()}
          {:else}
            {@render hero('connected')}
            <p class="od-first-launch--status">{flow.account}</p>
            <p class="od-first-launch--status-help">{t('welcomeSteps.connectedCreate', { file: fileName })}</p>
            {#if service.key !== 'icloud'}
              <button type="button" class="od-first-launch--text-link" disabled={switching} onclick={signIn}>{t('welcomeSteps.changeAccount')}</button>
            {/if}
            <button type="button" class="od-first-launch--action" disabled={busy} onclick={iphone && service.key === 'icloud' ? createInIcloud : createCloud}>{t('welcomeSteps.createLogbook')}</button>
          {/if}
        {:else if step === 'webdav'}
          <h3 class="od-first-launch--subtitle">{t('welcomeSteps.webdavTitle')}</h3>
          <FirstLaunchWebdav create oncoming={cloud} onsubmit={windowTakes ? createWebdav : undefined} onfail={windowTakes ? (e) => creationFailed(e, 'webdav') : undefined} />
        {:else if step === 'git'}
          <h3 class="od-first-launch--subtitle">{t('welcomeSteps.gitStepTitle')}</h3>
          <FirstLaunchGit create router={f7router} afterConnect={afterGit} onswitch={() => go('openLink')} onconnect={windowTakes ? createGit : undefined} />
        {:else if step === 'import'}
          <p class="od-first-launch--lead">{t('welcomeSteps.importQuestion')}</p>
          {#if unreadable}
            <div class="od-first-launch--error" role="alert">
              <span class="od-first-launch--error-icon"><Icon name="error" size={22} /></span>
              <span class="od-first-launch--error-text">
                <span class="od-first-launch--error-title">{t('welcomeSteps.fileUnreadable')}</span>
                <span class="od-first-launch--error-detail">{t('welcomeSteps.fileUnreadableHelp', { name: unreadable })}</span>
              </span>
            </div>
          {/if}
          <nav class="od-first-launch--rows" aria-label={t('welcomeSteps.importQuestion')}>
            <ReleaseChoiceRow main icon="file" title={t('welcomeSteps.fileTitle')} help={t('welcomeSteps.fileHelp', { n: IMPORT_FORMAT_COUNT })} disabled={busy} onclick={() => fileInput?.click()} />
            <!-- Task 2026-11-16-226: the link sits right under « Un fichier », a 48 dp target 4 dp from each row. -->
            <ImportFormats />
            <ReleaseChoiceRow icon="globe" title={t('welcomeSteps.divelogsTitle')} help={t('welcomeSteps.divelogsHelp')} onclick={() => go('divelogs')} />
          </nav>
          {@render dropLine()}
          <input type="file" multiple class="od-first-launch--file" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={fileChosen} />
          {#if csv}
            <CsvImportDialog file={csv.file} companion={csv.companion} onclose={() => (csv = null)} onconfirm={csvConfirmed} onfail={(e) => { const file = csv?.file; csv = null; failed(e, file); }} />
          {/if}
        {:else if step === 'importDivelogs' || step === 'importProgress'}
          <FirstLaunchDivelogs {step} onread={divelogsRead} />
        {:else if step === 'open'}
          <p class="od-first-launch--lead">{t('welcomeSteps.openWhere')}</p>
          <nav class="od-first-launch--rows" aria-label={t('welcomeSteps.openWhere')}>
            <ReleaseChoiceRow main icon="cloudUpload" title={t('welcomeSteps.cloudTitle')} help={t(iphoneKey('welcomeSteps.openCloudHelp', iphone))} onclick={() => go('cloud')} />
            <ReleaseChoiceRow icon="git" title={t('welcomeSteps.gitTitle')} help={t('welcomeSteps.openGitHelp')} onclick={() => go('git')} />
          </nav>
        {:else if step === 'openCloudService'}
          <p class="od-first-launch--lead">{t('welcomeSteps.openService')}</p>
          {@render serviceList()}
        {:else if step === 'openCloudConnect' || step === 'openCloudConnected'}
          <p class="od-first-launch--lead od-first-launch--lead-tight">{t('welcomeSteps.connectTitle', { service: serviceName })}</p>
          {#if step === 'openCloudConnect'}
            {@render connecting()}
          {:else}
            {@render hero('connected')}
            <p class="od-first-launch--status">{flow.account}</p>
            <p class="od-first-launch--status-help">{t('welcomeSteps.openConnectedHelp')}</p>
            {#if service.key !== 'icloud'}
              <button type="button" class="od-first-launch--text-link" onclick={signIn}>{t('welcomeSteps.changeAccount')}</button>
            {/if}
            <button type="button" class="od-first-launch--action" onclick={seeLogbooks}>{t('welcomeSteps.seeLogbooks')}</button>
          {/if}
        {:else if step === 'openChoose'}
          <p class="od-first-launch--lead">{t('welcomeSteps.chooseHelp', { account: flow.account, service: serviceName })}</p>
          {#if chooseOutcome(flow.found) === 'none'}
            <!-- Nothing in the OpenDives folder (mock-up …-ouvrir-aucun-carnet-paysage). -->
            <div class="od-first-launch--empty">
              <span class="od-first-launch--empty-tile"><Icon name="logbook" size={24} /></span>
              <p class="od-first-launch--empty-title">{t('welcomeSteps.noLogbookTitle')}</p>
              <p class="od-first-launch--empty-text">{t('welcomeSteps.noLogbookText')}</p>
            </div>
            <div class="od-first-launch--buttons od-first-launch--buttons-even">
              <button type="button" class="od-first-launch--outlined" onclick={otherAccount}>{t('welcomeSteps.changeAccount')}</button>
              <button type="button" class="od-first-launch--action od-first-launch--action-inline" onclick={() => go('createHere')}>{t('welcomeSteps.createHere')}</button>
            </div>
          {/if}
          <div class="od-first-launch--list" hidden={chooseOutcome(flow.found) === 'none'}>
            {#each flow.found as found (found.id)}
              <button type="button" class="od-first-launch--list-row" onclick={cloud}>
                <span class="od-first-launch--list-tile"><Icon name="logbook" size={22} /></span>
                <span class="od-first-launch--list-text">
                  <span class="od-first-launch--list-title">{found.name}</span>
                  <span class="od-first-launch--list-detail">{t('welcomeSteps.foundLogbook', { n: found.dives, date: changed(Date.parse(found.changed)) })}</span>
                </span>
                <span class="od-first-launch--list-chevron"><Icon name="chevron" size={20} weight={2} /></span>
              </button>
            {/each}
          </div>
        {:else if step === 'openWebdav'}
          <p class="od-first-launch--lead od-first-launch--lead-tight">{t('welcomeSteps.webdavTitle')}</p>
          <FirstLaunchWebdav create={false} oncoming={cloud} />
        {:else if step === 'openGit'}
          <h3 class="od-first-launch--subtitle">{t('welcomeSteps.gitStepTitle')}</h3>
          <FirstLaunchGit create={false} router={f7router} afterConnect={async () => resetFlow()} onswitch={() => go('createLink')} onconnect={windowTakes ? createGit : undefined} />
        {/if}
      </section>
    {/key}
  </div>

  <!-- Task 2026-11-15-219: pinned 28 dp above the bottom of the column on every step, so that it does not move. -->
  <WelcomeHelpLink />
</div>

<style>
  @layer od.components {
    .od-first-launch {
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

    .od-first-launch--stage {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template: 1fr / 1fr;
      overflow-y: auto;
    }

    /* The leaving and the arriving step lie on the same cell, centred. */
    .od-first-launch--step {
      grid-area: 1 / 1;
      align-self: center;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    /* Shared axis X: 30 dp, the outgoing fades out in the first 30 %, the incoming fades in over the rest. */
    @keyframes od-first-launch-in-forward {
      from { translate: 30px 0; }
      to { translate: 0 0; }
    }
    @keyframes od-first-launch-in-back {
      from { translate: -30px 0; }
      to { translate: 0 0; }
    }
    @keyframes od-first-launch-out-forward {
      to { translate: -30px 0; }
    }
    @keyframes od-first-launch-out-back {
      to { translate: 30px 0; }
    }
    @keyframes od-first-launch-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes od-first-launch-fade-out {
      to { opacity: 0; }
    }

    .od-first-launch--in-forward,
    .od-first-launch--in-back {
      animation:
        var(--od-first-launch-slide) var(--od-motion-spatial-default-ms, 350ms) var(--od-motion-spatial-default, cubic-bezier(0.2, 0, 0, 1)) both,
        od-first-launch-fade-in calc(var(--od-motion-effects-default-ms, 200ms) * 1) var(--od-motion-effects-default, ease-out)
          calc(var(--od-motion-spatial-default-ms, 350ms) * 0.3) both;
    }

    .od-first-launch--in-forward { --od-first-launch-slide: od-first-launch-in-forward; }
    .od-first-launch--in-back { --od-first-launch-slide: od-first-launch-in-back; }

    .od-first-launch--out-forward,
    .od-first-launch--out-back {
      pointer-events: none;
      animation:
        var(--od-first-launch-slide) var(--od-motion-spatial-default-ms, 350ms) var(--od-motion-spatial-default, cubic-bezier(0.2, 0, 0, 1)) both,
        od-first-launch-fade-out calc(var(--od-motion-spatial-default-ms, 350ms) * 0.3) var(--od-motion-effects-default, ease-out) both;
    }

    .od-first-launch--out-forward { --od-first-launch-slide: od-first-launch-out-forward; }
    .od-first-launch--out-back { --od-first-launch-slide: od-first-launch-out-back; }

    @media (prefers-reduced-motion: reduce) {
      .od-first-launch--in-forward,
      .od-first-launch--in-back,
      .od-first-launch--out-forward,
      .od-first-launch--out-back {
        animation: none;
      }
    }

    .od-first-launch--back {
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
      color: var(--od-text);
      font: inherit;
      font-size: 15px;
      line-height: 20px;
      font-weight: 500;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
      }
    }

    .od-first-launch--back-icon {
      display: flex;
      transform: rotate(180deg);
    }

    .od-first-launch--title {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .od-first-launch--name {
      width: auto;
      align-self: flex-start;
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--od-text);
      font: inherit;
      cursor: pointer;

      :global(svg) {
        color: var(--od-release-row-main);
      }

      @media (hover: hover) {
        &:hover :global(svg) {
          color: var(--od-release-row-main-hover);
        }

        &:hover .od-first-launch--title {
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 4px;
      }
    }

    .od-first-launch--subtitle {
      margin: 2px 0 6px;
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-first-launch--lead {
      margin: 0 0 20px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .od-first-launch--lead-tight {
      margin-bottom: 14px;
    }

    .od-first-launch--rows {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-first-launch--rows-start {
      margin-top: 14px;
    }

    /* The recent logbooks screen (task 2026-11-16-241): « Ou bien » and the three compact choices under the list. */
    .od-first-launch--or {
      margin: 28px 0 10px;
      font-size: 15px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-first-launch--rows-compact {
      gap: 8px;
    }

    :global(.od-first-launch--name-field) {
      margin: 8px 0 4px;
    }

    .od-first-launch--section {
      margin: 24px 0 0;
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
    }

    .od-first-launch--section-help {
      margin: 0 0 14px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    /* The file that could not be read (mock-up …-importer-fichier-erreur-paysage). */
    .od-first-launch--error {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin: 0 0 22px;
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--od-error-container);
      color: var(--od-on-error-container);
    }

    .od-first-launch--error-icon {
      flex: none;
      color: var(--od-error);
      display: flex;
    }

    .od-first-launch--error-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .od-first-launch--error-title {
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .od-first-launch--error-detail {
      font-size: 14px;
      line-height: 19px;
    }

    .od-first-launch--file {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    /* A grouped list: the services, the logbooks found. */
    .od-first-launch--list {
      border: 1px solid var(--od-surface-container-highest);
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-first-launch--list-row {
      box-sizing: border-box;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border: none;
      border-bottom: 1px solid var(--od-release-divider);
      background: transparent;
      color: var(--od-text);
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
          background: var(--od-surface-2);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: -2px;
      }
    }

    .od-first-launch--list-tile {
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-tile);
      color: var(--od-release-tile-icon);
    }

    .od-first-launch--list-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .od-first-launch--list-title {
      flex: 1;
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .od-first-launch--list-text .od-first-launch--list-title {
      flex: none;
    }

    .od-first-launch--list-detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-first-launch--list-chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    /* The link between OpenDives and the service. */
    .od-first-launch--hero {
      margin-top: 14px;
      padding: 22px 64px 18px;
      border-radius: 24px;
      background: linear-gradient(180deg, var(--od-release-hero) 0%, var(--od-background) 100%);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .od-first-launch--hero-end {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      width: 96px;
    }

    .od-first-launch--hero-tile {
      width: 80px;
      height: 80px;
      border-radius: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-surface);
      box-shadow: 0 2px 8px var(--od-release-row-shadow-hover);
      color: var(--od-release-tile-icon);
    }

    .od-first-launch--hero-name {
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      text-align: center;
    }

    .od-first-launch--hero-link {
      flex: 1;
      height: 80px;
      display: flex;
      align-items: center;
      gap: 0;
      padding: 0 8px;
    }

    .od-first-launch--hero-line {
      flex: 1;
      border-top: 2px dashed var(--od-release-line);
    }

    .od-first-launch--hero-badge {
      flex: none;
      width: 28px;
      height: 28px;
      margin: 0 -2px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-line-soft);
      color: var(--od-text-2);
    }

    .od-first-launch--hero-linked {
      .od-first-launch--hero-line {
        border-top: 3px solid var(--od-release-ok);
      }

      .od-first-launch--hero-badge {
        background: var(--od-release-ok);
        color: var(--od-release-on-panel);
      }
    }

    .od-first-launch--hero-waiting {
      .od-first-launch--hero-line {
        border-top-color: var(--od-release-row-main);
      }

      .od-first-launch--hero-badge {
        background: var(--od-surface);
        box-shadow: 0 1px 4px var(--od-release-row-shadow-hover);
      }
    }

    .od-first-launch--hero-refused {
      .od-first-launch--hero-line {
        border-top-color: var(--od-alarm);
      }

      .od-first-launch--hero-badge {
        background: var(--od-error-container);
        color: var(--od-alarm);
      }
    }

    .od-first-launch--hero-question {
      font-size: 14px;
      line-height: 14px;
      font-weight: 700;
    }

    /* The wait for the provider's page: a ring turning on the link. */
    @keyframes od-first-launch-spin {
      to { rotate: 360deg; }
    }

    .od-first-launch--spinner {
      box-sizing: border-box;
      width: 18px;
      height: 18px;
      border: 2px solid var(--od-release-track);
      border-top-color: var(--od-release-row-main);
      border-radius: 50%;
      animation: od-first-launch-spin 0.9s linear infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      .od-first-launch--spinner {
        animation: none;
      }
    }

    .od-first-launch--status-error {
      color: var(--od-alarm);
    }

    .od-first-launch--status {
      margin: 28px 0 0;
      text-align: center;
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .od-first-launch--status-help {
      margin: 2px 0 0;
      text-align: center;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    /* « Se connecter à… » is centred, and so is the two-line hint under it (task 2026-11-16-230). */
    .od-first-launch--action.od-first-launch--action-centre {
      align-self: center;
    }

    .od-first-launch--hint {
      align-self: center;
      margin: 8px 0 0;
      text-align: center;
      white-space: pre-line;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-first-launch--buttons {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 24px;
      margin-top: 22px;
    }

    .od-first-launch--outlined {
      width: auto;
      height: 48px;
      padding: 0 22px;
      border: 1px solid var(--od-release-field-border);
      border-radius: 24px;
      background: transparent;
      color: var(--od-text);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s;

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 2px;
      }
    }

    /* A text button: « Rouvrir la page ». */
    .od-first-launch--quiet {
      width: auto;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: transparent;
      color: var(--od-release-link);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s;

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
      }
    }

    .od-first-launch--action.od-first-launch--action-inline {
      margin-top: 0;
    }

    /* « Aucun carnet dans ce compte ». */
    .od-first-launch--empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 28px 32px 30px;
      border: 1px solid var(--od-surface-container-highest);
      border-radius: 24px;
      background: var(--od-surface);
      text-align: center;
    }

    .od-first-launch--empty-tile {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-tile);
      color: var(--od-release-tile-icon);
    }

    .od-first-launch--empty-title {
      margin: 14px 0 0;
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
    }

    .od-first-launch--empty-text {
      margin: 4px 0 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-first-launch--text-link {
      width: auto;
      align-self: center;
      margin: 6px 0 0;
      padding: 2px 4px;
      border: none;
      background: transparent;
      color: var(--od-release-row-main);
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
          color: var(--od-release-row-main-hover);
        }
      }
    }

    /* The two text buttons under the three choices of the first step (task 2026-11-17-263): « Essayer avec un carnet
       d’exemple » and « Découvrir OpenDives+ », centred, Material 3 text buttons: 40 dp high, 12 dp side padding, 8 dp
       apart, 16 dp above and below the group. */
    .od-first-launch--text-buttons {
      align-self: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      margin: 16px 0;
    }

    .od-first-launch--text-button {
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
      color: var(--od-release-link);
      font: inherit;
      font-size: 15px;
      line-height: 20px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s;
      -webkit-tap-highlight-color: transparent;

      &.od-first-launch--text-button-quiet {
        color: var(--od-text-2);
      }

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          background: var(--od-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-link);
        outline-offset: 2px;
      }
    }

    /* Desktop app (task 2026-11-16-228): the line under the choices of « Pour commencer » and « Importer un carnet »;
       it lights up while a file is dragged over the window. */
    .od-first-launch--drop {
      margin: 12px 0 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-first-launch--dragging .od-first-launch--drop {
      color: var(--od-release-link);
      font-weight: 600;
      outline: 2px dashed var(--od-release-link);
      outline-offset: 8px;
      border-radius: 4px;
    }

    .od-first-launch--action {
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
      background: var(--od-text);
      color: var(--od-background);
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
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 2px;
      }
    }

    /* The summary of an imported file. */
    .od-first-launch--summary {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 4px;
      padding: 12px 14px;
      border-radius: 16px;
      background: var(--od-release-note);
    }

    .od-first-launch--summary-icon {
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-surface);
      color: var(--od-release-row-main);
    }

    .od-first-launch--summary-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .od-first-launch--summary-name {
      font-size: 15px;
      line-height: 20px;
      font-weight: 600;
    }

    .od-first-launch--summary-detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    @media (orientation: portrait) {
      .od-first-launch {
        padding: 0 120px 76px;
      }

    }

    /* Phone (task 2026-11-16-227; mock-ups docs/mockups/android-premier-lancement-production*.dc.html): the column
       has 16 dp side margins (task 2026-11-16-248, MD3 compact) and its content starts at the top (16 dp under the 96 dp band, 20 dp under the
       330 dp one); the page scrolls when a step is taller than the screen, and the help link follows the
       content, at the bottom of the screen when there is room. */
    @media (max-width: 767.98px) {
      .od-first-launch {
        padding: 16px 16px 0;
        overflow: visible;
      }

      .od-first-launch--first {
        padding-top: 20px;
      }

      .od-first-launch--stage {
        overflow: visible;
      }

      .od-first-launch--step {
        align-self: start;
      }

      .od-first-launch :global(.od-welcome-help-link) {
        margin: auto auto calc(var(--f7-safe-area-bottom) + 28px);
        padding-top: 24px;
      }

      .od-first-launch--title {
        font-size: 24px;
        line-height: 30px;
      }

      .od-first-launch--hero {
        padding: 22px 0 18px;
        justify-content: center;
      }

      .od-first-launch--hero-end {
        width: 84px;
      }

      .od-first-launch--hero-tile {
        width: 64px;
        height: 64px;
        border-radius: 20px;
      }

      .od-first-launch--hero-link {
        flex: none;
        width: 56px;
        height: 64px;
        padding: 0;
      }

      .od-first-launch--action,
      .od-first-launch--action.od-first-launch--action-centre {
        align-self: stretch;
        justify-content: center;
      }

      .od-first-launch--hint {
        align-self: center;
        text-align: center;
      }

      /* « Changer de compte » and « Créer un carnet ici »: two buttons of the same width, their text on two lines. */
      .od-first-launch--buttons-even {
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
    .od-first-launch--desktop {
      /* A step taller than the window scrolls from its top: auto margins centre it only when there is room. */
      .od-first-launch--step {
        align-self: start;
        margin-block: auto;
      }

      .od-first-launch--hero {
        padding: 24px 16px 18px;
        justify-content: center;
      }

      .od-first-launch--hero-end {
        width: 104px;
        gap: 8px;
      }

      .od-first-launch--hero-tile {
        width: 80px;
        height: 80px;
        border-radius: 24px;
      }

      .od-first-launch--hero-name {
        font-size: 14px;
        line-height: 19px;
      }

      .od-first-launch--hero-link {
        flex: none;
        width: 120px;
        height: 80px;
        padding: 0;
      }

      .od-first-launch--action {
        align-self: flex-end;
      }

      .od-first-launch--action.od-first-launch--action-centre {
        align-self: center;
      }

      .od-first-launch--status {
        font-size: 17px;
        line-height: 22px;
      }

      .od-first-launch--status-help {
        font-size: 15px;
        line-height: 21px;
      }
    }
  }
</style>
