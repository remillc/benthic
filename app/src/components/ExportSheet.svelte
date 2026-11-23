<script>
  // @ts-check
  import { deviceStore } from '../lib/device-store.js';
  // « Exporter le carnet » and « Exporter N plongées » (docs/mockups/carnet-export-android.dc.html,
  // android-tablette-carnet-exporter-paysage; task 2026-11-22-324): the formats as plain rows (ExportFormats.svelte), the
  // « Anonymiser » switch (off by default), then Annuler / Exporter, in a basic dialog (the phone's is 16 dp from the screen
  // sides, its footer line above the buttons and its list scrolling inside; the tablet's has the line in the row of the
  // buttons). The last format is remembered on the device. « Envoyer vers divelogs.de » (task 2026-11-23-337) turns the
  // button into « Continuer » and goes on to the connection dialog (DivelogsUploadDialog.svelte).
  import { onMount } from 'svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import DivelogsUploadDialog from './DivelogsUploadDialog.svelte';
  import ExportFormats from './ExportFormats.svelte';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { t } from '../lib/i18n.js';
  import { layout } from '../lib/layout.svelte.js';
  import { exportFormats, isUpload, rememberable, usableFormat } from '../lib/desktop-export.js';

  /** @typedef {'benthic'|'uddf'|'ssrf'|'csv'|'csvProfiles'|'pdf'} ExportFormat */

  /**
   * @type {{
   *   count: number,
   *   whole?: boolean,
   *   logbookName?: string,
   *   ids?: number[],
   *   onexport: (format: ExportFormat, anonymize: boolean, showName: boolean, withMedia: boolean) => void,
   *   onclose: () => void,
   * }}
   */
  let { count, whole = false, logbookName = '', ids = [], onexport, onclose } = $props();

  const KEY = 'bc.exportFormat';
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
  let uploading = $state(false);
  const upload = $derived(isUpload(format));
  const footnote = $derived(upload ? t('export.divelogsFootnote') : phone ? t('export.footnotePhone') : t('export.footnoteTablet'));

  function submit() {
    if (upload) {
      uploading = true;
      return;
    }
    if (rememberable(format)) deviceStore.setItem(KEY, format);
    onexport(/** @type {ExportFormat} */ (format), anonymize, showName, withMedia);
    onclose();
  }
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

{#if uploading}
  <DivelogsUploadDialog {ids} {logbookName} {onclose} />
{:else}
  <Md3Dialog
    class="bc-export-sheet {phone ? 'bc-export-sheet--phone' : 'bc-export-sheet--dialog'}"
    title={whole ? t('export.titleLogbook') : t('export.title', { n: count })}
    text={whole ? t('export.textLogbook', { name: logbookName, n: count }) : t('export.textSelection')}
    oncancel={onclose}
  >
    <div class="bc-export-sheet--formats">{@render content()}</div>
    {#snippet footer()}
      {#if phone}<p class="bc-export-sheet--footnote">{footnote}</p>{/if}
    {/snippet}
    {#snippet actions()}
      {#if !phone}<span class="bc-export-sheet--footnote bc-export-sheet--footnote-inline">{footnote}</span>{/if}
      <button type="button" onclick={onclose}>{t('dialog.cancel')}</button>
      <button type="button" onclick={submit}>{upload ? t('export.continue') : t('export.action')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer bc.components {
    .bc-export-sheet--formats {
      padding: 0 24px;
    }

    .bc-export-sheet--footnote {
      margin: 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* In the tablet dialog the footnote sits at the start of the buttons' row. */
    .bc-export-sheet--footnote-inline {
      flex: 1;
      min-width: 0;
    }

    /* The phone's dialog is 16 dp from the screen sides; its list scrolls inside it. */
    :global(.bc-export-sheet--phone) :global(.bc-md3-dialog--surface) {
      width: calc(100% - 32px);
    }

    .bc-export-sheet--switch-row {
      min-height: 64px;
      padding: 8px 4px;
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

    .toggle {
      flex: none;
    }
  }
</style>
