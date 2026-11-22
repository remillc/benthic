<script>
  // @ts-check
  // Statistics section (spec, section 1, "Statistics"; Android
  // docs/mockups/android-stats.dc.html, iPhone ios-stats-tableau.dc.html):
  // "Free filter" in the top bar (the same filter as the Logbook: the figures
  // follow it); the three key figures; two ready-made charts on cards scrolled
  // sideways, dives per year and dive durations (no chart builder; the maximum
  // depth chart is only on the filtered screens); My statistics with "New
  // statistic"; By year, By mode, By suit, By buddy, accordions closed at first.
  // The charts are plain content; every row opens the list of its dives
  // (StatisticsDives.svelte). No totals by dive computer. Every figure comes from the core (lib/statistics.svelte.js).
  import { Page, Navbar, NavRight, Link, theme } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import AccountAvatar from '../components/AccountAvatar.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import BandBackdrop from '../components/BandBackdrop.svelte';
  import KeyFigures from '../components/KeyFigures.svelte';
  import BarChart from '../components/BarChart.svelte';
  import ActiveFilter from '../components/ActiveFilter.svelte';
  import { filter } from '../lib/filter.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { startup } from '../lib/startup.svelte.js';
  import {
    chronological,
    computeStatistics,
    myStatistics,
    rowHref,
    notSetLabel,
    summaryLine,
  } from '../lib/statistics.svelte.js';
  import { formatTotalTime, formatLongDuration } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { layout } from '../lib/layout.svelte.js';
  import { chooseStatistic, statSelection } from '../lib/statistics-selection.svelte.js';
  import { keepInSvelteRange } from '../lib/master-detail.js';
  import HeatMapCard from '../components/HeatMapCard.svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { cachedSites } from '../lib/core-cache.js';

  /** @type {{ f7router?: any }} */
  let { f7router = undefined } = $props();

  let result = $state(/** @type {import('../lib/statistics.svelte.js').StatsResult|null} */ (null));
  /** Figures of each saved statistic, by its id. */
  let saved = $state(/** @type {Record<string, import('../lib/statistics.svelte.js').StatsFigures|null>} */ ({}));

  $effect(() => {
    const dives = logbook.dives;
    const list = myStatistics.list;
    const ids = filter.ids;
    if (logbook.loading || !startup.ready) return;
    void dives;
    void ids;
    computeStatistics([]).then((r) => (result = r));
    for (const s of list) computeStatistics(s.criteria).then((r) => (saved[s.id] = r?.total ?? null));
  });

  /** The sites, for « Où je plonge le plus » (their coordinates). */
  let sites = $state(/** @type {import('opendives-core').SiteSummary[]} */ ([]));
  $effect(() => {
    logbook.sitesVersion;
    if (logbook.loading || !startup.ready) return;
    cachedSites().then(
      (/** @type {import('opendives-core').SiteSummary[]} */ list) => (sites = list),
      (/** @type {unknown} */ e) => console.error('Sites', e),
    );
  });

  /** The dives counted by the core (invalid dives and the free filter left out), the oldest first. */
  const dives = $derived.by(() => {
    const ids = new Set(result?.diveIds ?? []);
    return chronological(logbook.dives.filter((d) => ids.has(d.id)));
  });
  const yearly = $derived([...(result?.yearly ?? [])].sort((a, b) => b.year - a.year));

  const durationBars = $derived(dives.map((d) => ({ value: d.durationSeconds })));
  const durations = $derived(dives.map((d) => d.durationSeconds).filter((s) => s > 0));
  const durationRange = $derived(
    durations.length
      ? t('stats.perDiveRange', {
          min: formatLongDuration(Math.min(...durations)),
          max: formatLongDuration(Math.max(...durations)),
        })
      : '',
  );
  /**
   * The address of a saved statistic's row, for the statistic the desktop layout had chosen
   * (adaptive page: the same selection in both layouts); '' for any other.
   * @param {string} key
   */
  function savedHref(key) {
    const mine = key.startsWith('saved:') ? myStatistics.list.find((s) => s.id === key.slice(6)) : null;
    return layout.split && mine ? rowHref('mine', mine.name, mine.criteria) : '';
  }
  /** Tablet: the address of the row whose result is shown beside the list. */
  let selected = $state(savedHref(statSelection.key));
  /** The "By …" sections opened, by title: all closed at first. */
  let openSections = $state(/** @type {Record<string, boolean>} */ ({}));
  /**
   * Opens or closes a « By … » section. Tablet (to-do #33): closing the section of the row shown
   * beside the list empties the pane, back to its first view.
   * @param {string} key @param {boolean} open whether the section is open now
   */
  function toggleSection(key, open) {
    openSections[key] = !open;
    if (!open || !layout.split || !selected.includes(`section=${key}&`)) return;
    selected = '';
    // Framework7 does not go back to the master alone in a list-detail pair: show the empty pane.
    f7router?.navigate('/pane/empty', { reloadDetail: true, animate: false });
  }

  /** @param {MouseEvent} e */
  function select(e) {
    if (!layout.split) return;
    const link = /** @type {HTMLElement} */ (e.target).closest('a[data-reload-detail]');
    if (link) selected = link.getAttribute('href') ?? '';
  }

  const yearBars = $derived(
    [...(result?.yearly ?? [])].sort((a, b) => a.year - b.year).map((y) => ({ value: y.dives, label: String(y.year) })),
  );

  /** @typedef {{key: string, title: string, numeric?: boolean, support: string, after?: string, criteria: import('../lib/statistics.svelte.js').Criterion[]}} StatRow */

  /**
   * A row of By mode, By suit, By buddy: the number of dives, the total time on the right.
   * @param {string} field the criterion of the section
   * @param {string} key the value of the row
   * @param {string} title
   * @param {import('../lib/statistics.svelte.js').StatsFigures} figures
   * @returns {StatRow}
   */
  const totalRow = (field, key, title, figures) => ({
    key,
    title,
    support: t('trip.dives', { n: figures.dives }),
    after: formatTotalTime(figures.totalSeconds),
    criteria: [{ field, values: [key] }],
  });

  /** "9 plongées sur 6 années, de 2013 à 2026" (the band). */
  const bandSummary = $derived.by(() => {
    if (!logbook.dives.length) return '';
    const years = [...new Set(logbook.dives.map((d) => d.date.slice(0, 4)))].sort();
    return `${t('band.dives', { n: logbook.dives.length })} ${t('band.overYears', { n: years.length, from: years[0], to: years[years.length - 1] })}`;
  });
</script>

<Page data-od-scroll class="bc-statistics" onPageInit={keepInSvelteRange}>
  <Navbar large={theme.ios} class={theme.ios ? 'bc-ios-bar' : 'bc-band-bar bc-band-titled'} title={t('stats.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      {#if theme.ios}
        <Link href="/filter">{t('stats.filterShort')}</Link>
      {:else}
        <Link class="bc-statistics--filter-button" href="/filter"><Icon name="filter" size={18} weight={2} />{t('stats.freeFilter')}</Link>
      {/if}
      <AccountAvatar />
    </NavRight>
  </Navbar>

  {#if !theme.ios}<BandBackdrop short />{/if}
  <SectionBand bare={!theme.ios} summary={bandSummary} />

  {#if !logbook.loading && !logbook.dives.length}
    <div class="bc-statistics--empty">
      <p class="bc-state-title">{t('stats.emptyTitle')}</p>
      <p>{t('stats.emptyText')}</p>
    </div>
  {:else if !logbook.loading}
    {#if filter.ids}
      <ActiveFilter prefs={logbook.prefs} dives={logbook.dives} shown={result?.total.dives ?? filter.ids.size} />
    {/if}
    <KeyFigures figures={result?.total ?? null} prefs={logbook.prefs} />

    <div class="block-title">{t('stats.charts')}</div>
    <div class="bc-statistics--charts">
      <section class="bc-statistics--chart-card">
        <h3>{t('stats.chartYears')}</h3>
        <p>{result ? t('stats.chartYearsText', { dives: t('trip.dives', { n: result.total.dives }), n: yearBars.length }) : ''}</p>
        <BarChart bars={yearBars} tinted label={t('stats.chartYears')} />
      </section>
      <section class="bc-statistics--chart-card">
        <h3>{t('stats.chartDurations')}</h3>
        <p>{durationRange}</p>
        <BarChart bars={durationBars} tinted scale={60} unit={t('units.minutes')} label={t('stats.chartDurationsLabel', { n: dives.length })} />
      </section>
    </div>

    <!-- « Où je plonge le plus » (task 2026-11-14-152): after the charts, on the same filter. -->
    <div class="bc-statistics--heatmap"><HeatMapCard {dives} {sites} /></div>

    <div class="block-title">{t('stats.mine')}</div>
    {#if myStatistics.list.length || theme.ios}
      <div class="list list-strong inset list-dividers media-list chevron-center">
        <ul>
          {#each myStatistics.list as s (s.id)}
            {@const href = rowHref('mine', s.name, s.criteria)}
            <li class:bc-statistics--selected={layout.split && selected === href}>
              <a {href} data-reload-detail="true" class="item-link item-content" onclick={(e) => { chooseStatistic(`saved:${s.id}`); select(e); }}>
                <div class="item-inner">
                  <div class="item-title-row"><div class="item-title">{s.name}</div></div>
                  <div class="item-text bc-value">{summaryLine(saved[s.id])}</div>
                </div>
              </a>
            </li>
          {/each}
          {#if theme.ios}
            <!-- iOS: the action is a row of the group (HIG), not a button. -->
            <li><a href="/statistics/new" class="item-content bc-statistics--action-row"><div class="item-inner"><div class="item-title">{t('stats.newEllipsis')}</div></div></a></li>
          {/if}
        </ul>
      </div>
    {/if}
    {#if !myStatistics.list.length}<p class="bc-statistics--note">{t('stats.mineEmpty')}</p>{/if}
    {#if !theme.ios}
      <div class="bc-statistics--new">
        <a href="/statistics/new" class="bc-tonal-button bc-statistics--new-button"><Icon name="plus" size={18} weight={2} />{t('stats.new')}</a>
      </div>
    {/if}

    <!-- The "By …" sections: accordions, closed at first; each row opens its dives. -->
    {#snippet section(/** @type {string} */ key, /** @type {StatRow[]|null} */ rows)}
      {#if rows?.length}
        {@const title = t(`stats.${key}`)}
        {@const open = !!openSections[key]}
        <h2 class="bc-statistics--heading">
          <button type="button" class="bc-statistics--toggle" aria-expanded={open} onclick={() => toggleSection(key, open)}>
            <span class="bc-statistics--toggle-text">{title}</span>
            <span class="bc-statistics--chevron" class:bc-statistics--chevron-up={open}><Icon name="expand" size={24} /></span>
          </button>
        </h2>
        {#if open}
          <ul class="bc-statistics--rows">
            {#each rows as row (row.key)}
              {@const href = rowHref(key, row.title, row.criteria)}
              <li class:bc-statistics--selected={layout.split && selected === href}>
                <a {href} data-reload-detail="true" class="bc-statistics--row ripple" onclick={select}>
                  <div class="bc-statistics--text">
                    <span class="bc-statistics--title" class:bc-value={row.numeric}>{row.title}</span>
                    <span class="bc-statistics--support bc-value">{row.support}</span>
                  </div>
                  {#if row.after}<span class="bc-statistics--after bc-value">{row.after}</span>{/if}
                  <span class="bc-statistics--row-chevron"><Icon name="chevron" size={20} /></span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    {/snippet}

    {@render section(
      'byYear',
      yearly.map((y) => ({
        key: String(y.year),
        title: String(y.year),
        numeric: true,
        support: summaryLine(y),
        criteria: [{ field: 'year', values: [String(y.year)] }],
      })),
    )}
    {@render section('byMode', result ? result.byMode.filter((m) => m.dives).map((m) => totalRow('mode', m.mode, t(`detail.modes.${m.mode}`), m)) : null)}
    {@render section('bySuit', result ? result.bySuit.map((v) => totalRow('suit', v.value, v.value || notSetLabel('suit'), v)) : null)}
    {@render section('byBuddy', result ? result.byBuddy.map((v) => totalRow('buddy', v.value, v.value || notSetLabel('buddy'), v)) : null)}
    <div class="bc-statistics--end"></div>
  {/if}
</Page>

<style>
  @layer od.components {
    /* The section titles (mock-up android-stats). */
    .block-title {
      margin: 22px 16px 8px;
      color: var(--bc-text-2);

      /* iPhone (docs/mockups/ios-stats-tableau): small-capitals titles. */
      :global(.ios) & {
        margin: 22px 32px 6px;
        font-size: 13px;
        line-height: 18px;
        font-weight: 400;
        text-transform: uppercase;
      }
    }

    :global(.ios) .bc-statistics--toggle-text {
      font-size: 13px;
      font-weight: 400;
      text-transform: uppercase;
    }

    /* The title of a "By …" section: a 48 dp button (mock-up android-stats). */
    .bc-statistics--heading {
      margin: 14px 8px 0;
      font: inherit;
    }

    .bc-statistics--toggle {
      width: 100%;
      min-height: 48px;
      padding: 0 12px 0 8px;
      border: none;
      background: none;
      color: var(--bc-text-2);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .bc-statistics--toggle-text {
      flex: 1;
    }

    .bc-statistics--chevron {
      display: flex;
      transition: transform 0.2s;
    }

    .bc-statistics--chevron-up {
      transform: rotate(180deg);
    }

    /* The "By …" sections: a rounded card of plain rows (mock-up android-stats). */
    .bc-statistics--rows {
      margin: 0 16px;
      padding: 0;
      list-style: none;
      border-radius: 16px;
      background: var(--bc-surface);
      overflow: hidden;

      :global(.ios) & {
        border-radius: 10px;
      }
      & li + li {
        border-top: 1px solid var(--bc-separator);
      }
    }

    .bc-statistics--row {
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      gap: 12px;
      box-sizing: border-box;
      min-height: 72px;
      padding: 8px 16px;
      color: var(--bc-text);
      text-decoration: none;
    }

    .bc-statistics--row-chevron {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-statistics--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-statistics--title {
      font-size: 16px;
      line-height: 24px;
    }

    .bc-statistics--support,
    .bc-statistics--after {
      font-size: 14px;
      line-height: 20px;
    }

    .bc-statistics--support {
      color: var(--bc-text-2);
    }

    /* Tablet: the row whose result is shown beside the list. */
    li.bc-statistics--selected {
      background: var(--bc-tint);
      color: var(--bc-on-tint);
    }

    .bc-statistics--empty {
      margin: 32px 20px;
      color: var(--bc-text-2);
    }

    .bc-statistics--note {
      margin: 8px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* Top bar text button with its icon (MD3 text button, 12 dp side padding). */
    :global(.md .bc-statistics--filter-button) {
      width: auto;
      white-space: nowrap;
      gap: 8px;
      padding: 0 12px;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
    }

    .bc-statistics--heatmap {
      margin-top: 16px;
    }

    /* Ready-made charts: cards scrolled sideways, snapping to each card. */
    .bc-statistics--charts {
      padding: 0 16px;
      display: flex;
      gap: 12px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-padding: 0 16px;
      scrollbar-width: none;

      /* The desktop app (a mouse has no swipe, fluid layout): the cards wrap in the pane's width instead of scrolling sideways. */
      :global(html.bc-desktop-app) & {
        flex-wrap: wrap;
        overflow-x: visible;
        scroll-snap-type: none;

        .bc-statistics--chart-card {
          flex: 1 1 272px;
          width: auto;
          min-width: 0;
          max-width: 100%;
        }
      }
    }

    .bc-statistics--chart-card {
      flex: none;
      width: 272px;
      padding: 16px;
      box-sizing: border-box;
      border-radius: 12px;
      background: var(--bc-surface);
      display: flex;
      flex-direction: column;
      gap: 4px;
      scroll-snap-align: start;

      :global(.ios) & {
        padding: 14px 16px;
        border-radius: 10px;
        gap: 2px;
      }

      h3 {
        margin: 0;
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;

        :global(.ios) & {
          font-size: 17px;
          line-height: 22px;
          font-weight: 600;
        }
      }

      p {
        margin: 0 0 10px;
        font-size: 12px;
        line-height: 16px;
        color: var(--bc-text-2);
        font-variant-numeric: tabular-nums;

        :global(.ios) & {
          font-size: 13px;
          line-height: 18px;
        }
      }
    }

    /* Android: "New statistic" is a tonal button under the list (MD3). */
    .bc-statistics--new {
      margin: 12px 16px 0;
      display: flex;
    }

    .bc-statistics--new-button {
      padding: 0 24px 0 16px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      font-weight: 500;
    }

    /* iOS: the action row of the My statistics group, in bold. */
    .bc-statistics--action-row .item-title {
      font-weight: 600;
      color: var(--bc-action);
    }

    .bc-statistics--end {
      height: 32px;
    }
  }
</style>
