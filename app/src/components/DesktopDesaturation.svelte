<script>
  // @ts-check
  // Désaturation on the desktop (task 2026-11-15-196, mock-up bureau-outils-desaturation): the wait
  // before flying and the time since the last dive side by side, the 16 tissues, the dives the
  // calculation used. The data and the figures are the phone's (Desaturation.svelte): the core's
  // tissues, lib/tools.js for the wait, lib/desaturation.js for the surface interval. No figure
  // of OpenDives' own is added (the mock-up's « Désaturation restante » is left out).
  import { OpenDivesCore } from 'opendives-core';
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { setFlightNotify } from '../lib/flight-reminder.svelte.js';
  import { goToSection } from '../lib/navigation.svelte.js';
  import { formatDateTime, formatDepth, formatDuration, formatFullDate, formatLongDuration, formatRelativeDateTime, formatTimeAgo, formatTimeOfDay, locale } from '../lib/format.js';
  import { flightWait, formatHoursMinutes } from '../lib/tools.js';
  import { flightRule, lastDiveFigure } from '../lib/desktop-tools.js';
  import { ALARM_PERCENT } from '../lib/tissues.js';
  import { overlapStart, surfaceSeconds } from '../lib/desaturation.js';
  import { t } from '../lib/i18n.js';

  let desat = $state(/** @type {import('opendives-core').Desaturation|null} */ (null));
  let failed = $state(false);

  async function load() {
    try {
      desat = await OpenDivesCore.toolQuery({ kind: 'desaturation' });
      failed = false;
    } catch (e) {
      console.error('Desaturation', e);
      failed = true;
    }
  }

  // Read again when the logbook changes, and when the window comes back (the clock moved).
  $effect(() => {
    logbook.dives;
    if (!logbook.loading) load();
  });
  $effect(() => {
    const comeBack = () => document.visibilityState === 'visible' && !logbook.loading && load();
    document.addEventListener('visibilitychange', comeBack);
    return () => document.removeEventListener('visibilitychange', comeBack);
  });

  const wait = $derived(desat ? flightWait(desat.dives, desat.now, settings.flightWait) : null);
  const sinceLastDive = $derived(desat ? surfaceSeconds(desat.dives, desat.now) : -1);
  const lastFigure = $derived(lastDiveFigure(sinceLastDive));
  const rule = $derived(flightRule(wait, settings.flightWait));
  /** The last dive of the logbook before now, used or not by the calculation, as the phone's. */
  const lastDive = $derived.by(() => {
    const now = desat?.now;
    if (!now) return null;
    let last = null;
    for (const d of logbook.dives) if (d.date <= now && (!last || d.date > last.date)) last = d;
    return last;
  });
  /** « Sortie de l'eau il y a 55 min »; in days, months or years after 48 hours. */
  const surfaced = $derived.by(() => {
    if (!desat || !lastDive) return '';
    const end = Date.parse(`${lastDive.date}Z`) + lastDive.durationSeconds * 1000;
    const seconds = Math.max(0, Math.round((Date.parse(`${desat.now}Z`) - end) / 1000));
    if (seconds <= 48 * 3600) return t('desaturation.surfacedAgo', { time: formatLongDuration(seconds) });
    return t('desaturation.surfacedLong', { ago: formatTimeAgo(new Date(end).toISOString().slice(0, 19)) });
  });
  const overlapAt = $derived(desat ? overlapStart(desat.dives) : null);
  const waiting = $derived(!!wait && wait.remainingSeconds > 0);

  /** The tissue's load on the Desaturation scale, as the phone's (0 % at rest, 100 % at the limit). @param {{ surfaceGf: number }} tissue */
  const restLoad = (tissue) => Math.round(Math.max(0, Math.min(tissue.surfaceGf, 110)));

  /** « demain vers 5 h 50 »: the day in words (today, tomorrow), else the date, then the time. @param {string} iso */
  function around(iso) {
    if (!desat) return '';
    const DAY = 86400000;
    const days = Math.floor(Date.parse(`${iso}Z`) / DAY) - Math.floor(Date.parse(`${desat.now}Z`) / DAY);
    const day = days >= -1 && days <= 1 ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day') : formatDateTime(iso).split(',')[0];
    return t('desktopTools.around', { day, time: formatTimeOfDay(iso) });
  }
  /** @param {number} load */
  const barClass = (load) => (load >= ALARM_PERCENT ? 'od-desktop-desaturation--bar-high' : load >= 50 ? 'od-desktop-desaturation--bar-mid' : 'od-desktop-desaturation--bar-low');

  // Chart geometry, in its own units (the limit line at 100 %).
  const WIDTH = 600;
  const TOP = 20;
  const BOTTOM = 150;
  const GAP = 6;
  const BAR = (WIDTH - 15 * GAP) / 16;
  /** @param {number} value */
  const barHeight = (value) => Math.max(2, (value / 100) * (BOTTOM - TOP));

  const modelText = $derived.by(() => {
    if (!desat) return '';
    return desat.model === 'vpmb' ? t('desaturation.modelVpmb', { n: desat.vpmbConservatism }) : t('desaturation.modelGf', { low: desat.gfLow, high: desat.gfHigh });
  });
  const chartLabel = $derived.by(() => {
    if (!desat) return '';
    const values = desat.tissues.map(restLoad);
    const high = values.filter((v) => v >= ALARM_PERCENT).length;
    const label = t('desaturation.chartLabel', { min: Math.min(...values), max: Math.max(...values) });
    return high ? `${label} ${t('desaturation.chartLabelHigh', { n: high })}` : label;
  });
</script>

<div class="od-desktop-desaturation">
  {#if failed}
    <p class="od-desktop-desaturation--lead">{t('desaturation.failed')}</p>
  {:else if desat}
    <p class="od-desktop-desaturation--lead od-value">{t('desaturation.asOf', { date: formatFullDate(desat.now) })}</p>

    <section class="od-desktop-desaturation--figures">
      <div class="od-desktop-desaturation--figure">
        <span class="od-desktop-desaturation--label">{t('desaturation.lastDive')}</span>
        <span class="od-desktop-desaturation--value od-value">{lastFigure.seconds === null ? t(lastFigure.key) : t(lastFigure.key, { time: formatHoursMinutes(lastFigure.seconds) })}</span>
        {#if lastDive}<span class="od-desktop-desaturation--sub od-value">{surfaced}</span>{/if}
      </div>
      <div class="od-desktop-desaturation--figure">
        <span class="od-desktop-desaturation--label">{t('desaturation.beforeFlying')}</span>
        <span class="od-desktop-desaturation--value od-value">{waiting && wait ? formatHoursMinutes(wait.remainingSeconds) : wait ? t('desaturation.canFly') : t('desaturation.noWait')}</span>
        {#if waiting && wait}
          <span class="od-desktop-desaturation--sub od-value">{t('desktopTools.soit', { when: around(wait.endsAt) })}</span>
        {:else if wait}
          <span class="od-desktop-desaturation--sub od-value">{t('desaturation.waitOverAt', { when: formatRelativeDateTime(wait.endsAt, desat.now, false) })}</span>
        {/if}
      </div>
      {#if waiting}
        <button type="button" class="od-desktop-desaturation--notify" aria-pressed={settings.flightNotify} onclick={() => setFlightNotify(!settings.flightNotify)}>
          {#if settings.flightNotify}
            <Icon name="check" size={18} weight={2.4} />{t('desktopTools.notifyOn')}
          {:else}
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            {t('desktopTools.notify')}
          {/if}
        </button>
      {/if}
    </section>
    <p class="od-desktop-desaturation--caption">{t(rule.key, rule.params)}</p>

    <div class="od-desktop-desaturation--columns">
      <section class="od-desktop-desaturation--card">
        <h3 class="od-desktop-desaturation--heading">{t('desaturation.tissues')}</h3>
        <svg class="od-desktop-desaturation--chart" viewBox="0 0 {WIDTH} 190" role="img" aria-label={chartLabel}>
          <path class="od-desktop-desaturation--limit" d="M0 {TOP} H{WIDTH}" />
          <text class="od-desktop-desaturation--axis od-desktop-desaturation--limit-text" x={WIDTH} y="12" text-anchor="end">{t('desaturation.limit')}</text>
          {#each desat.tissues as tissue, i (i)}
            {@const load = restLoad(tissue)}
            {@const h = barHeight(load)}
            <rect class={barClass(load)} x={i * (BAR + GAP)} y={BOTTOM - h} width={BAR} height={h} rx="2" />
          {/each}
          <text class="od-desktop-desaturation--axis" x="0" y="172">{t('desaturation.fast')}</text>
          <text class="od-desktop-desaturation--axis" x={WIDTH} y="172" text-anchor="end">{t('desaturation.slow')}</text>
        </svg>
        <div class="od-desktop-desaturation--legend" aria-hidden="true">
          <span><i class="od-desktop-desaturation--swatch od-desktop-desaturation--bar-high"></i>{t('desaturation.legendAlarm')}</span>
          <span><i class="od-desktop-desaturation--swatch od-desktop-desaturation--bar-mid"></i>{t('desktopTools.legendMid')}</span>
          <span><i class="od-desktop-desaturation--swatch od-desktop-desaturation--bar-low"></i>{t('desktopTools.legendLow')}</span>
        </div>
        <p class="od-desktop-desaturation--caption">{t('desaturation.chartText')} {modelText}</p>
        {#if overlapAt}
          <p class="od-desktop-desaturation--caption" role="note">{t('desaturation.overlap', { date: formatDateTime(overlapAt) })}</p>
        {/if}
      </section>

      <section class="od-desktop-desaturation--card">
        <h3 class="od-desktop-desaturation--heading od-desktop-desaturation--ruled">{t('desaturation.usedDives')}</h3>
        {#if desat.dives.length}
          <ul class="od-desktop-desaturation--dives">
            {#each [...desat.dives].reverse() as dive (dive.id)}
              <li>
                <span class="od-desktop-desaturation--dive-date od-value">{formatRelativeDateTime(dive.date, desat.now)}</span>
                <span class="od-desktop-desaturation--dive-line">{dive.site || t('dive.siteNotSet')} · {formatDepth(dive.maxDepthMm, logbook.prefs)} · {formatDuration(dive.durationSeconds)}</span>
              </li>
            {/each}
          </ul>
          <button type="button" class="od-desktop-desaturation--link" onclick={() => goToSection('logbook')}>{t('desktopTools.seeInLogbook')}</button>
        {:else}
          <p class="od-desktop-desaturation--caption">{t('desaturation.noDives')}</p>
        {/if}
      </section>
    </div>

    <p class="od-desktop-desaturation--note">{t('desaturation.note')}</p>
  {/if}
</div>

<style>
  @layer od.components {
    .od-desktop-desaturation {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 1000px;
    }
    .od-desktop-desaturation--lead {
      margin: -8px 0 0;
      font-size: 14px;
      color: var(--od-text-2);
    }
    .od-desktop-desaturation--figures {
      display: flex;
      align-items: flex-start;
      gap: 48px;
      padding: 20px 24px;
      border-radius: 16px;
      background: var(--od-surface);
    }
    .od-desktop-desaturation--figure {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
    }
    .od-desktop-desaturation--label {
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-desktop-desaturation--value {
      font-family: var(--od-title-font);
      font-size: 32px;
      font-weight: 500;
      line-height: 1.15;
      color: var(--od-text);
    }
    .od-desktop-desaturation--sub {
      font-size: 14px;
      color: var(--od-text-2);
    }
    .od-desktop-desaturation--notify {
      display: flex;
      align-items: center;
      gap: 8px;
      align-self: flex-start;
      margin-left: auto;
      height: 40px;
      padding: 0 20px;
      border: 1px solid var(--od-text-2);
      border-radius: 20px;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--od-text);
      cursor: pointer;
    }
    .od-desktop-desaturation--notify[aria-pressed='true'] {
      border-color: transparent;
      background: var(--od-desktop-selected);
      color: var(--od-desktop-selected-ink);
    }
    .od-desktop-desaturation--columns {
      display: grid;
      grid-template-columns: minmax(0, 1.75fr) minmax(240px, 1fr);
      gap: 16px;
      align-items: start;
    }
    .od-desktop-desaturation--card {
      padding: 20px;
      border-radius: 16px;
      background: var(--od-surface);
    }
    .od-desktop-desaturation--heading {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 500;
      color: var(--od-text);
    }
    .od-desktop-desaturation--ruled {
      padding-bottom: 8px;
      border-bottom: 1px solid var(--od-separator);
    }
    .od-desktop-desaturation--chart {
      display: block;
      width: 100%;
    }
    .od-desktop-desaturation--limit {
      stroke: var(--od-alarm);
      stroke-width: 1;
      stroke-dasharray: 4 3;
    }
    .od-desktop-desaturation--axis {
      font-size: 11px;
      fill: var(--od-text-2);
    }
    .od-desktop-desaturation--limit-text {
      fill: var(--od-alarm);
    }
    .od-desktop-desaturation--bar-high {
      fill: var(--od-alarm);
      background: var(--od-alarm);
    }
    .od-desktop-desaturation--bar-mid {
      fill: var(--od-desktop-bar-mid);
      background: var(--od-desktop-bar-mid);
    }
    .od-desktop-desaturation--bar-low {
      fill: var(--od-desktop-bar-low);
      background: var(--od-desktop-bar-low);
    }
    .od-desktop-desaturation--legend {
      display: flex;
      gap: 20px;
      margin-top: 8px;
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-desktop-desaturation--legend span {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .od-desktop-desaturation--swatch {
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }
    .od-desktop-desaturation--caption {
      margin: 8px 0 0;
      font-size: 13px;
      line-height: 1.4;
      color: var(--od-text-2);
    }
    .od-desktop-desaturation--dives {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .od-desktop-desaturation--dives li {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 10px 0;
      border-bottom: 1px solid var(--od-separator);
    }
    .od-desktop-desaturation--dive-date {
      font-size: 15px;
      color: var(--od-text);
    }
    .od-desktop-desaturation--dive-line {
      font-size: 14px;
      color: var(--od-text-2);
    }
    .od-desktop-desaturation--link {
      margin: 12px 0 0;
      padding: 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: 14px;
      color: var(--od-desktop-selected-ink);
      text-decoration: underline;
      cursor: pointer;
    }
    .od-desktop-desaturation--note {
      margin: 0;
      max-width: 720px;
      font-size: 13px;
      line-height: 1.4;
      color: var(--od-text);
    }
  }
</style>
