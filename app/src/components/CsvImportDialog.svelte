<script>
  // @ts-check
  // Importing a CSV file, in three steps (task 2026-11-16-224, part 8; mock-ups docs/mockups/android-tablette-
  // import-csv-{type,colonnes,apercu}-paysage.dc.html): the type of file and the known format, the content of
  // each column, the preview of what the core read. The steps are lib/csv-dialog.js, the mapping lib/csv-import.js.
  // « Ajouter au carnet » gives the mapping to `onconfirm`: from the logbook the dives are added at once, from the
  // first launch the mapping waits for the new logbook (components/FirstLaunchSteps.svelte).
  import { onMount } from 'svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import ReleaseField from './ReleaseField.svelte';
  import { BenthicCore } from 'benthic-core';
  import { stageFile } from '../lib/staged-file.js';
  import {
    SEPARATORS,
    KNOWN_FORMATS,
    inspectCsv,
    previewTotals,
    profilePath,
    runCsvImport,
  } from '../lib/csv-import.js';
  import {
    createState,
    setKind,
    setKnown,
    setColumn,
    setSeparator,
    fieldsOf,
    columnCount,
    rows_,
    names,
    canNext,
    next,
    back,
    paramsOf,
    needsDiveDate,
    needsFormats,
  } from '../lib/csv-dialog.js';
  import { formatDepth, formatDateTime, formatNumber } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   file: File,
   *   companion?: File|null,
   *   onclose: () => void,
   *   onconfirm: (result: { params: import('benthic-core').CsvParams, companion: File|null, dives: number, minutes: number }) => void|Promise<void>,
   *   onfail: (error: unknown) => void,
   * }}
   */
  let { file, companion = null, onclose, onconfirm, onfail } = $props();

  /** @type {import('../lib/csv-dialog.js').CsvState|null} */
  let state = $state(null);
  let confirming = $state(false);
  /** The preview that is being read, so that an answer that comes late for a step left behind is ignored. */
  let reading = 0;

  /** The calls of the plugin, with the staging of the files. */
  const calls = {
    stage: async (/** @type {File} */ f) => (await stageFile(BenthicCore, f)).path,
    discard: (/** @type {string} */ path) => BenthicCore.discardImport({ path }),
    importCsv: (/** @type {any} */ o) => BenthicCore.importCsv(o),
  };

  onMount(async () => {
    try {
      const inspection = inspectCsv(await file.text(), file.name);
      if (companion && /^MkVI_Config/.test(await companion.text())) inspection.known = /** @type {any} */ ('poseidon');
      const created = createState(inspection, { lastModified: file.lastModified, hasCompanion: Boolean(companion) });
      if (inspection.known === /** @type {any} */ ('poseidon')) created.known = 'poseidon';
      state = created;
      if (created.known === 'poseidon') setKnown(created, 'poseidon');
    } catch (e) {
      onfail(e);
    }
  });

  // The third step reads the file with the core, without adding anything.
  $effect(() => {
    const s = state;
    if (!s || s.step !== 3 || s.preview || s.busy || s.previewError) return;
    const ticket = ++reading;
    s.busy = true;
    runCsvImport(calls, { file, companion, params: paramsOf(s), dryRun: true })
      .then((preview) => {
        if (ticket === reading && state) state.preview = preview;
      })
      .catch((e) => {
        console.error('CSV preview', String(e?.message ?? e));
        if (ticket === reading && state) state.previewError = String(e?.message ?? '') === 'NO_DIVES' ? 'noDives' : 'failed';
      })
      .finally(() => {
        if (ticket === reading && state) state.busy = false;
      });
  });

  const metric = $derived(state?.units !== 1);
  /** @param {'depth'|'temperature'|'pressure'|'time'|undefined} unit */
  const unitText = (unit) => (unit === 'depth' ? (metric ? 'm' : 'ft') : unit === 'temperature' ? (metric ? '°C' : '°F') : unit === 'pressure' ? (metric ? 'bar' : 'psi') : '');

  /** @param {{ key: string, unit?: 'depth'|'temperature'|'pressure'|'time' }} field */
  const fieldLabel = (field) => t(`csvImport.field.${field.key}`, { unit: unitText(field.unit) });

  /** @param {string} message */
  const eyebrow = (message) => message;

  async function confirm() {
    if (!state || !state.preview || confirming) return;
    confirming = true;
    try {
      const totals = previewTotals(state.preview);
      await onconfirm({ params: paramsOf(state), companion, dives: totals.dives, minutes: totals.minutes });
    } catch (e) {
      onfail(e);
    } finally {
      confirming = false;
    }
  }

  const SEPARATOR_KEYS = SEPARATORS.map((s) => s.key);
  const DATE_FORMATS = ['dmy', 'mdy', 'ymd'];
  const DURATION_FORMATS = ['seconds', 'minutes', 'minSec'];
  // The date formats of the stylesheets: 0 dd.mm.yyyy, 1 mm/dd/yyyy, 2 yyyy-mm-dd (lib/csv-import.js, guessDateFormat).
  const DATE_ORDER = [0, 1, 2];

  /** @param {number} when seconds, as the core gives it (the log's own clock) */
  const isoOf = (when) => new Date(when * 1000).toISOString().slice(0, 19);
</script>

{#if state}
  {@const s = state}
  <Md3Dialog
    class="bc-csv-import"
    title={t(`csvImport.${s.step === 1 ? 'type' : s.step === 2 ? 'columns' : 'preview'}.title`)}
    eyebrow={eyebrow(t('csvImport.eyebrow', { n: s.step }))}
    closeLabel={t('csvImport.close')}
    onclose={onclose}
    oncancel={onclose}
  >
    <div class="bc-csv-import--body">
      {#if s.step === 1}
        <div class="bc-csv-import--file">
          <span class="bc-csv-import--file-icon"><Icon name="file" size={20} /></span>
          <span class="bc-csv-import--file-text">
            <span class="bc-csv-import--file-name">{file.name}</span>
            <span class="bc-csv-import--file-detail">
              {t('csvImport.type.detail', {
                columns: t('csvImport.type.columns', { n: s.inspection.columnCount }),
                lines: t('csvImport.type.lines', { n: s.inspection.lineCount }),
                separator: t(`csvImport.separator.${SEPARATOR_KEYS[s.inspection.separator]}`).toLowerCase(),
              })}
            </span>
          </span>
        </div>

        <h3 class="bc-csv-import--question">{t('csvImport.type.question')}</h3>
        <div class="bc-csv-import--kinds" role="radiogroup" aria-label={t('csvImport.type.question')}>
          {#each /** @type {const} */ (['samples', 'dives']) as kind (kind)}
            {@const selected = s.kind === kind}
            <button
              type="button"
              class="bc-csv-import--kind"
              class:bc-csv-import--kind-selected={selected}
              role="radio"
              aria-checked={selected}
              onclick={() => setKind(s, kind)}
            >
              <span class="bc-csv-import--kind-tile">
                {#if kind === 'samples'}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h4l3 8 3-8h4l2 3h2" /></svg>
                {:else}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
                {/if}
              </span>
              <span class="bc-csv-import--kind-text">
                <span class="bc-csv-import--kind-title">{t(`csvImport.type.${kind}`)}</span>
                <span class="bc-csv-import--kind-help">{t(`csvImport.type.${kind}Help`)}</span>
              </span>
              {#if selected}<span class="bc-csv-import--kind-check"><Icon name="check" size={16} weight={2.6} /></span>{/if}
            </button>
          {/each}
        </div>

        <h3 class="bc-csv-import--question">{t('csvImport.type.known')}</h3>
        <label class="bc-csv-import--select bc-csv-import--select-wide">
          <span class="bc-csv-import--select-label">{t('csvImport.type.knownField')}</span>
          <select value={s.known ?? ''} onchange={(e) => setKnown(s, /** @type {any} */ (e.currentTarget.value || null))}>
            <option value="">{t('csvImport.type.none')}</option>
            {#each KNOWN_FORMATS as known (known)}<option value={known}>{known === 'seabear' ? 'Seabear' : known === 'poseidon' ? 'Poseidon MkVI' : 'Sensus'}</option>{/each}
          </select>
          <span class="bc-csv-import--select-chevron"><Icon name="chevron" size={18} weight={2} /></span>
        </label>
        <p class="bc-csv-import--help" class:bc-csv-import--help-warn={s.known === 'poseidon' && !s.hasCompanion}>
          {s.known === 'poseidon' && !s.hasCompanion ? t('csvImport.type.poseidonNeeds') : t('csvImport.type.knownHelp')}
        </p>
      {:else if s.step === 2}
        <p class="bc-csv-import--lead">{t('csvImport.columns.help')}</p>
        {@const rows = rows_(s)}
        {#if rows.length === 0}
          <p class="bc-csv-import--error" role="alert">{t('csvImport.columns.none')}</p>
        {:else}
          <div class="bc-csv-import--table-wrap">
            <table class="bc-csv-import--table">
              <thead>
                <tr>
                  {#each names(s) as name, column (column)}
                    <th scope="col">
                      <span class="bc-csv-import--column-name">{name}</span>
                      <span class="bc-csv-import--menu" class:bc-csv-import--menu-ignored={!s.mapping[column]}>
                        <select
                          aria-label={t('csvImport.columns.menu', { name })}
                          value={s.mapping[column] ?? ''}
                          onchange={(e) => setColumn(s, column, e.currentTarget.value)}
                        >
                          <option value="">{t('csvImport.columns.ignore')}</option>
                          {#each fieldsOf(s) as field (field.key)}<option value={field.key}>{fieldLabel(field)}</option>{/each}
                        </select>
                        <span class="bc-csv-import--menu-chevron"><Icon name="chevron" size={16} weight={2.2} /></span>
                      </span>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each rows as row, r (r)}
                  <tr>
                    {#each { length: columnCount(s) } as _, column (column)}
                      <td class:bc-csv-import--cell-ignored={!s.mapping[column]}>{row[column] ?? ''}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        <div class="bc-csv-import--options">
          <label class="bc-csv-import--select">
            <span class="bc-csv-import--select-label">{t('csvImport.columns.units')}</span>
            <select value={String(s.units)} onchange={(e) => (s.units = e.currentTarget.value === '1' ? 1 : 0)}>
              <option value="0">{t('csvImport.columns.metric')}</option>
              <option value="1">{t('csvImport.columns.imperial')}</option>
            </select>
            <span class="bc-csv-import--select-chevron"><Icon name="chevron" size={18} weight={2} /></span>
          </label>
          <label class="bc-csv-import--select bc-csv-import--select-narrow">
            <span class="bc-csv-import--select-label">{t('csvImport.separator.label')}</span>
            <select value={String(s.separator)} onchange={(e) => setSeparator(s, Number(e.currentTarget.value))}>
              {#each SEPARATORS as sep (sep.index)}<option value={String(sep.index)}>{t(`csvImport.separator.${sep.key}`)}</option>{/each}
            </select>
            <span class="bc-csv-import--select-chevron"><Icon name="chevron" size={18} weight={2} /></span>
          </label>
          {#if needsDiveDate(s)}
            <ReleaseField class="bc-csv-import--date" label={t('csvImport.columns.diveDate')} type="datetime-local" bind:value={s.diveDate} />
          {/if}
          {#if needsFormats(s).date}
            <label class="bc-csv-import--select bc-csv-import--select-narrow">
              <span class="bc-csv-import--select-label">{t('csvImport.columns.dateFormat')}</span>
              <select value={String(s.dateFormat)} onchange={(e) => (s.dateFormat = Number(e.currentTarget.value))}>
                {#each DATE_ORDER as index (index)}<option value={String(index)}>{t(`csvImport.columns.dateFormats.${DATE_FORMATS[index]}`)}</option>{/each}
              </select>
              <span class="bc-csv-import--select-chevron"><Icon name="chevron" size={18} weight={2} /></span>
            </label>
          {/if}
          {#if needsFormats(s).duration}
            <label class="bc-csv-import--select bc-csv-import--select-narrow">
              <span class="bc-csv-import--select-label">{t('csvImport.columns.durationFormat')}</span>
              <select value={String(s.durationFormat)} onchange={(e) => (s.durationFormat = Number(e.currentTarget.value))}>
                {#each DURATION_FORMATS as format, index (format)}<option value={String(index)}>{t(`csvImport.columns.durationFormats.${format}`)}</option>{/each}
              </select>
              <span class="bc-csv-import--select-chevron"><Icon name="chevron" size={18} weight={2} /></span>
            </label>
          {/if}
        </div>
      {:else}
        {@const preview = s.preview}
        {#if s.previewError}
          <p class="bc-csv-import--error" role="alert">{t(`csvImport.preview.${s.previewError}`)}</p>
        {:else if !preview}
          <p class="bc-csv-import--lead" role="status">{t('csvImport.preview.reading')}</p>
        {:else}
          {@const totals = previewTotals(preview)}
          {@const first = preview.dives[0]}
          <div class="bc-csv-import--file">
            <span class="bc-csv-import--file-icon"><Icon name="file" size={20} /></span>
            <span class="bc-csv-import--file-text">
              <span class="bc-csv-import--file-name">{file.name}</span>
              <span class="bc-csv-import--file-detail">
                {t('csvImport.preview.summary', {
                  dives: t('csvImport.preview.dives', { n: totals.dives }),
                  minutes: formatNumber(totals.minutes, 0),
                  depth: formatDepth(totals.maxDepthMm, logbook.prefs),
                })}
              </span>
            </span>
          </div>
          <p class="bc-csv-import--lead">{t('csvImport.preview.lead', { n: totals.dives })}</p>
          <div class="bc-csv-import--dive">
            <span class="bc-csv-import--dive-thumb" aria-hidden="true"></span>
            <span class="bc-csv-import--dive-text">
              <span class="bc-csv-import--dive-title">{t('csvImport.preview.newDive')}</span>
              <span class="bc-csv-import--dive-detail">{formatDateTime(isoOf(first.when))} · {t('csvImport.preview.site')}</span>
            </span>
            <span class="bc-csv-import--dive-figures">
              <span class="bc-csv-import--dive-duration">{formatNumber(Math.round(first.durationSeconds / 60), 0)} min</span>
              <span class="bc-csv-import--dive-depth">{formatDepth(first.maxDepthMm, logbook.prefs)}</span>
            </span>
          </div>
          {#if totals.dives > 1}<p class="bc-csv-import--more">{t('csvImport.preview.more', { n: totals.dives - 1 })}</p>{/if}
          {#if first.profile.length > 1}
            {@const path = profilePath(first.profile, 1000, 150)}
            <div class="bc-csv-import--profile">
              <svg viewBox="-6 -6 1012 162" preserveAspectRatio="none" aria-hidden="true">
                <path class="bc-csv-import--profile-area" d={path.area} />
                <path class="bc-csv-import--profile-line" d={path.line} vector-effect="non-scaling-stroke" />
              </svg>
            </div>
          {/if}
          <p class="bc-csv-import--note">{t('csvImport.preview.note')}</p>
        {/if}
      {/if}
    </div>

    {#snippet actions()}
      {#if s.step === 1}
        <button type="button" class="bc-csv-import--outlined" onclick={onclose}>{t('csvImport.cancel')}</button>
        <button type="button" class="bc-csv-import--filled" disabled={!canNext(s)} onclick={() => next(s)}>{t('csvImport.next')}</button>
      {:else if s.step === 2}
        <button type="button" class="bc-csv-import--outlined" onclick={() => back(s)}>{t('csvImport.back')}</button>
        <button type="button" class="bc-csv-import--filled" disabled={!canNext(s)} onclick={() => next(s)}>{t('csvImport.next')}</button>
      {:else}
        <button type="button" class="bc-csv-import--outlined" onclick={() => back(s)}>{t('csvImport.back')}</button>
        <button type="button" class="bc-csv-import--filled" disabled={!s.preview || confirming} onclick={confirm}>{t('csvImport.add')}</button>
      {/if}
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer od.components {
    :global(.bc-csv-import) :global(.bc-md3-dialog--surface) {
      width: min(1000px, calc(100% - 48px));
      height: min(700px, calc(100% - 96px));
      padding-top: 28px;
    }

    :global(.bc-csv-import) :global(.bc-md3-dialog--content) {
      padding: 0 24px;
    }

    :global(.bc-csv-import) :global(.bc-md3-dialog--actions) {
      margin: 12px 24px 0;
      gap: 12px;
    }

    .bc-csv-import--body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-bottom: 6px;
    }

    .bc-csv-import--lead {
      margin: 0;
      font-size: 15px;
      line-height: 21px;
      color: var(--bc-text-2);
    }

    .bc-csv-import--question {
      margin: 12px 0 0;
      font-size: 15px;
      line-height: 21px;
      font-weight: 400;
      color: var(--bc-text-2);
    }

    .bc-csv-import--file {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 16px;
      border-radius: 16px;
      background: var(--bc-release-note);
    }

    .bc-csv-import--file-icon {
      width: 40px;
      height: 40px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      background: var(--bc-surface);
      color: var(--bc-release-tile-icon);
    }

    .bc-csv-import--file-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-csv-import--file-name {
      font-size: 15px;
      line-height: 21px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .bc-csv-import--file-detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-csv-import--kinds {
      display: flex;
      gap: 16px;
    }

    .bc-csv-import--kind {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      width: auto;
      padding: 18px 40px 18px 18px;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 20px;
      background: var(--bc-surface);
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: 2px;
      }
    }

    .bc-csv-import--kind-selected {
      border: 2px solid var(--bc-release-row-main);
      padding: 17px 39px 17px 17px;
    }

    .bc-csv-import--kind-tile {
      width: 40px;
      height: 40px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      background: var(--bc-release-tile);
      color: var(--bc-release-tile-icon);
    }

    .bc-csv-import--kind-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-csv-import--kind-title {
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
    }

    .bc-csv-import--kind-help {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-csv-import--kind-check {
      position: absolute;
      top: 14px;
      right: 14px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      background: var(--bc-release-row-main);
      color: var(--bc-release-on-panel);
    }

    /* An outlined select with its label on the outline, as ReleaseField draws a text field. */
    .bc-csv-import--select {
      position: relative;
      display: block;
      width: 100%;
      max-width: 520px;
    }

    .bc-csv-import--select-narrow {
      max-width: 220px;
    }

    .bc-csv-import--select select {
      appearance: none;
      box-sizing: border-box;
      width: 100%;
      height: 52px;
      padding: 0 40px 0 16px;
      border: 1px solid var(--bc-release-field-border);
      border-radius: 12px;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      font-size: 16px;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: 1px;
      }
    }

    .bc-csv-import--select-label {
      position: absolute;
      top: -9px;
      left: 12px;
      padding: 0 4px;
      background: var(--bc-dialog);
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
      pointer-events: none;
    }

    .bc-csv-import--select-chevron {
      position: absolute;
      top: 0;
      right: 12px;
      height: 52px;
      display: flex;
      align-items: center;
      transform: rotate(90deg);
      pointer-events: none;
    }

    .bc-csv-import--help {
      margin: 0;
      padding-left: 14px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-csv-import--help-warn {
      color: var(--bc-error, var(--bc-text));
    }

    .bc-csv-import--error {
      margin: 0;
      padding: 14px 16px;
      border-radius: 12px;
      background: var(--bc-release-note);
      font-size: 15px;
      line-height: 21px;
    }

    /* Step 2: the first rows of the file under a menu for each column. */
    .bc-csv-import--table-wrap {
      overflow: auto;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 20px;
      background: var(--bc-surface);
      max-height: 330px;
    }

    .bc-csv-import--table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      & th {
        min-width: 168px;
        padding: 12px 6px 10px 12px;
        text-align: start;
        font-weight: 400;
        vertical-align: top;
      }
    }

    .bc-csv-import--column-name {
      display: block;
      margin-bottom: 6px;
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
      overflow-wrap: anywhere;
    }

    .bc-csv-import--menu {
      position: relative;
      display: block;
      & select {
        appearance: none;
        box-sizing: border-box;
        width: 100%;
        height: 36px;
        padding: 0 30px 0 12px;
        border: none;
        border-radius: 10px;
        background: var(--bc-release-hero);
        color: var(--bc-release-chip-text);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;

        &:focus-visible {
          outline: 2px solid var(--bc-release-row-main);
          outline-offset: 1px;
      }
      }
    }

    .bc-csv-import--menu-ignored select {
      background: var(--bc-surface-container-highest);
      color: var(--bc-text-2);
    }

    .bc-csv-import--menu-chevron {
      position: absolute;
      top: 0;
      right: 8px;
      height: 36px;
      display: flex;
      align-items: center;
      transform: rotate(90deg);
      pointer-events: none;
    }

    .bc-csv-import--table td {
      padding: 7px 12px;
      border-top: 1px solid var(--bc-release-divider);
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 13px;
      white-space: nowrap;
    }

    .bc-csv-import--cell-ignored {
      color: var(--bc-text-2);
    }

    .bc-csv-import--options {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 14px;
      align-items: flex-start;

      :global(.bc-csv-import--date) {
        width: 260px;
      }
    }

    /* Step 3: what was read. */
    .bc-csv-import--dive {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 16px;
      background: var(--bc-surface);
    }

    .bc-csv-import--dive-thumb {
      width: 72px;
      height: 40px;
      flex: none;
      border-radius: 8px;
      background: linear-gradient(180deg, var(--bc-water-top), var(--bc-water-bottom));
    }

    .bc-csv-import--dive-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-csv-import--dive-title {
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
    }

    .bc-csv-import--dive-detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-csv-import--dive-figures {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    .bc-csv-import--dive-duration {
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
    }

    .bc-csv-import--dive-depth {
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-csv-import--more {
      margin: 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-csv-import--profile {
      height: 170px;
      padding: 12px 16px;
      box-sizing: border-box;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 16px;
      background: var(--bc-surface);
      & svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
    }

    .bc-csv-import--profile-area {
      fill: var(--bc-release-hero);
      stroke: none;
    }

    .bc-csv-import--profile-line {
      fill: none;
      stroke: var(--bc-release-row-main);
      stroke-width: 2;
    }

    .bc-csv-import--note {
      margin: 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    /* The two buttons of every step: outlined « Annuler » and « Retour », filled « Suivant » and « Ajouter au carnet ». */
    :global(.bc-csv-import) :global(.bc-md3-dialog--actions) button {
      height: 44px;
      padding: 0 24px;
      border-radius: 22px;
      font-size: 15px;
      font-weight: 500;
      letter-spacing: 0;
    }

    :global(.bc-csv-import) :global(.bc-md3-dialog--actions) .bc-csv-import--outlined {
      border: 1px solid var(--bc-release-field-border);
      color: var(--bc-text);
    }

    :global(.bc-csv-import) :global(.bc-md3-dialog--actions) .bc-csv-import--filled {
      background: var(--bc-text);
      color: var(--bc-background);

      &:disabled {
        opacity: 0.38;
        cursor: default;
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          opacity: 0.88;
        }
      }
    }

    @media (max-width: 767px) {
      .bc-csv-import--kinds {
        flex-direction: column;
      }
    }
  }
</style>
