<script>
  // @ts-check
  // The blue band at the top of the first launch on Android phones (tasks 2026-11-16-233, 234, 235 and 236;
  // docs/mockups/android-accueil-c.dc.html and android-premier-lancement-*.dc.html): the same panel as the
  // tablet's (gradient, sheen, hatching), with the logo, « OpenDives » and the « Alpha » badge.
  // `welcome`: 330 dp, with the headline, the line under it and the decorative dive profile.
  // `step`: 140 dp, only the brand, a straight bottom edge (no wave, no profile).
  // The status bar is part of the band: its height (at least 24 dp) comes first.
  import { t } from '../lib/i18n.js';
  import { decorativeProfilePath } from '../lib/smooth-path.js';

  /** @type {{ variant?: 'welcome'|'step' }} */
  let { variant = 'step' } = $props();

  const welcome = $derived(variant === 'welcome');

  const WIDTH = 688;
  const HEIGHT = 130;
  const TOP = 5.5;
  const line = decorativeProfilePath(WIDTH, TOP, 118);
  const area = `${line} L${WIDTH} ${TOP} Z`;
  const gradient = `od-first-band-water-${Math.random().toString(36).slice(2, 9)}`;
  const glow = `od-first-band-glow-${Math.random().toString(36).slice(2, 9)}`;
</script>

<header class="od-first-launch-band" class:od-first-launch-band--welcome={welcome}>
  <div class="od-first-launch-band--sheen" aria-hidden="true"></div>
  <div class="od-first-launch-band--hatch" aria-hidden="true"></div>
  <div class="od-first-launch-band--brand" role="img" aria-label={t('welcome.brandAlpha')}>
    <img class="od-first-launch-band--logo" src="logo-light.svg" alt="" width={welcome ? 40 : 32} height={welcome ? 40 : 32} />
    <span class="od-first-launch-band--name" aria-hidden="true">OpenDives</span>
    <span class="od-first-launch-band--alpha" aria-hidden="true">{t('welcome.alpha')}</span>
  </div>
  {#if welcome}
    <h1 class="od-first-launch-band--headline">{t('firstLaunch.bandHeadline')}</h1>
    <p class="od-first-launch-band--intro">{t('firstLaunch.bandIntro')}</p>
    <svg class="od-first-launch-band--profile" viewBox="0 0 {WIDTH} {HEIGHT}" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="od-first-launch-band--water-top"></stop>
          <stop offset="1" class="od-first-launch-band--water-bottom"></stop>
        </linearGradient>
        <filter id={glow} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"></feGaussianBlur></filter>
      </defs>
      <line class="od-first-launch-band--surface" x1="0" y1={TOP} x2={WIDTH} y2={TOP}></line>
      <path d={area} fill="url(#{gradient})"></path>
      <path class="od-first-launch-band--glow" d={line} filter="url(#{glow})"></path>
      <path class="od-first-launch-band--trace" d={line}></path>
    </svg>
  {/if}
</header>

<style>
  @layer od.components {
    .od-first-launch-band {
      --od-first-band-top: max(var(--f7-safe-area-top), 24px);
      box-sizing: border-box;
      position: relative;
      flex: none;
      width: 100%;
      height: calc(var(--od-first-band-top) + 116px);
      padding: calc(var(--od-first-band-top) + 16px) 20px 0;
      overflow: hidden;
      background: var(--od-first-band);
      color: var(--od-on-first-band);

      &.od-first-launch-band--welcome {
        height: calc(var(--od-first-band-top) + 306px);
      }
    }

    .od-first-launch-band--sheen,
    .od-first-launch-band--hatch {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .od-first-launch-band--sheen {
      background: var(--od-first-band-sheen);
    }

    /* Faint diagonal hatching, fading out at 55 % of the height. */
    .od-first-launch-band--hatch {
      background: var(--od-first-band-hatch);
      mask-image: linear-gradient(180deg, #000 0%, transparent 55%);
    }

    .od-first-launch-band--brand {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .od-first-launch-band--logo {
      display: block;
    }

    .od-first-launch-band--name {
      font-size: 20px;
      line-height: 26px;
      font-weight: 500;
      white-space: nowrap;
    }

    .od-first-launch-band--welcome .od-first-launch-band--name {
      font-size: 24px;
      line-height: 30px;
    }

    /* « Alpha » (task 2026-11-16-235): 9 sp, line 12, letter spacing 0.5, padding 1 × 5 dp, 16 dp tall. */
    .od-first-launch-band--alpha {
      box-sizing: border-box;
      height: 16px;
      padding: 1px 5px;
      border: 1px solid var(--od-first-band-badge-line);
      border-radius: 999px;
      background: var(--od-first-band-badge);
      color: var(--od-on-first-band);
      font-size: 9px;
      line-height: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    /* On the welcome band the badge sits under the light sheen: with the fill at 18 % the white 9 sp text
       measured 4.04:1; at 12 % it is 4.6:1 (WCAG AA 4.5:1). The steps keep 18 % (5.1:1). */
    .od-first-launch-band--welcome .od-first-launch-band--alpha {
      background: var(--od-first-band-badge-welcome);
    }

    .od-first-launch-band--headline {
      position: relative;
      margin: 28px 0 0;
      font-size: 26px;
      line-height: 32px;
      font-weight: 400;
      letter-spacing: -0.3px;
      white-space: pre-line;
    }

    .od-first-launch-band--intro {
      position: relative;
      margin: 8px 0 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-on-first-band-2);
    }

    .od-first-launch-band--profile {
      position: relative;
      display: block;
      width: calc(100% - 8px);
      height: auto;
      margin: 16px 4px 0;
      overflow: visible;
    }

    .od-first-launch-band--surface {
      stroke: var(--od-first-band-surface);
      stroke-width: 1;
      stroke-dasharray: 3 4;
    }

    .od-first-launch-band--water-top {
      stop-color: var(--od-first-band-water-top);
    }

    .od-first-launch-band--water-bottom {
      stop-color: var(--od-first-band-water-bottom);
    }

    .od-first-launch-band--glow {
      fill: none;
      stroke: var(--od-first-band-glow);
      stroke-width: 6;
      stroke-opacity: 0.55;
    }

    .od-first-launch-band--trace {
      fill: none;
      stroke: var(--od-first-band-trace);
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
  }
</style>
