<script>
  // @ts-check
  // First launch of the release edition, on tablets (tasks 2026-11-15-213 and 218; mock-ups
  // docs/mockups/android-tablette-premier-lancement-production-*.dc.html). The beta edition keeps
  // pages/WelcomeStart.svelte. Landscape: a 700 dp blue panel on the left (brand, heading, the decorative profile),
  // the steps on the right (components/FirstLaunchSteps.svelte). Portrait: the panel across the top (640 dp), the
  // steps below. The panel is the same on every step and its line draws itself only when this page opens. The page
  // chosen for the edition is pages/WelcomeEntry.svelte.
  import { Page } from 'framework7-svelte';
  import ReleaseProfile from '../components/ReleaseProfile.svelte';
  import FirstLaunchSteps from '../components/FirstLaunchSteps.svelte';
  import { flow } from '../lib/first-launch.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  // The faint profile of the section band (the same path as the app's section band), drawn at the bottom of the phone steps band.
  const BAND_PROFILE = 'M0 30 L20 38 L45 70 L70 92 L95 96 L120 88 L140 94 L165 80 L185 62 L210 58 L235 50 L255 46 L275 40 L300 36';
</script>

{#snippet panelContent()}
  <div class="od-welcome-release--brand">
    <img class="od-welcome-release--logo" src="logo-light.svg" alt="" width="96" height="96" />
    <span>OpenDives</span>
  </div>
  <h1 class="od-welcome-release--headline">{t('welcomeRelease.headline')}</h1>
  <p class="od-welcome-release--intro">{t('welcomeRelease.intro')}</p>
  <div class="od-welcome-release--profile"><ReleaseProfile /></div>
{/snippet}

<Page class="od-welcome-release" noToolbar>
  <div class="od-welcome-release--page">
    <section class="od-welcome-release--panel" class:od-welcome-release--compact={flow.stack.length > 1}>
      <div class="od-welcome-release--panel-light" aria-hidden="true"></div>
      <div class="od-welcome-release--panel-bands" aria-hidden="true"></div>
      <svg class="od-welcome-release--panel-profile" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
        <path d="{BAND_PROFILE} V140 H0 Z" class="od-welcome-release--panel-profile-area" />
        <path d={BAND_PROFILE} class="od-welcome-release--panel-profile-line" vector-effect="non-scaling-stroke" />
      </svg>
      <svg class="od-welcome-release--panel-wave" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M0 11 Q37.5 2 75 11 T150 11 T225 11 T300 11 V18 H0 Z" /></svg>
      {@render panelContent()}
    </section>

    <FirstLaunchSteps {f7router} />
  </div>
</Page>

<style>
  @layer od.components {
    :global(.od-welcome-release) {
      --f7-page-bg-color: var(--od-background);

      :global(.page-content) {
        padding: 0;
      }
    }

    /* Landscape: panel and steps side by side. */
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

    /* The phone steps band's faint profile and wave: only on a phone, only on the steps. */
    .od-welcome-release--panel-profile,
    .od-welcome-release--panel-wave {
      display: none;
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

    /* Portrait: the panel across the top (640 dp, 540 dp from the second step on: a compact hero), the steps
       centred below it with 120 dp side margins. */
    @media (orientation: portrait) {
      .od-welcome-release--page {
        flex-direction: column;
      }

      .od-welcome-release--panel {
        width: auto;
        height: 640px;
        padding-top: calc(max(var(--f7-safe-area-top, 0px), 24px) + 40px);
      }

      .od-welcome-release--compact {
        height: 540px;
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

    }

    /* Phone (tasks 2026-11-16-227, 230 and 244; mock-ups docs/mockups/android-premier-lancement-production*.dc.html, 390 x 844):
       the hatched dark blue of the alpha across the top (--od-first-band, its sheen and its hatching; no wave, no faint
       profile, a straight bottom edge) on the first step; the steps take the section band's look (task 251, below), 330 dp on the first step (the status bar's 24 dp included) and 140 dp on the
       others, and the page scrolls as one when a step is taller than the screen. The first-step band grows when its
       texts need more room, so that nothing is cut off. */
    @media (max-width: 767.98px) {
      .od-welcome-release--page {
        height: auto;
        flex-direction: column;
      }

      .od-welcome-release--panel {
        --od-welcome-band-top: max(var(--f7-safe-area-top, 0px), 24px);
        display: flex;
        flex-direction: column;
        flex: none;
        width: auto;
        height: auto;
        min-height: calc(330px - 24px + var(--od-welcome-band-top));
        padding: calc(var(--od-welcome-band-top) + 16px) 20px 0;
        overflow: hidden;
        background: var(--od-first-band);
        color: var(--od-on-first-band);
      }

      .od-welcome-release--panel-light {
        background: var(--od-first-band-sheen);
      }

      .od-welcome-release--panel-bands {
        background: var(--od-first-band-hatch);
      }

      /* Steps band (task 2026-11-16-251): the section band's radial gradient and rays, its faint profile and its 18 dp wave
         in the page colour; no sheen. */
      .od-welcome-release--compact {
        height: auto;
        min-height: calc(140px - 24px + var(--od-welcome-band-top));
        background: var(--od-first-step-band);
      }

      .od-welcome-release--compact .od-welcome-release--panel-light {
        display: none;
      }

      .od-welcome-release--compact .od-welcome-release--panel-profile {
        display: block;
        position: absolute;
        left: 0;
        bottom: 2px;
        width: 100%;
        height: 34px;
      }

      .od-welcome-release--panel-profile-area {
        fill: var(--od-band-profile-area);
      }

      .od-welcome-release--panel-profile-line {
        fill: none;
        stroke: var(--od-band-profile-line);
        stroke-width: 1.5;
        stroke-linejoin: round;
      }

      .od-welcome-release--compact .od-welcome-release--panel-wave {
        display: block;
        position: absolute;
        left: 0;
        bottom: -1px;
        width: 100%;
        height: 18px;
      }

      .od-welcome-release--panel-wave path {
        fill: var(--od-background);
      }

      .od-welcome-release--brand {
        gap: 10px;
        font-size: 24px;
        line-height: 30px;
        letter-spacing: 0;
      }

      .od-welcome-release--logo {
        width: 40px;
        height: 40px;
      }

      .od-welcome-release--compact .od-welcome-release--brand {
        font-size: 20px;
        line-height: 26px;
      }

      .od-welcome-release--compact .od-welcome-release--logo {
        width: 32px;
        height: 32px;
      }

      .od-welcome-release--compact .od-welcome-release--headline,
      .od-welcome-release--compact .od-welcome-release--intro,
      .od-welcome-release--compact .od-welcome-release--profile {
        display: none;
      }

      .od-welcome-release--headline {
        max-width: none;
        margin: 18px 0 0;
        font-size: 26px;
        line-height: 32px;
        letter-spacing: -0.3px;
      }

      .od-welcome-release--intro {
        max-width: none;
        margin: 8px 0 0;
        color: var(--od-on-first-band-2);
        font-size: 14px;
        line-height: 20px;
      }

      /* 24 dp from both edges (the band's 20 dp padding and 4 dp). */
      .od-welcome-release--profile {
        flex: 1;
        min-height: 56px;
        margin: 16px 4px 24px;
      }

      /* Its height is the flex item's, which a percentage cannot reach: the profile fills it by position. */
      .od-welcome-release--profile :global(.od-release-profile) {
        position: absolute;
        inset: 0;
        width: auto;
        height: auto;
      }
    }
  }
</style>
