<script>
  // @ts-check
  // The progress of a `.benthic` import over the app (task 2026-11-23-360): after « Remplacer » of « Remplacer ce carnet ? », and
  // on the desktop once the new logbook is open. Mounted once in App.svelte. A full-screen sheet on a phone, a centred card
  // on a tablet and on the desktop. The first launch draws the same parts inline (FirstLaunchBenthic.svelte).
  import BenthicFileCard from './BenthicFileCard.svelte';
  import BenthicProgressSteps from './BenthicProgressSteps.svelte';
  import { benthicRun, cancelBenthicRun } from '../lib/benthic-import.svelte.js';
  import { desktopApp } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';
</script>

{#if benthicRun.active && benthicRun.overlay}
  <div class="bc-benthic-overlay" role="dialog" aria-modal="true" aria-labelledby="bc-benthic-overlay-title">
    <div class="bc-benthic-overlay--card">
      <h2 class="bc-benthic-overlay--title" id="bc-benthic-overlay-title">{t('welcomeSteps.importTitle')}</h2>
      <BenthicFileCard name={benthicRun.fileName} exportedAt={benthicRun.exportedAt} />
      <BenthicProgressSteps />
      <p class="bc-benthic-overlay--help">{t(desktopApp ? 'benthicImport.progress.helpDesktop' : 'benthicImport.progress.help')}</p>
      <button type="button" class="bc-benthic-overlay--cancel" disabled={benthicRun.cancelling || benthicRun.phase === 'write'} onclick={cancelBenthicRun}>
        {t(benthicRun.cancelling ? 'benthicImport.progress.cancelling' : 'benthicImport.progress.cancel')}
      </button>
    </div>
  </div>
{/if}

<style>
  @layer bc.components {
    .bc-benthic-overlay {
      position: fixed;
      inset: 0;
      z-index: 14000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-background);
      overflow-y: auto;
      padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
    }

    .bc-benthic-overlay--card {
      box-sizing: border-box;
      width: 100%;
      max-width: 560px;
      max-height: 100%;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 24px 20px;
    }

    .bc-benthic-overlay--title {
      margin: 0 0 4px;
      font-size: 24px;
      line-height: 30px;
      font-weight: 600;
    }

    .bc-benthic-overlay--help {
      margin: 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-benthic-overlay--cancel {
      align-self: flex-end;
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

      &:disabled {
        cursor: default;
        opacity: 0.38;
      }
    }

    @media (min-width: 768px) {
      .bc-benthic-overlay {
        background: rgb(0 0 0 / 40%);
      }

      .bc-benthic-overlay--card {
        padding: 28px 28px 24px;
        border-radius: 28px;
        background: var(--bc-background);
        box-shadow: 0 8px 32px rgb(0 0 0 / 28%);
      }
    }

    @media (max-width: 767.98px) {
      .bc-benthic-overlay--cancel {
        align-self: stretch;
      }
    }
  }
</style>
