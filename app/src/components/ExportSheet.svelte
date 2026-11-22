<script>
  // @ts-check
  import { deviceStore } from '../lib/device-store.js';
  // « Exporter le carnet » and « Exporter N plongées » (docs/mockups/carnet-export-android.dc.html,
  // android-tablette-carnet-exporter-paysage; task 2026-11-22-324): the formats as plain rows (ExportFormats.svelte), the
  // « Anonymiser » switch (off by default), then Annuler / Exporter. The phone shows them in an MD3 modal bottom sheet, the
  // tablet in a dialog. The last format is remembered on the device.
  import { Sheet } from 'framework7-svelte';
  import { onMount } from 'svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import ExportFormats from './ExportFormats.svelte';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { t } from '../lib/i18n.js';
  import { layout } from '../lib/layout.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { exportFormats, isUpload, rememberable, usableFormat } from '../lib/desktop-export.js';

  /** @typedef {'benthic'|'uddf'|'ssrf'|'csv'|'csvProfiles'|'pdf'} ExportFormat */

  /**
   * @type {{
   *   count: number,
   *   whole?: boolean,
   *   logbookName?: string,
   *   onexport: (format: ExportFormat, anonymize: boolean, showName: boolean, withMedia: boolean) => void,
   *   onclose: () => void,
   * }}
   */
  let { count, whole = false, logbookName = '', onexport, onclose } = $props();

  const KEY = 'od.exportFormat';
  // « Fichier Benthic » comes first, for the whole logbook only (task 2026-11-22-323).
  // svelte-ignore state_referenced_locally
  const FORMATS = exportFormats(whole);
  // svelte-ignore state_referenced_locally
  let format = $state(usableFormat(String(deviceStore.getItem(KEY) ?? ''), whole));
  let anonymize = $state(false);
  // « Inclure les photos et vidéos »: on by default, in the .benthic row only.
  let withMedia = $state(true);
  // « Mon nom dans l’en-tête » (task 2026-11-19-312): for the PDF only, on by default, offered when the profile has a name.
  let showName = $state(true);
  const fullName = $derived(diver.info.fullName);
  const phone = $derived(layout.phone);
  onMount(() => {
    if (!diver.ready) loadProfile().catch((e) => console.error('Reading the profile', e));
  });
  let opened = $state(true);

  function submit() {
    if (isUpload(format)) {
      // The divelogs.de upload has no sign-in or progress screen yet (task 2026-11-22-324): the row says so and the dialog stays.
      showSnackbar(t('export.divelogsSoon'));
      return;
    }
    if (rememberable(format)) deviceStore.setItem(KEY, format);
    opened = false;
    onexport(/** @type {ExportFormat} */ (format), anonymize, showName, withMedia);
    if (!phone) onclose();
  }
  const cancel = () => (phone ? (opened = false) : onclose());
</script>

{#snippet content()}
  <ExportFormats formats={FORMATS} {format} bind:withMedia onselect={(f) => (format = f)} label={t('export.formatsLabel')} />
  {#if format !== 'benthic' && !isUpload(format)}
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
  {/if}
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
{/snippet}

{#if phone}
  <Sheet {opened} swipeToClose backdrop class="bc-export-sheet bc-sheet-dialog" style="height: auto" onSheetClosed={onclose}>
    <div class="bc-export-sheet--sheet" role="dialog" aria-labelledby="od-export-title">
      <div class="bc-export-sheet--handle" aria-hidden="true"></div>
      <h2 id="od-export-title" class="bc-export-sheet--title">{whole ? t('export.titleLogbook') : t('export.title', { n: count })}</h2>
      <p class="bc-export-sheet--text">{whole ? t('export.textLogbook', { name: logbookName, n: count }) : t('export.textSelection')}</p>
      <div class="bc-export-sheet--formats">{@render content()}</div>
      <p class="bc-export-sheet--footnote">{t('export.footnotePhone')}</p>
      <div class="bc-export-sheet--actions">
        <button type="button" class="bc-export-sheet--text-button" onclick={cancel}>{t('dialog.cancel')}</button>
        <button type="button" class="bc-export-sheet--filled" onclick={submit}>{t('export.action')}</button>
      </div>
    </div>
  </Sheet>
{:else}
  <Md3Dialog
    class="bc-export-sheet bc-export-sheet--dialog"
    title={whole ? t('export.titleLogbook') : t('export.title', { n: count })}
    text={whole ? t('export.textLogbook', { name: logbookName, n: count }) : t('export.textSelection')}
    oncancel={onclose}
  >
    <div class="bc-export-sheet--formats">{@render content()}</div>
    {#snippet actions()}
      <span class="bc-export-sheet--footnote bc-export-sheet--footnote-inline">{t('export.footnoteTablet')}</span>
      <button type="button" onclick={onclose}>{t('dialog.cancel')}</button>
      <button type="button" onclick={submit}>{t('export.action')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer od.components {
    :global(.bc-export-sheet.sheet-modal) {
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

    .bc-export-sheet--formats {
      padding: 0 24px;
    }

    .bc-export-sheet--footnote {
      margin: 12px 24px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* In the tablet dialog the footnote sits at the start of the buttons' row. */
    .bc-export-sheet--footnote-inline {
      flex: 1;
      min-width: 0;
      margin: 0;
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
      padding-left: 4px;
      padding-right: 4px;
    }

    .toggle {
      flex: none;
    }

    .bc-export-sheet--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 24px 0;
      & button {
        width: auto;
        min-height: 40px;
        padding: 0 20px;
        border-radius: 20px;
        border: none;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
      }
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
