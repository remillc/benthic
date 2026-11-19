<script>
  // @ts-check
  // « Supprimer le Shearwater Perdix 2 ? » (task 2026-11-19-306, docs/mockups/profil-piece-supprimer-android.dc.html):
  // the same words on every device, in each platform's alert style (Md3Dialog draws the iOS one on iOS). The
  // dives made with the computer stay in the logbook; only the piece leaves the equipment and the kits.
  import Md3Dialog from './Md3Dialog.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ name: string, onconfirm: () => void, oncancel: () => void }} */
  let { name, onconfirm, oncancel } = $props();
</script>

<Md3Dialog title={t('gear.computerDelete.title', { name })} text={t('gear.computerDelete.text')} role="alertdialog" {oncancel}>
  <span></span>
  {#snippet actions()}
    <button type="button" onclick={oncancel}>{t('gear.computerDelete.cancel')}</button>
    <button type="button" class="od-computer-delete--confirm" onclick={onconfirm}>{t('gear.computerDelete.confirm')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    :global(.od-md3-dialog--actions button.od-computer-delete--confirm) {
      color: var(--od-alarm);
    }
  }
</style>
