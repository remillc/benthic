<script>
  // @ts-check
  // « Autre équipement » in the dive detail (task 2026-11-17-267, docs/mockups-release/detail-equipement-plus-android.dc.html):
  // the pieces of the dive from the inventory, with the OpenDives+ chip, a piece outside the inventory saying
  // « Hors inventaire » in its sub-line, and at the end the kit used, « Kit « Eau froide » ». Nothing when the
  // dive has none of this.
  import GearIcon from './GearIcon.svelte';
  import Icon from './Icon.svelte';
  import OdPlusChip from './OdPlusChip.svelte';
  import { gear, gearMap } from '../lib/inventory.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ equipment: import('../lib/inventory.js').DiveEquipment }} */
  let { equipment } = $props();

  const pieces = $derived(equipment.gearIds.map((id) => gearMap().get(id)).filter((g) => !!g));
  const kit = $derived(equipment.kitId ? gear.kits.find((k) => k.id === equipment.kitId) : undefined);
</script>

{#if pieces.length || equipment.adhoc.length || kit}
  <div class="od-dive-gear-block">
    {#if pieces.length || equipment.adhoc.length}
      <div class="od-dive-gear-block--head"><h3>{t('gear.diveGear.other')}</h3><OdPlusChip onLight /></div>
      <ul class="od-dive-gear-block--list">
        {#each pieces as g (g?.id)}
          {#if g}
            <li class="od-dive-gear-block--row">
              <span class="od-dive-gear-block--icon"><GearIcon type={g.type} size={22} /></span>
              <span class="od-dive-gear-block--texts">
                <span class="od-dive-gear-block--name">{g.name}</span>
                <span class="od-dive-gear-block--line">{g.note || t(`gear.inventory.type.${g.type}`)}</span>
              </span>
            </li>
          {/if}
        {/each}
        {#each equipment.adhoc as p (p.id)}
          <li class="od-dive-gear-block--row">
            <span class="od-dive-gear-block--icon"><GearIcon type="other" size={22} /></span>
            <span class="od-dive-gear-block--texts">
              <span class="od-dive-gear-block--name">{p.name}</span>
              <span class="od-dive-gear-block--line">{t('gear.diveGear.outside')}</span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if kit}
      <p class="od-dive-gear-block--kit"><Icon name="briefcase" size={20} />{t('gear.diveGear.kitDetail', { name: kit.name })}</p>
    {/if}
  </div>
{/if}

<style>
  @layer od.components {
    .od-dive-gear-block {
      margin-top: 8px;
      padding: 12px 16px;
      border-radius: 20px;
      background: var(--od-surface);
    }

    .od-dive-gear-block--head {
      display: flex;
      align-items: center;
      gap: 8px;

      h3 {
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--od-text-2);
      }
    }

    .od-dive-gear-block--list {
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
    }

    .od-dive-gear-block--row {
      min-height: 52px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-dive-gear-block--icon {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-dive-gear-block--texts {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .od-dive-gear-block--name {
      font-size: 16px;
      line-height: 22px;
    }

    .od-dive-gear-block--line {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-dive-gear-block--kit {
      margin: 8px 0 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--od-text-2);
    }
  }
</style>
