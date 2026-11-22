<script>
  // @ts-check
  // The dive profile on the blue panel of the tablet's first launch (task 2026-11-16-237; mock-ups
  // docs/mockups/android-tablette-premier-lancement-*.dc.html): a white 2.5 dp line with a soft light-blue
  // glow, the water column in white fading from 20 % to 4 % (visible from the start), a dashed surface line,
  // a white dot at the deepest point and two frosted labels. The curve of the orientation is scaled to the
  // box it is given, so the stroke stays 2.5 dp. When it appears the line and its glow draw from left to
  // right in 2.2 s (stroke trimming), the dot appears at 0.7 s and the labels at 2.1 s; the timing is in
  // lib/profile-hero.js. The page re-creates the component each time it is shown, so that it plays again.
  // With the system setting that removes animations, it shows its final state at once.
  // Decoration (the texts are an example, not the diver's data): one label for screen readers.
  import { scaledProfile } from '../lib/profile-hero.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ still?: boolean }} still: the final state, without the animation (the steps after the first screen) */
  let { still = false } = $props();

  let width = $state(588);
  let height = $state(300);
  const query = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null;
  let portrait = $state(query?.matches ?? false);
  $effect(() => {
    if (!query) return;
    const update = () => (portrait = query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  });

  const shape = $derived(scaledProfile(portrait ? 'portrait' : 'landscape', width, height));
  const id = Math.random().toString(36).slice(2, 9);
  const gradient = `bc-profile-hero-water-${id}`;
  const glow = `bc-profile-hero-glow-${id}`;
</script>

<div class="bc-profile-hero" class:bc-profile-hero--portrait={portrait} class:bc-profile-hero--still={still} bind:clientWidth={width} bind:clientHeight={height}>
  <svg class="bc-profile-hero--svg" {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={t('firstLaunch.profileLabel')}>
    <defs>
      <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="bc-profile-hero--water-top"></stop>
        <stop offset="1" class="bc-profile-hero--water-bottom"></stop>
      </linearGradient>
      <filter id={glow} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"></feGaussianBlur></filter>
    </defs>
    <line class="bc-profile-hero--surface" x1="0" y1={shape.surfaceY} x2={width} y2={shape.surfaceY}></line>
    <path class="bc-profile-hero--water" d={shape.area} fill="url(#{gradient})"></path>
    <path class="bc-profile-hero--glow" d={shape.line} filter="url(#{glow})" pathLength="1"></path>
    <path class="bc-profile-hero--line" d={shape.line} pathLength="1"></path>
  </svg>
  <span class="bc-profile-hero--dot" style="left: {shape.deepest.x}px; top: {shape.deepest.y}px" aria-hidden="true"></span>
  <div class="bc-profile-hero--label bc-profile-hero--label-depth" aria-hidden="true">
    <span class="bc-profile-hero--value">{t('firstLaunch.profileDepthValue')}</span>
    <span class="bc-profile-hero--caption">{t('firstLaunch.profileDepthCaption')}</span>
  </div>
  <div class="bc-profile-hero--label bc-profile-hero--label-duration" aria-hidden="true">
    <span class="bc-profile-hero--value">{t('firstLaunch.profileDurationValue')}</span>
    <span class="bc-profile-hero--caption">{t('firstLaunch.profileDurationCaption')}</span>
  </div>
</div>

<style>
  @layer bc.components {
    .bc-profile-hero {
      position: relative;
      /* Fills the box its page gives it; the curve is scaled to it. */
      width: 100%;
      height: 100%;
    }

    .bc-profile-hero--svg {
      position: absolute;
      inset: 0;
      overflow: visible;
    }

    .bc-profile-hero--water-top {
      stop-color: var(--bc-first-band-water-top);
    }

    .bc-profile-hero--water-bottom {
      stop-color: var(--bc-first-band-water-bottom);
    }

    .bc-profile-hero--surface {
      stroke: var(--bc-first-band-surface);
      stroke-width: 1;
      stroke-dasharray: 3 4;
    }

    .bc-profile-hero--glow {
      fill: none;
      stroke: var(--bc-first-band-glow);
      stroke-width: 6;
      stroke-opacity: 0.55;
      stroke-dasharray: 1;
      animation: bc-profile-hero-draw 2.2s cubic-bezier(0.4, 0, 0.2, 1) both;
    }

    .bc-profile-hero--line {
      fill: none;
      stroke: var(--bc-first-band-trace);
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-linecap: round;
      stroke-dasharray: 1;
      animation: bc-profile-hero-draw 2.2s cubic-bezier(0.4, 0, 0.2, 1) both;
    }

    /* The deepest point of the curve (its centre is where the page puts left and top). */
    .bc-profile-hero--dot {
      position: absolute;
      width: 12px;
      height: 12px;
      margin: -6px 0 0 -6px;
      border-radius: 6px;
      background: var(--bc-first-band-trace);
      box-shadow: 0 0 0 5px var(--bc-first-band-dot-ring);
      animation: bc-profile-hero-pop 0.3s 0.7s cubic-bezier(0.2, 0, 0, 1) both;
    }

    .bc-profile-hero--label {
      position: absolute;
      padding: 8px 14px;
      border-radius: 14px;
      background: var(--bc-first-band-label);
      border: 1px solid var(--bc-first-band-label-line);
      backdrop-filter: blur(6px);
      color: var(--bc-on-first-band);
      display: flex;
      flex-direction: column;
      white-space: nowrap;
      animation: bc-profile-hero-in 0.5s 2.1s cubic-bezier(0.2, 0, 0, 1) both;
    }

    .bc-profile-hero--value {
      font-size: 20px;
      line-height: 24px;
      font-weight: 600;
      letter-spacing: -0.2px;
    }

    .bc-profile-hero--caption {
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-first-band-label-caption);
    }

    /* Landscape: the depth label under the dot, the duration label near the end of the line. */
    .bc-profile-hero--label-depth {
      left: calc(13.3% - 50px);
      top: calc(94.9% + 20px);
    }

    .bc-profile-hero--label-duration {
      left: 70.1%;
      top: 29%;
    }

    /* Portrait: the depth label to the right of the dot, the duration label a little lower. */
    .bc-profile-hero--portrait .bc-profile-hero--label-depth {
      left: 23.8%;
      top: 85%;
    }

    .bc-profile-hero--portrait .bc-profile-hero--label-duration {
      left: 74%;
      top: 34.5%;
    }

    /* The desktop app in a narrow window (task 2026-11-16-242): the duration label stays inside the panel. */
    @media (max-width: 1100px) {
      :global(html.bc-desktop-app) .bc-profile-hero--label-duration {
        left: auto;
        right: 0;
      }
    }

    @keyframes bc-profile-hero-draw {
      from {
        stroke-dashoffset: 1;
      }
      to {
        stroke-dashoffset: 0;
      }
    }

    @keyframes bc-profile-hero-pop {
      from {
        opacity: 0;
        transform: scale(0.4);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    @keyframes bc-profile-hero-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-profile-hero--glow,
      .bc-profile-hero--line,
      .bc-profile-hero--dot,
      .bc-profile-hero--label {
        animation: none;
      }
    }

    .bc-profile-hero--still {
      .bc-profile-hero--glow,
      .bc-profile-hero--line,
      .bc-profile-hero--dot,
      .bc-profile-hero--label {
        animation: none;
      }
    }
  }
</style>
