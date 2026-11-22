<script>
  // @ts-check
  import Md3Dialog from './Md3Dialog.svelte';
  import TextField from './TextField.svelte';
  import { t } from '../lib/i18n.js';
  import { displayName, validLogbookName } from '../lib/desktop-logbooks.js';
  import { renameLogbook, windowLogbook } from '../lib/desktop-logbooks.svelte.js';

  /** @type {{ onclose: () => void }} */
  let { onclose } = $props();
  const entry = windowLogbook();
  let name = $state(entry ? displayName(entry, t) : '');
  let busy = $state(false);
  let error = $state('');
  /** @type {HTMLElement|undefined} */
  let field = $state();
  const valid = $derived(validLogbookName(name));

  $effect(() => {
    const timer = setTimeout(() => {
      const input = field?.querySelector('input');
      input?.focus();
      input?.select();
    }, 0);
    return () => clearTimeout(timer);
  });

  function cancel() {
    if (!busy) onclose();
  }

  async function save() {
    if (busy || !valid) return;
    busy = true;
    error = '';
    try {
      await renameLogbook(name.trim());
      onclose();
    } catch (e) {
      console.error('Renaming the logbook', e);
      error = t('desktopLogbooks.rename.failed');
    } finally {
      busy = false;
    }
  }

  /** @param {KeyboardEvent} event */
  function keydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
  }
</script>

<Md3Dialog class="bc-desktop-rename-logbook" title={t('desktopLogbooks.rename.title')} oncancel={cancel}>
  {#snippet children()}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="bc-desktop-rename-logbook--field" bind:this={field} onkeydown={keydown}>
      <TextField label={t('desktopLogbooks.rename.name')} bind:value={name} disabled={busy} />
    </div>
    {#if error}<p class="bc-desktop-rename-logbook--error" role="alert">{error}</p>{/if}
  {/snippet}
  {#snippet actions()}
    <button type="button" disabled={busy} onclick={cancel}>{t('dialog.cancel')}</button>
    <button type="button" disabled={busy || !valid} onclick={save}>{t('desktopLogbooks.rename.save')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .bc-desktop-rename-logbook--field {
      --bc-field-margin: 24px;
    }
    .bc-desktop-rename-logbook--error {
      margin: 12px 24px 0;
      color: var(--bc-alarm);
    }
  }
</style>
