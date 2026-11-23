<script>
  // @ts-check
  // « Clé de secours, offre au premier envoi » (inbox task 2026-11-23-338, item 9; Benthic+ only): offered strongly at the
  // first sync, not forced. « Plus tard » (`onlater`) / « Créer la clé » (`oncreate`).
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ oncreate: () => void, onlater: () => void, busy?: boolean }} */
  let { oncreate, onlater, busy = false } = $props();
</script>

<Md3Dialog title={t('accountSync.key.offerTitle')} text={t('accountSync.key.offerText')} class="bc-recovery-offer" oncancel={onlater}>
  {#snippet icon()}<span class="bc-recovery-key-icon" style="color: var(--bc-secondary)"><Icon name="key" size={32} /></span>{/snippet}
  <span></span>
  {#snippet actions()}
    <button type="button" data-action="later" disabled={busy} onclick={onlater}>{t('accountSync.key.later')}</button>
    <button type="button" data-action="create" disabled={busy} onclick={oncreate}>{t('accountSync.key.create')}</button>
  {/snippet}
</Md3Dialog>
