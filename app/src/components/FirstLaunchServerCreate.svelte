<script>
  // @ts-check
  // Creating a logbook on the OpenDives server (task 2026-11-17-266; mock-ups docs/mockups-release/
  // android-serveur-creer-*, android-tablette-serveur-creer-*, bureau-serveur-creer-*): « Aucun carnet sur votre
  // compte » and its three choices, the name of a new logbook, the upload with its progress, and the two stops
  // (« Serveur injoignable », « Envoi interrompu »). The title above the choices, the name and the upload is drawn
  // by FirstLaunchSteps.svelte. The logbook is written in OpenDives' own format, in small commits, so that an
  // interrupted upload resumes where it stopped (lib/server-upload.js); the logbook stays on the device too.
  import { OpenDivesCore } from 'opendives-core';
  import Icon from './Icon.svelte';
  import ReleaseChoiceRow from './ReleaseChoiceRow.svelte';
  import ReleaseField from './ReleaseField.svelte';
  import { flow, go, goBackTo, goReplace } from '../lib/first-launch.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { serverTransport } from '../lib/server-transport.js';
  import { UPLOAD_KEY, UploadError, timeLeft, uploadLogbook } from '../lib/server-upload.js';
  import { coreSource, emptySource } from '../lib/server-upload-source.js';
  import { createChoices } from '../lib/server-create.js';
  import { readImportFile } from '../lib/release-welcome.js';
  import { logbookFileName, nameFromFile, sanitiseLogbookName } from '../lib/logbook-name.js';
  import { importErrorKey } from '../lib/deep-link.js';
  import { deviceStore } from '../lib/device-store.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { deviceKind, deviceKey } from '../lib/first-launch-phone.js';
  import { desktopApp, ios, layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * `makeDeviceLogbook`: creates the logbook on this device, with the dives of a file when there is one; `'reload'`
   * when the desktop window is about to reload on it. `onfinished`: the logbook is on the server and opens.
   * @type {{
   *   step: 'createChoice'|'createName'|'createSend'|'createInterrupted'|'createOffline',
   *   makeDeviceLogbook: (file: File|null) => Promise<'ready'|'reload'|'cancelled'>,
   *   onfinished: () => void,
   *   onlater: () => void,
   * }}
   */
  let { step, makeDeviceLogbook, onfinished, onlater } = $props();

  const c = flow.create;
  const kind = $derived(deviceKind({ phone: layout.phone, ios, desktop: desktopApp }));
  let busy = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();
  let cancelled = false;
  /** What « Réessayer » repeats. @type {(() => void)|null} */
  let retry = null;
  /** The stage of the upload before its first dive: reading the file, then sending. */
  let reading = $state(false);

  const fileName = $derived(logbookFileName(c.name, []));
  const nameError = $derived(c.name.trim() && !fileName ? t('welcomeSteps.nameInvalid') : '');
  const choices = $derived(createChoices(c.deviceLogbook));

  // --- The choices ------------------------------------------------------------------------------------------

  /** The logbook already on this device, for « Envoyer le carnet de … ». */
  async function readDeviceLogbook() {
    try {
      const listed = await OpenDivesCore.listDives();
      if (!listed.exists) return void (c.deviceLogbook = null);
      const name = deviceStore.getItem('od.logbookName') || t('welcomeSteps.defaultName');
      c.deviceLogbook = { name, dives: listed.dives.length };
    } catch {
      c.deviceLogbook = null;
    }
  }

  $effect(() => {
    if (step === 'createChoice') void readDeviceLogbook();
  });

  /** « Créer un carnet vide »: the name step. */
  function blank() {
    c.source = '';
    c.file = null;
    c.name = t('welcomeSteps.defaultName');
    go('blank');
  }

  /** « Envoyer le carnet de … ». */
  function sendDevice() {
    if (!c.deviceLogbook) return;
    c.source = 'device';
    c.file = null;
    c.name = c.deviceLogbook.name;
    c.total = c.deviceLogbook.dives;
    c.done = 0;
    go('send');
  }

  /** The file picked: read first without touching anything (the same check as « Importer un carnet »). */
  async function fileChosen() {
    const file = fileInput?.files?.[0];
    if (fileInput) fileInput.value = '';
    if (!file || busy) return;
    busy = true;
    try {
      const dives = await readImportFile(file, {
        readBase64: (f) => toBase64(f),
        stage: (o) => OpenDivesCore.stageImport(o),
        count: (o) => OpenDivesCore.importCount(o),
        discard: (o) => OpenDivesCore.discardImport(o),
      });
      c.source = 'file';
      c.file = file;
      c.name = nameFromFile(file.name, t('welcomeSteps.defaultName'));
      c.total = dives;
      c.done = 0;
      c.deviceReady = false;
      go('send');
    } catch (e) {
      showSnackbar(t(importErrorKey(String(/** @type {any} */ (e)?.message ?? ''))));
    } finally {
      busy = false;
    }
  }

  /** @param {File} file @returns {Promise<string>} */
  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // --- « Nouveau carnet »: an empty logbook ---------------------------------------------------------------

  /** « Créer le carnet »: the marker on the server, then the logbook on this device. */
  async function createBlank() {
    if (busy || !fileName) return;
    busy = true;
    try {
      const access = await OpenDivesCore.serverSessionAccess();
      await uploadLogbook({ transport: serverTransport, access, store: deviceStore, source: emptySource, name: sanitiseLogbookName(c.name) });
      deviceStore.setItem('od.logbookName', sanitiseLogbookName(c.name));
      logbook.welcomeHold = true;
      const made = await makeDeviceLogbook(null);
      if (made === 'ready') onfinished();
      else logbook.welcomeHold = false;
    } catch (e) {
      // Nothing was created: « Serveur injoignable ».
      console.error('Creating the logbook', e instanceof Error ? e.message : e);
      retry = () => {
        goReplace('createName');
        void createBlank();
      };
      go('offline');
    } finally {
      busy = false;
    }
  }

  // --- « Envoi du carnet » -------------------------------------------------------------------------------

  let startedAt = 0;
  let startedDone = -1;

  /** @param {number} done @param {number} total */
  function progress(done, total) {
    if (startedDone < 0) startedDone = done;
    c.done = done;
    c.total = total;
    c.left = timeLeft({ done, total, startedDone, elapsedMs: Date.now() - startedAt });
  }

  async function send() {
    cancelled = false;
    startedAt = Date.now();
    startedDone = -1;
    c.left = { unit: 'none', n: 0 };
    logbook.welcomeHold = true;
    try {
      const access = await OpenDivesCore.serverSessionAccess();
      if (c.source === 'file' && !c.deviceReady && c.file) {
        reading = true;
        if (layoutReloads()) {
          // Written down first: the window reloads on the new logbook, and the upload goes on from there.
          deviceStore.setItem(UPLOAD_KEY, JSON.stringify({ v: 1, repository: access.repositoryUrl, name: sanitiseLogbookName(c.name), total: c.total, ids: {}, fresh: true }));
        }
        const made = await makeDeviceLogbook(c.file);
        if (made === 'reload') return;
        if (made === 'cancelled') {
          reading = false;
          logbook.welcomeHold = false;
          goReplace('createChoice');
          return;
        }
        c.deviceReady = true;
        reading = false;
      }
      const name = sanitiseLogbookName(c.name);
      deviceStore.setItem('od.logbookName', name);
      await uploadLogbook({
        transport: serverTransport,
        access,
        store: deviceStore,
        source: coreSource(OpenDivesCore),
        name,
        onProgress: progress,
        cancelled: () => cancelled,
      });
      if (cancelled) return;
      onfinished();
    } catch (e) {
      reading = false;
      if (cancelled || (e instanceof UploadError && e.code === 'CANCELLED')) return;
      stopped(e);
    }
  }

  /** The desktop window without a logbook reloads on the one it creates (the main process). */
  function layoutReloads() {
    return desktopApp && /** @type {any} */ (globalThis).odDesktop?.logbook === null;
  }

  /** The upload stopped: nothing sent yet is « Serveur injoignable », else « Envoi interrompu ». @param {unknown} e */
  function stopped(e) {
    console.error('Sending the logbook', e instanceof Error ? e.message : e);
    const sent = e instanceof UploadError ? e.done : c.done;
    if (e instanceof UploadError && e.code === 'REFUSED') showSnackbar(t('serverCreate.refused'));
    c.done = sent;
    if (sent > 0 || (e instanceof UploadError && e.code === 'REFUSED')) {
      goReplace('createInterrupted');
    } else {
      retry = () => goReplace('createSend');
      goReplace('createOffline');
    }
  }

  $effect(() => {
    if (step === 'createSend') {
      void send();
      return () => {
        cancelled = true;
      };
    }
  });

  /** « Annuler l'envoi »: back to the choices; what was sent stays on the server and is reused by the next upload. */
  function cancelSend() {
    cancelled = true;
    reading = false;
    goReplace('createChoice');
  }

  // --- The two stops ----------------------------------------------------------------------------------------

  /** « Revenir à l'accueil »: nothing was created. */
  function home() {
    logbook.welcomeHold = false;
    goBackTo('start');
  }

  function again() {
    const action = retry;
    retry = null;
    if (action) action();
  }

  const leftText = $derived(
    c.left.unit === 'seconds'
      ? t('serverCreate.leftSeconds', { n: c.left.n })
      : c.left.unit === 'minutes'
        ? t('serverCreate.leftMinutes', { n: c.left.n })
        : t('serverCreate.leftNone'),
  );
  const ratio = $derived(c.total ? Math.min(1, c.done / c.total) : 0);
</script>

{#if step === 'createChoice'}
  <p class="od-server-create--lead">{t('serverCreate.lead')}</p>
  <nav class="od-server-create--rows" aria-label={t('serverCreate.title')}>
    {#each choices as choice (choice)}
      {#if choice === 'blank'}
        <ReleaseChoiceRow icon="plus" title={t('serverCreate.blankTitle')} help={t('serverCreate.blankHelp')} onclick={blank} />
      {:else if choice === 'import'}
        <ReleaseChoiceRow icon="upload" title={t('serverCreate.importTitle')} help={t('serverCreate.importHelp')} disabled={busy} onclick={() => fileInput?.click()} />
      {:else if c.deviceLogbook}
        <ReleaseChoiceRow
          icon={desktopApp ? 'desktop' : layout.phone ? 'phone' : 'tablet'}
          title={t(deviceKey('serverCreate.sendTitle', kind))}
          help={t('serverCreate.sendHelp', { name: c.deviceLogbook.name, n: c.deviceLogbook.dives })}
          onclick={sendDevice}
        />
      {/if}
    {/each}
  </nav>
  <input type="file" accept=".ssrf,.xml,text/xml,application/xml" class="od-server-create--file" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={fileChosen} />
{:else if step === 'createName'}
  <ReleaseField label={t('welcomeSteps.nameLabel')} bind:value={c.name} tall error={nameError} help={t(deviceKey('serverCreate.nameHelp', kind))} onenter={createBlank} />
  <button type="button" class="od-server-create--action" disabled={busy || !fileName} aria-busy={busy} onclick={createBlank}>{t('serverCreate.create')}</button>
{:else if step === 'createSend'}
  <p class="od-server-create--name">{t('serverCreate.sendingName', { name: sanitiseLogbookName(c.name), n: c.total })}</p>
  <div class="od-server-create--bar" role="progressbar" aria-label={t('serverCreate.sendingTitle')} aria-valuemin="0" aria-valuemax={c.total} aria-valuenow={c.done}>
    <span class="od-server-create--bar-fill" style:width="{ratio * 100}%"></span>
  </div>
  <div class="od-server-create--counts">
    <span class="od-server-create--count">{reading ? t('serverCreate.reading') : t('serverCreate.progress', { n: c.done, total: c.total })}</span>
    <span class="od-server-create--left" aria-live="off">{reading ? '' : leftText}</span>
  </div>
  <p class="od-server-create--note">
    <Icon name={desktopApp ? 'desktop' : layout.phone ? 'phone' : 'tablet'} size={20} />
    <span>{t(deviceKey('serverCreate.safe', kind))}</span>
  </p>
  <button type="button" class="od-server-create--text" onclick={cancelSend}>{t('serverCreate.cancel')}</button>
{:else if step === 'createInterrupted'}
  <span class="od-server-create--tile od-server-create--tile-pending" aria-hidden="true"><Icon name="cloudUpload" size={28} weight={1.8} /></span>
  <h2 class="od-server-create--heading">{t('serverCreate.interruptedTitle')}</h2>
  <p class="od-server-create--lead">{t(deviceKey('serverCreate.interruptedHelp', kind), { sent: t('serverCreate.sentCount', { n: c.done }), total: c.total })}</p>
  <div class="od-server-create--bar od-server-create--bar-stopped" role="progressbar" aria-label={t('serverCreate.interruptedTitle')} aria-valuemin="0" aria-valuemax={c.total} aria-valuenow={c.done}>
    <span class="od-server-create--bar-fill" style:width="{ratio * 100}%"></span>
  </div>
  <p class="od-server-create--count od-server-create--sent">{t('serverCreate.interruptedSent', { n: c.done, total: c.total })}</p>
  <div class="od-server-create--buttons">
    <button type="button" class="od-server-create--text" onclick={onlater}>{t('serverCreate.later')}</button>
    <button type="button" class="od-server-create--action od-server-create--action-inline" onclick={() => goReplace('createSend')}>{t('serverCreate.resume')}</button>
  </div>
{:else if step === 'createOffline'}
  <span class="od-server-create--tile" aria-hidden="true"><Icon name="offline" size={28} weight={1.8} /></span>
  <h2 class="od-server-create--heading">{t('serverCreate.offlineTitle')}</h2>
  <p class="od-server-create--lead">{t(deviceKey('serverCreate.offlineHelp', kind))} {t('serverCreate.offlineNote')}</p>
  <div class="od-server-create--buttons">
    <button type="button" class="od-server-create--text" onclick={home}>{t('serverSteps.backHome')}</button>
    <button type="button" class="od-server-create--action od-server-create--action-inline" onclick={again}>{t('serverSteps.retry')}</button>
  </div>
{/if}

<style>
  @layer od.components {
    .od-server-create--lead {
      margin: 0 0 20px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .od-server-create--rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .od-server-create--file {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    .od-server-create--heading {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .od-server-create--tile {
      width: 56px;
      height: 56px;
      margin: 4px 0 16px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-error-container);
      color: var(--od-error);
    }

    .od-server-create--tile-pending {
      background: var(--od-plus-amber);
      color: var(--od-plus-amber-icon);
    }

    .od-server-create--name {
      margin: 0 0 14px;
      font-size: 16px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    /* The bar of the mock-up: flat, determinate, the width says how many dives are on the server. */
    .od-server-create--bar {
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      background: var(--od-release-track);
    }

    .od-server-create--bar-fill {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: var(--od-release-row-main);
      transition: width 0.3s;
    }

    .od-server-create--bar-stopped .od-server-create--bar-fill {
      background: var(--od-plus-amber-icon);
    }

    .od-server-create--counts {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin: 8px 0 20px;
      font-size: 15px;
      line-height: 20px;
    }

    .od-server-create--count {
      color: var(--od-text);
    }

    .od-server-create--sent {
      margin: 8px 0 0;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-server-create--left {
      color: var(--od-text-2);
      text-align: end;
    }

    .od-server-create--note {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      margin: 0 0 20px;
      padding: 14px 16px;
      border: 1px solid var(--od-surface-container-highest);
      border-radius: 20px;
      background: var(--od-surface);
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text);
    }

    .od-server-create--note :global(svg) {
      flex: none;
      margin-top: 1px;
    }

    .od-server-create--buttons {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin-top: 22px;
    }

    .od-server-create--action {
      align-self: flex-end;
      height: 48px;
      margin-top: 22px;
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

      &:disabled {
        cursor: default;
        background: var(--od-release-disabled-bg);
        color: var(--od-release-disabled-text);
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          opacity: 0.88;
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 2px;
      }
    }

    .od-server-create--action-inline {
      margin-top: 0;
    }

    .od-server-create--text {
      align-self: flex-end;
      height: 48px;
      padding: 0 16px;
      border: none;
      border-radius: 24px;
      background: transparent;
      color: var(--od-release-row-main);
      font: inherit;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;

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

    .od-server-create--buttons .od-server-create--text {
      color: var(--od-text);
    }

    @media (max-width: 767.98px) {
      .od-server-create--action:not(.od-server-create--action-inline) {
        align-self: stretch;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-server-create--action,
      .od-server-create--bar-fill {
        transition: none;
      }
    }
  }
</style>
