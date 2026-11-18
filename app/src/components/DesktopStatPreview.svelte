<script>
  // @ts-check
  // The preview at the end of a row of the desktop Statistiques list (task 2026-11-15-176): 56 × 24 dp,
  // decorative. Small bars for counts, a 2 dp line for a measure over time (the depth drawn
  // downward), a 4 × 2 grid of the heat map's colours. Nothing is drawn without a preview.
  import { linePoints } from '../lib/desktop-stats.js';

  /** @type {{ preview: import('../lib/desktop-stats.js').Preview|null, downward?: boolean }} */
  let { preview, downward = false } = $props();

  const bars = $derived.by(() => {
    if (preview?.type !== 'bars') return [];
    const n = preview.values.length;
    const step = 54 / n;
    const width = Math.min(11, step * 0.62);
    return preview.values.map((v, i) => {
      const h = Math.max(2, v * 22);
      return { x: 1 + i * step + (step - width) / 2, y: 24 - h, width, height: h };
    });
  });
</script>

<span class="od-desktop-stat-preview" aria-hidden="true">
  {#if preview}
    <svg width="56" height="24" viewBox="0 0 56 24">
      {#if preview.type === 'bars'}
        {#each bars as b, i (i)}
          <rect class="od-desktop-stat-preview--bar" x={b.x} y={b.y} width={b.width} height={b.height} rx="1.5" />
        {/each}
      {:else if preview.type === 'line'}
        <polyline class="od-desktop-stat-preview--line" points={linePoints(preview.values, downward)} />
      {:else}
        {#each preview.levels as level, i (i)}
          <rect
            class="od-desktop-stat-preview--cell od-desktop-stat-preview--level-{level}"
            x={(i % 4) * 14}
            y={i < 4 ? 0 : 13}
            width="12"
            height="11"
            rx="2"
          />
        {/each}
      {/if}
    </svg>
  {/if}
</span>

<style>
  @layer od.components {
    /* The slot keeps its size when there is no preview, so the titles do not move. */
    .od-desktop-stat-preview {
      flex: none;
      width: 56px;
      height: 24px;
      display: block;
    }

    .od-desktop-stat-preview svg {
      display: block;
    }

    .od-desktop-stat-preview--bar {
      fill: var(--od-desk-stats-preview);
    }

    .od-desktop-stat-preview--line {
      fill: none;
      stroke: var(--od-desk-stats-preview);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .od-desktop-stat-preview--level-0 {
      fill: var(--od-desk-stats-heat-0);
    }
    .od-desktop-stat-preview--level-1 {
      fill: var(--od-desk-stats-heat-1);
    }
    .od-desktop-stat-preview--level-2 {
      fill: var(--od-desk-stats-heat-2);
    }
    .od-desktop-stat-preview--level-3 {
      fill: var(--od-desk-stats-heat-3);
    }
    .od-desktop-stat-preview--level-4 {
      fill: var(--od-desk-stats-heat-4);
    }

    /* On the chosen row: the ink of the selection. */
    :global(.od-desktop-statistics--item-selected) .od-desktop-stat-preview--bar {
      fill: var(--od-on-table-selected);
    }
    :global(.od-desktop-statistics--item-selected) .od-desktop-stat-preview--line {
      stroke: var(--od-on-table-selected);
    }
  }
</style>
