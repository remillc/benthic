<script>
  // @ts-check
  // The demo logbook's banner and its two dialogs (task 2026-11-16-224, part 7; mock-ups docs/mockups/android-tablette-
  // demo{,-quitter,-ajout}-{paysage,portrait}.dc.html): « Carnet d’exemple. Ces plongées ne sont pas les vôtres. » with
  // « Commencer mon carnet » at the top of the app while the demo is open, the confirmation of that button (`demo-quitter`)
  // and the dialog adding a dive opens in the demo (`demo-ajout`). Both dialogs are basic dialogs (Md3Dialog) with the same
  // two buttons. The state and what each button does are lib/demo.svelte.js and lib/demo.js.
  import Md3Dialog from './Md3Dialog.svelte';
  import { demo, demoBannerShown, requestExit, closeDialog, endDemo } from '../lib/demo.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  const shown = $derived(demoBannerShown());

  // The app's content makes room for the banner (theme rules below, on the root element).
  $effect(() => {
    document.documentElement.classList.toggle('od-demo-on', shown);
    return () => document.documentElement.classList.remove('od-demo-on');
  });

  // The first launch's link could not open the demo.
  $effect(() => {
    if (demo.failed) {
      demo.failed = false;
      showSnackbar(t('demoLogbook.failed'));
    }
  });

  async function confirm() {
    await endDemo();
  }
</script>

{#if shown}
  <div class="od-demo-banner" role="region" aria-label={t('demoLogbook.banner.lead')}>
    <svg class="od-demo-banner--icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3M7.5 15h9" />
    </svg>
    <p class="od-demo-banner--text"><strong>{t('demoLogbook.banner.lead')}</strong> {t('demoLogbook.banner.text')}</p>
    <button type="button" class="od-demo-banner--start" onclick={requestExit}>{t('demoLogbook.banner.start')}</button>
  </div>
{/if}

{#if shown && demo.dialog}
  <Md3Dialog
    class="od-demo-dialog"
    title={demo.dialog === 'exit' ? t('demoLogbook.exit.title') : t('demoLogbook.add.title')}
    text=""
    oncancel={closeDialog}
  >
    <p class="od-demo-dialog--text">{demo.dialog === 'exit' ? t('demoLogbook.exit.text') : t('demoLogbook.add.text')}</p>
    {#snippet actions()}
      <button type="button" class="od-demo-dialog--cancel" onclick={closeDialog}>{t('demoLogbook.exit.cancel')}</button>
      <button type="button" class="od-demo-dialog--confirm" disabled={demo.busy} onclick={confirm}>{t('demoLogbook.exit.confirm')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer od.components {
    .od-demo-banner {
      position: fixed;
      top: calc(var(--f7-safe-area-top, 0px) + 4px);
      left: 12px;
      right: 12px;
      z-index: 7000;
      box-sizing: border-box;
      height: 52px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 8px 0 18px;
      border-radius: 26px;
      background: var(--od-release-row-main);
      color: var(--od-release-on-panel);
    }

    .od-demo-banner--icon {
      flex: none;
    }

    .od-demo-banner--text {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: 16px;
      line-height: 22px;
    }

    .od-demo-banner--text strong {
      font-weight: 600;
    }

    .od-demo-banner--start {
      flex: none;
      width: auto;
      height: 38px;
      padding: 0 20px;
      border: none;
      border-radius: 19px;
      background: var(--od-release-on-panel);
      color: var(--od-release-row-main);
      font: inherit;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;

      @media (hover: hover) {
        &:hover {
          opacity: 0.88;
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-on-panel);
        outline-offset: 2px;
      }
    }

    /* The content leaves room for the banner: the views, the rail and the sidebar start under it. */
    :global(html.od-demo-on) {
      --od-demo-height: calc(var(--f7-safe-area-top, 0px) + 60px);
    }

    :global(html.od-demo-on .views) {
      --f7-safe-area-top: 0px;
      margin-top: var(--od-demo-height);
      height: calc(100% - var(--od-demo-height));
    }

    :global(html.od-demo-on .od-nav-rail--rail) {
      top: var(--od-demo-height);
      padding-top: 24px;
    }

    .od-demo-dialog--text {
      margin: 0 24px;
      font-size: 15px;
      line-height: 22px;
      color: var(--od-text-2);
    }

    :global(.od-demo-dialog) :global(.od-md3-dialog--surface) {
      width: min(420px, calc(100% - 48px));
    }

    :global(.od-demo-dialog) :global(.od-md3-dialog--actions) {
      margin: 20px 24px 0;
      gap: 12px;
    }

    :global(.od-demo-dialog) :global(.od-md3-dialog--actions) .od-demo-dialog--cancel {
      color: var(--od-release-link);
      font-size: 15px;
    }

    :global(.od-demo-dialog) :global(.od-md3-dialog--actions) .od-demo-dialog--confirm {
      height: 44px;
      padding: 0 24px;
      border-radius: 22px;
      background: var(--od-text);
      color: var(--od-background);
      font-size: 15px;

      &:disabled {
        opacity: 0.38;
        cursor: default;
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          opacity: 0.88;
        }
      }
    }
  }
</style>
