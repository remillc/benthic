<script>
  // @ts-check
  // The desktop export dialog (task 2026-11-15-189, mock-up bureau-carnet-exporter): which
  // dives (the selection, the filtered ones, the whole logbook), the format, « Anonymiser »,
  // then « Exporter… » opens the system's save dialog with a proposed name. Choice rows, no
  // radio buttons; the last format is remembered on this computer.
  import Md3Dialog from './Md3Dialog.svelte';
  import ChoiceRow from './ChoiceRow.svelte';
  import { exportFile } from '../lib/share.js';
  import { deviceStore } from '../lib/device-store.js';
  import { defaultScope, exportFileName } from '../lib/desktop-export.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   selected: import('opendives-core').Dive[],
   *   filtered: number[]|null,
   *   all: number[],
   *   prefs: any,
   *   whole?: boolean,
   *   onclose: () => void,
   * }}
   */
  let { selected, filtered, all, prefs, whole = false, onclose } = $props();

  const FORMATS = /** @type {const} */ (['ssrf', 'uddf', 'csv', 'csvProfiles', 'pdf']);
  const FORMAT_KEY = 'od.desktopExportFormat';

  // svelte-ignore state_referenced_locally
  let scope = $state(whole ? 'all' : defaultScope(selected.length, !!filtered));
  let format = $state(/** @type {(typeof FORMATS)[number]} */ (FORMATS.find((f) => f === deviceStore.getItem(FORMAT_KEY)) ?? 'ssrf'));
  let anonymize = $state(false);
  let busy = $state(false);

  const ids = $derived(scope === 'selection' ? selected.map((d) => d.id) : scope === 'filtered' ? (filtered ?? []) : all);
  const numbers = $derived(
    [...selected]
      .map((d) => d.number)
      .filter((n) => n > 0)
      .sort((a, b) => a - b),
  );

  async function run() {
    busy = true;
    deviceStore.setItem(FORMAT_KEY, format);
    try {
      const day = new Date().toISOString().slice(0, 10);
      const name = exportFileName(/** @type {any} */ (scope), numbers, format, day, { dives: t('desktop.export.fileDives'), logbook: t('desktop.export.fileLogbook') });
      const { uri } = await exportFile(ids, format, anonymize, prefs, name);
      const result = await /** @type {any} */ (window).odDesktop.saveAs({ path: uri, name });
      onclose();
      if (result?.saved) showSnackbar(t('desktop.export.saved', { n: ids.length }));
    } catch (e) {
      console.error('Export dives', e);
      showSnackbar(t('export.failed'));
      busy = false;
    }
  }
</script>

<Md3Dialog class="od-desktop-export" title={t('export.title', { n: ids.length })} oncancel={onclose}>
  <h3 class="od-desktop-export--heading">{t('desktop.export.which')}</h3>
  <div class="od-desktop-export--choices" role="radiogroup" aria-label={t('desktop.export.which')}>
    {#if selected.length}
      <ChoiceRow name="od-export-scope" selected={scope === 'selection'} onselect={() => (scope = 'selection')}>
        <span class="od-desktop-export--label">{t('desktop.export.selection', { n: selected.length })}</span>
        {#if numbers.length}<span class="od-desktop-export--line">{t('desktop.numbers', { numbers: numbers.slice(0, 8).join(', ') + (numbers.length > 8 ? '…' : '') })}</span>{/if}
      </ChoiceRow>
    {/if}
    {#if filtered}
      <ChoiceRow name="od-export-scope" selected={scope === 'filtered'} onselect={() => (scope = 'filtered')}>
        <span class="od-desktop-export--label">{t('desktop.export.filtered', { n: filtered.length })}</span>
      </ChoiceRow>
    {/if}
    <ChoiceRow name="od-export-scope" selected={scope === 'all'} onselect={() => (scope = 'all')}>
      <span class="od-desktop-export--label">{t('desktop.export.all')}</span>
      <span class="od-desktop-export--line">{t('trip.dives', { n: all.length })}</span>
    </ChoiceRow>
  </div>

  <h3 class="od-desktop-export--heading">{t('desktop.export.format')}</h3>
  <div class="od-desktop-export--choices" role="radiogroup" aria-label={t('desktop.export.format')}>
    {#each FORMATS as f (f)}
      <ChoiceRow name="od-export-format" selected={format === f} onselect={() => (format = f)}>
        <span class="od-desktop-export--label">{t(`export.formats.${f}`)}</span>
        <span class="od-desktop-export--line">{t(`export.formatTexts.${f}`)}</span>
      </ChoiceRow>
    {/each}
  </div>

  <label class="od-desktop-export--switch">
    <span>
      <span class="od-desktop-export--label">{t('export.anonymize')}</span>
      <span class="od-desktop-export--line">{t('export.anonymizeText')}</span>
    </span>
    <input type="checkbox" role="switch" bind:checked={anonymize} />
  </label>

  {#snippet actions()}
    <button type="button" class="button" onclick={onclose}>{t('dialog.cancel')}</button>
    <button type="button" class="button button-fill" disabled={busy || !ids.length} onclick={run}>{t('desktop.export.action')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .od-desktop-export--heading,
    .od-desktop-export--switch {
      padding-inline: 24px;
    }
    .od-desktop-export--heading {
      margin: 12px 0 4px;
      font-size: 14px;
      font-weight: 600;
      color: var(--od-text);
    }
    .od-desktop-export--choices {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .od-desktop-export--label {
      display: block;
      font-size: 15px;
      color: var(--od-text);
    }
    .od-desktop-export--line {
      display: block;
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-desktop-export--switch {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-top: 12px;
      padding: 8px 24px;
      cursor: pointer;
    }

    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .od-desktop-export--switch {
        transition: box-shadow 120ms linear;
      }
      .od-desktop-export--switch:hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .od-desktop-export--switch {
        transition: none;
      }
    }
  }
</style>
