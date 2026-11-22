<script>
  // @ts-check
  // « Retirer le Shearwater Perdix 2 ? » (task 2026-11-19-308, docs/mockups/profil-piece-supprimer-android.dc.html and the
  // tablet and desktop `…-retirer` files; ios-profil-piece-retirer.dc.html): replaces the delete dialog of task 306. The piece
  // leaves the lists, the kits and the reminders; its maintenance history and its dives stay. An optional reason as filter chips
  // (Vendue, Perdue, Hors d'usage). On iPhone an action sheet offers each reason, and « Retirer sans raison ».
  import { onMount } from 'svelte';
  import { f7 } from 'framework7-svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { RETIRE_REASONS } from '../lib/inventory.js';
  import { retireSheetButtons } from '../lib/action-sheet.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ name: string, computer?: boolean, onconfirm: (reason: 'sold'|'lost'|'worn'|'other'|undefined) => void, oncancel: () => void }} */
  let { name, computer = false, onconfirm, oncancel } = $props();

  /** @type {'sold'|'lost'|'worn'|'other'|undefined} */
  let reason = $state();
  const suffix = $derived(computer ? '' : 'Other');
  const title = $derived(t(`gear.retire.title${suffix}`, { name }));

  onMount(() => {
    if (!ios) return;
    let picked = false;
    const sheet = f7.actions.create({
      buttons: retireSheetButtons({
        title,
        text: t(`gear.retire.textShort${suffix}`),
        reasons: RETIRE_REASONS.map((r) => ({ reason: r, label: t('gear.retire.sheet', { reason: t(`gear.retire.reason.${r}`).toLocaleLowerCase() }) })),
        none: t('gear.retire.sheetNone'),
        onPick: (r) => {
          picked = true;
          onconfirm(r);
        },
      }),
      on: {
        closed: () => {
          if (!picked) oncancel();
        },
      },
    });
    sheet.open();
    return () => sheet.destroy?.();
  });
</script>

{#if !ios}
  <Md3Dialog class="bc-retire-dialog" {title} text={t(`gear.retire.text${suffix}`)} role="alertdialog" {oncancel}>
    <div class="bc-retire-dialog--reason">
      <p id="bc-retire-reason" class="bc-retire-dialog--label">{t('gear.retire.reasonLabel')}</p>
      <div class="bc-retire-dialog--chips" role="group" aria-labelledby="bc-retire-reason">
        {#each RETIRE_REASONS as r (r)}
          <button type="button" class="bc-retire-dialog--chip" class:bc-retire-dialog--chip-on={reason === r} aria-pressed={reason === r} onclick={() => (reason = reason === r ? undefined : r)}>
            {#if reason === r}<Icon name="check" size={18} />{/if}{t(`gear.retire.reason.${r}`)}
          </button>
        {/each}
      </div>
    </div>
    {#snippet actions()}
      <button type="button" onclick={oncancel}>{t('gear.retire.cancel')}</button>
      <button type="button" onclick={() => onconfirm(reason)}>{t('gear.retire.confirm')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer bc.components {
    :global(.bc-retire-dialog .bc-retire-dialog--reason) {
      margin: 16px 24px 0;
    }

    :global(.bc-retire-dialog .bc-retire-dialog--label) {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    :global(.bc-retire-dialog .bc-retire-dialog--chips) {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    :global(.bc-retire-dialog .bc-retire-dialog--chip) {
      width: auto;
      height: 32px;
      padding: 0 12px;
      border: var(--bc-outline-width) solid var(--bc-outline);
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    :global(.bc-retire-dialog .bc-retire-dialog--chip-on) {
      border-color: transparent;
      background: var(--bc-selected-container);
    }

    :global(.bc-retire-sheet--title) {
      font-weight: 600;
    }
  }
</style>
