<script>
  // @ts-check
  // The list of « Autre équipement » of the desktop detail's Équipement tab (tasks 2026-11-16-262 and 2026-11-23-366): two
  // columns of 56 px grey rows, each with a 36 px white round tile holding the gear icon, the name and a 48 px cross that
  // removes the item from this dive. Adding is the card's « + Ajouter » button (DesktopDiveFields).
  //
  // Nothing here reads or writes any storage: the parent gives the props `items` (the list of this dive) and `onremove`; a
  // row has no cross without `onremove`. The icon is the one of the phone (GearIcon): a piece named « Saucisse » shows the
  // surface marker buoy (task 2026-11-19-288), a knife the dive knife drawing.
  import Icon from './Icon.svelte';
  import GearIcon from './GearIcon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   items?: { id: string, name: string, type?: import('../lib/inventory.js').GearType, line?: string }[],
   *   onremove?: (id: string) => void,
   * }}
   */
  let { items = [], onremove } = $props();
</script>

<div class="bc-desktop-other-gear" role="list" aria-label={t('desktopDetail.otherGearList')}>
  {#each items as item (item.id)}
    <div class="bc-desktop-other-gear--tile" role="listitem">
      <span class="bc-desktop-other-gear--icon" aria-hidden="true"><GearIcon type={item.type ?? 'other'} name={item.name} size={20} /></span>
      <span class="bc-desktop-other-gear--texts"><span class="bc-desktop-other-gear--name">{item.name}</span>{#if item.line}<span class="bc-desktop-other-gear--line">{item.line}</span>{/if}</span>
      {#if onremove}
        <button type="button" class="bc-desktop-other-gear--remove" aria-label={t('desktopDetail.otherGearRemove', { name: item.name })} title={t('desktopDetail.otherGearRemoveTip')} onclick={() => onremove?.(item.id)}><Icon name="close" size={20} /></button>
      {/if}
    </div>
  {/each}
</div>

<style>
  @layer bc.components {
    .bc-desktop-other-gear {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
      gap: 8px 12px;
    }

    .bc-desktop-other-gear--tile {
      box-sizing: border-box;
      height: 56px;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 4px 0 10px;
      border-radius: 12px;
      background: var(--bc-field-rest);
      color: var(--bc-text);
      font-size: 15px;
    }

    .bc-desktop-other-gear--icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--bc-surface);
      color: var(--bc-on-table-selected);
    }

    .bc-desktop-other-gear--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-desktop-other-gear--name,
    .bc-desktop-other-gear--line {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bc-desktop-other-gear--line {
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
    }

    .bc-desktop-other-gear--remove {
      flex: none;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text-2);
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
        color: var(--bc-text);
      }
    }
  }
</style>
