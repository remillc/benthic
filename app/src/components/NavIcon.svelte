<script>
  // @ts-check
  // The icons of the four sections in the Android navigation (task 2026-11-14-120, the phone's
  // bottom bar; task 2026-11-14-126, the tablet rail, docs/mockups/nav-barre-android.dc.html):
  // outlined when inactive; when active, filled parts (`fill`) and inner lines (`cut`) drawn in
  // the pill's colour.

  /** @type {{ section: import('../lib/navigation.svelte.js').Section, active?: boolean }} */
  let { section, active = false } = $props();

  /** @type {Record<string, { line: string, fill?: string, cut?: string, dots?: [number, number][] }>} */
  const ICONS = {
    logbook: { line: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', fill: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', cut: 'M5 17a3 3 0 0 1 3-3h11' },
    sites: { line: 'M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z', fill: 'M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z', dots: [[12, 11]] },
    statistics: { line: 'M3 20h18 M6 16v-4 M10.5 16V6 M15 16v-6 M19.5 16V9' },
    tools: { line: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8', dots: [[16, 7], [10, 17]] },
  };
  const icon = $derived(ICONS[section]);
</script>

<svg class="od-nav-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
  {#if active && icon.fill}<path d={icon.fill} class="od-nav-icon--filled" />{/if}
  <path d={icon.line} />
  {#if icon.cut}<path d={icon.cut} class:od-nav-icon--cut={active} />{/if}
  {#each icon.dots ?? [] as [cx, cy] (`${cx},${cy}`)}
    <circle {cx} {cy} r="2" class:od-nav-icon--filled={active && section === 'tools'} class:od-nav-icon--cut-fill={active && section === 'sites'} />
  {/each}
</svg>

<style>
  @layer od.components {
    .od-nav-icon {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;

      .od-nav-icon--filled {
        fill: currentColor;
      }

      .od-nav-icon--cut {
        stroke: var(--od-nav-active-container);
      }

      .od-nav-icon--cut-fill {
        fill: var(--od-nav-active-container);
        stroke: var(--od-nav-active-container);
      }
    }
  }
</style>
