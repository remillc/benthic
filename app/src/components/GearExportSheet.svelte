<script>
  // @ts-check
  // « Exporter ou imprimer… » of the equipment (task 2026-11-17-267, redrawn on 26 November 2026): the format (« PDF à
  // imprimer », a page in the paper of the settings; « Tableau CSV », the text the share sheet sends), the pieces to put in
  // it, all chosen at first, with « Tout cocher » / « Tout décocher », and the action that says what it makes. A bottom sheet
  // on a phone; a dialog on a tablet and on the desktop, its buttons always in view under the scrolled list.
  import { Sheet } from 'framework7-svelte';
  import { Share } from '@capacitor/share';
  import { BenthicCore } from 'benthic-core';
  import GearPicker from './GearPicker.svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import ButtonGroup from './ButtonGroup.svelte';
  import { groupGear } from '../lib/inventory.js';
  import { gearCsv, gearHtml } from '../lib/gear-export.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { letterPaper } from '../lib/share.js';
  import { desktopApp } from '../lib/layout.svelte.js';
  import { profileWide } from '../lib/profile-frame.js';
  import { formatDate } from '../lib/format.js';
  import { localDay } from '../lib/logbook-name.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ opened: boolean, pieces: import('../lib/inventory.js').Gear[], onclose: () => void }} */
  let { opened, pieces, onclose } = $props();

  /** @type {string[]} */
  let selected = $state([]);
  /** @type {'pdf'|'csv'} */
  let format = $state('pdf');
  let working = $state(false);
  $effect(() => {
    if (opened) selected = pieces.map((g) => g.id);
  });
  const groups = $derived(groupGear(pieces));
  const all = $derived(selected.length === pieces.length);
  const formats = $derived([
    { value: 'pdf', label: t('gear.inventory.exportPdf') },
    { value: 'csv', label: t('gear.inventory.exportCsv') },
  ]);

  /** The PDF of the chosen pieces: the share sheet on a phone or tablet, the save dialog on the desktop. @param {import('../lib/inventory.js').Gear[]} chosen */
  async function sendPdf(chosen) {
    const day = localDay();
    const letter = letterPaper();
    const html = gearHtml(groupGear(chosen), {
      title: t('gear.inventory.exportPdfTitle'),
      exportedOn: t('gear.inventory.exportPdfDate', { date: formatDate(day) }),
      letter,
      columns: t('gear.inventory.exportPdfColumns').split('|'),
      groupName: (group) => t(`gear.inventory.group.${group}`),
      date: formatDate,
      retired: t('gear.inventory.exportRetired'),
    });
    const name = t('gear.inventory.exportPdfFile', { day });
    const { uri } = await BenthicCore.htmlToPdf({ html, name, letter });
    if (desktopApp) {
      await /** @type {any} */ (window).benthicDesktop.saveAs({ path: uri, name });
      return;
    }
    await BenthicCore.grantShareFile({ uri, mime: 'application/pdf' });
    await Share.share({ title: name, files: [uri], dialogTitle: t('gear.inventory.exportTitle') });
  }

  async function send() {
    const chosen = pieces.filter((g) => selected.includes(g.id));
    if (!chosen.length || working) return;
    if (format === 'pdf') {
      working = true;
      try {
        await sendPdf(chosen);
        onclose();
        showSnackbar(t('gear.inventory.exportDone'));
      } catch (e) {
        // The diver closed the share sheet (nothing to tell), or the PDF failed.
        console.info('Equipment PDF', e);
        if (!/cancel/i.test(String(/** @type {any} */ (e)?.message ?? ''))) showSnackbar(t('gear.inventory.exportFailed'));
      } finally {
        working = false;
      }
      return;
    }
    const text = gearCsv(chosen, t('gear.inventory.exportHeader').split('|'), (type) => t(`gear.inventory.type.${type}`));
    onclose();
    try {
      await Share.share({ title: t('gear.inventory.exportTitle'), text, dialogTitle: t('gear.inventory.exportTitle') });
    } catch (e) {
      // The diver closed the share sheet: nothing to tell.
      console.info('Share equipment', e);
      return;
    }
    showSnackbar(t('gear.inventory.exportDone'));
  }
</script>

{#snippet body()}
  <div class="bc-gear-export--format">
    <ButtonGroup options={formats} value={format} onchange={(v) => (format = /** @type {'pdf'|'csv'} */ (v))} ariaLabel={t('gear.inventory.exportFormat')} />
  </div>
  <div class="bc-gear-export--count-row">
    <p class="bc-gear-export--count">{t('gear.inventory.exportChosen', { n: selected.length })}</p>
    <button type="button" class="bc-gear-export--all" onclick={() => (selected = all ? [] : pieces.map((g) => g.id))}>{t(all ? 'gear.inventory.exportUncheckAll' : 'gear.inventory.exportCheckAll')}</button>
  </div>
  <div class="bc-gear-export--scroll" data-bc-scroll><GearPicker {groups} bind:selected /></div>
{/snippet}

{#snippet buttons(/** @type {string} */ textClass, /** @type {string} */ mainClass)}
  <button type="button" class={textClass} onclick={onclose}>{t('gear.addSheet.cancel')}</button>
  <button type="button" class={mainClass} disabled={!selected.length || working} onclick={send}>{t(format === 'pdf' ? 'gear.inventory.exportMakePdf' : 'gear.inventory.exportMakeCsv')}</button>
{/snippet}

{#if profileWide()}
  {#if opened}
    <Md3Dialog class="bc-gear-export" title={t('gear.inventory.exportTitle')} oncancel={onclose}>
      <div class="bc-gear-export--body bc-gear-export--dialog">{@render body()}</div>
      {#snippet actions()}{@render buttons('', '')}{/snippet}
    </Md3Dialog>
  {/if}
{:else}
  <Sheet class="bc-gear-sheet" {opened} onSheetClosed={onclose} backdrop swipeToClose push={false} aria-label={t('gear.inventory.exportTitle')}>
    <div class="bc-gear-sheet--content">
      <h2 class="bc-gear-sheet--title">{t('gear.inventory.exportTitle')}</h2>
      <div class="bc-gear-export--body bc-gear-export--sheet">{@render body()}</div>
      <div class="bc-gear-sheet--actions">{@render buttons('bc-gear-sheet--text', 'bc-gear-sheet--main')}</div>
    </div>
  </Sheet>
{/if}

<style>
  @layer bc.components {
    :global(.sheet-modal.bc-gear-sheet) {
      --f7-sheet-bg-color: var(--bc-drawer);
      height: auto;
      max-height: 85%;
      border-radius: 28px 28px 0 0;
    }

    .bc-gear-sheet--content {
      display: flex;
      flex-direction: column;
      max-height: 85vh;
      padding: 20px 0 calc(12px + var(--bc-safe-bottom));
    }

    .bc-gear-sheet--title {
      margin: 0 24px 12px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
    }

    /* The format, the count with « Tout cocher », then the list: the only part that scrolls. */
    .bc-gear-export--body {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .bc-gear-export--sheet {
      flex: 1;
    }
    /* In the dialog: a bounded height, so the buttons stay in view. */
    .bc-gear-export--dialog {
      width: min(520px, 80vw);
      max-height: min(560px, 62vh);
    }

    .bc-gear-export--format {
      padding: 0 24px 12px;
    }
    .bc-gear-export--dialog .bc-gear-export--format {
      padding-inline: 0;
    }

    .bc-gear-export--count-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 12px 4px 24px;
    }
    .bc-gear-export--dialog .bc-gear-export--count-row {
      padding-inline: 0;
    }

    .bc-gear-export--count {
      margin: 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-gear-export--all {
      flex: none;
      width: auto;
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--bc-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-gear-export--scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      border-top: 1px solid var(--bc-separator);
    }

    .bc-gear-sheet--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 8px 16px 0;
    }

    .bc-gear-sheet--text,
    .bc-gear-sheet--main {
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--bc-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-gear-sheet--main {
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      &:disabled {
        opacity: 0.38;
      }
    }
  }
</style>
