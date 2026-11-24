<script>
  // @ts-check
  // A drawn cylinder (docs/mockups/android-edition.dc.html, "Gaz"), the one used by
  // every screen but the rebreather drawing: an ink outline, and the body filled from the bottom with the water
  // gradient up to `ratio` (end pressure over working pressure, 0..1). With
  // `startRatio` (the start pressure, same scale) a solid pale band shows what
  // was breathed between the end and the start level, and a dashed line marks
  // each level (task 46). `hatched`: the start and end pressures are not both
  // known, so the body is hatched in grey with no level (13 November 2026).
  // The outline is `stroke` wide in the drawing's own units (1.2 of the 44 x 76 viewBox, task 2026-11-24-379): it scales with `width`,
  // 1.2 px at 44 px and about 1.75 px at 64 px.
  // Decorative: the text next to it says the same.

  /** @type {{ ratio?: number, startRatio?: number|null, hatched?: boolean, width?: number, stroke?: number }} */
  let { ratio = 0, startRatio = null, hatched = false, width = 44, stroke = 1.2 } = $props();

  const id = `bc-cylinder-drawing-${Math.random().toString(36).slice(2, 9)}`;
  // The cylinder (task 2026-11-13-85): a slim body with shoulders narrowing into a
  // short neck and a rounded bottom, no valve. Filled, used as the clip of the
  // levels, then drawn again as the outline.
  const SHAPE = 'M19 9 L19 13 C13.5 14 9 19 9 26 L9 63 C9 70 14 75 22 75 C30 75 35 70 35 63 L35 26 C35 19 30.5 14 25 13 L25 9 Z';
  // The levels' scale is unchanged: full at 12, empty at 74, clipped by the shape.
  const BODY_TOP = 12;
  const BODY_HEIGHT = 62;
  const level = $derived(hatched ? 0 : Math.min(1, Math.max(0, ratio)));
  const fillTop = $derived(BODY_TOP + BODY_HEIGHT * (1 - level));
  const startLevel = $derived(hatched || startRatio === null ? null : Math.min(1, Math.max(level, startRatio)));
  const startTop = $derived(startLevel === null ? 0 : BODY_TOP + BODY_HEIGHT * (1 - startLevel));
  // A dashed line at the very top or bottom of the body is kept inside it (half its width).
  /** @param {number} y */
  const lineY = (y) => Math.min(BODY_TOP + BODY_HEIGHT - 0.75, Math.max(BODY_TOP + 0.75, y));
</script>

<svg class="bc-cylinder-drawing" {width} height={(width * 76) / 44} viewBox="0 0 44 76" aria-hidden="true">
  <defs>
    <linearGradient id="{id}-water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="bc-cylinder-drawing--water-top" />
      <stop offset="1" class="bc-cylinder-drawing--water-bottom" />
    </linearGradient>
    <clipPath id="{id}-clip"><path d={SHAPE} /></clipPath>
    <pattern id="{id}-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" class="bc-cylinder-drawing--hatch-ground" />
      <rect width="4" height="8" class="bc-cylinder-drawing--hatch-stripe" />
    </pattern>
  </defs>
  <path d={SHAPE} class="bc-cylinder-drawing--body" style:fill={hatched ? `url(#${id}-hatch)` : null} />
  {#if startLevel !== null && startLevel > 0}
    <rect x="6" y={startTop} width="32" height={BODY_TOP + BODY_HEIGHT - startTop} class="bc-cylinder-drawing--start-fill" clip-path="url(#{id}-clip)" />
    <line x1="7" y1={lineY(startTop)} x2="37" y2={lineY(startTop)} class="bc-cylinder-drawing--level" clip-path="url(#{id}-clip)" />
  {/if}
  {#if level > 0}
    <rect x="6" y={fillTop} width="32" height={BODY_TOP + BODY_HEIGHT - fillTop} fill="url(#{id}-water)" clip-path="url(#{id}-clip)" />
    {#if startLevel !== null}
      <line x1="7" y1={lineY(fillTop)} x2="37" y2={lineY(fillTop)} class="bc-cylinder-drawing--level" clip-path="url(#{id}-clip)" />
    {/if}
  {/if}
  <path d={SHAPE} class="bc-cylinder-drawing--outline" stroke-width={stroke} />
</svg>

<style>
  @layer bc.components {
    .bc-cylinder-drawing {
      flex: none;
    }

    .bc-cylinder-drawing--body {
      fill: var(--bc-surface);
    }

    .bc-cylinder-drawing--outline {
      fill: none;
      stroke: var(--bc-text);
      stroke-linejoin: round;
    }

    .bc-cylinder-drawing--hatch-ground {
      fill: var(--bc-cylinder-no-pressure);
    }

    .bc-cylinder-drawing--hatch-stripe {
      fill: var(--bc-cylinder-no-pressure-stripe);
    }

    /* The water gradient. */
    .bc-cylinder-drawing--water-top {
      stop-color: var(--bc-cylinder-water-top);
    }

    .bc-cylinder-drawing--water-bottom {
      stop-color: var(--bc-cylinder-water-bottom);
    }

    /* Between the end and the start pressure: what was breathed. */
    .bc-cylinder-drawing--start-fill {
      fill: var(--bc-cylinder-breathed);
    }

    .bc-cylinder-drawing--level {
      stroke: var(--bc-cylinder-level);
      stroke-width: 1.5;
      stroke-dasharray: 3 2;
    }
  }
</style>
