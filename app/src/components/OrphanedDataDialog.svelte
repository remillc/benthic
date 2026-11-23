<script>
  // @ts-check
  // « Données chiffrées illisibles » (Benthic+ only): sealed items under a key that no device and no recovery key holds any more,
  // on a device that holds the account key (pairing cannot help). « Effacer » removes them; « Plus tard » closes (asked again
  // at the next start of the app). Driven by props and callbacks only.
  import Md3Dialog from './Md3Dialog.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ busy?: boolean, onerase: () => void, onlater: () => void }} */
  let { busy = false, onerase, onlater } = $props();
</script>

<Md3Dialog title={t('accountSync.orphans.title')} text={t('accountSync.orphans.text')} class="bc-orphaned-data" oncancel={onlater}>
  <span></span>
  {#snippet actions()}
    <button type="button" data-action="later" disabled={busy} onclick={onlater}>{t('accountSync.orphans.later')}</button>
    <button type="button" data-action="erase" disabled={busy} onclick={onerase}>{t('accountSync.orphans.erase')}</button>
  {/snippet}
</Md3Dialog>
