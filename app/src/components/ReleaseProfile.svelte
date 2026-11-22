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
  const gradient = `bc-release-profile-${Math.random().toString(36).slice(2, 9)}`;
  const glow = `${gradient}-glow`;
</script>

<div class="bc-release-profile" class:bc-release-profile--still={still} bind:clientWidth={width} bind:clientHeight={height}>
  <svg class="bc-release-profile--svg" {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={t('welcomeRelease.profileLabel')}>
    <defs>
      <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="bc-release-profile--water-top"></stop>
        <stop offset="1" class="bc-release-profile--water-bottom"></stop>
      </linearGradient>
      <filter id={glow} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"></feGaussianBlur></filter>
    </defs>
    <line class="bc-release-profile--surface" x1="0" y1={shape.surfaceY} x2={width} y2={shape.surfaceY}></line>
    <path class="bc-release-profile--water" d={shape.area} fill="url(#{gradient})"></path>
    <path class="bc-release-profile--glow" d={shape.line} filter="url(#{glow})"></path>
    <path class="bc-release-profile--line" d={shape.line} pathLength="1"></path>
  </svg>
  <span class="bc-release-profile--dot" aria-hidden="true"></span>
  <div class="bc-release-profile--chip bc-release-profile--chip-depth">
    <span class="bc-release-profile--value">{t('welcomeRelease.maxDepthValue')}</span>
    <span class="bc-release-profile--caption">{t('welcomeRelease.maxDepthLabel')}</span>
  </div>
  <div class="bc-release-profile--chip bc-release-profile--chip-duration">
    <span class="bc-release-profile--value">{t('welcomeRelease.durationValue')}</span>
    <span class="bc-release-profile--caption">{t('welcomeRelease.durationLabel')}</span>
  </div>
</div>

<style>
  @layer bc.components {
    .bc-release-profile {
      position: relative;
      /* Fills the box its page gives it; the curve is scaled to it. */
      width: 100%;
      height: 100%;
    }

    .bc-release-profile--svg {
      position: absolute;
      inset: 0;
      overflow: visible;
    }

    .bc-release-profile--water-top {
      stop-color: var(--bc-release-on-panel);
      stop-opacity: 0.2;
    }

    .bc-release-profile--water-bottom {
      stop-color: var(--bc-release-on-panel);
      stop-opacity: 0.04;
    }

    .bc-release-profile--surface {
      stroke: var(--bc-release-surface-line);
      stroke-width: 1;
      stroke-dasharray: 3 4;
    }

    .bc-release-profile--glow {
      fill: none;
      stroke: var(--bc-release-glow);
      stroke-width: 6;
      stroke-opacity: 0.55;
    }

    .bc-release-profile--line {
      fill: none;
      stroke: var(--bc-release-on-panel);
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-linecap: round;
      stroke-dasharray: 1;
      animation: bc-release-draw 1.6s cubic-bezier(0.2, 0, 0, 1) both;
    }

    /* The deepest point of the curve: 78.2 / 588 across and 284.7 / 300 down in the mock-up. */
    .bc-release-profile--dot {
      position: absolute;
      left: 13.3%;
      top: 94.9%;
      width: 12px;
      height: 12px;
      margin: -6px 0 0 -6px;
      border-radius: 6px;
      background: var(--bc-release-on-panel);
      box-shadow: 0 0 0 5px var(--bc-release-dot-ring);
      animation: bc-release-in 0.5s 1.2s cubic-bezier(0.2, 0, 0, 1) both;
    }

    .bc-release-profile--chip {
      position: absolute;
      padding: 8px 14px;
      border-radius: 14px;
      background: var(--bc-release-chip);
      border: 1px solid var(--bc-release-chip-border);
      backdrop-filter: blur(6px);
      color: var(--bc-release-on-panel);
      display: flex;
      flex-direction: column;
      white-space: nowrap;
      animation: bc-release-in 0.5s 1.2s cubic-bezier(0.2, 0, 0, 1) both;
    }

    .bc-release-profile--value {
      font-size: 20px;
      line-height: 24px;
      font-weight: 600;
      letter-spacing: -0.2px;
    }

    .bc-release-profile--caption {
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-release-chip-caption);
    }

    /* Landscape: the depth chip sits under the dot, the duration chip near the end of the line. */
    .bc-release-profile--chip-depth {
      left: calc(13.3% - 50px);
      top: calc(94.9% + 20px);
    }

    .bc-release-profile--chip-duration {
      left: 70%;
      top: 29%;
    }

    /* Portrait: the depth chip to the right of the dot, the duration chip a little lower. */
    @media (orientation: portrait) {
      .bc-release-profile--chip-depth {
        left: calc(13.4% + 72px);
        top: calc(95% - 22px);
      }

      .bc-release-profile--chip-duration {
        left: 74%;
        top: 34.5%;
      }
    }

    /* Phone (task 2026-11-16-227): the band's profile is the line alone, without the dot and the chips. */
    @media (max-width: 767.98px) {
      .bc-release-profile--dot,
      .bc-release-profile--chip {
        display: none;
      }
    }

    @keyframes bc-release-draw {
      from {
        stroke-dashoffset: 1;
      }
      to {
        stroke-dashoffset: 0;
      }
    }

    @keyframes bc-release-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    .bc-release-profile--still {
      .bc-release-profile--line,
      .bc-release-profile--dot,
      .bc-release-profile--chip {
        animation: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-release-profile--line,
      .bc-release-profile--dot,
      .bc-release-profile--chip {
        animation: none;
      }
    }
  }
</style>
