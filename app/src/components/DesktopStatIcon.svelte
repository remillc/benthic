<script>
  // @ts-check
  // The 22 dp stroke icon of a statistic's tile in the desktop Statistiques list (task
  // 2026-11-15-176, mock-up bureau-stats): bars, an arrow down to the bottom, a stopwatch, a
  // cylinder, a pin, a grid. Drawn in the colour of the text around it.

  /** @type {{ name: 'bars'|'depth'|'stopwatch'|'cylinder'|'pin'|'grid', size?: number }} */
  let { name, size = 22 } = $props();
</script>

<svg class="bc-desktop-stat-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  {#if name === 'bars'}
    <path d="M4 20h16 M7 16v-5 M12 16V7 M17 16v-8" />
  {:else if name === 'depth'}
    <path d="M12 4v14 M7 13l5 5 5-5" /><path d="M4 21h16" />
  {:else if name === 'stopwatch'}
    <circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2 M10 2h4" />
  {:else if name === 'cylinder'}
    <rect x="8" y="6" width="8" height="15" rx="3" /><path d="M10 3h4 M12 3v3" />
  {:else if name === 'pin'}
    <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2" />
  {:else}
    <rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
  {/if}
</svg>

<style>
  @layer bc.components {
    .bc-desktop-stat-icon {
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  }
</style>
