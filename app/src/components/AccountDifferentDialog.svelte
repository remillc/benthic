<script>
  // @ts-check
  // « Un autre compte » (docs/account-sync.md, « First sync of a device that already has data »; Benthic+ only): this device
  // last synced with another account, so nothing is sent until the diver chooses. « Garder séparé » leaves everything as it
  // is and sends nothing; « Utiliser ce compte » adds the data of this device to the account that is signed in now (the join
  // step then lists what matches). Driven by props and callbacks only.
  import Md3Dialog from './Md3Dialog.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ onuse: () => void, onkeep: () => void, busy?: boolean }} */
  let { onuse, onkeep, busy = false } = $props();
</script>

<Md3Dialog title={t('accountSync.different.title')} text={t('accountSync.different.text')} class="bc-different-account" oncancel={onkeep}>
  <span></span>
  {#snippet actions()}
    <button type="button" data-action="keep" disabled={busy} onclick={onkeep}>{t('accountSync.different.keep')}</button>
    <button type="button" data-action="use" disabled={busy} onclick={onuse}>{t('accountSync.different.use')}</button>
  {/snippet}
</Md3Dialog>
