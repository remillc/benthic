<script>
  // @ts-check
  // « Exporter ou imprimer… » (task 2026-11-17-267): the pieces to send as a CSV through the system's share sheet,
  // all chosen at first. A bottom sheet on a phone.
  import { Sheet } from 'framework7-svelte';
  import { Share } from '@capacitor/share';
  import GearPicker from './GearPicker.svelte';
  import { groupGear } from '../lib/inventory.js';
  import { gearCsv } from '../lib/gear-export.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ opened: boolean, pieces: import('../lib/inventory.js').Gear[], onclose: () => void }} */
  let { opened, pieces, onclose } = $props();

  /** @type {string[]} */
  let selected = $state([]);
  $effect(() => {
    if (opened) selected = pieces.map((g) => g.id);
  });
  const groups = $derived(groupGear(pieces));

  async function send() {
    const chosen = pieces.filter((g) => selected.includes(g.id));
    if (!chosen.length) return;
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

<Sheet class="bc-gear-sheet" {opened} onSheetClosed={onclose} backdrop swipeToClose push={false} aria-label={t('gear.inventory.exportTitle')}>
  <div class="bc-gear-sheet--content">
    <h2 class="bc-gear-sheet--title">{t('gear.inventory.exportTitle')}</h2>
    <p class="bc-gear-sheet--count">{t('gear.inventory.exportChosen', { n: selected.length })}</p>
    <div class="bc-gear-sheet--scroll"><GearPicker {groups} bind:selected /></div>
    <div class="bc-gear-sheet--actions">
      <button type="button" class="bc-gear-sheet--text" onclick={onclose}>{t('gear.addSheet.cancel')}</button>
      <button type="button" class="bc-gear-sheet--main" disabled={!selected.length} onclick={send}>{t('gear.inventory.exportAction')}</button>
    </div>
  </div>
</Sheet>

<style>
  @layer od.components {
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
      margin: 0 24px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
    }

    .bc-gear-sheet--count {
      margin: 4px 24px 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-gear-sheet--scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
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
    }

    .bc-gear-sheet--main:disabled {
      opacity: 0.38;
    }
  }
</style>
