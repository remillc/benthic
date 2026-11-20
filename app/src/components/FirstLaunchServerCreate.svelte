<script>
  // @ts-check
  // Creating a logbook on the OpenDives server (task 2026-11-17-266; mock-ups docs/mockups-release/
  // android-serveur-creer-*, android-tablette-serveur-creer-*, bureau-serveur-creer-*): « Aucun carnet sur votre
  // compte » and its three choices, the name of a new logbook, the upload with its progress, and the two stops
  // (« Serveur injoignable », « Envoi interrompu »). The title above the choices, the name and the upload is drawn
  // by FirstLaunchSteps.svelte. The logbook is a Subsurface git logbook made and pushed by the core, like a personal git
  // repository (lib/server-logbook.js); git resumes an interrupted push, so « Reprendre l'envoi » pushes again. The
  // logbook stays on the device too.
  import { OpenDivesCore } from 'opendives-core';
  import Icon from './Icon.svelte';
  import ReleaseChoiceRow from './ReleaseChoiceRow.svelte';
  import ProgressLine from './ProgressLine.svelte';
  import ReleaseField from './ReleaseField.svelte';
  import { flow, go, goBackTo, goReplace } from '../lib/first-launch.svelte.js';
  import { logbook, importFile as importLogbookFile } from '../lib/logbook.svelte.js';
  import { ServerLogbookError, createServerLogbook, pushToServer } from '../lib/server-logbook.js';
  import { nextProgress } from '../lib/sync-progress.js';
  import { createChoices } from '../lib/server-create.js';
  import { readImportFile } from '../lib/release-welcome.js';
  import { stageFile } from '../lib/staged-file.js';
  import { logbookFileName, nameFromFile, sanitiseLogbookName } from '../lib/logbook-name.js';
  import { importErrorKey } from '../lib/deep-link.js';
  import { deviceStore } from '../lib/device-store.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { deviceKind, deviceKey } from '../lib/first-launch-phone.js';
  import { desktopApp, ios, layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * `openInWindow`: the desktop window without a logbook: the main process creates the logbook in the repository (with
   * the dives of the file, imported once the window has reloaded on it); false when the diver cancelled.
   * `onfinished`: the logbook is on the server and opens. `onlater`: it opens, the sending goes on at the next sync.
   * @type {{
   *   step: 'createChoice'|'createName'|'createSend'|'createInterrupted'|'createOffline',
   *   openInWindow: (file: File|null) => Promise<boolean>,
   *   onfinished: () => void,
   *   onlater: () => void,
   * }}
   */
  let { step, openInWindow, onfinished, onlater } = $props();

  const c = flow.create;
  const kind = $derived(deviceKind({ phone: layout.phone, ios, desktop: desktopApp }));
  let busy = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();
  let cancelled = false;
  /** What « Réessayer » repeats. @type {(() => void)|null} */
  let retry = null;
  /** The stage of the upload: bringing the dives in (reading the file), then sending them. */
  let stage = $state(/** @type {'importing'|'sending'} */ ('sending'));
  /** How far the push is (0 to 1), from the core's git messages, and the objects counted so far. */
  let fraction = $state(0);
  let objects = $state({ n: 0, total: 0 });
  /** The desktop window without a logbook: its main process makes the logbook, the window reloads on it. */
  const windowTakes = desktopApp && /** @type {any} */ (globalThis).odDesktop?.logbook === null;

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
        stage: (f) => stageFile(OpenDivesCore, f),
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

  // --- « Nouveau carnet »: an empty logbook ---------------------------------------------------------------

  /**
   * What a failed creation shows: a snackbar for a refusal, « Serveur injoignable » otherwise.
   * @param {unknown} e
   * @returns {boolean} whether the server was simply unreachable
   */
  function failedToCreate(e) {
    const code = e instanceof ServerLogbookError ? e.code : 'UNREACHABLE';
    console.error('Creating the logbook', code);
    if (code === 'REFUSED') showSnackbar(t('serverCreate.refused'));
    else if (code === 'NOT_EMPTY') showSnackbar(t('serverCreate.notEmpty'));
    else if (code === 'FAILED') showSnackbar(t('serverCreate.failed'));
    return code === 'UNREACHABLE';
  }

  /** « Créer le carnet »: the core creates the empty logbook on the server and this device keeps its copy. */
  async function createBlank() {
    if (busy || !fileName) return;
    busy = true;
    try {
      const access = await OpenDivesCore.serverSessionAccess();
      deviceStore.setItem('od.logbookName', sanitiseLogbookName(c.name));
      if (windowTakes) {
        await openInWindow(null);
        return;
      }
      await createServerLogbook(OpenDivesCore, access, { source: 'blank' });
      onfinished();
    } catch (e) {
      // Nothing was created: « Serveur injoignable » (a refusal only says so in a snackbar).
      if (failedToCreate(e)) {
        retry = () => {
          goReplace('createName');
          void createBlank();
        };
        go('offline');
      }
    } finally {
      busy = false;
    }
  }

  // --- « Envoi du carnet » -------------------------------------------------------------------------------

  async function send() {
    cancelled = false;
    fraction = 0;
    objects = { n: 0, total: 0 };
    stage = c.deviceReady ? 'sending' : 'importing';
    /** @type {{ remove: () => Promise<void> }|null} */
    let listener = null;
    try {
      /** @type {import('../lib/sync-progress.js').SyncProgress|null} */
      let progress = null;
      listener = await OpenDivesCore.addListener('syncProgress', (/** @type {{ message: string }} */ { message }) => {
        if (stage !== 'sending') return;
        progress = nextProgress(message, progress);
        fraction = progress?.fraction ?? fraction;
        const m = /\((\d+)\/(\d+)\)/.exec(message);
        if (m && Number(m[2]) > 0) objects = { n: Math.min(Number(m[1]), Number(m[2])), total: Number(m[2]) };
      });
      const name = sanitiseLogbookName(c.name);
      deviceStore.setItem('od.logbookName', name);
      if (c.deviceReady) {
        // The logbook is made and saved here: pushing again sends what the server does not have yet.
        await pushToServer(OpenDivesCore);
      } else if (windowTakes) {
        if (!(await openInWindow(c.source === 'file' ? c.file : null))) goReplace('createChoice');
        return;
      } else {
        const access = await OpenDivesCore.serverSessionAccess();
        const file = c.file;
        await createServerLogbook(OpenDivesCore, access, {
          source: c.source === 'file' ? 'file' : 'device',
          importFile: file ? () => importLogbookFile(file) : undefined,
          onStage: (next) => {
            stage = next;
            if (next === 'sending') c.deviceReady = true;
          },
        });
      }
      if (cancelled) return;
      onfinished();
    } catch (e) {
      if (cancelled) return;
      stopped(e);
    } finally {
      void listener?.remove();
    }
  }

  /** The upload stopped: before the logbook was made on the server it is « Serveur injoignable », after, « Envoi interrompu ». @param {unknown} e */
  function stopped(e) {
    const code = e instanceof ServerLogbookError ? e.code : 'UNREACHABLE';
    console.error('Sending the logbook', code);
    if (code === 'REFUSED') showSnackbar(t('serverCreate.refused'));
    else if (code === 'NOT_EMPTY') showSnackbar(t('serverCreate.notEmpty'));
    else if (code === 'FAILED') showSnackbar(t('serverCreate.failed'));
    if (c.deviceReady || code === 'REFUSED' || code === 'FAILED') {
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

  /** « Ne pas attendre »: the logbook opens, and the sending goes on at the next sync (git sends what the server lacks). */
  function cancelSend() {
    cancelled = true;
    if (c.deviceReady) onlater();
    else goReplace('createChoice');
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

  const ratio = $derived(Math.min(1, fraction));
</script>

{#if step === 'createChoice'}
  <p class="bc-server-create--lead">{t('serverCreate.lead')}</p>
  <nav class="bc-server-create--rows" aria-label={t('serverCreate.title')}>
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
  <input type="file" accept=".ssrf,.xml,text/xml,application/xml" class="bc-server-create--file" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={fileChosen} />
{:else if step === 'createName'}
  <ReleaseField label={t('welcomeSteps.nameLabel')} bind:value={c.name} tall error={nameError} help={t(deviceKey('serverCreate.nameHelp', kind))} onenter={createBlank} />
  <button type="button" class="bc-server-create--action" disabled={busy || !fileName} aria-busy={busy} onclick={createBlank}>{t('serverCreate.create')}</button>
{:else if step === 'createSend'}
  <p class="bc-server-create--name">{c.total ? t('serverCreate.sendingName', { name: sanitiseLogbookName(c.name), n: c.total }) : sanitiseLogbookName(c.name)}</p>
  <div class="bc-server-create--bar" role="progressbar" aria-label={t('serverCreate.sendingTitle')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(ratio * 100)}>
    <span class="bc-server-create--bar-fill" style:width="{ratio * 100}%"></span>
  </div>
  <div class="bc-server-create--counts">
    {#if stage === 'importing'}
      <span class="bc-server-create--count">{t(c.source === 'file' ? 'serverCreate.reading' : 'serverCreate.importing')}</span>
    {:else if objects.total}
      <ProgressLine done={objects.n} total={objects.total} count={t('serverCreate.objects', { n: objects.n, total: objects.total })} />
    {:else}
      <span class="bc-server-create--count">{t('serverCreate.sending')}</span>
    {/if}
  </div>
  <p class="bc-server-create--note">
    <Icon name={desktopApp ? 'desktop' : layout.phone ? 'phone' : 'tablet'} size={20} />
    <span>{t(deviceKey('serverCreate.safe', kind))}</span>
  </p>
  <button type="button" class="bc-server-create--text" onclick={cancelSend}>{t('serverCreate.cancel')}</button>
{:else if step === 'createInterrupted'}
  <span class="bc-server-create--tile bc-server-create--tile-pending" aria-hidden="true"><Icon name="cloudUpload" size={28} weight={1.8} /></span>
  <h2 class="bc-server-create--heading">{t('serverCreate.interruptedTitle')}</h2>
  <p class="bc-server-create--lead">{t(deviceKey('serverCreate.interruptedHelp', kind))}</p>
  <div class="bc-server-create--bar bc-server-create--bar-stopped" role="progressbar" aria-label={t('serverCreate.interruptedTitle')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(ratio * 100)}>
    <span class="bc-server-create--bar-fill" style:width="{ratio * 100}%"></span>
  </div>
  <div class="bc-server-create--buttons">
    <button type="button" class="bc-server-create--text" onclick={onlater}>{t('serverCreate.later')}</button>
    <button type="button" class="bc-server-create--action bc-server-create--action-inline" onclick={() => goReplace('createSend')}>{t('serverCreate.resume')}</button>
  </div>
{:else if step === 'createOffline'}
  <span class="bc-server-create--tile" aria-hidden="true"><Icon name="offline" size={28} weight={1.8} /></span>
  <h2 class="bc-server-create--heading">{t('serverCreate.offlineTitle')}</h2>
  <p class="bc-server-create--lead">{t(deviceKey('serverCreate.offlineHelp', kind))} {t('serverCreate.offlineNote')}</p>
  <div class="bc-server-create--buttons">
    <button type="button" class="bc-server-create--text" onclick={home}>{t('serverSteps.backHome')}</button>
    <button type="button" class="bc-server-create--action bc-server-create--action-inline" onclick={again}>{t('serverSteps.retry')}</button>
  </div>
{/if}

<style>
  @layer od.components {
    .bc-server-create--lead {
      margin: 0 0 20px;
      font-size: 15px;
      line-height: 21px;
      color: var(--bc-text-2);
    }

    .bc-server-create--rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-server-create--file {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    .bc-server-create--heading {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .bc-server-create--tile {
      width: 56px;
      height: 56px;
      margin: 4px 0 16px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-error-container);
      color: var(--bc-error);
    }

    .bc-server-create--tile-pending {
      background: var(--bc-plus-amber);
      color: var(--bc-plus-amber-icon);
    }

    .bc-server-create--name {
      margin: 0 0 14px;
      font-size: 16px;
      line-height: 21px;
      color: var(--bc-text-2);
    }

    /* The bar of the mock-up: flat, determinate, the width says how many dives are on the server. */
    .bc-server-create--bar {
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      background: var(--bc-release-track);
    }

    .bc-server-create--bar-fill {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: var(--bc-release-row-main);
      transition: width 0.3s;
    }

    .bc-server-create--bar-stopped .bc-server-create--bar-fill {
      background: var(--bc-plus-amber-icon);
    }

    .bc-server-create--counts {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin: 8px 0 20px;
      font-size: 15px;
      line-height: 20px;
    }

    .bc-server-create--count {
      color: var(--bc-text);
    }

    .bc-server-create--note {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      margin: 0 0 20px;
      padding: 14px 16px;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 20px;
      background: var(--bc-surface);
      font-size: 15px;
      line-height: 21px;
      color: var(--bc-text);
    }

    .bc-server-create--note :global(svg) {
      flex: none;
      margin-top: 1px;
    }

    .bc-server-create--buttons {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin-top: 22px;
    }

    .bc-server-create--action {
      align-self: flex-end;
      height: 48px;
      margin-top: 22px;
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

      &:disabled {
        cursor: default;
        background: var(--bc-release-disabled-bg);
        color: var(--bc-release-disabled-text);
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          opacity: 0.88;
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: 2px;
      }
    }

    .bc-server-create--action-inline {
      margin-top: 0;
    }

    .bc-server-create--text {
      align-self: flex-end;
      height: 48px;
      padding: 0 16px;
      border: none;
      border-radius: 24px;
      background: transparent;
      color: var(--bc-release-row-main);
      font: inherit;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;

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

    .bc-server-create--buttons .bc-server-create--text {
      color: var(--bc-text);
    }

    @media (max-width: 767.98px) {
      .bc-server-create--action:not(.bc-server-create--action-inline) {
        align-self: stretch;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-server-create--action,
      .bc-server-create--bar-fill {
        transition: none;
      }
    }
  }
</style>
