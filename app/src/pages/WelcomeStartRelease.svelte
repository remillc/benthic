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
  import FirstLaunchRays from '../components/FirstLaunchRays.svelte';
  import BrandLockup from '../components/BrandLockup.svelte';
  import FirstLaunchSteps from '../components/FirstLaunchSteps.svelte';
  import BenthicPlusChip from '../components/BenthicPlusChip.svelte';
  import BenthicPlusPanel from '../components/BenthicPlusPanel.svelte';
  import { flow, currentStep } from '../lib/first-launch.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';
  import { layout } from '../lib/layout.svelte.js';
  import { lockupSize } from '../lib/first-launch-phone.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  /** The Benthic+ screens draw their own blue hero: on a phone it takes the place of the panel (task 2026-11-17-265). */
  const plusHero = $derived(['benthicPlusOffer', 'benthicPlusAll', 'benthicPlusReady', 'benthicPlusWelcome'].includes(currentStep()));

  /** « Benthic+, l'offre » on a tablet (task 2026-11-18-282): the panel carries the offer's chip, title and lead. */
  const offerPanel = $derived(currentStep() === 'benthicPlusOffer' || currentStep() === 'benthicPlusAll');
  const plusPanel = $derived(currentStep() === 'benthicPlusReady');

  /** The lockup: large on a tablet, the phone's on the first step, the Benthic+ sign-in and offer, the name alone on the other steps. */
  const lockup = $derived(lockupSize(layout, flow.stack.length <= 1, currentStep() === 'benthicPlusConnect' || offerPanel));

  // The faint profile of the section band (the same path as the app's section band), drawn at the bottom of the phone steps band.
  const BAND_PROFILE = 'M0 30 L20 38 L45 70 L70 92 L95 96 L120 88 L140 94 L165 80 L185 62 L210 58 L235 50 L255 46 L275 40 L300 36';
</script>

{#snippet panelContent()}
  <div class="bc-welcome-release--brand"><BrandLockup size={plusPanel ? 'compact' : lockup} ring /></div>
  {#if plusPanel}
    <BenthicPlusPanel centered />
  {:else if offerPanel}
    <div class="bc-welcome-release--chip"><BenthicPlusChip label={t('benthicPlus.offer.pill')} /></div>
    <h1 class="bc-welcome-release--headline bc-welcome-release--headline-offer">{t('benthicPlus.offer.title')}</h1>
    <p class="bc-welcome-release--intro">{t('benthicPlus.offer.lead')}</p>
  {:else}
    <h1 class="bc-welcome-release--headline">{t('welcomeRelease.headline')}</h1>
    <p class="bc-welcome-release--intro">{t('welcomeRelease.intro')}</p>
  {/if}
  {#if !plusPanel}<div class="bc-welcome-release--profile"><ReleaseProfile /></div>{/if}
{/snippet}

<Page class="bc-welcome-release" noToolbar>
  <div class="bc-welcome-release--page" class:bc-welcome-release--plus={plusHero}>
    <section class="bc-welcome-release--panel" class:bc-welcome-release--compact={flow.stack.length > 1} class:bc-welcome-release--ready={plusPanel}>
      <div class="bc-welcome-release--panel-light" aria-hidden="true"></div>
      <div class="bc-welcome-release--panel-rays"><FirstLaunchRays /></div>
      <svg class="bc-welcome-release--panel-profile" width="300" height="34" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
        <path d="{BAND_PROFILE} V140 H0 Z" class="bc-welcome-release--panel-profile-area" />
        <path d={BAND_PROFILE} class="bc-welcome-release--panel-profile-line" vector-effect="non-scaling-stroke" />
      </svg>
      <svg class="bc-welcome-release--panel-wave" width="300" height="18" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M0 11 Q37.5 2 75 11 T150 11 T225 11 T300 11 V18 H0 Z" /></svg>
      {@render panelContent()}
    </section>

    <!-- This page is built with the first-launch popup at every start: the steps only ask the core once it is open. -->
    <FirstLaunchSteps {f7router} shown={logbook.welcome || logbook.welcomeHold} />
  </div>
</Page>

<style>
  @layer bc.components {
    :global(.bc-welcome-release) {
      --f7-page-bg-color: var(--bc-background);

      :global(.page-content) {
        padding: 0;
      }
    }

    /* Landscape: panel and steps side by side. */
    .bc-welcome-release--page {
      box-sizing: border-box;
      height: 100%;
      min-height: 100%;
      display: flex;
      background: var(--bc-background);
      color: var(--bc-text);
    }

    .bc-welcome-release--panel {
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
        var(--bc-release-panel-1) 0%,
        var(--bc-release-panel-2) 22%,
        var(--bc-release-panel-3) 70%,
        var(--bc-release-panel-4) 100%
      );
      color: var(--bc-release-on-panel);
    }

    .bc-welcome-release--panel-light {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 70% 45% at 85% 0%, var(--bc-release-panel-light), transparent 70%);
    }

    .bc-welcome-release--panel-rays {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    /* The phone steps band's faint profile and wave: only on a phone, only on the steps. */
    .bc-welcome-release--panel-profile,
    .bc-welcome-release--panel-wave {
      display: none;
    }

    .bc-welcome-release--brand {
      position: relative;
    }

    .bc-welcome-release--headline {
      position: relative;
      max-width: 540px;
      margin: 36px 0 0;
      font-size: 40px;
      line-height: 48px;
      font-weight: 400;
      letter-spacing: -0.5px;
      white-space: pre-line;
    }

    /* The offer's panel (task 2026-11-18-282): the chip sits where the headline would, the title 16 dp under it. */
    .bc-welcome-release--chip {
      position: relative;
      margin-top: 36px;
    }

    .bc-welcome-release--headline-offer {
      margin-top: 16px;
    }

    .bc-welcome-release--intro {
      position: relative;
      max-width: 520px;
      margin: 10px 0 0;
      font-size: 16px;
      line-height: 22px;
      color: var(--bc-release-on-panel-soft);
    }

    /* The profile keeps 56 dp from the panel's sides (the padding) and 96 dp above its bottom edge. */
    .bc-welcome-release--profile {
      position: relative;
      flex: 1;
      min-height: 120px;
      margin: 42px 0 96px;
    }

    /* Portrait: the panel across the top (640 dp, 540 dp from the second step on: a compact hero), the steps
       centred below it with 120 dp side margins. */
    @media (orientation: portrait) {
      .bc-welcome-release--page {
        flex-direction: column;
      }

      .bc-welcome-release--panel {
        width: auto;
        height: 640px;
        padding-top: calc(max(var(--f7-safe-area-top, 0px), 24px) + 40px);
      }

      .bc-welcome-release--compact {
        height: 540px;
      }

      .bc-welcome-release--headline {
        margin-top: 28px;
        max-width: 680px;
      }

      .bc-welcome-release--intro {
        margin-top: 8px;
        max-width: 600px;
      }

      .bc-welcome-release--profile {
        margin: 36px 0 48px;
      }

    }

    /* « Votre carnet est prêt » (task 2026-11-23-335): the small wordmark sits 40 dp from the panel's top and left edges; the
       column of the panel is centred (components/BenthicPlusPanel.svelte). */
    .bc-welcome-release--panel.bc-welcome-release--ready {
      padding: calc(max(var(--f7-safe-area-top, 0px), 24px) + 16px) 40px 0;
    }

    /* Phone (tasks 2026-11-16-227, 230 and 244; mock-ups docs/mockups/android-premier-lancement-production*.dc.html, 390 x 844):
       the hatched dark blue of the alpha across the top (--bc-first-band, its sheen and its hatching; no wave, no faint
       profile, a straight bottom edge) on the first step; the steps take the section band's look (task 251, below), 330 dp on the first step (the status bar's 24 dp included) and 140 dp on the
       others, and the page scrolls as one when a step is taller than the screen. The first-step band grows when its
       texts need more room, so that nothing is cut off. */
    @media (max-width: 767.98px) {
      .bc-welcome-release--plus .bc-welcome-release--panel {
        display: none;
      }

      .bc-welcome-release--page {
        height: auto;
        flex-direction: column;
      }

      .bc-welcome-release--panel {
        --bc-welcome-band-top: max(var(--f7-safe-area-top, 0px), 24px);
        display: flex;
        flex-direction: column;
        flex: none;
        width: auto;
        height: auto;
        min-height: calc(330px - 24px + var(--bc-welcome-band-top));
        padding: calc(var(--bc-welcome-band-top) + 16px) 20px 0;
        overflow: hidden;
        background: var(--bc-first-band);
        color: var(--bc-on-first-band);
      }

      .bc-welcome-release--panel-light {
        background: var(--bc-first-band-sheen);
      }

      /* Steps band (task 2026-11-16-251): the section band's radial gradient and rays, its faint profile and its 18 dp wave
         in the page colour; no sheen. */
      .bc-welcome-release--compact {
        height: auto;
        min-height: calc(140px - 24px + var(--bc-welcome-band-top));
        background: var(--bc-first-step-band);
        & .bc-welcome-release--panel-light {
          display: none;
        }
        & .bc-welcome-release--panel-profile {
          display: block;
          position: absolute;
          left: 0;
          bottom: 2px;
          width: 100%;
          height: 34px;
        }
      }

      .bc-welcome-release--panel-profile-area {
        fill: var(--bc-band-profile-area);
      }

      .bc-welcome-release--panel-profile-line {
        fill: none;
        stroke: var(--bc-band-profile-line);
        stroke-width: 1.5;
        stroke-linejoin: round;
      }

      .bc-welcome-release--compact .bc-welcome-release--panel-wave {
        display: block;
        position: absolute;
        left: 0;
        bottom: -1px;
        width: 100%;
        height: 18px;
      }

      .bc-welcome-release--panel-wave path {
        fill: var(--bc-background);
      }

      .bc-welcome-release--compact .bc-welcome-release--headline,
      .bc-welcome-release--compact .bc-welcome-release--intro,
      .bc-welcome-release--compact .bc-welcome-release--profile {
        display: none;
      }

      .bc-welcome-release--headline {
        max-width: none;
        margin: 18px 0 0;
        font-size: 26px;
        line-height: 32px;
        letter-spacing: -0.3px;
      }

      .bc-welcome-release--intro {
        max-width: none;
        margin: 8px 0 0;
        color: var(--bc-on-first-band-2);
        font-size: 14px;
        line-height: 20px;
      }

      /* 24 dp from both edges (the band's 20 dp padding and 4 dp). */
      .bc-welcome-release--profile {
        flex: 1;
        min-height: 56px;
        margin: 16px 4px 24px;

        /* Its height is the flex item's, which a percentage cannot reach: the profile fills it by position. */
        & :global(.bc-release-profile) {
          position: absolute;
          inset: 0;
          width: auto;
          height: auto;
        }
      }
    }
  }
</style>
