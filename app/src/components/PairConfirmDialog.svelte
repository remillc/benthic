<script>
  // @ts-check
  // « Appareil déjà jumelé, confirmer le jumelage » (inbox task 2026-11-23-338, item 8; Benthic+ only): « Jumeler « <name> » ? ».
  // Nothing is committed before « Jumeler » (`onconfirm`); « Refuser » (`onrefuse`) discards the request. `busy` disables
  // both while the key is wrapped and pushed.
  import Md3Dialog from './Md3Dialog.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ deviceName: string, onconfirm: () => void, onrefuse: () => void, busy?: boolean }} */
  let { deviceName, onconfirm, onrefuse, busy = false } = $props();
</script>

<Md3Dialog title={t('accountSync.pair.confirmTitle', { name: deviceName })} text={t('accountSync.pair.confirmText')} class="bc-pair-confirm" oncancel={onrefuse}>
  <span></span>
  {#snippet actions()}
    <button type="button" data-action="refuse" disabled={busy} onclick={onrefuse}>{t('accountSync.pair.refuse')}</button>
    <button type="button" data-action="confirm" disabled={busy} onclick={onconfirm}>{t('accountSync.pair.confirm')}</button>
  {/snippet}
</Md3Dialog>
