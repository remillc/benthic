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
   * }}
   */
  let { items = [], onadd, onremove } = $props();
</script>

<div class="od-desktop-other-gear" role="list" aria-label={t('desktopDetail.otherGearList')}>
  {#each items as item (item.id)}
    <div class="od-desktop-other-gear--tile" role="listitem">
      <span class="od-desktop-other-gear--icon" aria-hidden="true"><GearIcon type={item.type ?? 'other'} name={item.name} size={18} /></span>
      <span class="od-desktop-other-gear--name">{item.name}</span>
      {#if onremove}
        <button type="button" class="od-desktop-other-gear--remove" aria-label={t('desktopDetail.otherGearRemove', { name: item.name })} title={t('desktopDetail.otherGearRemoveTip')} onclick={() => onremove?.(item.id)}><Icon name="close" size={20} /></button>
      {/if}
    </div>
  {/each}
  <button type="button" class="od-desktop-other-gear--add" disabled={!onadd} title={onadd ? undefined : t('desktopDetail.otherGearSoon')} onclick={() => onadd?.()}>
    <span class="od-desktop-other-gear--plus" aria-hidden="true"><Icon name="plus" size={20} /></span>{t('desktopDetail.otherGearAdd')}
  </button>
</div>

<style>
  @layer od.components {
    .od-desktop-other-gear {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
      gap: 8px 12px;
    }

    .od-desktop-other-gear--tile,
    .od-desktop-other-gear--add {
      box-sizing: border-box;
      height: 48px;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      border-radius: 12px;
      font-size: 15px;
    }

    .od-desktop-other-gear--tile {
      padding: 0 4px 0 8px;
      background: var(--od-surface);
      border: 1px solid var(--od-surface-container-highest);
      color: var(--od-text);
    }

    .od-desktop-other-gear--icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--od-secondary-container);
      color: var(--od-on-secondary-container);
    }

    .od-desktop-other-gear--name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .od-desktop-other-gear--remove {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--od-text-2);
      cursor: pointer;
    }

    .od-desktop-other-gear--add {
      padding: 0 8px;
      border: 1.5px dashed var(--od-gas-card-add-outline);
      background: none;
      color: var(--od-on-table-selected);
      font: inherit;
      font-weight: 500;
      cursor: pointer;
    }

    .od-desktop-other-gear--add:disabled {
      opacity: 0.55;
      cursor: default;
    }

    .od-desktop-other-gear--plus {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
    }
  }
</style>
