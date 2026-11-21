<script>
  // @ts-check
  // The desktop Statistiques screen (tasks 2026-11-15-171 and 176, mock-up bureau-stats): from
  // 1200 dp in the desktop app, the statistics are a list on the left (340 dp: an icon tile, the
  // title and a summary line, a preview of the statistic's own data) and the chosen one on the
  // right (the chart on a white card, then its key figures). The mouse over a bar shows a
  // tooltip, a click opens those dives in the Carnet. The data and the wording are the
  // phone's: the dives the core counted (lib/statistics.svelte.js), the heat map card.
  // Below 1200 dp the tablet's Statistics.svelte shows instead (App.svelte).
  import { untrack } from 'svelte';
  import { Page } from 'framework7-svelte';
  import { Share } from '@capacitor/share';
  import Icon from '../components/Icon.svelte';
  import DesktopContextMenu from '../components/DesktopContextMenu.svelte';
  import DesktopStatChart from '../components/DesktopStatChart.svelte';
  import DesktopStatIcon from '../components/DesktopStatIcon.svelte';
  import DesktopStatPreview from '../components/DesktopStatPreview.svelte';
  import HeatMapCard from '../components/HeatMapCard.svelte';
  import { logbook, undoLastChange } from '../lib/logbook.svelte.js';
  import { filter } from '../lib/filter.svelte.js';
  import { navigation, goToSection, openAbout } from '../lib/navigation.svelte.js';
  import { desk, loadExtras } from '../lib/desktop-logbook.svelte.js';
  import { computeStatistics, myStatistics, summaryLine } from '../lib/statistics.svelte.js';
  import {
    STAT_KINDS,
    barsOf,
    barsPreview,
    chartFileName,
    depthBars,
    keyFigures,
    previewOf,
    selectionOfBar,
  } from '../lib/desktop-stats.js';
  import { chooseStatistic, statSelection } from '../lib/statistics-selection.svelte.js';
  import { desktopMac, layout } from '../lib/layout.svelte.js';
  import { undoNameKey } from '../lib/undo-name.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { profilePng } from '../lib/share.js';
  import { depthUnit, depthValue, formatDepth, formatNumber, formatSac, formatDate, formatTotalTime } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { OpenDivesCore } from 'opendives-core';
  import { cachedSites } from '../lib/core-cache.js';

  /** @type {{ f7router?: any }} */
  let { f7router = undefined } = $props();

  /** Fluid layout: the chart keeps 380 dp in a tall window and shrinks in a short one, so the page does not scroll. */
  let windowHeight = $state(900);
  const chartHeight = $derived(Math.max(200, Math.min(380, windowHeight - 330)));
  // One selection for both layouts (lib/statistics-selection.svelte.js).
  const selected = $derived(statSelection.key);
  const choose = chooseStatistic;

  // --- The data: the dives the core counted, on the free filter. ------------------------------
  let result = $state(/** @type {import('../lib/statistics.svelte.js').StatsResult|null} */ (null));
  /** The dives of each statistic the diver created, by its id. */
  let savedResults = $state(/** @type {Record<string, import('../lib/statistics.svelte.js').StatsResult|null>} */ ({}));
  let sites = $state(/** @type {import('opendives-core').SiteSummary[]} */ ([]));

  $effect(() => {
    const dives = logbook.dives;
    const list = myStatistics.list;
    const ids = filter.ids;
    if (logbook.loading) return;
    void dives;
    void ids;
    computeStatistics([]).then((r) => (result = r));
    for (const s of list) computeStatistics(s.criteria).then((r) => (savedResults[s.id] = r));
  });

  $effect(() => {
    logbook.sitesVersion;
    if (logbook.loading) return;
    cachedSites().then(
      (/** @type {import('opendives-core').SiteSummary[]} */ list) => (sites = list),
      (/** @type {unknown} */ e) => console.error('Sites', e),
    );
  });

  // The per-dive values (consumption) come from the columns the Carnet reads; read them here
  // too when the Carnet has not yet.
  $effect(() => {
    if (logbook.loading || logbook.error || !logbook.dives.length) return;
    if (!untrack(() => desk.extras.size)) untrack(() => loadExtras());
  });

  /** @param {number[]|undefined} ids */
  const divesOf = (ids) => {
    const set = new Set(ids ?? []);
    return logbook.dives.filter((d) => set.has(d.id));
  };
  const dives = $derived(divesOf(result?.diveIds));

  // --- The list. -------------------------------------------------------------------------------
  const years = $derived([...new Set(dives.map((d) => d.date.slice(0, 4)))].sort());

  /** @param {import('../lib/desktop-stats.js').StatKind} kind */
  function subtitleOf(kind) {
    const p = logbook.prefs;
    switch (kind) {
      case 'byYear':
        if (!dives.length) return '';
        return years.length === 1
          ? t('desktopStats.subtitle.byYearSingle', { dives: t('trip.dives', { n: dives.length }), year: years[0] })
          : t('desktopStats.subtitle.byYear', { dives: t('trip.dives', { n: dives.length }), from: years[0], to: years[years.length - 1] });
      case 'maxDepth':
        return t('desktopStats.subtitle.maxDepth');
      case 'time':
        return result?.total.totalSeconds ? t('desktopStats.subtitle.time', { time: formatTotalTime(result.total.totalSeconds) }) : '';
      case 'sac':
        return result?.total.meanSacMlMin
          ? t('desktopStats.subtitle.sac', { sac: formatSac(result.total.meanSacMlMin, p) })
          : dives.length
            ? t('desktopStats.subtitle.sacNone')
            : '';
      case 'bySite': {
        const n = new Set(dives.map((d) => d.site).filter(Boolean)).size;
        return n ? t('desktopStats.subtitle.bySite', { n }) : '';
      }
      default:
        return t('desktopStats.subtitle.heat');
    }
  }

  const rows = $derived([
    ...STAT_KINDS.map((k) => ({
      key: /** @type {string} */ (k.key),
      icon: /** @type {'bars'|'depth'|'stopwatch'|'cylinder'|'pin'|'grid'} */ (k.icon),
      title: t(`desktopStats.kinds.${k.key}.title`),
      subtitle: subtitleOf(k.key),
      preview: previewOf(k.key, dives, desk.extras, sites),
      downward: k.key === 'maxDepth',
    })),
    // A statistic the diver created takes the icon of its chart type: a bar per dive.
    ...myStatistics.list.map((s) => ({
      key: `saved:${s.id}`,
      icon: /** @type {'bars'} */ ('bars'),
      title: s.name,
      subtitle: summaryLine(savedResults[s.id]?.total),
      preview: barsPreview(depthBars(divesOf(savedResults[s.id]?.diveIds))),
      downward: false,
    })),
  ]);

  // A statistic that no longer exists (deleted on the phone layout): back to the first.
  $effect(() => {
    if (!rows.some((r) => r.key === selected)) choose('byYear');
  });

  // --- The chart of the chosen statistic. ---------------------------------------------------
  const current = $derived(rows.find((r) => r.key === selected) ?? rows[0]);
  const isHeat = $derived(selected === 'heat');
  const savedId = $derived(selected.startsWith('saved:') ? selected.slice(6) : '');
  const kind = $derived(/** @type {import('../lib/desktop-stats.js').StatKind} */ (savedId ? 'maxDepth' : selected));
  const chartDives = $derived(savedId ? divesOf(savedResults[savedId]?.diveIds) : dives);
  const bars = $derived(barsOf(kind, chartDives, desk.extras));

  /** @param {number} n */
  const diveCount = (n) => t('trip.dives', { n });
  /** @param {import('../lib/desktop-stats.js').StatBar} bar */
  const when = (bar) => bar.year ?? (bar.date ? formatDate(bar.date) : (bar.site || t('desktopStats.noSite')));

  /** What the bar says: its value in words, for the tooltip and the figures. @param {import('../lib/desktop-stats.js').StatBar} bar */
  function valueWords(bar) {
    const p = logbook.prefs;
    switch (kind) {
      case 'byYear':
      case 'bySite':
        return diveCount(bar.value);
      case 'time':
        return formatTotalTime(bar.value);
      case 'sac':
        return formatSac(bar.value, p);
      default:
        return formatDepth(bar.value, p);
    }
  }

  /** @param {import('../lib/desktop-stats.js').StatBar} bar */
  function valueShort(bar) {
    const p = logbook.prefs;
    switch (kind) {
      case 'byYear':
      case 'bySite':
        return String(bar.value);
      case 'time':
        return formatNumber(bar.value / 3600, 1);
      case 'sac':
        return formatNumber(bar.value / (p.volume === 'cuft' ? 28316.8466 : 1000), p.volume === 'cuft' ? 2 : 1);
      default:
        return depthValue(bar.value, p);
    }
  }

  const axis = $derived.by(() => {
    const p = logbook.prefs;
    switch (kind) {
      case 'time':
        return { scale: 3600, unit: t('desktopStats.hoursUnit') };
      case 'sac':
        return p.volume === 'cuft'
          ? { scale: 28316.8466, unit: t('units.cubicFeetPerMinute') }
          : { scale: 1000, unit: t('units.litersPerMinute') };
      case 'maxDepth':
        return { scale: p.length === 'ft' ? 304.8 : 1000, unit: depthUnit(p) };
      default:
        return { scale: 1, unit: '' };
    }
  });

  /** « 2013 · 4 plongées » and « Clic pour les voir ». @param {import('../lib/desktop-stats.js').StatBar} bar @returns {[string, string]} */
  const tip = (bar) => [
    t('desktopStats.tip', { what: when(bar), value: valueWords(bar) }),
    t('desktopStats.open', { n: bar.diveIds.length }),
  ];

  /** The key figures under the chart. */
  const figures = $derived.by(() => {
    const k = keyFigures(kind, bars, chartDives.length);
    const p = logbook.prefs;
    /** @type {{label: string, value: string}[]} */
    const list = [];
    const f = /** @type {Record<string, any>} */ (k);
    if (savedId) {
      const total = savedResults[savedId]?.total;
      return total
        ? [
            { label: t('stats.figureDives'), value: formatNumber(total.dives) },
            { label: t('stats.figureTime'), value: formatTotalTime(total.totalSeconds) },
            { label: t('stats.figureDeepest'), value: total.maxDepthMm ? formatDepth(total.maxDepthMm, p) : '—' },
          ]
        : [];
    }
    if (!bars.length) return list;
    switch (kind) {
      case 'byYear':
        list.push(
          { label: t('desktopStats.figure.total'), value: diveCount(f.total) },
          { label: t('desktopStats.figure.bestYear'), value: t('desktopStats.figure.yearValue', { year: f.best, value: diveCount(f.bestValue) }) },
          { label: t('desktopStats.figure.mean'), value: t('desktopStats.figure.perYear', { n: formatNumber(f.mean, 1) }) },
        );
        break;
      case 'time':
        list.push(
          { label: t('desktopStats.figure.total'), value: formatTotalTime(f.total) },
          { label: t('desktopStats.figure.longestYear'), value: t('desktopStats.figure.yearValue', { year: f.best, value: formatTotalTime(f.bestValue) }) },
          { label: t('desktopStats.figure.meanPerDive'), value: formatTotalTime(f.mean) },
        );
        break;
      case 'maxDepth':
        list.push(
          { label: t('desktopStats.figure.deepest'), value: formatDepth(f.max, p) },
          { label: t('desktopStats.figure.mean'), value: formatDepth(f.mean, p) },
          { label: t('desktopStats.figure.shallowest'), value: formatDepth(f.min, p) },
        );
        break;
      case 'sac':
        list.push(
          { label: t('desktopStats.figure.mean'), value: formatSac(f.mean, p) },
          { label: t('desktopStats.figure.lowest'), value: formatSac(f.min, p) },
          { label: t('desktopStats.figure.highest'), value: formatSac(f.max, p) },
        );
        break;
      case 'bySite':
        list.push(
          { label: t('desktopStats.figure.sites'), value: formatNumber(f.sites) },
          { label: t('desktopStats.figure.busiest'), value: t('desktopStats.figure.siteValue', { site: f.best || t('desktopStats.noSite'), dives: diveCount(f.bestValue) }) },
        );
        if (f.withoutSite) list.push({ label: t('desktopStats.figure.withoutSite'), value: diveCount(f.withoutSite) });
        break;
    }
    return list;
  });

  const summary = $derived.by(() => {
    const all = logbook.dives;
    if (!all.length) return '';
    const ys = [...new Set(all.map((d) => d.date.slice(0, 4)))].sort();
    const text = `${t('band.dives', { n: all.length })} ${t('band.overYears', { n: ys.length, from: ys[0], to: ys[ys.length - 1] })}`;
    return filter.ids && result ? `${t('stats.outOf', { n: result.total.dives, total: result.logDives })} · ${text}` : text;
  });

  // --- A click on a bar: those dives, selected in the Carnet. ----------------------------------
  /** @param {import('../lib/desktop-stats.js').StatBar} bar */
  function openBar(bar) {
    const selection = selectionOfBar(bar);
    if (!selection) return;
    desk.collapsed = {};
    desk.selection = selection;
    goToSection('logbook');
  }

  // --- « Exporter le graphique »: the chart as a PNG, through the share path. --------------------
  /** @type {SVGSVGElement|undefined} */
  let chartSvg = $state();

  /** The image saved as a file by the system when the share sheet is not there (the desktop's). @param {string} name @param {string} base64 */
  function download(name, base64) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function exportChart() {
    if (!chartSvg) return;
    const name = chartFileName(t('desktopStats.filePrefix'), current.title, new Date().toISOString().slice(0, 10));
    try {
      const base64 = await profilePng(chartSvg);
      try {
        const { uri } = await OpenDivesCore.writeShareFile({ name, base64 });
        await OpenDivesCore.grantShareFile({ uri, mime: 'image/png' });
        await Share.share({ title: name, files: [uri], dialogTitle: t('share.title') });
      } catch (e) {
        if (/cancel/i.test(String(/** @type {any} */ (e)?.message ?? ''))) return;
        download(name, base64);
      }
    } catch (e) {
      console.error('Export the chart', e);
      showSnackbar(t('desktopStats.exportFailed'));
    }
  }

  // --- The top bar: Filtrer, Annuler, Rétablir and the ⋮. ----------------------------------------
  const mod = desktopMac ? '⌘' : 'Ctrl+';
  /** @type {{x: number, y: number}|null} */
  let moreAt = $state(null);

  /** @param {MouseEvent} e */
  function openMore(e) {
    const r = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
    moreAt = { x: r.right - 280, y: r.bottom + 4 };
  }

  /** « Annuler : Ajouter au voyage », or plain « Annuler » when the step has no known name. @param {'undo'|'redo'} which */
  function undoEntryText(which) {
    const key = undoNameKey(which === 'undo' ? logbook.undoText : logbook.redoText);
    return key ? t(`desktop.${which}Named`, { action: t(key) }) : t(`desktop.${which}Plain`);
  }

  const moreEntries = $derived(
    /** @type {import('../lib/desktop-table.js').MenuEntry[]} */ ([
      { key: 'undo', label: '', text: undoEntryText('undo'), icon: 'undo', shortcut: desktopMac ? '⌘Z' : 'Ctrl+Z', disabled: !logbook.undoText },
      { key: 'redo', label: '', text: undoEntryText('redo'), icon: 'redo', shortcut: desktopMac ? '⇧⌘Z' : 'Ctrl+Maj+Z', disabled: !logbook.redoText },
      { key: 'separator' },
      { key: 'new', label: '', text: t('stats.new'), icon: 'plus' },
      // « Filtre libre… » leaves the top bar for the ⋮; « À propos » ends it (task 2026-11-15-202).
      { key: 'filter', label: '', text: t('desktopSettings.filterFree'), icon: 'filter', shortcut: desktopMac ? '⇧⌘F' : 'Ctrl+Maj+F' },
      { key: 'separator' },
      { key: 'about', label: '', text: t('desktopSettings.about'), icon: 'info' },
    ]),
  );

  /** @param {'undo'|'redo'} which */
  function step(which) {
    undoLastChange(which === 'redo').catch((/** @type {unknown} */ e) => {
      console.error('Desktop statistics undo', e);
      showSnackbar(t('desktop.changeFailed'));
    });
  }

  /** @param {string} key */
  function moreChoose(key) {
    if (key === 'undo' || key === 'redo') step(key);
    else if (key === 'new') f7router?.navigate('/statistics/new');
    else if (key === 'filter') f7router?.navigate('/filter');
    else if (key === 'about') openAbout();
  }

  // Ctrl/⌘+Z and Ctrl/⌘+Shift+Z while this section is the one shown.
  $effect(() => {
    /** @param {KeyboardEvent} e */
    const keydown = (e) => {
      if (!layout.desktop || navigation.section !== 'statistics' || moreAt) return;
      if (document.querySelector('.dialog.modal-in, .sheet-modal.modal-in, .popup.modal-in')) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const modKey = desktopMac ? e.metaKey : e.ctrlKey;
      const k = e.key.toLowerCase();
      if (modKey && k === 'f' && e.shiftKey) f7router?.navigate('/filter');
      else if (modKey && k === 'z') step(e.shiftKey ? 'redo' : 'undo');
      else if (modKey && k === 'y' && !desktopMac) step('redo');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', keydown);
    const off = /** @type {any} */ (window).odDesktop?.onMenu?.((/** @type {string} */ c) => {
      if (layout.desktop && navigation.section === 'statistics' && (c === 'undo' || c === 'redo')) step(c);
    });
    return () => {
      window.removeEventListener('keydown', keydown);
      off?.();
    };
  });

  /** The list's keys: ↑ ↓ move from one statistic to the next. @param {KeyboardEvent} e */
  function listKey(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const at = rows.findIndex((r) => r.key === selected);
    const next = rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      choose(next.key);
      /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.currentTarget).querySelector(`[data-stat="${CSS.escape(next.key)}"]`))?.focus();
    }
  }
</script>

<svelte:window bind:innerHeight={windowHeight} />

<Page class="bc-desktop-statistics" pageContent={false}>
  <div class="bc-desktop-statistics--frame">
    <header class="bc-desktop-statistics--bar">
      <h1 class="bc-desktop-statistics--title">{t('stats.title')}</h1>
      {#if summary}<p class="bc-desktop-statistics--summary bc-value" title={summary}>{summary}</p>{/if}
      <span class="bc-desktop-statistics--spacer"></span>
      <button type="button" class="bc-desktop-statistics--icon-button" aria-label={t('desktopStats.undo')} title="{t('desktopStats.undo')} ({mod}Z)" disabled={!logbook.undoText} onclick={() => step('undo')}>
        <Icon name="undo" size={22} />
      </button>
      <button type="button" class="bc-desktop-statistics--icon-button" aria-label={t('desktopStats.redo')} title="{t('desktopStats.redo')} ({desktopMac ? '⇧⌘Z' : 'Ctrl+Maj+Z'})" disabled={!logbook.redoText} onclick={() => step('redo')}>
        <Icon name="redo" size={22} />
      </button>
      <button type="button" class="bc-desktop-statistics--icon-button" aria-label={t('desktopStats.more')} title={t('desktopStats.more')} aria-haspopup="menu" onclick={openMore}>
        <Icon name="more" size={22} />
      </button>
    </header>

    {#if logbook.loading}
      <p class="bc-desktop-statistics--state" role="status" aria-busy="true">{t('logbook.loading')}</p>
    {:else if !logbook.dives.length}
      <div class="bc-desktop-statistics--state">
        <h2 class="bc-state-title">{t('stats.emptyTitle')}</h2>
        <p>{t('stats.emptyText')}</p>
      </div>
    {:else}
      <div class="bc-desktop-statistics--body">
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <section class="bc-desktop-statistics--list" data-od-scroll aria-label={t('desktopStats.list')} onkeydown={listKey}>
          <ul role="list">
            {#each rows as row (row.key)}
              <li>
                <button
                  type="button"
                  class="bc-desktop-statistics--item"
                  class:bc-desktop-statistics--item-selected={row.key === selected}
                  aria-current={row.key === selected ? 'true' : undefined}
                  data-stat={row.key}
                  onclick={() => choose(row.key)}
                >
                  <span class="bc-desktop-statistics--tile"><DesktopStatIcon name={row.icon} /></span>
                  <span class="bc-desktop-statistics--text">
                    <span class="bc-desktop-statistics--item-title">{row.title}</span>
                    <span class="bc-desktop-statistics--item-subtitle bc-value">{row.subtitle}</span>
                  </span>
                  <DesktopStatPreview preview={row.preview} downward={row.downward} />
                </button>
              </li>
            {/each}
          </ul>
          <button type="button" class="bc-desktop-statistics--outlined bc-desktop-statistics--new" onclick={() => f7router?.navigate('/statistics/new')}>{t('desktopStats.newStatistic')}</button>
        </section>

        <div class="bc-desktop-statistics--divider" role="separator" aria-orientation="vertical"></div>

        <section class="bc-desktop-statistics--detail" aria-label={current.title}>
          <div class="bc-desktop-statistics--detail-head">
            <h2 class="bc-desktop-statistics--detail-title">{current.title}</h2>
            {#if !isHeat}
              <button type="button" class="bc-desktop-statistics--outlined" disabled={!bars.length} onclick={exportChart}>{t('desktopStats.exportChart')}</button>
            {/if}
          </div>
          {#if isHeat}
            <HeatMapCard dives={chartDives} {sites} height="clamp(200px, calc(100vh - 330px), 420px)" />
          {:else}
            <div class="bc-desktop-statistics--card">
              {#if bars.length}
                <DesktopStatChart
                  bind:svg={chartSvg}
                  {bars}
                  height={chartHeight}
                  label={current.title}
                  {tip}
                  valueText={valueShort}
                  onopen={openBar}
                  scale={axis.scale}
                  unit={axis.unit}
                />
              {:else}
                <p class="bc-desktop-statistics--none">{kind === 'sac' ? t('desktopStats.noSac') : t('desktopStats.noData')}</p>
              {/if}
            </div>
            {#if figures.length}
              <dl class="bc-desktop-statistics--figures">
                {#each figures as f (f.label)}
                  <div class="bc-desktop-statistics--figure">
                    <dt>{f.label}</dt>
                    <dd class="bc-value">{f.value}</dd>
                  </div>
                {/each}
              </dl>
            {/if}
          {/if}
        </section>
      </div>
    {/if}

    {#if moreAt}
      <DesktopContextMenu x={moreAt.x} y={moreAt.y} heading="" entries={moreEntries} onchoose={moreChoose} onclose={() => (moreAt = null)} />
    {/if}
  </div>
</Page>

<style>
  @layer od.components {
    .bc-desktop-statistics--frame {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bc-background);
    }

    /* A page that is not the master of a master-detail pair: no « nothing chosen » cover over it. */
    :global(.views .view-master-detail:has(.bc-desktop-statistics)::after) {
      content: none;
      display: none;
    }

    .bc-desktop-statistics--bar {
      flex: none;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 64px;
      padding: 0 16px 0 24px;
    }

    .bc-desktop-statistics--title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 22px;
      font-weight: 500;
      color: var(--bc-text);
    }

    .bc-desktop-statistics--summary {
      margin: 0 0 0 12px;
      font-size: 14px;
      color: var(--bc-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bc-desktop-statistics--spacer {
      flex: 1;
    }

    /* The outlined button: 40 dp, a pill. */
    .bc-desktop-statistics--outlined {
      flex: none;
      width: auto;
      height: 40px;
      padding: 0 16px;
      box-sizing: border-box;
      border: 1px solid var(--bc-separator);
      border-radius: 20px;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      font-size: 15px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
      &:hover:not(:disabled) {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
      &:disabled {
        opacity: 0.38;
        cursor: default;
      }
    }

    .bc-desktop-statistics--icon-button {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text);
      cursor: pointer;
      &:hover:not(:disabled) {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
      &:disabled {
        opacity: 0.38;
        cursor: default;
      }
    }

    .bc-desktop-statistics--state {
      margin: 32px 24px;
      color: var(--bc-text-2);
    }

    .bc-desktop-statistics--body {
      flex: 1;
      min-height: 0;
      display: flex;
    }

    /* The list of statistics: 340 dp. */
    .bc-desktop-statistics--list {
      flex: none;
      width: 340px;
      padding-top: 8px;
      overflow-x: hidden;
      overflow-y: auto;
      box-sizing: border-box;
      & ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }
    }

    /* A row: 72 dp, 12 dp corners, 8 dp side margins, 4 dp between rows. */
    .bc-desktop-statistics--item {
      width: calc(100% - 16px);
      height: 72px;
      margin: 0 8px 4px;
      padding: 0 14px 0 12px;
      box-sizing: border-box;
      border: 0;
      border-radius: 12px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 14px;
      cursor: pointer;
      &:hover:not(.bc-desktop-statistics--item-selected) {
        background: color-mix(in srgb, var(--bc-text) 6%, transparent);
      }
    }

    .bc-desktop-statistics--item-selected {
      background: var(--bc-table-selected);
      color: var(--bc-on-table-selected);
    }

    .bc-desktop-statistics--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: var(--bc-surface-container-high);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-desktop-statistics--item-selected .bc-desktop-statistics--tile {
      background: var(--bc-surface);
    }

    .bc-desktop-statistics--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-desktop-statistics--item-title {
      font-size: 16px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bc-desktop-statistics--item-selected .bc-desktop-statistics--item-title {
      font-weight: 600;
    }

    .bc-desktop-statistics--item-subtitle {
      font-size: 14px;
      color: var(--bc-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bc-desktop-statistics--item-selected .bc-desktop-statistics--item-subtitle {
      color: var(--bc-on-table-selected);
    }

    .bc-desktop-statistics--new {
      margin: 12px 8px;
      width: auto;
    }

    .bc-desktop-statistics--divider {
      flex: none;
      width: 1px;
      background: var(--bc-separator);
    }

    /* The chosen statistic. */
    .bc-desktop-statistics--detail {
      flex: 1;
      min-width: 0;
      padding: 8px 24px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;
    }

    .bc-desktop-statistics--detail-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bc-desktop-statistics--detail-title {
      flex: 1;
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 22px;
      font-weight: 500;
      color: var(--bc-text);
    }

    .bc-desktop-statistics--card {
      padding: 16px;
      border-radius: 16px;
      background: var(--bc-surface);
    }

    .bc-desktop-statistics--none {
      margin: 24px 8px;
      color: var(--bc-text-2);
    }

    .bc-desktop-statistics--figures {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 16px 32px;
    }

    .bc-desktop-statistics--figure dt {
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-desktop-statistics--figure dd {
      margin: 0;
      font-size: 20px;
      font-weight: 500;
      color: var(--bc-text);
    }


    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-desktop-statistics--item-selected:hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
  }
</style>
