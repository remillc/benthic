<script>
  // @ts-check
  // <DiveRow> (spec, section 4, "LignePlongee"): thumbnail, site (or "site not
  // set"), date and time; on the right the maximum depth, then the duration.
  import { theme } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import ProfileThumbnail from './ProfileThumbnail.svelte';
  import { formatDateTime, formatDepth, formatDuration, formatTimeOfDay, locale } from '../lib/format.js';
  import { diveRowLabel } from '../lib/dive-row-text.js';
  import { dayOfMonth, monthAbbreviation } from '../lib/logbook-cards.js';
  import { layout } from '../lib/layout.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * `inTrip`: the row belongs to an expanded trip and is shifted to the right.
   * `index` and `top`: position in the logbook's virtual list.
   * @type {{
   *   dive: import('opendives-core').Dive,
   *   prefs: import('opendives-core').Prefs,
   *   inTrip?: boolean,
   *   index?: number,
   *   top?: number,
   *   pending?: string[],
   *   selecting?: boolean,
   *   checked?: boolean,
   *   appear?: boolean,
   *   tripFirst?: boolean,
   *   tripLast?: boolean,
   *   card?: boolean,
   *   cardFirst?: boolean,
   *   cardLast?: boolean,
   *   gapBefore?: boolean,
   * }}
   * `pending`: fields edited and not sent yet; the date gives way to them.
   * `selecting`: the logbook's selection mode, a check box before the row;
   * the logbook handles the taps (data-dive gives the dive).
   * `appear`: the row of a trip just expanded slides into place (accordion).
   * `tripFirst`, `tripLast`: the ends of the white surface of an expanded trip.
   * `card`: the phone logbook's row (task 2026-11-18-278): date block, site, number and time, then the profile
   * and the values; `cardFirst`, `cardLast`: the ends of its white card, `gapBefore`: another card ends above it.
   */
  let { dive, prefs, inTrip = false, index = undefined, top = undefined, pending = [], selecting = false, checked = false, appear = false, tripFirst = false, tripLast = false, card = false, cardFirst = false, cardLast = false, gapBefore = false } = $props();

  // "Notes edited, waiting to be sent" (spec, section 4, <DiveRow>).
  const pendingText = $derived(
    pending.length === 0
      ? ''
      : pending.length === 1
        ? t('dive.pending', { what: t(`dive.pendingFields.${pending[0]}`) })
        : t('dive.pendingSeveral'),
  );

  // Dive number as in the detail ("N° 1234"); 0 means not numbered.
  const number = $derived(dive.number ? t('detail.number', { number: String(dive.number) }) : '');

  // Name read by TalkBack and VoiceOver: number, site, date, then the values.
  // A zero depth means "unknown" in the core: it is not read.
  const details = $derived(
    t(dive.maxDepthMm ? 'dive.screenReader' : 'dive.screenReaderNoDepth', {
      site: dive.site || t('dive.siteNotSet'),
      date: formatDateTime(dive.date),
      depth: formatDepth(dive.maxDepthMm, prefs),
      duration: formatDuration(dive.durationSeconds),
    }),
  );
  const label = $derived(card ? [diveRowLabel(dive, prefs), pendingText].filter(Boolean).join(', ') : [number, details, pendingText].filter(Boolean).join(', '));
</script>

{#if card}
  <li
    class="od-dive-row od-dive-row--card"
    data-trip={inTrip ? dive.trip?.id : undefined}
    class:od-dive-row--card-first={cardFirst}
    class:od-dive-row--card-last={cardLast}
    class:od-dive-row--under-header={inTrip && tripFirst}
    class:od-dive-row--gap-before={gapBefore}
    class:od-dive-row--card-selected={layout.split && navigation.dive === String(dive.id)}
    class:od-dive-row--appear={appear}
    data-virtual-list-index={index}
    style:top={top === undefined ? undefined : `${top}px`}
  >
    <a
      href="/dives/{dive.id}"
      data-reload-detail="true"
      data-dive={dive.id}
      draggable="false"
      class="od-dive-row--link od-dive-row--surface"
      role={selecting ? 'checkbox' : undefined}
      aria-checked={selecting ? checked : undefined}
      aria-label={label}
    >
      {#if selecting}
        <span class="checkbox" aria-hidden="true"><input type="checkbox" {checked} tabindex="-1" /><i class="icon-checkbox"></i></span>
      {/if}
      <span class="od-dive-row--date" aria-hidden="true">
        <span class="od-dive-row--day">{dayOfMonth(dive.date)}</span>
        <span class="od-dive-row--month">{monthAbbreviation(dive.date, locale)}</span>
      </span>
      <span class="od-dive-row--text" aria-hidden="true">
        {#if dive.site}
          <span class="od-dive-row--site">{dive.site}</span>
        {:else}
          <span class="od-dive-row--site od-dive-row--site-not-set"><span class="od-dive-row--pin"><Icon name="pinOff" size={14} weight={2} /></span><span class="od-dive-row--site-text">{t('dive.siteNotSet')}</span></span>
        {/if}
        <span class="od-dive-row--meta">{#if number}<strong class="od-dive-row--number">{number}</strong>{/if}<span class="od-dive-row--time">{formatTimeOfDay(dive.date)}</span></span>
        {#if pendingText}<span class="od-dive-row--meta od-dive-row--pending">{pendingText}</span>{/if}
      </span>
      <span class="od-dive-row--right" aria-hidden="true">
        {#if theme.ios}
          <!-- iPhone (docs/mockups/ios-carnet): no thumbnail, the depth over the duration. -->
          {#if dive.maxDepthMm}<strong class="od-dive-row--ios-depth">{formatDepth(dive.maxDepthMm, prefs)}</strong>{/if}
          <span class="od-dive-row--ios-duration">{formatDuration(dive.durationSeconds)}</span>
        {:else}
          <ProfileThumbnail profile={dive.profile} maxDepthMm={dive.maxDepthMm} {prefs} wide />
          <span class="od-dive-row--figures">{#if dive.maxDepthMm}<strong>{formatDepth(dive.maxDepthMm, prefs)}</strong>{' · '}{/if}{formatDuration(dive.durationSeconds)}</span>
        {/if}
      </span>
    </a>
  </li>
{:else}

<li class="od-dive-row" data-trip={inTrip ? dive.trip?.id : undefined} class:od-dive-row--in-trip={inTrip} class:od-dive-row--trip-first={tripFirst} class:od-dive-row--trip-last={tripLast} class:od-dive-row--appear={appear} class:od-dive-row--selected={layout.split && navigation.dive === String(dive.id)} data-virtual-list-index={index} style:top={top === undefined ? undefined : `${top}px`}>
  <!-- data-reload-detail: beside the list (tablet), the dive replaces the one shown. -->
  <a
    href="/dives/{dive.id}"
    data-reload-detail="true"
    data-dive={dive.id}
    draggable="false"
    class="item-link item-content od-dive-row--link"
    class:no-chevron={selecting}
    role={selecting ? 'checkbox' : undefined}
    aria-checked={selecting ? checked : undefined}
    aria-label={label}
  >
    {#if selecting}
      <span class="checkbox" aria-hidden="true"><input type="checkbox" {checked} tabindex="-1" /><i class="icon-checkbox"></i></span>
    {/if}
    <div class="item-media">
      <ProfileThumbnail profile={dive.profile} maxDepthMm={dive.maxDepthMm} {prefs} />
    </div>
    <div class="item-inner od-row">
      <div class="od-row-text">
        <div class="item-title">
          {#if dive.site}{dive.site}{:else}<span class="od-dive-row--not-set">{t('dive.siteNotSet')}</span>{/if}
        </div>
        <div class="item-text">{#if number}{number}<span class="od-dive-row--separator" aria-hidden="true">·</span>{/if}{formatDateTime(dive.date)}</div>
        {#if pendingText}<div class="item-text od-dive-row--pending">{pendingText}</div>{/if}
      </div>
      <div class="od-dive-row--values od-value">
        {#if theme.ios}
          {#if dive.maxDepthMm}<strong>{formatDepth(dive.maxDepthMm, prefs)}</strong>{/if}
          <span>{formatDuration(dive.durationSeconds)}</span>
        {:else}
          <!-- Android: the duration above the depth (spec, "Dive rows, duration above depth"). -->
          <strong>{formatDuration(dive.durationSeconds)}</strong>
          {#if dive.maxDepthMm}<span>{formatDepth(dive.maxDepthMm, prefs)}</span>{/if}
        {/if}
      </div>
    </div>
  </a>
</li>
{/if}

<style>
  @layer od.components {
    /* iOS: shifted on the left only, values and chevron aligned with the other
       rows. Android: a white surface, in theme.css. */
    :global(.ios) .od-dive-row--in-trip .item-content {
      padding-left: calc(32px + var(--f7-safe-area-left));
    }

    /* Beside the list (tablet), the row of the dive shown. */
    .od-dive-row--selected {
      background: var(--od-tint);
      color: var(--od-on-tint);
    }

    /* A trip just expanded: its dives slide down into place. */
    .od-dive-row--appear {
      animation: od-row-appear 220ms ease-out;
    }

    /* Android: the Expressive springs, the slide (spatial) and the fade (effects). */
    :global(.md) .od-dive-row--appear {
      animation:
        od-row-slide var(--od-motion-spatial-default-ms) var(--od-motion-spatial-default) backwards,
        od-row-fade var(--od-motion-effects-default-ms) var(--od-motion-effects-default) backwards;
    }

    @keyframes od-row-appear {
      from {
        opacity: 0;
        transform: translateY(-16px);
      }
    }

    @keyframes od-row-slide {
      from {
        transform: translateY(-16px);
      }
    }

    @keyframes od-row-fade {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-dive-row--appear {
        animation: none;
      }
    }

    /* Phone rows (task 2026-11-18-278): the dives of a year in a white card with 20 px corners. The row is
       transparent, its link is the card's surface: the space between cards is the row's own padding, so that
       the virtual list measures it. */
    .od-dive-row--card {
      list-style: none;
      padding: 0 12px;
    }

    .od-dive-row--gap-before {
      padding-top: 12px;
    }

    .od-dive-row--surface {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      box-sizing: border-box;
      min-height: 72px;
      padding: 10px 14px 10px 12px;
      background: var(--od-surface);
      color: var(--od-text);
      text-decoration: none;
    }

    /* Beside the detail (tablet): the dive shown keeps the pale blue of the selected rows. */
    .od-dive-row--card-selected .od-dive-row--surface {
      background: var(--od-table-selected);
    }

    .od-dive-row--card-first .od-dive-row--surface {
      border-top-left-radius: 20px;
      border-top-right-radius: 20px;
    }

    .od-dive-row--card-last .od-dive-row--surface {
      border-bottom-left-radius: 20px;
      border-bottom-right-radius: 20px;
    }

    /* The thin divider between two dives of a card, from the start of the text. */
    .od-dive-row--card:not(.od-dive-row--card-first, .od-dive-row--under-header) .od-dive-row--surface::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      left: 74px;
      height: 1px;
      background: var(--od-row-divider);
    }

    .od-dive-row--date {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      min-width: 48px;
      min-height: 48px;
      padding: 4px;
      border-radius: 14px;
      background: var(--od-date-block);
      color: var(--od-on-date-block);
      line-height: 1;
    }

    .od-dive-row--day {
      font-size: 19px;
      font-weight: 700;
    }

    .od-dive-row--month {
      margin-top: 3px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.6px;
    }

    .od-dive-row--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-dive-row--site {
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
      color: var(--od-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .od-dive-row--site-not-set {
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 400;
      font-style: italic;
      color: var(--od-text-2);
    }

    .od-dive-row--pin {
      flex: none;
      display: flex;
      color: var(--od-outline);
    }

    .od-dive-row--site-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      /* The slant of the italic would be cut by the clipping. */
      padding-right: 2px;
    }

    .od-dive-row--meta {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .od-dive-row--number {
      font-weight: 700;
      color: var(--od-text);
    }

    .od-dive-row--card .od-dive-row--pending {
      color: var(--od-tertiary);
    }

    /* The right column gives way before the site does: at a large text size it wraps its two figures. */
    .od-dive-row--right {
      flex: 0 1 auto;
      min-width: 64px;
      max-width: 40%;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }

    .od-dive-row--figures {
      font-size: 13px;
      line-height: 16px;
      text-align: right;
      color: var(--od-text);
      font-variant-numeric: tabular-nums;

      strong {
        font-weight: 600;
      }
    }

    /* iPhone (docs/mockups/ios-carnet): inset list rows, a plain day and month, the depth over the duration. */
    :global(.ios) .od-dive-row--card {
      padding: 0 16px;
    }

    :global(.ios) .od-dive-row--surface {
      min-height: 60px;
      gap: 12px;
      padding: 8px 16px;
    }

    :global(.ios) .od-dive-row--card-first .od-dive-row--surface {
      border-top-left-radius: 10px;
      border-top-right-radius: 10px;
    }

    :global(.ios) .od-dive-row--card-last .od-dive-row--surface {
      border-bottom-left-radius: 10px;
      border-bottom-right-radius: 10px;
    }

    :global(.ios) .od-dive-row--card:not(.od-dive-row--card-first, .od-dive-row--under-header) .od-dive-row--surface::before {
      left: 68px;
    }

    :global(.ios) .od-dive-row--date {
      width: 40px;
      min-width: 40px;
      min-height: 0;
      padding: 0;
      border-radius: 0;
      background: none;
      color: var(--od-text);
    }

    :global(.ios) .od-dive-row--day {
      font-size: 22px;
      line-height: 26px;
    }

    :global(.ios) .od-dive-row--month {
      margin-top: 0;
      font-size: 11px;
      line-height: 13px;
      font-weight: 600;
      letter-spacing: 0;
      text-transform: uppercase;
      color: var(--od-text-2);
    }

    :global(.ios) .od-dive-row--site {
      font-size: 17px;
      font-weight: 400;
    }

    :global(.ios) .od-dive-row--number {
      font-weight: 400;
      color: var(--od-text-2);
    }

    :global(.ios) .od-dive-row--number + .od-dive-row--time::before {
      content: '·';
      margin: 0 6px;
    }

    :global(.ios) .od-dive-row--meta {
      gap: 0;
    }

    :global(.ios) .od-dive-row--right {
      gap: 2px;
      min-width: 0;
    }

    .od-dive-row--ios-depth {
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .od-dive-row--ios-duration {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }

    .od-dive-row--card .checkbox {
      margin-right: 0;
    }

    /* Selection mode: the check box before the thumbnail. */
    .checkbox {
      flex: none;
      margin-right: 16px;
      pointer-events: none;

      /* Android: the row's own 16 dp gap. */
      :global(.md) & {
        margin-right: 0;
      }
    }

    .od-dive-row--separator {
      margin: 0 0.4em;
    }

    .item-text.od-dive-row--pending {
      color: var(--od-tertiary);
    }

    .od-dive-row--not-set {
      color: var(--od-text-2);
      font-weight: normal;
    }

    /* The first value strong, the second small under it; both centred on the row. */
    .od-dive-row--values {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      text-align: right;
      flex-shrink: 0;

      strong {
        font-size: 17px;
        line-height: 22px;
        font-weight: 700;
        color: var(--od-text);
      }

      span {
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
      }

      /* Android: docs/mockups/android-carnet.dc.html. */
      :global(.md) & {
        gap: 2px;

        strong {
          font-size: 16px;
          line-height: 24px;
          font-weight: 500;
        }

        span {
          font-size: 14px;
          line-height: 20px;
        }
      }
    }
  }
</style>
