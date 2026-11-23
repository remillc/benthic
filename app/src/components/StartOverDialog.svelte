<script>
  // @ts-check
  // « Repartir sans les données chiffrées » (inbox task 2026-11-23-338, item 6; Benthic+ only): the destructive dialog,
  // « Effacer et repartir » in error red. It erases the sealed files from the account on every device (`onstartover`) and keeps
  // the logbook, gear, kits and maintenance.
  import Md3Dialog from './Md3Dialog.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ onstartover: () => void, oncancel: () => void, busy?: boolean }} */
  let { onstartover, oncancel, busy = false } = $props();
</script>

<Md3Dialog title={t('accountSync.startOver.title')} text={t('accountSync.startOver.text')} role="alertdialog" class="bc-start-over" {oncancel}>
  <span></span>
  {#snippet actions()}
    <button type="button" data-action="cancel" disabled={busy} onclick={oncancel}>{t('accountSync.startOver.cancel')}</button>
    <button type="button" class="bc-start-over--confirm" data-action="start-over" disabled={busy} onclick={onstartover}>{t('accountSync.startOver.confirm')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    :global(.bc-start-over .bc-md3-dialog--actions .bc-start-over--confirm) {
      color: var(--bc-alarm);
    }
  }
</style>
