<script>
  // @ts-check
  // The blue panel of the first launch on Android tablets (task 2026-11-16-237; mock-ups
  // docs/mockups/android-tablette-premier-lancement-paysage.dc.html and -portrait.dc.html): the same blue
  // as the phone's band (hatching, sheen), the round logo, « OpenDives » at 48 sp, the « Alpha » badge, the
  // title, the paragraph and the dive profile with its animation. Landscape: 700 dp wide, the full height,
  // on the left. Portrait: 640 dp tall, across the top. The status bar is part of the panel.
  import ProfileHero from './ProfileHero.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * playKey: changes each time the screen is shown, the profile is created again and plays its animation again.
   * still: the steps (task 2026-11-16-239) show the profile without the animation.
   * @type {{ playKey?: number, still?: boolean }}
   */
  let { playKey = 0, still = false } = $props();
</script>

<header class="od-first-launch-panel">
  <div class="od-first-launch-panel--sheen" aria-hidden="true"></div>
  <div class="od-first-launch-panel--hatch" aria-hidden="true"></div>
  <div class="od-first-launch-panel--brand" role="img" aria-label={t('welcome.brandAlpha')}>
    <img class="od-first-launch-panel--logo" src="logo-light.svg" alt="" width="96" height="96" />
    <span class="od-first-launch-panel--name" aria-hidden="true">OpenDives</span>
    <span class="od-first-launch-panel--alpha" aria-hidden="true">{t('welcome.alpha')}</span>
  </div>
  <h1 class="od-first-launch-panel--title">{t('firstLaunch.bandHeadline')}</h1>
  <p class="od-first-launch-panel--intro">{t('firstLaunch.bandIntro')}</p>
  <div class="od-first-launch-panel--profile">
    {#key playKey}
      <ProfileHero {still} />
    {/key}
  </div>
</header>

<style>
  @layer od.components {
    .od-first-launch-panel {
      --od-first-panel-top: max(var(--f7-safe-area-top), 24px);
      box-sizing: border-box;
      position: relative;
      flex: none;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: var(--od-first-band);
      color: var(--od-on-first-band);
      /* Landscape: 700 dp wide, the full height of the screen. */
      width: min(700px, 55%);
      height: 100%;
      padding: calc(var(--od-first-panel-top) + 56px) 56px 96px;

      /* Portrait: 640 dp tall across the top. */
      @media (orientation: portrait) {
        width: 100%;
        height: 640px;
        padding: calc(var(--od-first-panel-top) + 40px) 56px 48px;
      }
    }

    .od-first-launch-panel--sheen,
    .od-first-launch-panel--hatch {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .od-first-launch-panel--sheen {
      background: var(--od-first-band-sheen);
    }

    /* Faint diagonal hatching, fading out at 55 % of the height. */
    .od-first-launch-panel--hatch {
      background: var(--od-first-band-hatch);
      mask-image: linear-gradient(180deg, #000 0%, transparent 55%);
    }

    .od-first-launch-panel--brand {
      position: relative;
      flex: none;
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .od-first-launch-panel--logo {
      display: block;
    }

    .od-first-launch-panel--name {
      font-size: 48px;
      line-height: 56px;
      font-weight: 500;
      letter-spacing: -0.5px;
      white-space: nowrap;
    }

    /* « Alpha »: 12 sp, line 16, letter spacing 0.6, padding 2 × 8 dp, outline at 55 %. The white fill is 12 % and
       not the 18 % of the brief, as on the phone's welcome band (task 233): with 18 % the white 12 sp text measured
       4.2:1 on the panel, with 12 % it is above 4.5:1 (WCAG AA). */
    .od-first-launch-panel--alpha {
      margin-left: -6px;
      padding: 2px 8px;
      border: 1px solid var(--od-first-band-badge-line);
      border-radius: 999px;
      background: var(--od-first-band-badge-welcome);
      color: var(--od-on-first-band);
      font-size: 12px;
      line-height: 16px;
      font-weight: 700;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .od-first-launch-panel--title {
      position: relative;
      flex: none;
      margin: 36px 0 0;
      font-size: 40px;
      line-height: 48px;
      font-weight: 400;
      letter-spacing: -0.5px;
      white-space: pre-line;

      @media (orientation: portrait) {
        margin-top: 28px;
      }
    }

    .od-first-launch-panel--intro {
      position: relative;
      flex: none;
      max-width: 520px;
      margin: 10px 0 0;
      font-size: 16px;
      line-height: 22px;
      color: var(--od-on-first-band-2);

      @media (orientation: portrait) {
        max-width: 600px;
        margin-top: 8px;
      }
    }

    /* The profile takes what is left: 300 dp at most in landscape (588 wide), 220 dp in portrait (688 wide). */
    .od-first-launch-panel--profile {
      position: relative;
      flex: 1;
      min-height: 0;
      max-height: 300px;
      margin-top: 20px;

      @media (orientation: portrait) {
        max-height: 220px;
        margin-top: 36px;
      }
    }

    /* The desktop app (task 2026-11-16-242; mock-ups docs/mockups/bureau-premier-lancement-alpha-*.dc.html): always a
       row, the panel on the left in a window of any shape. 700 dp in a 1440 dp window, sharing the width in a
       narrower one so that the step keeps its room (the window is 768 dp wide at least). */
    :global(html.od-desktop-app) .od-first-launch-panel {
      width: min(700px, 48.6%);
      min-width: 300px;
      height: 100%;
      padding: 80px 56px 48px;
    }
    :global(html.od-desktop-app) .od-first-launch-panel--title {
      margin-top: 36px;
    }
    :global(html.od-desktop-app) .od-first-launch-panel--intro {
      max-width: 520px;
      margin-top: 10px;
    }
    :global(html.od-desktop-app) .od-first-launch-panel--profile {
      max-height: 300px;
      margin-top: 42px;
    }

    /* A narrow window: a smaller brand row, title and margins. */
    @media (max-width: 1100px) {
      :global(html.od-desktop-app) .od-first-launch-panel {
        padding: 40px 32px 88px;
      }
      :global(html.od-desktop-app) .od-first-launch-panel--brand {
        gap: 12px;
      }
      :global(html.od-desktop-app) .od-first-launch-panel--logo {
        width: 64px;
        height: 64px;
      }
      :global(html.od-desktop-app) .od-first-launch-panel--name {
        font-size: 34px;
        line-height: 40px;
      }
      :global(html.od-desktop-app) .od-first-launch-panel--title {
        margin-top: 24px;
        font-size: 28px;
        line-height: 34px;
      }
      :global(html.od-desktop-app) .od-first-launch-panel--intro {
        font-size: 14px;
        line-height: 20px;
      }
      :global(html.od-desktop-app) .od-first-launch-panel--profile {
        margin-top: 24px;
      }
    }
  }
</style>
