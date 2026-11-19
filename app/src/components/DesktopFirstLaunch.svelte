<script>
  // @ts-check
  // « Pour commencer » of the release edition in the desktop app (task 2026-11-16-228; mock-ups
  // docs/mockups/bureau-premier-lancement-production*.dc.html, a 1440 x 900 window): what the window without a
  // logbook shows in the release edition, in place of components/DesktopLogbookStart.svelte (which the beta keeps,
  // task 2026-11-15-173). The blue panel (700 dp, the window's full height) is on the left, as on a tablet in
  // landscape (pages/WelcomeStartRelease.svelte), and the steps are on the right (components/FirstLaunchSteps.svelte).
  // It covers the whole window; it steps aside while a page is open under it (the token help) or Réglages is shown,
  // and keeps its state meanwhile. About is a popup and opens above it. The logbook the steps make is created by the main process, which reloads
  // this window on it (lib/desktop-first-launch.js).
  // After first use (a logbook was opened before: the recent list is not empty) the same window shows the recent
  // logbooks above the choices and the profile without its opening animation (task 2026-11-16-241); the first launch
  // keeps the screen of task 228. The right column waits for the list (read, with which files are still there) to choose.
  import { onMount } from 'svelte';
  import { f7, f7ready } from 'framework7-svelte';
  import ReleaseProfile from './ReleaseProfile.svelte';
  import BenthicPlusPanel from './BenthicPlusPanel.svelte';
  import { currentStep } from '../lib/first-launch.svelte.js';
  import FirstLaunchSteps from './FirstLaunchSteps.svelte';
  import { navigation } from '../lib/navigation.svelte.js';
  import { logbooks, refreshRecent, checkRecent } from '../lib/desktop-logbooks.svelte.js';
  import { startMode } from '../lib/desktop-recents.js';
  import { t } from '../lib/i18n.js';

  /** A page is open over the start screen: the token help of the git step (About is a popup, above this screen). */
  let pushed = $state(false);
  const visible = $derived(navigation.section !== 'account' && !pushed);
  /** The screen: the first launch, or the recent logbooks; null until the list is read. */
  /** « Vos données de santé » and « Votre carnet est prêt »: the panel carries the header (task 2026-11-18-275). @type {'odplusReady'|'odplusHealth'|''} */
  const plusPanel = $derived(['odplusReady', 'odplusHealth'].includes(currentStep()) ? /** @type {'odplusReady'|'odplusHealth'} */ (currentStep()) : '');
  const mode = $derived(startMode(logbooks.recentLoaded ? logbooks.recent : null));

  /** The same router the pages use, read when it is needed (the views are built after this component). */
  const router = {
    navigate: (/** @type {string} */ url) => f7.views.main?.router.navigate(url),
  };

  onMount(() => {
    document.documentElement.classList.add('od-no-logbook');
    void refreshRecent().then(checkRecent);
    const update = () => {
      const path = f7.views.get('#view-logbook')?.router?.currentRoute?.path ?? '/';
      pushed = path.startsWith('/welcome/');
    };
    let ready = false;
    // The views are built after this component: Framework7 is waited for.
    f7ready(() => {
      ready = true;
      f7.on('routeChanged', update);
      f7.on('pageAfterIn', update);
      f7.on('pageAfterOut', update);
      update();
    });
    return () => {
      document.documentElement.classList.remove('od-no-logbook');
      if (!ready) return;
      f7.off('routeChanged', update);
      f7.off('pageAfterIn', update);
      f7.off('pageAfterOut', update);
    };
  });
</script>

<main class="od-desktop-first-launch" class:od-desktop-first-launch--away={!visible} aria-label={t('welcomeSteps.startTitle')}>
  <section class="od-desktop-first-launch--panel">
    <div class="od-desktop-first-launch--panel-light" aria-hidden="true"></div>
    <div class="od-desktop-first-launch--panel-bands" aria-hidden="true"></div>
    <div class="od-desktop-first-launch--brand">
      <img class="od-desktop-first-launch--logo" src="logo-light.svg" alt="" width="96" height="96" />
      <span>Benthic</span>
    </div>
    {#if plusPanel}
      <BenthicPlusPanel step={plusPanel} />
    {:else}
      <h1 class="od-desktop-first-launch--headline">{t('welcomeRelease.headline')}</h1>
      <p class="od-desktop-first-launch--intro">{t('welcomeRelease.intro')}</p>
      <div class="od-desktop-first-launch--profile"><ReleaseProfile still={mode === 'recents'} /></div>
    {/if}
  </section>

  <div class="od-desktop-first-launch--steps">
    {#if mode}<FirstLaunchSteps f7router={router} recents={mode === 'recents'} />{/if}
  </div>
</main>

<style>
  @layer od.components {
    .od-desktop-first-launch {
      position: fixed;
      inset: 0;
      /* Above the rail (6000): the mock-ups show the first launch without it. */
      z-index: 6100;
      display: flex;
      background: var(--od-background);
      color: var(--od-text);
    }

    .od-desktop-first-launch--away {
      display: none;
    }

    /* The panel is 700 dp wide in a 1440 dp window and shares the width otherwise, so that the steps keep room in
       the smallest window (760 dp). */
    .od-desktop-first-launch--panel {
      position: relative;
      box-sizing: border-box;
      flex: none;
      width: 48.6%;
      min-width: 300px;
      max-width: 700px;
      overflow: hidden;
      padding: 80px 56px 0;
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

    .od-desktop-first-launch--panel-light {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 70% 45% at 22% 0%, var(--od-release-panel-light), transparent 70%);
    }

    .od-desktop-first-launch--panel-bands {
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(105deg, var(--od-release-panel-band) 0 60px, transparent 60px 150px);
      mask-image: linear-gradient(180deg, black 0%, transparent 55%);
    }

    .od-desktop-first-launch--brand {
      position: relative;
      display: flex;
      align-items: center;
      gap: 20px;
      font-size: 48px;
      line-height: 56px;
      font-weight: 500;
      letter-spacing: -0.5px;
    }

    .od-desktop-first-launch--logo {
      display: block;
      width: 96px;
      height: 96px;
    }

    .od-desktop-first-launch--headline {
      position: relative;
      max-width: 540px;
      margin: 36px 0 0;
      font-size: 40px;
      line-height: 48px;
      font-weight: 400;
      letter-spacing: -0.5px;
      white-space: pre-line;
    }

    .od-desktop-first-launch--intro {
      position: relative;
      max-width: 520px;
      margin: 10px 0 0;
      font-size: 16px;
      line-height: 22px;
      color: var(--od-release-on-panel-soft);
    }

    .od-desktop-first-launch--profile {
      position: relative;
      flex: 1;
      min-height: 120px;
      margin: 42px 0 96px;
    }

    /* The steps: the tablet's column, in landscape whatever the window's shape. The portrait and phone rules of the
       column's CSS answer to the screen, not to the window: a desktop window is never a phone, but from 760 to
       767 dp wide it matches the phone query, so what those rules change is set again here. */
    .od-desktop-first-launch--steps {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;

      :global(.od-first-launch) {
        padding: 54px 64px 76px;
        overflow: hidden;
      }

      :global(.od-first-launch--stage) {
        overflow-y: auto;
      }

      :global(.od-first-launch-git--action),
      :global(.od-first-launch-webdav--action) {
        align-self: flex-end;
      }

      /* Pinned 28 dp above the bottom, as on a tablet. */
      :global(.od-welcome-help-link) {
        position: absolute;
        left: 50%;
        bottom: 28px;
        margin: 0;
        padding: 6px 12px;
        transform: translateX(-50%);
        white-space: nowrap;
      }
    }

    /* A short or narrow window (down to 760 x 560): the panel keeps its brand and headline, smaller, and the profile
       gives up its room first. */
    @media (max-width: 1100px), (max-height: 760px) {
      .od-desktop-first-launch--panel {
        padding: 40px 32px 0;
      }

      .od-desktop-first-launch--brand {
        gap: 14px;
        font-size: 32px;
        line-height: 40px;
      }

      .od-desktop-first-launch--logo {
        width: 64px;
        height: 64px;
      }

      .od-desktop-first-launch--headline {
        margin-top: 24px;
        font-size: 28px;
        line-height: 34px;
      }

      .od-desktop-first-launch--intro {
        font-size: 14px;
        line-height: 20px;
      }

      .od-desktop-first-launch--profile {
        min-height: 80px;
        margin: 24px 0 40px;
      }

      .od-desktop-first-launch--steps :global(.od-first-launch) {
        padding: 24px 32px 76px;
      }
    }

    /* A narrow window: the panel gives the steps room, down to 300 dp at the smallest window (760 dp). */
    @media (max-width: 1100px) {
      .od-desktop-first-launch--panel {
        width: 40%;
      }
    }

    @media (max-width: 900px) {
      .od-desktop-first-launch--panel {
        padding: 32px 24px 0;
      }

      .od-desktop-first-launch--brand {
        gap: 10px;
        font-size: 26px;
        line-height: 32px;
      }

      .od-desktop-first-launch--logo {
        width: 48px;
        height: 48px;
      }

      .od-desktop-first-launch--headline {
        margin-top: 20px;
        font-size: 22px;
        line-height: 28px;
        letter-spacing: 0;
      }

      .od-desktop-first-launch--intro {
        font-size: 13px;
        line-height: 18px;
      }
    }

    /* A short window (down to 560 dp tall): the column scrolls, and the help link follows it instead of floating
       over the choices. */
    @media (max-height: 700px) {
      .od-desktop-first-launch--steps :global(.od-first-launch) {
        padding: 16px 32px 4px;
      }

      .od-desktop-first-launch--steps :global(.od-welcome-help-link) {
        position: static;
        flex: none;
        margin: 4px auto 10px;
        transform: none;
      }
    }
  }
</style>
