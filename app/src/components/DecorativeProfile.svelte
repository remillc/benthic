<script>
  // @ts-check
  // The decorative dive profile of first launch and of the editorial pages
  // (docs/system-design.md, section 8): a 1.5 dp line over the water
  // gradient, stretched across the width it is given. Decoration only: hidden
  // from screen readers.
  import { decorativeProfilePath } from '../lib/smooth-path.js';

  /**
   * `trace`: the line in the profile ink (`--bc-trace`, 1.25 dp) instead of the text colour (1.5 dp).
   * @type {{ class?: string, trace?: boolean }}
   */
  let { class: extraClass = '', trace = false } = $props();

  const WIDTH = 390;
  const HEIGHT = 190;
  // The dive of the mock-ups as a smooth curve through every point (task 2026-11-15-214).
  const line = decorativeProfilePath(WIDTH, 8, 174);
  // Several profiles can be in the page at once (first launch over a section).
  const gradient = `od-decorative-profile-${Math.random().toString(36).slice(2, 9)}`;
</script>

<svg class="bc-decorative-profile {extraClass}" viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="bc-decorative-profile--water-top"></stop>
      <stop offset="1" class="bc-decorative-profile--water-bottom"></stop>
    </linearGradient>
  </defs>
  <path class="bc-decorative-profile--water" d="{line} Z" fill="url(#{gradient})"></path>
  <path class="bc-decorative-profile--line" class:bc-decorative-profile--trace={trace} d={line}></path>
</svg>

<style>
  @layer od.components {
    .bc-decorative-profile {
      display: block;
      width: 100%;
    }

    .bc-decorative-profile--water-top {
      stop-color: var(--bc-water-top);
    }

    .bc-decorative-profile--water-bottom {
      stop-color: var(--bc-water-bottom);
    }

    .bc-decorative-profile--water {
      opacity: 0.9;
    }

    .bc-decorative-profile--line {
      fill: none;
      stroke: var(--bc-text);
      stroke-width: 1.5;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    .bc-decorative-profile--trace {
      stroke: var(--bc-trace);
      stroke-width: 1.25;
    }
  }
</style>
