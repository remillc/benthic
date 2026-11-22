<script>
  // @ts-check
  import { onMount } from 'svelte';
  import { BenthicCore } from 'benthic-core';
  import { showSnackbar } from '../lib/snackbar.js';
  import { renumberDives } from '../lib/logbook.svelte.js';
  import { renumberFromPlan } from '../lib/renumber-from.js';
  import { offerUndo } from '../lib/undo.js';
  import { t } from '../lib/i18n.js';
  import Md3Dialog from './Md3Dialog.svelte';
  import TextField from './TextField.svelte';

  /** @type {{ id: number, oncancel: () => void, ondone: () => void }} */
  let { id, oncancel, ondone } = $props();
  let text = $state('');
  let busy = $state(false);
  let loading = $state(true);
  /** @type {{id: number, number: number}[]} */
  let dives = $state([]);
  const wanted = $derived(/^\d{1,10}$/.test(text.trim()) ? Number(text.trim()) : 0);
  const plan = $derived(renumberFromPlan(dives, id, wanted));
  const tooLarge = $derived(!!plan && wanted + plan.ids.length - 1 >= 2147483647);
  const invalid = $derived(wanted < 1 || !plan || tooLarge);

  function failed(/** @type {unknown} */ error) {
    console.error('Renumber from dive', error);
    const code = String(/** @type {any} */ (error)?.message ?? '');
    showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('renumberFrom.failed'));
    oncancel();
  }

  onMount(() => {
    let active = true;
    BenthicCore.listLoadedDives({ includeInvalid: true }).then((all) => {
      if (!active) return;
      const initial = renumberFromPlan(all, id);
      if (!initial) throw new Error('NOT_FOUND');
      dives = all;
      text = String(initial.suggested);
      loading = false;
    }).catch((error) => { if (active) failed(error); });
    return () => { active = false; };
  });

  async function confirm() {
    if (busy || loading || invalid || plan?.conflict !== null) return;
    busy = true;
    const first = wanted;
    try {
      const all = await BenthicCore.listLoadedDives({ includeInvalid: true });
      const latest = renumberFromPlan(all, id, first);
      if (!latest) throw new Error('NOT_FOUND');
      dives = all;
      if (latest.conflict !== null || first + latest.ids.length - 1 >= 2147483647) {
        busy = false;
        return;
      }
      await renumberDives(latest.ids, first);
      ondone();
      offerUndo(t('renumber.done'));
    } catch (error) {
      failed(error);
    }
  }
</script>

<Md3Dialog class="bc-renumber-from-dialog" title={t('renumberFrom.title')} text={t('renumberFrom.text')} oncancel={() => { if (!busy) oncancel(); }}>
  <div class="bc-renumber-from-dialog--field">
    <TextField
      label={t('renumber.start')}
      bind:value={text}
      inputmode="numeric"
      disabled={busy || loading}
      invalid={!loading && (invalid || plan?.conflict !== null)}
      supporting={loading ? '' : tooLarge ? t('renumberFrom.tooLarge') : invalid ? t('renumber.invalid') : plan?.conflict !== null ? t('renumberFrom.conflict', { n: String(plan?.conflict) }) : ''}
    />
  </div>
  {#snippet actions()}
    <button type="button" onclick={oncancel} disabled={busy}>{t('dialog.cancel')}</button>
    <button type="button" onclick={confirm} disabled={busy || loading || invalid || plan?.conflict !== null}>{t('renumber.action')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-renumber-from-dialog--field {
      --bc-field-margin: 24px;
    }
  }
</style>
