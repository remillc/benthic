<script>
  // @ts-check
  // « Renommer l'ordinateur » in « Modifier une plongée » (task 2026-11-17-267): the same rename as
  // Réglages → Ordinateurs du carnet. It changes the computer's name in the whole logbook, one undoable step,
  // and the dialog says so. A computer without a serial number cannot be named (the name is kept by serial).
  import Md3Dialog from './Md3Dialog.svelte';
  import TextField from './TextField.svelte';
  import { computerChange } from '../lib/dive-computers.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   computer: { model: string, serial: string, nickname: string },
   *   oncancel: () => void,
   *   ondone: () => void,
   * }}
   */
  let { computer, oncancel, ondone } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(computer.nickname || computer.model);
  let saving = $state(false);
  const typed = $derived(name.trim());

  async function rename() {
    if (!typed || saving) return;
    saving = true;
    // Back to the model's own name: no nickname (the same rule as the settings screen).
    const value = typed === computer.model ? '' : typed;
    try {
      if (value !== computer.nickname) await computerChange({ action: 'rename', model: computer.model, serial: computer.serial, value });
      showSnackbar(t('gear.diveGear.renamed'));
      ondone();
    } catch (e) {
      console.error('Rename computer', e);
      showSnackbar(t('gear.diveGear.renameFailed'));
      saving = false;
    }
  }
</script>

<Md3Dialog title={t('gear.diveGear.renameTitle')} text={t('gear.diveGear.renameText')} {oncancel}>
  <div class="od-rename-computer--field">
    <TextField label={t('gear.diveGear.renameField')} bind:value={name} invalid={!typed && name !== ''} supporting={!typed ? t('gear.diveGear.renameEmpty') : ''} />
  </div>
  {#snippet actions()}
    <button type="button" onclick={oncancel}>{t('gear.addSheet.cancel')}</button>
    <button type="button" disabled={!typed || saving} onclick={rename}>{t('gear.diveGear.renameSave')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .od-rename-computer--field {
      padding: 0 24px;
    }
  }
</style>
