<script>
  // @ts-check
  // The chart of the desktop Statistiques screen (task 2026-11-15-171, mock-up bureau-stats): one bar per
  // year, dive or site on a white 16 dp card, the values above the bars when they are few,
  // round steps on the left. The mouse over a bar shows a dark tooltip (« 2013 · 4 plongées /
  // Clic pour les voir »); a click, or Entrée on the focused bar, opens its dives in the Carnet.
  import { niceTicks } from '../lib/desktop-stats.js';

  /**
   * @type {{
   *   bars: import('../lib/desktop-stats.js').StatBar[],
   *   label: string,
   *   tip: (bar: import('../lib/desktop-stats.js').StatBar) => [string, string],
   *   valueText?: (bar: import('../lib/desktop-stats.js').StatBar) => string,
   *   onopen: (bar: import('../lib/desktop-stats.js').StatBar) => void,
   *   scale?: number,
   *   unit?: string,
   *   height?: number,
   *   svg?: SVGSVGElement|undefined,
   * }}
   * `scale`: values per unit of the axis (1000 for millimetres shown in metres); `unit` is
   * written after the top value. `valueText`: the text above a bar; without it, the value.
   * `svg`: the drawn chart, for « Exporter le graphique ».
   */
  let { bars, label, tip, valueText = undefined, onopen, scale = 1, unit = '', height = 380, svg = $bindable(undefined) } = $props();

  let width = $state(0);
  /** @type {number|null} */
  let hovered = $state(null);

  const LEFT = 52;
  const TOP = 40;
  const BOTTOM = 30;
  const RIGHT = 12;
  const plotHeight = $derived(height - TOP - BOTTOM);

  const ticks = $derived(niceTicks(Math.max(...bars.map((b) => b.value), 0) / scale));
  const axisMax = $derived(ticks.max * scale);
  /** @param {number} value */
  const yOf = (value) => TOP + plotHeight - (value / axisMax) * plotHeight;

  const slot = $derived(bars.length && width > LEFT + RIGHT ? (width - LEFT - RIGHT) / bars.length : 0);
  const barWidth = $derived(Math.max(1, Math.min(40, slot * 0.76)));
  /** Under 25 bars each one carries its value; the year under it every few bars when they are many. */
  const showValues = $derived(bars.length <= 24);
  const labelEvery = $derived(Math.max(1, Math.ceil(44 / (slot || 1))));

  const items = $derived(
    bars.map((bar, i) => {
      const h = bar.value > 0 ? Math.max(2, (bar.value / axisMax) * plotHeight) : 0;
      const x = LEFT + i * slot + (slot - barWidth) / 2;
      return { bar, x, y: TOP + plotHeight - h, h, centre: x + barWidth / 2, i };
    }),
  );

  /** @param {number} value @param {number} index */
  const tickText = (value, index) => {
    const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return index === ticks.ticks.length - 1 && unit ? `${text} ${unit}` : text;
  };

  /** The tooltip: right of the bar's top, on its left near the right edge. */
  const tooltip = $derived.by(() => {
    if (hovered === null || !items[hovered]) return null;
    const it = items[hovered];
    const lines = tip(it.bar);
    const flip = it.x + barWidth + 12 + 190 > width;
    return { lines, top: Math.max(4, it.y - 12), left: flip ? undefined : it.x + barWidth + 12, right: flip ? width - it.x + 12 : undefined };
  });

  /** @param {KeyboardEvent} e @param {import('../lib/desktop-stats.js').StatBar} bar */
  function key(e, bar) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onopen(bar);
    }
  }
</script>

<div class="od-desktop-stat-chart" style:height="{height}px" bind:clientWidth={width}>
  {#if width}
    <svg bind:this={svg} {width} {height} viewBox="0 0 {width} {height}" role="group" aria-label={label}>
      {#each ticks.ticks as tick, i (tick)}
        {@const y = yOf(tick * scale)}
        <line class="od-desktop-stat-chart--grid" x1={LEFT - 2} x2={width - RIGHT} y1={y} y2={y} />
        <text class="od-desktop-stat-chart--tick" x={LEFT - 10} y={y + 4} text-anchor="end">{tickText(tick, i)}</text>
      {/each}
      {#each items as it (it.bar.key)}
        <rect
          class="od-desktop-stat-chart--bar"
          class:od-desktop-stat-chart--bar-hover={hovered === it.i}
          x={it.x}
          y={it.y}
          width={barWidth}
          height={it.h}
          rx={barWidth >= 12 ? 6 : 1}
        />
        {#if showValues && it.bar.value > 0}
          <text class="od-desktop-stat-chart--value" x={it.centre} y={it.y - 8} text-anchor="middle">{valueText ? valueText(it.bar) : it.bar.value}</text>
        {/if}
        {#if it.i % labelEvery === 0}
          <text class="od-desktop-stat-chart--label" x={it.centre} y={height - 10} text-anchor="middle">{it.bar.label}</text>
        {/if}
      {/each}
      <!-- The hit areas: a whole column each, so that a thin or empty bar is easy to reach. -->
      {#each items as it (it.bar.key)}
        {#if it.bar.diveIds.length}
          <rect
            class="od-desktop-stat-chart--hit"
            data-bar={it.bar.key}
            x={LEFT + it.i * slot}
            y={TOP}
            width={slot}
            height={plotHeight}
            role="button"
            tabindex="0"
            aria-label={tip(it.bar).join('. ')}
            onpointerenter={() => (hovered = it.i)}
            onpointerleave={() => (hovered = null)}
            onfocus={() => (hovered = it.i)}
            onblur={() => (hovered = null)}
            onclick={() => onopen(it.bar)}
            onkeydown={(e) => key(e, it.bar)}
          />
        {/if}
      {/each}
    </svg>
    {#if tooltip}
      <div class="od-desktop-stat-chart--tip" style:top="{tooltip.top}px" style:left={tooltip.left === undefined ? undefined : `${tooltip.left}px`} style:right={tooltip.right === undefined ? undefined : `${tooltip.right}px`} role="tooltip">
        <span class="od-desktop-stat-chart--tip-title">{tooltip.lines[0]}</span>
        <span class="od-desktop-stat-chart--tip-hint">{tooltip.lines[1]}</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  @layer od.components {
    .od-desktop-stat-chart {
      position: relative;
      width: 100%;
    }

    svg {
      display: block;
    }

    .od-desktop-stat-chart--grid {
      stroke: var(--od-chart-grid);
      stroke-width: 1;
    }

    .od-desktop-stat-chart--tick,
    .od-desktop-stat-chart--label {
      font-size: 12px;
      fill: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }

    .od-desktop-stat-chart--value {
      font-size: 13px;
      fill: var(--od-text);
      font-variant-numeric: tabular-nums;
    }

    .od-desktop-stat-chart--bar {
      fill: var(--od-desk-stats-bar);
    }

    .od-desktop-stat-chart--bar-hover {
      fill: var(--od-desk-stats-bar-strong);
    }

    .od-desktop-stat-chart--hit {
      fill: transparent;
      cursor: pointer;
      outline: none;
    }

    .od-desktop-stat-chart--hit:focus-visible {
      stroke: var(--od-text);
      stroke-width: 2;
    }

    /* The dark tooltip (as the dive profile's). */
    .od-desktop-stat-chart--tip {
      position: absolute;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 7px 10px;
      border-radius: 8px;
      background: var(--od-inverse-surface);
      color: var(--od-inverse-on-surface);
      font-size: 12px;
      line-height: 1.3;
      white-space: nowrap;
      pointer-events: none;
    }

    .od-desktop-stat-chart--tip-hint {
      color: var(--od-desk-stats-tip-hint);
    }
  }
</style>
