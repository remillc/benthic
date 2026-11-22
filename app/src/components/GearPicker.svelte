<script>
  // @ts-check
  // The inventory by type with a checkbox on each piece (task 2026-11-17-267): the new kit and the
  // « Ajouter de l'équipement » sheet (docs/mockups-release/profil-kit-nouveau-android.dc.html,
  // equipement-ajout-android.dc.html). `groups` come from groupGear; `selected` is the chosen ids.
  import GearIcon from './GearIcon.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   groups: { group: string, items: import('../lib/inventory.js').Gear[] }[],
   *   selected: string[],
   *   picker?: boolean,
   *   disabled?: boolean,
   *   line?: (g: import('../lib/inventory.js').Gear) => string,
   *   warning?: (g: import('../lib/inventory.js').Gear) => string,
   * }}
   * picker: group titles are the types' plurals (the sheet), else the inventory page's groups.
   * warning: a line in red with a warning icon under the piece (task 2026-11-19-308: « Inspection visuelle en retard »); the piece stays selectable.
   */
  let { groups, selected = $bindable(), picker = false, disabled = false, line = (g) => g.note || '', warning = () => '' } = $props();

  /** @param {string} id */
  function toggle(id) {
    if (disabled) return;
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }
</script>

{#each groups as { group, items } (group)}
  <h3 class="bc-gear-picker--group">{t(picker ? `gear.inventory.typePlural.${group}` : `gear.inventory.group.${group}`)}</h3>
  <ul class="bc-gear-picker--list">
    {#each items as g (g.id)}
      {@const on = selected.includes(g.id)}
      <li>
        <button type="button" class="bc-gear-picker--row" role="checkbox" aria-checked={on} {disabled} onclick={() => toggle(g.id)}>
          <span class="bc-gear-picker--check" class:bc-gear-picker--on={on} aria-hidden="true">{#if on}<Icon name="check" size={16} weight={2.6} />{/if}</span>
          <span class="bc-gear-picker--icon"><GearIcon type={g.type} name={g.name} size={22} piece={g} tile={40} /></span>
          <span class="bc-gear-picker--texts">
            <span class="bc-gear-picker--name">{g.name}</span>
            {#if line(g)}<span class="bc-gear-picker--line">{line(g)}</span>{/if}
            {#if warning(g)}<span class="bc-gear-picker--warning"><Icon name="warning" size={16} />{warning(g)}</span>{/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
{/each}

<style>
  @layer bc.components {
    .bc-gear-picker--group {
      margin: 16px 16px 4px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-gear-picker--warning {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-alarm);
    }

    .bc-gear-picker--list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .bc-gear-picker--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 6px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      &:disabled {
        opacity: 0.6;
        cursor: default;
      }
    }

    .bc-gear-picker--check {
      flex: none;
      width: 22px;
      height: 22px;
      box-sizing: border-box;
      border: 2px solid var(--bc-outline);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-gear-picker--on {
      background: var(--bc-secondary);
      border-color: var(--bc-secondary);
      color: var(--bc-on-secondary);
    }

    .bc-gear-picker--icon {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-gear-picker--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-gear-picker--name {
      font-size: 16px;
      line-height: 22px;
    }

    .bc-gear-picker--line {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }
  }
</style>
