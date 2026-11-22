<script>
  // @ts-check
  // The desktop export dialog (task 2026-11-15-189, mock-up bureau-carnet-exporter): which
  // dives (the selection, the filtered ones, the whole logbook), the format, « Anonymiser »,
  // then « Exporter… » opens the system's save dialog with a proposed name. Choice rows, no
  // radio buttons; the last format is remembered on this computer.
  import Md3Dialog from './Md3Dialog.svelte';
  import { onMount } from 'svelte';
  import ChoiceRow from './ChoiceRow.svelte';
  import ExportFormats from './ExportFormats.svelte';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { exportFile } from '../lib/share.js';
  import { deviceStore } from '../lib/device-store.js';
  import { defaultScope, exportFileName, exportFormats, isUpload, rememberable, usableFormat } from '../lib/desktop-export.js';
  import { windowLogbook } from '../lib/desktop-logbooks.svelte.js';
  import { displayName } from '../lib/desktop-logbooks.js';
  import { localDay } from '../lib/logbook-name.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   selected: import('benthic-core').Dive[],
   *   filtered: number[]|null,
   *   all: number[],
   *   prefs: any,
   *   whole?: boolean,
   *   onclose: () => void,
   * }}
   */
  let { selected, filtered, all, prefs, whole = false, onclose } = $props();

  const FORMAT_KEY = 'od.desktopExportFormat';

  // svelte-ignore state_referenced_locally
  let scope = $state(whole ? 'all' : defaultScope(selected.length, !!filtered));
  // Stored as chosen; what is written is `usableFormat`: .benthic only exists for the whole logbook.
  let chosenFormat = $state(String(deviceStore.getItem(FORMAT_KEY) ?? ''));
  // « Inclure les photos et vidéos »: on by default, in the .benthic row only.
  let withMedia = $state(true);
  const wholeLogbook = $derived(scope === 'all');
  const formats = $derived(exportFormats(wholeLogbook));
  const format = $derived(usableFormat(chosenFormat, wholeLogbook));
  let anonymize = $state(false);
  let showName = $state(true);
  const fullName = $derived(diver.info.fullName);
  onMount(() => {
    if (!diver.ready) loadProfile().catch((e) => console.error('Reading the profile', e));
  });
  let busy = $state(false);

  const ids = $derived(scope === 'selection' ? selected.map((d) => d.id) : scope === 'filtered' ? (filtered ?? []) : all);
  const numbers = $derived(
    [...selected]
      .map((d) => d.number)
      .filter((n) => n > 0)
      .sort((a, b) => a - b),
  );

  async function run() {
    if (isUpload(format)) {
      // The divelogs.de upload has no sign-in or progress screen yet (task 2026-11-22-324): the row says so and the dialog stays.
      showSnackbar(t('export.divelogsSoon'));
      return;
    }
    busy = true;
    if (rememberable(format)) deviceStore.setItem(FORMAT_KEY, format);
    try {
      const day = localDay();
      const entry = windowLogbook();
      if (format === 'benthic') {
        // The archive of « Télécharger mes données » (lib/full-export.js), named after the logbook.
        const { buildExport, deliverExport } = await import('../lib/full-export.js');
        const { file } = await buildExport({ withMedia, logbookName: entry ? displayName(entry, t) : '' });
        const result = await deliverExport(file);
        onclose();
        if (result?.saved) showSnackbar(t('desktop.export.savedLogbook'));
        return;
      }
      const name = exportFileName(/** @type {any} */ (scope), numbers, format, day, { dives: t('desktop.export.fileDives'), logbook: t('desktop.export.fileLogbook') }, entry ? displayName(entry, t) : '');
      const { uri } = await exportFile(ids, format, anonymize, prefs, name, showName);
      const result = await /** @type {any} */ (window).benthicDesktop.saveAs({ path: uri, name });
      onclose();
      if (result?.saved) showSnackbar(t('desktop.export.saved', { n: ids.length }));
    } catch (e) {
      console.error('Export dives', e);
      showSnackbar(t('export.failed'));
      busy = false;
    }
  }
</script>

<Md3Dialog class="bc-desktop-export" title={wholeLogbook ? t('export.titleLogbook') : t('export.title', { n: ids.length })} oncancel={onclose}>
  <h3 class="bc-desktop-export--heading">{t('desktop.export.which')}</h3>
  <div class="bc-desktop-export--choices" role="radiogroup" aria-label={t('desktop.export.which')}>
    {#if selected.length}
      <ChoiceRow name="od-export-scope" selected={scope === 'selection'} onselect={() => (scope = 'selection')}>
        <span class="bc-desktop-export--label">{t('desktop.export.selection', { n: selected.length })}</span>
        {#if numbers.length}<span class="bc-desktop-export--line">{t('desktop.numbers', { numbers: numbers.slice(0, 8).join(', ') + (numbers.length > 8 ? '…' : '') })}</span>{/if}
      </ChoiceRow>
    {/if}
    {#if filtered}
      <ChoiceRow name="od-export-scope" selected={scope === 'filtered'} onselect={() => (scope = 'filtered')}>
        <span class="bc-desktop-export--label">{t('desktop.export.filtered', { n: filtered.length })}</span>
      </ChoiceRow>
    {/if}
    <ChoiceRow name="od-export-scope" selected={scope === 'all'} onselect={() => (scope = 'all')}>
      <span class="bc-desktop-export--label">{t('desktop.export.all')}</span>
      <span class="bc-desktop-export--line">{t('trip.dives', { n: all.length })}</span>
    </ChoiceRow>
  </div>

  <h3 class="bc-desktop-export--heading">{t('desktop.export.format')}</h3>
  <div class="bc-desktop-export--formats">
    <ExportFormats {formats} {format} bind:withMedia onselect={(f) => (chosenFormat = f)} label={t('desktop.export.format')} />
  </div>

  {#if format !== 'benthic' && !isUpload(format)}
    <label class="bc-desktop-export--switch">
      <span>
        <span class="bc-desktop-export--label">{t('export.anonymize')}</span>
        <span class="bc-desktop-export--line">{t('export.anonymizeText')}</span>
      </span>
      <input type="checkbox" role="switch" bind:checked={anonymize} />
    </label>
  {/if}

  {#if format === 'pdf' && fullName}
    <label class="bc-desktop-export--switch">
      <span>
        <span class="bc-desktop-export--label">{t('export.showName')}</span>
        <span class="bc-desktop-export--line">{t('export.showNameText', { name: fullName })}</span>
      </span>
      <input type="checkbox" role="switch" bind:checked={showName} disabled={anonymize} />
    </label>
  {/if}

  {#snippet actions()}
    <button type="button" class="button" onclick={onclose}>{t('dialog.cancel')}</button>
    <button type="button" class="button button-fill" disabled={busy || !ids.length} onclick={run}>{t('desktop.export.action')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .bc-desktop-export--heading,
    .bc-desktop-export--switch {
      padding-inline: 24px;
    }
    .bc-desktop-export--heading {
      margin: 12px 0 4px;
      font-size: 14px;
      font-weight: 600;
      color: var(--bc-text);
    }
    .bc-desktop-export--formats {
      padding-inline: 24px;
    }
    .bc-desktop-export--choices {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .bc-desktop-export--label {
      display: block;
      font-size: 15px;
      color: var(--bc-text);
    }
    .bc-desktop-export--line {
      display: block;
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-desktop-export--switch {
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
      .bc-desktop-export--switch {
        transition: box-shadow 120ms linear;
        &:hover {
          box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
        }
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-desktop-export--switch {
        transition: none;
      }
    }
  }
</style>
