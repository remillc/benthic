<script>
  // @ts-check
  // « Autre équipement » in « Modifier une plongée » (task 2026-11-17-267,
  // docs/mockups-release/edition-equipement-plus-android.dc.html): the pieces of this dive with the OpenDives+
  // chip, a ✕ on each to remove it from this dive only, then « Ajouter de l'équipement ». A piece outside the
  // inventory says « Hors inventaire » in its sub-line.
  import { f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import GearIcon from './GearIcon.svelte';
  import OdPlusChip from './OdPlusChip.svelte';
  import AddEquipmentSheet from './AddEquipmentSheet.svelte';
  import { gear, gearMap } from '../lib/inventory.svelte.js';
  import { isSubscriber } from '../lib/logbook.svelte.js';
  import { removeFromEquipment } from '../lib/inventory.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ equipment: import('../lib/inventory.js').DiveEquipment }} */
  let { equipment = $bindable() } = $props();

  let adding = $state(false);
  /** Only an OpenDives+ account changes the equipment of a dive; without one the block shows and stays inert. */
  const plus = $derived(isSubscriber());
  const locked = $derived(gear.readOnly || !plus);

  /** The pieces of the dive that still exist in the inventory. */
  const pieces = $derived(equipment.gearIds.map((id) => gearMap().get(id)).filter((g) => !!g));
  const empty = $derived(!pieces.length && !equipment.adhoc.length);

  function openAdd() {
    if (!plus) return;
    if (gear.readOnly) showSnackbar(t('gear.inventory.readOnlyRefused'));
    else {
      // The « Annuler » of a kit just applied would sit over the sheet's buttons.
      f7.toast.close();
      adding = true;
    }
  }
</script>

<h3 class="od-dive-gear--sub od-dive-gear--other-head">
  {t('gear.diveGear.other')}<OdPlusChip onLight />
</h3>

{#if !empty}
  <ul class="od-dive-gear--list">
    {#each pieces as g (g?.id)}
      {#if g}
        <li class="od-dive-gear--row">
          <span class="od-dive-gear--icon"><GearIcon type={g.type} name={g.name} size={22} piece={g} tile={40} /></span>
          <span class="od-dive-gear--texts">
            <span class="od-dive-gear--name">{g.name}</span>
            <span class="od-dive-gear--line">{g.note || t(`gear.inventory.type.${g.type}`)}</span>
          </span>
          <button type="button" class="od-dive-gear--remove" disabled={locked} aria-label={t('gear.diveGear.remove', { name: g.name })} onclick={() => (equipment = removeFromEquipment(equipment, { gearId: g.id }))}>
            <Icon name="close" size={20} />
          </button>
        </li>
      {/if}
    {/each}
    {#each equipment.adhoc as p (p.id)}
      <li class="od-dive-gear--row">
        <span class="od-dive-gear--icon"><GearIcon type="other" name={p.name} size={22} /></span>
        <span class="od-dive-gear--texts">
          <span class="od-dive-gear--name">{p.name}</span>
          <span class="od-dive-gear--line">{t('gear.diveGear.outside')}</span>
        </span>
        <button type="button" class="od-dive-gear--remove" disabled={locked} aria-label={t('gear.diveGear.remove', { name: p.name })} onclick={() => (equipment = removeFromEquipment(equipment, { adhocId: p.id }))}>
          <Icon name="close" size={20} />
        </button>
      </li>
    {/each}
  </ul>
{/if}

<button type="button" class="od-dive-gear--add" disabled={!plus} onclick={openAdd}>
  <Icon name="plus" size={20} />{t('gear.diveGear.add')}
</button>
{#if !plus}<p class="od-dive-gear--locked">{t('gear.diveGear.plusOnly')}</p>{:else if gear.readOnly}<p class="od-dive-gear--locked">{t('gear.diveGear.locked')}</p>{/if}

<AddEquipmentSheet opened={adding} {equipment} onclose={() => (adding = false)} onadd={(next) => (equipment = next)} />

<style>
  @layer od.components {
    .od-dive-gear--sub {
      margin: 20px 16px 4px;
      font-size: 14px;
      font-weight: 600;
    }

    .od-dive-gear--other-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .od-dive-gear--list {
      margin: 0;
      padding: 0 12px;
      list-style: none;
    }

    .od-dive-gear--row {
      min-height: 56px;
      padding: 4px 0 4px 4px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-dive-gear--icon {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-dive-gear--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-dive-gear--name {
      font-size: 16px;
      line-height: 22px;
    }

    .od-dive-gear--line {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-dive-gear--remove {
      flex: none;
      width: 48px;
      height: 48px;
      border: none;
      background: none;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--od-text);
    }

    .od-dive-gear--remove:disabled {
      opacity: 0.38;
    }

    .od-dive-gear--add {
      width: auto;
      max-width: calc(100% - 24px);
      box-sizing: border-box;
      margin: 4px 12px 8px;
      height: 40px;
      padding: 0 16px 0 12px;
      border: var(--od-outline-width) solid var(--od-outline);
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: none;
      color: var(--od-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-dive-gear--locked {
      margin: 0 16px 8px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
  }
</style>
