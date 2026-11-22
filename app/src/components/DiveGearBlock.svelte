<script>
  // @ts-check
  // « Autre équipement » in the dive detail (task 2026-11-17-267, docs/mockups-release/detail-equipement-plus-android.dc.html):
  // the pieces of the dive from the inventory, with the Benthic+ chip, a piece outside the inventory saying
  // « Hors inventaire » in its sub-line, and at the end the kit used, « Kit « Eau froide » ». Nothing when the
  // dive has none of this.
  import GearIcon from './GearIcon.svelte';
  import Icon from './Icon.svelte';
  import BenthicPlusChip from './BenthicPlusChip.svelte';
  import { gear, gearMap } from '../lib/inventory.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ equipment: import('../lib/inventory.js').DiveEquipment }} */
  let { equipment } = $props();

  const pieces = $derived(equipment.gearIds.map((id) => gearMap().get(id)).filter((g) => !!g));
  const kit = $derived(equipment.kitId ? gear.kits.find((k) => k.id === equipment.kitId) : undefined);
</script>

{#if pieces.length || equipment.adhoc.length || kit}
  <div class="bc-dive-gear-block">
    {#if pieces.length || equipment.adhoc.length}
      <div class="bc-dive-gear-block--head"><h3>{t('gear.diveGear.other')}</h3><BenthicPlusChip onLight /></div>
      <ul class="bc-dive-gear-block--list">
        {#each pieces as g (g?.id)}
          {#if g}
            <li class="bc-dive-gear-block--row">
              <span class="bc-dive-gear-block--icon"><GearIcon type={g.type} name={g.name} size={22} piece={g} tile={40} /></span>
              <span class="bc-dive-gear-block--texts">
                <span class="bc-dive-gear-block--name">{g.name}</span>
                <span class="bc-dive-gear-block--line">{g.note || t(`gear.inventory.type.${g.type}`)}</span>
              </span>
            </li>
          {/if}
        {/each}
        {#each equipment.adhoc as p (p.id)}
          <li class="bc-dive-gear-block--row">
            <span class="bc-dive-gear-block--icon"><GearIcon type="other" name={p.name} size={22} /></span>
            <span class="bc-dive-gear-block--texts">
              <span class="bc-dive-gear-block--name">{p.name}</span>
              <span class="bc-dive-gear-block--line">{t('gear.diveGear.outside')}</span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if kit}
      <p class="bc-dive-gear-block--kit"><Icon name="briefcase" size={20} />{t('gear.diveGear.kitDetail', { name: kit.name })}</p>
    {/if}
  </div>
{/if}

<style>
  @layer bc.components {
    .bc-dive-gear-block {
      margin-top: 8px;
      padding: 12px 16px;
      border-radius: 20px;
      background: var(--bc-surface);
    }

    .bc-dive-gear-block--head {
      display: flex;
      align-items: center;
      gap: 8px;

      h3 {
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--bc-text-2);
      }
    }

    .bc-dive-gear-block--list {
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
    }

    .bc-dive-gear-block--row {
      min-height: 52px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bc-dive-gear-block--icon {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-dive-gear-block--texts {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .bc-dive-gear-block--name {
      font-size: 16px;
      line-height: 22px;
    }

    .bc-dive-gear-block--line {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-dive-gear-block--kit {
      margin: 8px 0 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--bc-text-2);
    }
  }
</style>
