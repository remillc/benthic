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
  import { layout, ios, desktopApp, bottomNav } from '../lib/layout.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { deviceKind, deviceKey } from '../lib/first-launch-phone.js';

  const shown = $derived(demoBannerShown());
  // Phone (mock-up android-demo): the banner is a card just above the bottom navigation bar, on the four first pages.
  // Tablet and desktop (android-tablette-demo-*): a band at the top of the window.
  const bottom = $derived(bottomNav() && !desktopApp);
  const bannerShown = $derived(shown && (!bottom || navigation.atRoot));
  const kind = $derived(deviceKind({ phone: layout.phone, ios, desktop: desktopApp }));

  // The app's content makes room for the banner (theme rules below, on the root element).
  $effect(() => {
    document.documentElement.classList.toggle('bc-demo-on', bannerShown && !bottom);
    document.documentElement.classList.toggle('bc-demo-bottom-on', bannerShown && bottom);
    return () => document.documentElement.classList.remove('bc-demo-on', 'bc-demo-bottom-on');
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

{#if bannerShown}
  <div class="bc-demo-banner" class:bc-demo-banner--bottom={bottom} role="status" aria-label={t('demoLogbook.banner.lead')}>
    <svg class="bc-demo-banner--icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3M7.5 15h9" />
    </svg>
    <p class="bc-demo-banner--text"><strong>{t('demoLogbook.banner.lead')}</strong> {t('demoLogbook.banner.text')}</p>
    <button type="button" class="bc-demo-banner--start" onclick={requestExit}>{bottom ? t('demoLogbook.banner.startShort') : t('demoLogbook.banner.start')}</button>
  </div>
{/if}

{#if shown && demo.dialog}
  <Md3Dialog
    class="bc-demo-dialog"
    title={demo.dialog === 'exit' ? t('demoLogbook.exit.title') : t('demoLogbook.add.title')}
    text=""
    oncancel={closeDialog}
  >
    <p class="bc-demo-dialog--text">{demo.dialog === 'exit' ? t(deviceKey('demoLogbook.exit.text', kind)) : t('demoLogbook.add.text')}</p>
    {#snippet actions()}
      <button type="button" class="bc-demo-dialog--cancel" onclick={closeDialog}>{t('demoLogbook.exit.cancel')}</button>
      <button type="button" class="bc-demo-dialog--confirm" disabled={demo.busy} onclick={confirm}>{t('demoLogbook.exit.confirm')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer bc.components {
    .bc-demo-banner {
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
      padding: 0 8px 0 16px;
      border-radius: 16px;
      background: var(--bc-release-row-main);
      color: var(--bc-release-on-panel);
    }

    /* Phone: above the bottom navigation bar, 8 dp from it, over the list's last row's room (theme rules below). */
    .bc-demo-banner--bottom {
      top: auto;
      bottom: calc(var(--bc-bottom-nav-height, 64px) + var(--f7-safe-area-bottom, 0px) + 8px);
      height: auto;
      padding: 12px 12px 12px 16px;
      box-shadow: 0 4px 12px color-mix(in srgb, var(--bc-release-row-main) 25%, transparent);
      & .bc-demo-banner--text {
        font-size: 15px;
        line-height: 20px;
      }
      & .bc-demo-banner--start {
        height: 40px;
        padding: 0 16px;
        border-radius: 20px;
        font-size: 14px;
      }
    }

    .bc-demo-banner--icon {
      flex: none;
    }

    .bc-demo-banner--text {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: 16px;
      line-height: 22px;
      & strong {
        font-weight: 600;
      }
    }

    .bc-demo-banner--start {
      flex: none;
      width: auto;
      height: 38px;
      padding: 0 20px;
      border: none;
      border-radius: 19px;
      background: var(--bc-release-on-panel);
      color: var(--bc-release-row-main);
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
        outline: 2px solid var(--bc-release-on-panel);
        outline-offset: 2px;
      }
    }

    /* The content leaves room for the banner: the views, the rail and the sidebar start under it. */
    :global(html.bc-demo-on) {
      --bc-demo-height: calc(var(--f7-safe-area-top, 0px) + 60px);
    }

    :global(html.bc-demo-on .views) {
      --f7-safe-area-top: 0px;
      margin-top: var(--bc-demo-height);
      height: calc(100% - var(--bc-demo-height));
    }

    :global(html.bc-demo-on .bc-nav-rail--rail) {
      top: var(--bc-demo-height);
      padding-top: 24px;
    }

    .bc-demo-dialog--text {
      margin: 0 24px;
      font-size: 15px;
      line-height: 22px;
      color: var(--bc-text-2);
    }

    :global(.bc-demo-dialog) :global(.bc-md3-dialog--surface) {
      width: min(420px, calc(100% - 48px));
    }

    :global(.bc-demo-dialog) :global(.bc-md3-dialog--actions) {
      margin: 20px 24px 0;
      gap: 12px;

      .bc-demo-dialog--cancel {
        color: var(--bc-release-link);
        font-size: 15px;
      }

      .bc-demo-dialog--confirm {
        height: 44px;
        padding: 0 24px;
        border-radius: 22px;
        background: var(--bc-text);
        color: var(--bc-background);
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
  }
</style>
