<script>
  // @ts-check
  import { deviceStore } from '../lib/device-store.js';
  // "Exporter au format…" of the logbook's selection
  // (docs/mockups/carnet-export-android.dc.html; spec, section 4, "Logbook
  // selection and export"): an MD3 modal bottom sheet with the formats as a
  // choice list (64 dp rows with a description, the chosen one tinted and checked), the "Anonymiser" switch (off
  // by default) and Annuler / Exporter. The last format is remembered on the
  // device.
  import { Sheet } from 'framework7-svelte';
  import { onMount } from 'svelte';
  import ChoiceRow from './ChoiceRow.svelte';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {'ssrf'|'uddf'|'csv'|'csvProfiles'|'pdf'} ExportFormat */

  /**
   * @type {{
   *   count: number,
   *   onexport: (format: ExportFormat, anonymize: boolean, showName: boolean) => void,
   *   onclose: () => void,
   * }}
   */
  let { count, onexport, onclose } = $props();

  const KEY = 'od.exportFormat';
  /** @type {ExportFormat[]} */
  const FORMATS = ['ssrf', 'uddf', 'csv', 'csvProfiles', 'pdf'];
  const stored = /** @type {ExportFormat} */ (deviceStore.getItem(KEY) ?? 'ssrf');
  let format = $state(FORMATS.includes(stored) ? stored : 'ssrf');
  let anonymize = $state(false);
  // « Mon nom dans l’en-tête » (task 2026-11-19-312): for the PDF only, on by default, offered when the profile has a name.
  let showName = $state(true);
  const fullName = $derived(diver.info.fullName);
  onMount(() => {
    if (!diver.ready) loadProfile().catch((e) => console.error('Reading the profile', e));
  });
  let opened = $state(true);

  function submit() {
    deviceStore.setItem(KEY, format);
    opened = false;
    onexport(format, anonymize, showName);
  }
</script>

<Sheet {opened} swipeToClose backdrop class="bc-export-sheet bc-sheet-dialog" style="height: auto" onSheetClosed={onclose}>
  <div class="bc-export-sheet--sheet" role="dialog" aria-labelledby="od-export-title">
    <div class="bc-export-sheet--handle" aria-hidden="true"></div>
    <h2 id="od-export-title" class="bc-export-sheet--title">{t('export.title', { n: count })}</h2>
    <p class="bc-export-sheet--text">{t('export.text')}</p>
    <div class="bc-export-sheet--formats" role="radiogroup" aria-labelledby="od-export-title">
      {#each FORMATS as f (f)}
        <ChoiceRow class="bc-export-sheet--format" name="od-export-format" selected={format === f} onselect={() => (format = f)}>
          <span class="bc-export-sheet--texts">
            <span class="bc-export-sheet--headline">{t(`export.formats.${f}`)}</span>
            <span class="bc-export-sheet--supporting">{t(`export.formatTexts.${f}`)}</span>
          </span>
        </ChoiceRow>
      {/each}
    </div>
    <label class="bc-export-sheet--switch-row">
      <span class="bc-export-sheet--texts">
        <span class="bc-export-sheet--headline">{t('export.anonymize')}</span>
        <span class="bc-export-sheet--supporting">{t('export.anonymizeText')}</span>
      </span>
      <span class="toggle">
        <input type="checkbox" bind:checked={anonymize} />
        <span class="toggle-icon"></span>
      </span>
    </label>
    {#if format === 'pdf' && fullName}
      <label class="bc-export-sheet--switch-row bc-export-sheet--show-name">
        <span class="bc-export-sheet--texts">
          <span class="bc-export-sheet--headline">{t('export.showName')}</span>
          <span class="bc-export-sheet--supporting">{t('export.showNameText', { name: fullName })}</span>
        </span>
        <span class="toggle">
          <input type="checkbox" bind:checked={showName} disabled={anonymize} />
          <span class="toggle-icon"></span>
        </span>
      </label>
    {/if}
    <div class="bc-export-sheet--actions">
      <button type="button" class="bc-export-sheet--text-button" onclick={() => (opened = false)}>{t('dialog.cancel')}</button>
      <button type="button" class="bc-export-sheet--filled" onclick={submit}>{t('export.action')}</button>
    </div>
  </div>
</Sheet>

<style>
  @layer od.components {
    :global(.bc-export-sheet) {
      border-radius: 28px 28px 0 0;
      background: var(--bc-dialog);
      overflow: hidden;
    }

    .bc-export-sheet--sheet {
      max-height: 85vh;
      overflow-y: auto;
      padding: 8px 0 calc(16px + var(--f7-safe-area-bottom, 0px));
    }

    .bc-export-sheet--handle {
      width: 32px;
      height: 4px;
      margin: 8px auto 12px;
      border-radius: 2px;
      background: var(--bc-text-2);
      opacity: 0.4;
    }

    .bc-export-sheet--title {
      margin: 0 24px 4px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
      color: var(--bc-text);
    }

    .bc-export-sheet--text {
      margin: 0 24px 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    :global(.bc-export-sheet--format) {
      min-height: 64px;
      padding: 8px 12px;
    }

    .bc-export-sheet--formats {
      padding: 0 12px;
    }

    .bc-export-sheet--switch-row {
      min-height: 64px;
      padding: 8px 24px 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--bc-text);
    }

    .bc-export-sheet--texts {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .bc-export-sheet--headline {
      font-size: 16px;
      line-height: 24px;
    }

    .bc-export-sheet--supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-export-sheet--switch-row {
      padding-left: 24px;
      border-top: 1px solid var(--bc-row-divider);
      margin-top: 4px;
    }

    .toggle {
      flex: none;
    }

    .bc-export-sheet--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 24px 0;
    }

    .bc-export-sheet--actions button {
      width: auto;
      min-height: 40px;
      padding: 0 20px;
      border-radius: 20px;
      border: none;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
    }

    .bc-export-sheet--text-button {
      background: none;
      color: var(--bc-text);
    }

    .bc-export-sheet--filled {
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
    }
  }
</style>
