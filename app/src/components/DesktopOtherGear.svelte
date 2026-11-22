<script>
  // @ts-check
  // « Autre équipement » of the desktop detail's Équipement tab (task 2026-11-16-262; mock-up
  // bureau-carnet-onglet-equipement): two columns of tiles, each with an icon in a blue circle, the
  // name and a cross that removes the item from this dive, then a dashed « Ajouter de l’équipement » tile.
  //
  // Nothing here reads or writes any storage: the parent gives the three props `items` (the list of this
  // dive), `onadd` and `onremove`. Without `onadd` the add tile is disabled (the alpha edition, where the
  // list is not stored), and a tile has no cross without `onremove`. The icon is the one of the phone
  // (GearIcon): a piece named « Saucisse » shows the surface marker buoy (task 2026-11-19-288).
  import Icon from './Icon.svelte';
  import GearIcon from './GearIcon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   items?: { id: string, name: string, type?: import('../lib/inventory.js').GearType }[],
   *   onadd?: () => void,
   *   onremove?: (id: string) => void,
   *   locked?: boolean,
   * }}
   */
  let { items = [], onadd, onremove, locked = false } = $props();
</script>

<div class="bc-desktop-other-gear" class:bc-desktop-other-gear--locked={locked} role="list" aria-label={t('desktopDetail.otherGearList')}>
  {#each items as item (item.id)}
    <div class="bc-desktop-other-gear--tile" role="listitem">
      <span class="bc-desktop-other-gear--icon" aria-hidden="true"><GearIcon type={item.type ?? 'other'} name={item.name} size={18} /></span>
      <span class="bc-desktop-other-gear--name">{item.name}</span>
      {#if onremove}
        <button type="button" class="bc-desktop-other-gear--remove" aria-label={t('desktopDetail.otherGearRemove', { name: item.name })} title={t('desktopDetail.otherGearRemoveTip')} onclick={() => onremove?.(item.id)}><Icon name="close" size={20} /></button>
      {/if}
    </div>
  {/each}
  <button type="button" class="bc-desktop-other-gear--add" disabled={!onadd} title={onadd ? undefined : t(locked ? 'desktopDetail.otherGearPlusOnly' : 'desktopDetail.otherGearSoon')} onclick={() => onadd?.()}>
    <span class="bc-desktop-other-gear--plus" aria-hidden="true"><Icon name="plus" size={20} /></span>{t('desktopDetail.otherGearAdd')}
  </button>
</div>

<style>
  @layer bc.components {
    .bc-desktop-other-gear {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
      gap: 8px 12px;
    }

    .bc-desktop-other-gear--tile,
    .bc-desktop-other-gear--add {
      box-sizing: border-box;
      height: 48px;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      border-radius: 12px;
      font-size: 15px;
    }

    .bc-desktop-other-gear--tile {
      padding: 0 4px 0 8px;
      background: var(--bc-surface);
      border: 1px solid var(--bc-surface-container-highest);
      color: var(--bc-text);
    }

    .bc-desktop-other-gear--icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--bc-secondary-container);
      color: var(--bc-on-secondary-container);
    }

    .bc-desktop-other-gear--name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bc-desktop-other-gear--remove {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text-2);
      cursor: pointer;
    }

    .bc-desktop-other-gear--add {
      padding: 0 8px;
      border: 1.5px dashed var(--bc-gas-card-add-outline);
      background: none;
      color: var(--bc-on-table-selected);
      font: inherit;
      font-weight: 500;
      cursor: pointer;
      &:disabled {
        opacity: 0.55;
        cursor: default;
      }
    }

    .bc-desktop-other-gear--plus {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
    }
  }
</style>
