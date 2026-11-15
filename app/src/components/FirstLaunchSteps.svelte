<script>
  // @ts-check
  // The right-hand column of the release edition's first launch, in steps (task 2026-11-15-218; mock-ups
  // docs/mockups/android-tablette-premier-lancement-production-*.dc.html; docs/system-design.md, « Steps of the
  // first launch »). The order of the steps is in lib/first-launch-steps.js, their state in
  // lib/first-launch.svelte.js. Moving between steps plays the forward shared-axis X transition on this column
  // only (« Retour » plays it backwards); the blue panel next to it does not move.
  import { f7 } from 'framework7-svelte';
  import { Capacitor } from '@capacitor/core';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from './Icon.svelte';
  import ReleaseChoiceRow from './ReleaseChoiceRow.svelte';
  import ReleaseField from './ReleaseField.svelte';
  import WelcomeHelpLink from './WelcomeHelpLink.svelte';
  import FirstLaunchGit from './FirstLaunchGit.svelte';
  import FirstLaunchDivelogs from './FirstLaunchDivelogs.svelte';
  import { flow, go, goBack, editName, currentStep, importIsRead, resetFlow } from '../lib/first-launch.svelte.js';
  import { hasBack, hasLogbookTitle, chooseOutcome } from '../lib/first-launch-steps.js';
  import { logbookFileName, nameFromFile, sanitiseLogbookName } from '../lib/logbook-name.js';
  import { summariseImport, summaryText } from '../lib/import-summary.js';
  import { CLOUD_SERVICES, cloudComing, createDeviceLogbook, downloadedFile, readImportFile } from '../lib/release-welcome.js';
  import { logbook, startWithoutAccount, deleteDives, importFile } from '../lib/logbook.svelte.js';
  import { deviceStore } from '../lib/device-store.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { importErrorKey, isSubsurfaceXml } from '../lib/deep-link.js';
  import { reducedMotion } from '../lib/reduced-motion.js';
  import { t, locale } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  const step = $derived(currentStep());
  const service = $derived(CLOUD_SERVICES.find((s) => s.key === flow.service) ?? CLOUD_SERVICES[0]);
  const serviceName = $derived(t(service.text));
  const fileName = $derived(logbookFileName(flow.name, []));
  const nameInvalid = $derived(!fileName);
  const nameError = $derived(flow.name.trim() && nameInvalid ? t('welcomeSteps.nameInvalid') : '');
  let busy = $state(false);
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
    go('service');
  }

  /** « Se connecter à {service} »: idea #74 is not built yet, the message says so. */
  function signIn() {
    cloud();
  }

  /** « Seulement sur cette tablette », « Dans un dépôt git » and « Dans mon nuage » of the name step. */
  function where(/** @type {'cloud'|'git'|'device'} */ kind) {
    if (nameInvalid) return;
    if (kind === 'device') void createOnDevice();
    else go(kind);
  }

  /** The dives to bring into the new logbook, once it is open (nothing for an empty logbook). */
  function importer() {
    const source = flow.source;
    if (!source) return null;
    if (source.kind === 'file') return () => importFile(source.file);
    return async () => {
      const file = await downloadedFile(source.path, (p) => Capacitor.convertFileSrc(p), (u) => fetch(u));
      const added = await importFile(file);
      await OpenDivesCore.discardImport({ path: source.path }).catch(() => {});
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

  /** « Seulement sur cette tablette »: the logbook is created on the device and opened, no extra screen. */
  async function createOnDevice() {
    if (busy) return;
    busy = true;
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

  /** @param {unknown} e */
  function failed(e) {
    const code = String(/** @type {any} */ (e)?.message ?? '');
    console.error('First launch', code);
    f7.dialog.create({ title: t('logbook.importTitle'), text: t(importErrorKey(code)), buttons: [{ text: t('dialog.ok') }] }).open();
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

  /** A file picked for the import: read without touching anything, then « Nouveau carnet » with its summary. */
  async function fileChosen() {
    const file = fileInput?.files?.[0];
    if (!fileInput || !file || busy) return;
    fileInput.value = '';
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
      failed(e);
    } finally {
      busy = false;
    }
  }

  /** @param {{ path: string, dives: number }} read the divelogs.de download, read */
  function divelogsRead(read) {
    importIsRead({ kind: 'divelogs', path: read.path, name: t('welcomeSteps.defaultName'), summary: summariseImport(read.dives) });
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
    openGit: 'welcomeSteps.openTitle',
  });
</script>

{#snippet backButton()}
  {#if hasBack(step)}
    <button type="button" class="od-first-launch--back" onclick={goBack}>
      <span class="od-first-launch--back-icon"><Icon name="chevron" size={20} weight={2.2} /></span>{t('welcomeSteps.back')}
    </button>
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
    {#each CLOUD_SERVICES as s (s.key)}
      <button type="button" class="od-first-launch--list-row" onclick={() => pickService(s.key)}>
        <span class="od-first-launch--list-tile"><Icon name={s.icon === 'server' ? 'server' : 'cloudUpload'} size={22} /></span>
        <span class="od-first-launch--list-title">{t(s.text)}</span>
        <span class="od-first-launch--list-chevron"><Icon name="chevron" size={20} weight={2} /></span>
      </button>
    {/each}
  </div>
{/snippet}

{#snippet hero(connected)}
  <div class="od-first-launch--hero">
    <div class="od-first-launch--hero-end">
      <span class="od-first-launch--hero-tile"><img src="logo-light.svg" alt="" width="48" height="48" /></span>
      <span class="od-first-launch--hero-name">{t('welcomeSteps.appName')}</span>
    </div>
    <div class="od-first-launch--hero-link" class:od-first-launch--hero-linked={connected}>
      <span class="od-first-launch--hero-line"></span>
      <span class="od-first-launch--hero-badge"><Icon name={connected ? 'check' : 'link'} size={connected ? 16 : 14} weight={connected ? 2.6 : 1.8} /></span>
      <span class="od-first-launch--hero-line"></span>
    </div>
    <div class="od-first-launch--hero-end">
      <span class="od-first-launch--hero-tile"><Icon name={service.icon === 'server' ? 'server' : 'cloudUpload'} size={34} /></span>
      <span class="od-first-launch--hero-name">{serviceName}</span>
    </div>
  </div>
{/snippet}

{#snippet nameAndWhere()}
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
  <h3 class="od-first-launch--section">{t('welcomeSteps.whereTitle')}</h3>
  <p class="od-first-launch--section-help">{t('welcomeSteps.whereHelp')}</p>
  <nav class="od-first-launch--rows" aria-label={t('welcomeSteps.whereTitle')}>
    <ReleaseChoiceRow main icon="cloudUpload" title={t('welcomeSteps.cloudTitle')} help={t('welcomeSteps.cloudHelp')} disabled={nameInvalid} onclick={() => where('cloud')} />
    <ReleaseChoiceRow icon="git" title={t('welcomeSteps.gitTitle')} help={t('welcomeSteps.gitHelp')} disabled={nameInvalid} onclick={() => where('git')} />
    <ReleaseChoiceRow icon="tablet" title={t('welcomeSteps.deviceTitle')} help={t('welcomeSteps.deviceHelp')} disabled={nameInvalid || busy} onclick={() => where('device')} />
  </nav>
{/snippet}

<div class="od-first-launch">
  <div class="od-first-launch--stage">
    {#key step}
      <section class="od-first-launch--step" in:move={{ kind: 'in' }} out:move={{ kind: 'out' }}>
        {@render backButton()}

        {#if hasLogbookTitle(step)}
          {@render logbookTitle()}
        {:else}
          <h2 class="od-first-launch--title">{t(titles[step])}</h2>
        {/if}

        {#if step === 'start'}
          <nav class="od-first-launch--rows od-first-launch--rows-start" aria-label={t('welcomeSteps.startTitle')}>
            <ReleaseChoiceRow main icon="plus" title={t('welcomeSteps.createTitle')} help={t('welcomeSteps.createHelp')} onclick={() => go('create')} />
            <ReleaseChoiceRow icon="upload" title={t('welcomeSteps.importTitle')} help={t('welcomeSteps.importHelp')} onclick={() => go('import')} />
            <ReleaseChoiceRow icon="logbook" title={t('welcomeSteps.openTitle')} help={t('welcomeSteps.openHelp')} onclick={() => go('open')} />
          </nav>
          <!-- « Essayer avec un carnet d’exemple »: hidden until to-do #69 (the demo logbook) is built. -->
        {:else if step === 'new' || step === 'importNew'}
          {@render nameAndWhere()}
        {:else if step === 'cloudService'}
          <h3 class="od-first-launch--subtitle">{t('welcomeSteps.serviceTitle')}</h3>
          <p class="od-first-launch--lead">{t('welcomeSteps.serviceHelp')}</p>
          {@render serviceList()}
        {:else if step === 'cloudConnect' || step === 'cloudConnected'}
          <h3 class="od-first-launch--subtitle">{t('welcomeSteps.connectTitle', { service: serviceName })}</h3>
          {@render hero(step === 'cloudConnected')}
          {#if step === 'cloudConnect'}
            <p class="od-first-launch--status">{t('welcomeSteps.notConnected')}</p>
            <p class="od-first-launch--status-help">{t('welcomeSteps.notConnectedHelp')}</p>
            <button type="button" class="od-first-launch--action" onclick={signIn}>
              <Icon name="openInNew" size={18} />{t('welcomeSteps.connect', { service: serviceName })}
            </button>
          {:else}
            <p class="od-first-launch--status">{flow.account}</p>
            <p class="od-first-launch--status-help">{t('welcomeSteps.connectedCreate', { file: fileName })}</p>
            <button type="button" class="od-first-launch--text-link" onclick={signIn}>{t('welcomeSteps.changeAccount')}</button>
            <button type="button" class="od-first-launch--action" onclick={cloud}>{t('welcomeSteps.createLogbook')}</button>
          {/if}
        {:else if step === 'git'}
          <h3 class="od-first-launch--subtitle">{t('welcomeSteps.gitStepTitle')}</h3>
          <FirstLaunchGit create router={f7router} afterConnect={afterGit} onopen={() => go('openLink')} />
        {:else if step === 'import'}
          <p class="od-first-launch--lead">{t('welcomeSteps.importQuestion')}</p>
          <nav class="od-first-launch--rows" aria-label={t('welcomeSteps.importQuestion')}>
            <ReleaseChoiceRow main icon="file" title={t('welcomeSteps.fileTitle')} help={t('welcomeSteps.fileHelp')} disabled={busy} onclick={() => fileInput?.click()} />
            <ReleaseChoiceRow icon="globe" title={t('welcomeSteps.divelogsTitle')} help={t('welcomeSteps.divelogsHelp')} onclick={() => go('divelogs')} />
          </nav>
          <input type="file" class="od-first-launch--file" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={fileChosen} />
        {:else if step === 'importDivelogs' || step === 'importProgress'}
          <FirstLaunchDivelogs {step} onread={divelogsRead} />
        {:else if step === 'open'}
          <p class="od-first-launch--lead">{t('welcomeSteps.openWhere')}</p>
          <nav class="od-first-launch--rows" aria-label={t('welcomeSteps.openWhere')}>
            <ReleaseChoiceRow main icon="cloudUpload" title={t('welcomeSteps.cloudTitle')} help={t('welcomeSteps.openCloudHelp')} onclick={() => go('cloud')} />
            <ReleaseChoiceRow icon="git" title={t('welcomeSteps.gitTitle')} help={t('welcomeSteps.openGitHelp')} onclick={() => go('git')} />
          </nav>
        {:else if step === 'openCloudService'}
          <p class="od-first-launch--lead">{t('welcomeSteps.openService')}</p>
          {@render serviceList()}
        {:else if step === 'openCloudConnect' || step === 'openCloudConnected'}
          <p class="od-first-launch--lead od-first-launch--lead-tight">{t('welcomeSteps.connectTitle', { service: serviceName })}</p>
          {@render hero(step === 'openCloudConnected')}
          {#if step === 'openCloudConnect'}
            <p class="od-first-launch--status">{t('welcomeSteps.notConnected')}</p>
            <p class="od-first-launch--status-help">{t('welcomeSteps.notConnectedHelp')}</p>
            <button type="button" class="od-first-launch--action" onclick={signIn}>
              <Icon name="openInNew" size={18} />{t('welcomeSteps.connect', { service: serviceName })}
            </button>
          {:else}
            <p class="od-first-launch--status">{flow.account}</p>
            <p class="od-first-launch--status-help">{t('welcomeSteps.openConnectedHelp')}</p>
            <button type="button" class="od-first-launch--text-link" onclick={signIn}>{t('welcomeSteps.changeAccount')}</button>
            <button type="button" class="od-first-launch--action" onclick={seeLogbooks}>{t('welcomeSteps.seeLogbooks')}</button>
          {/if}
        {:else if step === 'openChoose'}
          <p class="od-first-launch--lead">{t('welcomeSteps.chooseHelp', { account: flow.account, service: serviceName })}</p>
          <div class="od-first-launch--list">
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
        {:else if step === 'openGit'}
          <h3 class="od-first-launch--subtitle">{t('welcomeSteps.gitStepTitle')}</h3>
          <FirstLaunchGit create={false} router={f7router} afterConnect={async () => resetFlow()} />
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
      padding: 22px 24px 18px;
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

      @media (hover: hover) {
        &:hover {
          color: var(--od-release-row-main-hover);
        }
      }
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
  }
</style>
