<script>
  // @ts-check
  // The progress of a `.benthic` import on the first launch (task 2026-11-23-360; mock-ups « Importer un carnet, fichier
  // .benthic, progrès »): the file card, the step list, « Gardez l’app ouverte jusqu’à la fin… » and « Annuler ». The run itself
  // is started by FirstLaunchSteps (lib/benthic-import.svelte.js); this only shows it. « Annuler » stops before anything is written.
  import BenthicFileCard from './BenthicFileCard.svelte';
  import BenthicProgressSteps from './BenthicProgressSteps.svelte';
  import { benthicRun, cancelBenthicRun } from '../lib/benthic-import.svelte.js';
  import { desktopApp } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';
</script>

<div class="bc-first-launch-benthic">
  <BenthicFileCard name={benthicRun.fileName} exportedAt={benthicRun.exportedAt} />
  <BenthicProgressSteps />
  <p class="bc-first-launch-benthic--help">{t(desktopApp ? 'benthicImport.progress.helpDesktop' : 'benthicImport.progress.help')}</p>
  <button type="button" class="bc-first-launch-benthic--cancel" disabled={benthicRun.cancelling || benthicRun.phase === 'write'} onclick={cancelBenthicRun}>
    {t(benthicRun.cancelling ? 'benthicImport.progress.cancelling' : 'benthicImport.progress.cancel')}
  </button>
</div>

<style>
  @layer bc.components {
    .bc-first-launch-benthic {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 12px;
    }

    .bc-first-launch-benthic--help {
      margin: 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-first-launch-benthic--cancel {
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
      transition: background-color 0.15s;

      &:disabled {
        cursor: default;
        opacity: 0.38;
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          background: var(--bc-release-hover);
        }
      }
    }

    @media (max-width: 767.98px) {
      .bc-first-launch-benthic--cancel {
        align-self: stretch;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-first-launch-benthic--cancel {
        transition: none;
      }
    }
  }
</style>
