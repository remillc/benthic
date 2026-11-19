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
   * }}
   * picker: group titles are the types' plurals (the sheet), else the inventory page's groups.
   */
  let { groups, selected = $bindable(), picker = false, disabled = false, line = (g) => g.note || '' } = $props();

  /** @param {string} id */
  function toggle(id) {
    if (disabled) return;
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }
</script>

{#each groups as { group, items } (group)}
  <h3 class="od-gear-picker--group">{t(picker ? `gear.inventory.typePlural.${group}` : `gear.inventory.group.${group}`)}</h3>
  <ul class="od-gear-picker--list">
    {#each items as g (g.id)}
      {@const on = selected.includes(g.id)}
      <li>
        <button type="button" class="od-gear-picker--row" role="checkbox" aria-checked={on} {disabled} onclick={() => toggle(g.id)}>
          <span class="od-gear-picker--check" class:od-gear-picker--on={on} aria-hidden="true">{#if on}<Icon name="check" size={16} weight={2.6} />{/if}</span>
          <span class="od-gear-picker--icon"><GearIcon type={g.type} name={g.name} size={22} piece={g} tile={40} /></span>
          <span class="od-gear-picker--texts">
            <span class="od-gear-picker--name">{g.name}</span>
            {#if line(g)}<span class="od-gear-picker--line">{line(g)}</span>{/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
{/each}

<style>
  @layer od.components {
    .od-gear-picker--group {
      margin: 16px 16px 4px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-gear-picker--list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .od-gear-picker--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 6px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .od-gear-picker--row:disabled {
      opacity: 0.6;
      cursor: default;
    }

    .od-gear-picker--check {
      flex: none;
      width: 22px;
      height: 22px;
      box-sizing: border-box;
      border: 2px solid var(--od-outline);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-gear-picker--on {
      background: var(--od-secondary);
      border-color: var(--od-secondary);
      color: var(--od-on-secondary);
    }

    .od-gear-picker--icon {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-gear-picker--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-gear-picker--name {
      font-size: 16px;
      line-height: 22px;
    }

    .od-gear-picker--line {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
  }
</style>
