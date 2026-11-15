<script>
  // @ts-check
  // First launch of the release edition, on tablets (task 2026-11-15-213; mock-ups
  // docs/mockups/android-tablette-premier-lancement-production-{paysage,portrait}.dc.html and
  // android-tablette-ouvrir-importer-paysage.dc.html). The beta edition keeps pages/WelcomeStart.svelte.
  // Landscape: a 700 dp blue panel on the left (brand, heading, the decorative profile), the choices on the
  // right. Portrait: the panel across the top (640 dp), the choices below. The page chosen for the edition is
  // pages/WelcomeEntry.svelte.
  import { Page, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import ReleaseProfile from '../components/ReleaseProfile.svelte';
  import OpenImportDialog from '../components/OpenImportDialog.svelte';
  import { logbook, startWithoutAccount, deleteDives, importFile } from '../lib/logbook.svelte.js';
  import { OpenDivesCore } from 'opendives-core';
  import { cloudComing, createLogbookFromFile } from '../lib/release-welcome.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { importErrorKey } from '../lib/deep-link.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  let dialogOpen = $state(false);
  let busy = $state(false);

  function cloud() {
    cloudComing(showSnackbar, t);
  }

  /** « Sur cette tablette »: today's « Commencer sans compte ». */
  function onDevice() {
    startWithoutAccount();
  }

  function git() {
    f7router.navigate('/welcome/git');
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

  /** A file picked in the dialog: the logbook of this tablet is made from it, with the app's import. */
  async function fileChosen(/** @type {File} */ file) {
    if (busy) return;
    busy = true;
    try {
      await createLogbookFromFile(file, {
        readBase64,
        stage: (o) => OpenDivesCore.stageImport(o),
        count: (o) => OpenDivesCore.importCount(o),
        discard: (o) => OpenDivesCore.discardImport(o),
        deviceLogExists: async () => (await OpenDivesCore.listDives()).exists,
        start: startWithoutAccount,
        sampleIds: () => logbook.dives.map((d) => d.id),
        remove: deleteDives,
        importFile,
      });
      dialogOpen = false;
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('First launch, import a file', code);
      f7.dialog.create({ title: t('logbook.importTitle'), text: t(importErrorKey(code)), buttons: [{ text: t('dialog.ok') }] }).open();
    } finally {
      busy = false;
    }
  }
</script>

{#snippet row(cls, icon, title, help, onclick)}
  <button type="button" class="od-welcome-release--row {cls}" {onclick}>
    <span class="od-welcome-release--tile"><Icon name={icon} size={24} /></span>
    <span class="od-welcome-release--text">
      <span class="od-welcome-release--title">{title}</span>
      <span class="od-welcome-release--help">{help}</span>
    </span>
    <span class="od-welcome-release--chevron"><Icon name="chevron" size={20} weight={2} /></span>
  </button>
{/snippet}

<Page class="od-welcome-release" noToolbar>
  <div class="od-welcome-release--page">
    <section class="od-welcome-release--panel">
      <div class="od-welcome-release--panel-light" aria-hidden="true"></div>
      <div class="od-welcome-release--panel-bands" aria-hidden="true"></div>
      <div class="od-welcome-release--brand">
        <img class="od-welcome-release--logo" src="logo-light.svg" alt="" width="96" height="96" />
        <span>OpenDives</span>
      </div>
      <h1 class="od-welcome-release--headline">{t('welcomeRelease.headline')}</h1>
      <p class="od-welcome-release--intro">{t('welcomeRelease.intro')}</p>
      <div class="od-welcome-release--profile"><ReleaseProfile /></div>
    </section>

    <section class="od-welcome-release--choices">
      <h2 class="od-welcome-release--choices-title">{t('welcomeRelease.choicesTitle')}</h2>
      <p class="od-welcome-release--choices-help">{t('welcomeRelease.choicesHelp')}</p>
      <nav class="od-welcome-release--rows" aria-label={t('welcome.choicesLabel')}>
        {@render row('od-welcome-release--row-main od-welcome-release--cloud', 'cloudUpload', t('welcomeRelease.cloudTitle'), t('welcomeRelease.cloudHelp'), cloud)}
        {@render row('od-welcome-release--device', 'tablet', t('welcomeRelease.deviceTitle'), t('welcomeRelease.deviceHelp'), onDevice)}
        {@render row('od-welcome-release--git', 'git', t('welcomeRelease.gitTitle'), t('welcomeRelease.gitHelp'), git)}
      </nav>
      <div class="od-welcome-release--divider">
        <span class="od-welcome-release--divider-label">{t('welcomeRelease.haveOne')}</span>
        <span class="od-welcome-release--divider-rule" aria-hidden="true"></span>
      </div>
      {@render row('od-welcome-release--open', 'folderDownload', t('welcomeRelease.openTitle'), t('welcomeRelease.openHelp'), () => (dialogOpen = true))}
      <p class="od-welcome-release--privacy"><Icon name="lock" size={16} />{t('welcomeRelease.privacy')}</p>
    </section>
  </div>
</Page>

{#if dialogOpen}
  <OpenImportDialog oncancel={() => (dialogOpen = false)} oncloud={cloud} onfile={fileChosen} {busy} />
{/if}

<style>
  @layer od.components {
    :global(.od-welcome-release) {
      --f7-page-bg-color: var(--od-background);

      :global(.page-content) {
        padding: 0;
      }
    }

    /* Landscape: panel and choices side by side. */
    .od-welcome-release--page {
      box-sizing: border-box;
      height: 100%;
      min-height: 100%;
      display: flex;
      background: var(--od-background);
      color: var(--od-text);
    }

    .od-welcome-release--panel {
      position: relative;
      box-sizing: border-box;
      flex: none;
      width: min(700px, 58%);
      overflow: hidden;
      padding: calc(max(var(--f7-safe-area-top, 0px), 24px) + 56px) 56px 0;
      display: flex;
      flex-direction: column;
      background: linear-gradient(
        180deg,
        var(--od-release-panel-1) 0%,
        var(--od-release-panel-2) 22%,
        var(--od-release-panel-3) 70%,
        var(--od-release-panel-4) 100%
      );
      color: var(--od-release-on-panel);
    }

    .od-welcome-release--panel-light {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 70% 45% at 22% 0%, var(--od-release-panel-light), transparent 70%);
    }

    .od-welcome-release--panel-bands {
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(105deg, var(--od-release-panel-band) 0 60px, transparent 60px 150px);
      mask-image: linear-gradient(180deg, black 0%, transparent 55%);
    }

    .od-welcome-release--brand {
      position: relative;
      display: flex;
      align-items: center;
      gap: 20px;
      font-size: 48px;
      line-height: 56px;
      font-weight: 500;
      letter-spacing: -0.5px;
    }

    .od-welcome-release--logo {
      display: block;
      width: 96px;
      height: 96px;
    }

    .od-welcome-release--headline {
      position: relative;
      max-width: 540px;
      margin: 36px 0 0;
      font-size: 40px;
      line-height: 48px;
      font-weight: 400;
      letter-spacing: -0.5px;
      white-space: pre-line;
    }

    .od-welcome-release--intro {
      position: relative;
      max-width: 520px;
      margin: 10px 0 0;
      font-size: 16px;
      line-height: 22px;
      color: var(--od-release-on-panel-soft);
    }

    /* The profile keeps 56 dp from the panel's sides (the padding) and 96 dp above its bottom edge. */
    .od-welcome-release--profile {
      position: relative;
      flex: 1;
      min-height: 120px;
      margin: 42px 0 96px;
    }

    .od-welcome-release--choices {
      box-sizing: border-box;
      flex: 1;
      min-width: 0;
      overflow-y: auto;
      padding: 24px 64px 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .od-welcome-release--choices-title {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .od-welcome-release--choices-help {
      margin: 0 0 20px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .od-welcome-release--rows {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-welcome-release--row {
      box-sizing: border-box;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      border: 1px solid var(--od-surface-container-highest);
      border-radius: 20px;
      background: var(--od-surface);
      box-shadow: 0 1px 2px var(--od-release-row-shadow);
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition:
        transform 0.15s,
        box-shadow 0.15s,
        background-color 0.15s;

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 2px;
      }

      @media (hover: hover) {
        &:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px var(--od-release-row-shadow-hover);
          background: var(--od-surface-2);
        }
      }
    }

    .od-welcome-release--row-main {
      border: none;
      background: var(--od-release-row-main);
      box-shadow: 0 6px 18px var(--od-release-row-main-shadow);
      color: var(--od-release-on-panel);

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-row-main-hover);
          box-shadow: 0 8px 22px var(--od-release-row-main-shadow);
        }
      }

      .od-welcome-release--tile {
        background: var(--od-release-main-tile);
        color: var(--od-release-on-panel);
      }

      .od-welcome-release--help,
      .od-welcome-release--chevron {
        color: var(--od-release-on-main-soft);
      }
    }

    .od-welcome-release--tile {
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-tile);
      color: var(--od-release-tile-icon);
    }

    .od-welcome-release--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-welcome-release--title {
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
    }

    .od-welcome-release--help {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-welcome-release--chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-welcome-release--divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 28px 0 16px;
    }

    .od-welcome-release--divider-label {
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--od-release-label);
    }

    .od-welcome-release--divider-rule {
      flex: 1;
      border-top: 1px solid var(--od-surface-container-highest);
    }

    .od-welcome-release--privacy {
      margin: 28px 0 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    @media (prefers-reduced-motion: reduce) {
      .od-welcome-release--row {
        transition: none;
      }
    }

    /* Portrait: the panel across the top (640 dp), the choices centred below it with 120 dp side margins. */
    @media (orientation: portrait) {
      .od-welcome-release--page {
        flex-direction: column;
      }

      .od-welcome-release--panel {
        width: auto;
        height: 640px;
        padding-top: calc(max(var(--f7-safe-area-top, 0px), 24px) + 40px);
      }

      .od-welcome-release--headline {
        margin-top: 28px;
        max-width: 680px;
      }

      .od-welcome-release--intro {
        margin-top: 8px;
        max-width: 600px;
      }

      .od-welcome-release--profile {
        margin: 36px 0 48px;
      }

      .od-welcome-release--choices {
        min-height: 0;
        padding: 0 120px 8px;
      }
    }
  }
</style>
