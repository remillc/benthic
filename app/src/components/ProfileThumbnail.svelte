<script>
  // @ts-check
  // <ProfileThumbnail> (spec, section 4, "Miniature"): a reduced profile in
  // place of an icon. The curve fills the whole height (the dive's own scale);
  // the water column follows the common scale, so depth stays readable.
  import { waterBottomColor } from '../lib/water-column.js';
  import { formatDepth } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   profile: number[],
   *   maxDepthMm: number,
   *   prefs: import('benthic-core').Prefs,
   *   small?: boolean,
   *   wide?: boolean,
   * }}
   */
  let { profile, maxDepthMm, prefs, small = false, wide = false } = $props();

  const uid = $props.id();
  const W = 56;
  const H = 40;

  const shape = $derived.by(() => {
    if (profile.length < 4) return null;
    let tMax = 0;
    let dMax = 0;
    for (let i = 0; i < profile.length; i += 2) {
      tMax = Math.max(tMax, profile[i]);
      dMax = Math.max(dMax, profile[i + 1]);
    }
    if (!tMax || !dMax) return null;
    /** @type {string[]} */
    const points = [];
    for (let i = 0; i < profile.length; i += 2) {
      const x = (profile[i] / tMax) * W;
      const y = (profile[i + 1] / dMax) * (H - 1);
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return { line: `M${points.join('L')}`, water: `M0,0L${points.join('L')}L${W},0Z` };
  });
</script>

<svg
  class="bc-profile-thumbnail bc-profile-thumbnail--thumbnail"
  class:bc-profile-thumbnail--small={small}
  class:bc-profile-thumbnail--wide={wide}
  viewBox="0 0 {W} {H}"
  preserveAspectRatio="none"
  role={small || wide ? undefined : 'img'}
  aria-hidden={small || wide ? 'true' : undefined}
  aria-label={small || wide ? undefined : t('dive.thumbnail', { depth: formatDepth(maxDepthMm, prefs) })}
>
  <defs>
    <linearGradient id="water-{uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: var(--bc-water-top)" />
      <stop offset="1" style="stop-color: {waterBottomColor(maxDepthMm)}" />
    </linearGradient>
  </defs>
  {#if shape}
    <path d={shape.water} fill="url(#water-{uid})" />
    <path d={shape.line} class="bc-profile-thumbnail--line" vector-effect="non-scaling-stroke" />
  {/if}
</svg>

<style>
  @layer bc.components {
    .bc-profile-thumbnail--thumbnail {
      display: block;
      width: 56px;
      height: 40px;
      border-radius: 8px;
      background: var(--bc-thumbnail-background);
      overflow: hidden;
      flex-shrink: 0;

      :global(.ios) & {
        height: 36px;
        border-radius: 4px;
      }

      /* Phone rows (task 2026-11-18-278): 64 × 28, on a light grey chip. */
      &.bc-profile-thumbnail--wide {
        width: 64px;
        height: 28px;
        border-radius: 6px;
        background: var(--bc-profile-chip);
      }

      &.bc-profile-thumbnail--small {
        width: 100%;
        height: 100%;
        border-radius: 4px;
      }
    }

    .bc-profile-thumbnail--line {
      fill: none;
      stroke: var(--bc-trace);
      stroke-width: 1.25;
      stroke-linejoin: round;

      .bc-profile-thumbnail--small & {
        stroke-width: 1;
      }
    }
  }
</style>
