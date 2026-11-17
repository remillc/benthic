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

<Sheet class="od-gear-sheet" {opened} onSheetClosed={onclose} backdrop swipeToClose push={false} aria-label={t('gear.inventory.exportTitle')}>
  <div class="od-gear-sheet--content">
    <h2 class="od-gear-sheet--title">{t('gear.inventory.exportTitle')}</h2>
    <p class="od-gear-sheet--count">{t('gear.inventory.exportChosen', { n: selected.length })}</p>
    <div class="od-gear-sheet--scroll"><GearPicker {groups} bind:selected /></div>
    <div class="od-gear-sheet--actions">
      <button type="button" class="od-gear-sheet--text" onclick={onclose}>{t('gear.addSheet.cancel')}</button>
      <button type="button" class="od-gear-sheet--main" disabled={!selected.length} onclick={send}>{t('gear.inventory.exportAction')}</button>
    </div>
  </div>
</Sheet>

<style>
  @layer od.components {
    :global(.sheet-modal.od-gear-sheet) {
      --f7-sheet-bg-color: var(--od-drawer);
      height: auto;
      max-height: 85%;
      border-radius: 28px 28px 0 0;
    }

    .od-gear-sheet--content {
      display: flex;
      flex-direction: column;
      max-height: 85vh;
      padding: 20px 0 calc(12px + env(safe-area-inset-bottom));
    }

    .od-gear-sheet--title {
      margin: 0 24px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
    }

    .od-gear-sheet--count {
      margin: 4px 24px 0;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-gear-sheet--scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .od-gear-sheet--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 8px 16px 0;
    }

    .od-gear-sheet--text,
    .od-gear-sheet--main {
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-gear-sheet--main {
      background: var(--od-secondary);
      color: var(--od-on-secondary);
    }

    .od-gear-sheet--main:disabled {
      opacity: 0.38;
    }
  }
</style>
