<script>
  // @ts-check
  // The decorative dive profile of the release edition's first launch (task 2026-11-15-213,
  // docs/mockups/android-tablette-premier-lancement-production-*.dc.html): a white 2.5 dp line with a soft blue
  // glow, the water column in white fading from 20 % to 4 %, a dashed surface line, a white dot at the deepest
  // point and two frosted chips. The curve is scaled to the box it is given (not stretched, so the stroke stays
  // 2.5 dp). On opening the line draws itself from left to right in 1.6 s, then the chips fade in; without
  // motion when the system asks for it (the rules are below). Decoration: hidden from screen readers except
  // for its label.
  import { scaledProfile } from '../lib/release-welcome.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ still?: boolean }} still: no opening animation (the screens that come back to it, task 2026-11-16-241) */
  let { still = false } = $props();

  let width = $state(588);
  let height = $state(300);
  const shape = $derived(scaledProfile(width, height));
  const gradient = `od-release-profile-${Math.random().toString(36).slice(2, 9)}`;
  const glow = `${gradient}-glow`;
</script>

<div class="od-release-profile" class:od-release-profile--still={still} bind:clientWidth={width} bind:clientHeight={height}>
  <svg class="od-release-profile--svg" {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={t('welcomeRelease.profileLabel')}>
    <defs>
      <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="od-release-profile--water-top"></stop>
        <stop offset="1" class="od-release-profile--water-bottom"></stop>
      </linearGradient>
      <filter id={glow} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"></feGaussianBlur></filter>
    </defs>
    <line class="od-release-profile--surface" x1="0" y1={shape.surfaceY} x2={width} y2={shape.surfaceY}></line>
    <path class="od-release-profile--water" d={shape.area} fill="url(#{gradient})"></path>
    <path class="od-release-profile--glow" d={shape.line} filter="url(#{glow})"></path>
    <path class="od-release-profile--line" d={shape.line} pathLength="1"></path>
  </svg>
  <span class="od-release-profile--dot" aria-hidden="true"></span>
  <div class="od-release-profile--chip od-release-profile--chip-depth">
    <span class="od-release-profile--value">{t('welcomeRelease.maxDepthValue')}</span>
    <span class="od-release-profile--caption">{t('welcomeRelease.maxDepthLabel')}</span>
  </div>
  <div class="od-release-profile--chip od-release-profile--chip-duration">
    <span class="od-release-profile--value">{t('welcomeRelease.durationValue')}</span>
    <span class="od-release-profile--caption">{t('welcomeRelease.durationLabel')}</span>
  </div>
</div>

<style>
  @layer od.components {
    .od-release-profile {
      position: relative;
      /* Fills the box its page gives it; the curve is scaled to it. */
      width: 100%;
      height: 100%;
    }

    .od-release-profile--svg {
      position: absolute;
      inset: 0;
      overflow: visible;
    }

    .od-release-profile--water-top {
      stop-color: var(--od-release-on-panel);
      stop-opacity: 0.2;
    }

    .od-release-profile--water-bottom {
      stop-color: var(--od-release-on-panel);
      stop-opacity: 0.04;
    }

    .od-release-profile--surface {
      stroke: var(--od-release-surface-line);
      stroke-width: 1;
      stroke-dasharray: 3 4;
    }

    .od-release-profile--glow {
      fill: none;
      stroke: var(--od-release-glow);
      stroke-width: 6;
      stroke-opacity: 0.55;
    }

    .od-release-profile--line {
      fill: none;
      stroke: var(--od-release-on-panel);
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-linecap: round;
      stroke-dasharray: 1;
      animation: od-release-draw 1.6s cubic-bezier(0.2, 0, 0, 1) both;
    }

    /* The deepest point of the curve: 78.2 / 588 across and 284.7 / 300 down in the mock-up. */
    .od-release-profile--dot {
      position: absolute;
      left: 13.3%;
      top: 94.9%;
      width: 12px;
      height: 12px;
      margin: -6px 0 0 -6px;
      border-radius: 6px;
      background: var(--od-release-on-panel);
      box-shadow: 0 0 0 5px var(--od-release-dot-ring);
      animation: od-release-in 0.5s 1.2s cubic-bezier(0.2, 0, 0, 1) both;
    }

    .od-release-profile--chip {
      position: absolute;
      padding: 8px 14px;
      border-radius: 14px;
      background: var(--od-release-chip);
      border: 1px solid var(--od-release-chip-border);
      backdrop-filter: blur(6px);
      color: var(--od-release-on-panel);
      display: flex;
      flex-direction: column;
      white-space: nowrap;
      animation: od-release-in 0.5s 1.2s cubic-bezier(0.2, 0, 0, 1) both;
    }

    .od-release-profile--value {
      font-size: 20px;
      line-height: 24px;
      font-weight: 600;
      letter-spacing: -0.2px;
    }

    .od-release-profile--caption {
      font-size: 12px;
      line-height: 16px;
      color: var(--od-release-chip-caption);
    }

    /* Landscape: the depth chip sits under the dot, the duration chip near the end of the line. */
    .od-release-profile--chip-depth {
      left: calc(13.3% - 50px);
      top: calc(94.9% + 20px);
    }

    .od-release-profile--chip-duration {
      left: 70%;
      top: 29%;
    }

    /* Portrait: the depth chip to the right of the dot, the duration chip a little lower. */
    @media (orientation: portrait) {
      .od-release-profile--chip-depth {
        left: calc(13.4% + 72px);
        top: calc(95% - 22px);
      }

      .od-release-profile--chip-duration {
        left: 74%;
        top: 34.5%;
      }
    }

    /* Phone (task 2026-11-16-227): the band's profile is the line alone, without the dot and the chips. */
    @media (max-width: 767.98px) {
      .od-release-profile--dot,
      .od-release-profile--chip {
        display: none;
      }
    }

    @keyframes od-release-draw {
      from {
        stroke-dashoffset: 1;
      }
      to {
        stroke-dashoffset: 0;
      }
    }

    @keyframes od-release-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    .od-release-profile--still {
      .od-release-profile--line,
      .od-release-profile--dot,
      .od-release-profile--chip {
        animation: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-release-profile--line,
      .od-release-profile--dot,
      .od-release-profile--chip {
        animation: none;
      }
    }
  }
</style>
