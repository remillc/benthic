<script>
  // @ts-check
  // <TripRow> (spec, section 4, "LigneVoyage"): a collapsed trip. Four
  // thumbnails in a 2 × 2 grid, the trip name, then "4 dives, 21.8 to 28.7 m";
  // a tap expands the trip.
  import Icon from './Icon.svelte';
  import { theme } from 'framework7-svelte';
  import ProfileThumbnail from './ProfileThumbnail.svelte';
  import { depthValue, formatDepth, formatDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   dives: import('opendives-core').Dive[],
   *   location: string,
   *   prefs: import('opendives-core').Prefs,
   *   expanded: boolean,
   *   ontoggle: () => void,
   *   index?: number,
   *   top?: number,
   *   selecting?: boolean,
   *   checked?: boolean,
   *   card?: boolean,
   *   cardFirst?: boolean,
   *   cardLast?: boolean,
   *   gapBefore?: boolean,
   * }}
   * `index` and `top`: position in the logbook's virtual list.
   * `selecting`, `checked`: the logbook's selection mode, a check box before
   * the row, checked when all the trip's dives are; the logbook handles the taps.
   * `card`: the phone logbook's header (task 2026-11-18-278), pale blue, suitcase, "4 plongées · de 69 à 94 pi" and
   * the fold chevron; `cardFirst`, `cardLast`, `gapBefore`: as in DiveRow.
   */
  let { dives, location, prefs, expanded, ontoggle, index = undefined, top = undefined, selecting = false, checked = false, card = false, cardFirst = true, cardLast = false, gapBefore = false } = $props();

  // Dives arrive from the most recent to the oldest.
  const start = $derived(dives[dives.length - 1].date);
  const title = $derived(location || t('trip.startingOn', { date: formatDate(start) }));
  const summary = $derived.by(() => {
    const diveCount = t('trip.dives', { n: dives.length });
    // A zero depth means "unknown": it is left out of the range.
    const depths = dives.map((d) => d.maxDepthMm).filter((mm) => mm > 0);
    if (!depths.length) return diveCount;
    const min = Math.min(...depths);
    const max = Math.max(...depths);
    const [single, range] = card ? ['trip.cardSummarySingle', 'trip.cardSummaryRange'] : ['trip.summarySingle', 'trip.summaryRange'];
    return min === max
      ? t(single, { dives: diveCount, depth: formatDepth(max, prefs) })
      : t(range, { dives: diveCount, min: depthValue(min, prefs), max: formatDepth(max, prefs) });
  });
  const preview = $derived(dives.slice(0, 4));

  /** @param {MouseEvent} e */
  function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    ontoggle();
  }

</script>

{#if card}
  <li
    class="od-trip-row od-trip-row--card"
    class:od-trip-row--card-last={cardLast}
    class:od-trip-row--gap-before={gapBefore}
    data-trip={dives[0].trip?.id}
    data-virtual-list-index={index}
    style:top={top === undefined ? undefined : `${top}px`}
  >
    <!-- As the other trip rows: the header opens the trip screen, the chevron folds or unfolds it in place. -->
    <a
      href="/trips/{dives[0].trip?.id}"
      data-reload-detail="true"
      draggable="false"
      class="od-trip-row--surface"
      role={selecting ? 'checkbox' : undefined}
      aria-checked={selecting ? checked : undefined}
    >
      {#if selecting}
        <span class="checkbox" aria-hidden="true"><input type="checkbox" {checked} tabindex="-1" /><i class="icon-checkbox"></i></span>
      {/if}
      <span class="od-trip-row--badge" aria-hidden="true"><Icon name="trip" size={22} weight={2} /></span>
      <span class="od-trip-row--text">
        <span class="od-trip-row--title">{title}</span>
        <span class="od-trip-row--summary">{summary}</span>
      </span>
      <button
        type="button"
        class="od-trip-row--expand"
        aria-expanded={expanded}
        aria-label={t(expanded ? 'trip.collapse' : 'trip.expand')}
        onclick={toggle}
      >
        <span class="od-trip-row--arrow" class:od-trip-row--expanded={expanded}><Icon name="expand" /></span>
      </button>
    </a>
  </li>
{:else}
<li class="od-trip-row" data-trip={dives[0].trip?.id} data-virtual-list-index={index} style:top={top === undefined ? undefined : `${top}px`}>
  <!-- The row opens the trip screen (spec, section 4, "Trip"); the arrow expands the trip in place. On a tablet the trip replaces what the pane shows (first screen of the pane). -->
  <a
    href="/trips/{dives[0].trip?.id}"
    data-reload-detail="true"
    draggable="false"
    class="item-link item-content no-chevron"
    role={selecting ? 'checkbox' : undefined}
    aria-checked={selecting ? checked : undefined}
  >
    {#if selecting}
      <span class="checkbox" aria-hidden="true"><input type="checkbox" {checked} tabindex="-1" /><i class="icon-checkbox"></i></span>
    {/if}
    <div class="item-media">
      <div class="od-trip-row--grid" aria-hidden="true">
        {#each preview as d (d.id)}
          <ProfileThumbnail profile={d.profile} maxDepthMm={d.maxDepthMm} {prefs} small />
        {/each}
      </div>
    </div>
    <div class="item-inner od-row">
      <div class="od-row-text">
        <div class="item-title">{title}</div>
        <div class="item-text od-value">{summary}</div>
        {#if location && theme.ios}<div class="item-text">{t('trip.startingOn', { date: formatDate(start) })}</div>{/if}
      </div>
      <button
        type="button"
        class="od-trip-row--expand"
        aria-expanded={expanded}
        aria-label={t(expanded ? 'trip.collapse' : 'trip.expand')}
        onclick={toggle}
      >
        <span class="od-trip-row--arrow" class:od-trip-row--expanded={expanded}><Icon name="expand" /></span>
      </button>
    </div>
  </a>
</li>
{/if}

<style>
  @layer od.components {
    /* Phone header (task 2026-11-18-278): the top of the trip's white card, pale blue. */
    .od-trip-row--card {
      list-style: none;
      padding: 0 12px;
    }

    .od-trip-row--gap-before {
      padding-top: 12px;
    }

    .od-trip-row--surface {
      display: flex;
      align-items: center;
      gap: 14px;
      box-sizing: border-box;
      min-height: 72px;
      padding: 12px 6px 12px 12px;
      border-radius: 20px 20px 0 0;
      background: var(--od-trip-header);
      color: var(--od-text);
      text-decoration: none;
    }

    .od-trip-row--card-last .od-trip-row--surface {
      border-radius: 20px;
    }

    .od-trip-row--badge {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: var(--od-surface);
      color: var(--od-on-date-block);
    }

    .od-trip-row--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-trip-row--title {
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .od-trip-row--summary {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }

    .od-trip-row--card .od-trip-row--expand {
      margin-right: 0;
    }

    .od-trip-row--grid {
      width: 56px;
      height: 40px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 2px;
    }

    .checkbox {
      flex: none;
      margin-right: 16px;
      pointer-events: none;

      /* Android: the row's own 16 dp gap. */
      :global(.md) & {
        margin-right: 0;
      }
    }

    /* 48 px touch target for the arrow, separate from the row's link. */
    .od-trip-row--expand {
      width: 48px;
      height: 48px;
      margin-right: -12px;
      border: none;
      background: none;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
    }

    .od-trip-row--arrow {
      display: block;
      transition: transform 200ms;

      &.od-trip-row--expanded {
        transform: rotate(180deg);
      }
    }
  }
</style>
